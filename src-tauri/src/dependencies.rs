use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use tauri::Emitter;
use std::cmp::Ordering;
use std::collections::HashMap;
use std::io::ErrorKind;
use std::process::Command;
use tauri::async_runtime::spawn_blocking;

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct InstallCommand {
  command: String,
  #[serde(default)]
  args: Vec<String>,
  #[serde(default)]
  display_label: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DependencySpec {
  id: String,
  name: String,
  command: String,
  #[serde(default)]
  args: Vec<String>,
  recommended_version: String,
  #[serde(default)]
  install_commands: Option<HashMap<String, InstallCommand>>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DependencyStatus {
  pub id: String,
  pub name: String,
  pub recommended_version: String,
  pub installed_version: Option<String>,
  pub status: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub message: Option<String>,
  pub can_install: bool,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub install_label: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DependencyInstallEvent {
  id: String,
  status: String,
  message: Option<String>,
}

static DEPENDENCIES: Lazy<Vec<DependencySpec>> = Lazy::new(|| {
  serde_json::from_str(include_str!("dependencies.json"))
    .expect("Failed to parse dependencies.json")
});

#[cfg(windows)]
fn command_candidates(command: &str) -> [String; 3] {
  [
    format!("{command}.cmd"),
    format!("{command}.exe"),
    command.to_string(),
  ]
}

#[cfg(not(windows))]
fn command_candidates(command: &str) -> [String; 1] {
  [command.to_string()]
}

#[cfg(windows)]
fn build_command(command: &str) -> Command {
  use std::os::windows::process::CommandExt;

  const CREATE_NO_WINDOW: u32 = 0x0800_0000;

  let mut cmd = Command::new(command);
  cmd.creation_flags(CREATE_NO_WINDOW);
  cmd
}

#[cfg(not(windows))]
fn build_command(command: &str) -> Command {
  Command::new(command)
}

fn current_platform_key() -> &'static str {
  if cfg!(target_os = "windows") {
    "windows"
  } else if cfg!(target_os = "macos") {
    "macos"
  } else {
    "linux"
  }
}

fn extract_version(output: &str) -> Option<String> {
  for token in output.split_whitespace() {
    let mut cleaned = String::new();
    let mut seen_digit = false;

    for ch in token.trim_start_matches("v").chars() {
      if ch.is_ascii_digit() {
        cleaned.push(ch);
        seen_digit = true;
      } else if ch == '.' && seen_digit {
        cleaned.push(ch);
      } else if seen_digit {
        break;
      }
    }

    if cleaned.contains('.') {
      return Some(cleaned.trim_end_matches('.').to_string());
    }
  }

  None
}

fn resolve_install_command(spec: &DependencySpec) -> Option<&InstallCommand> {
  let platform = current_platform_key();
  spec
    .install_commands
    .as_ref()
    .and_then(|map| map.get(platform))
}

fn compare_versions(installed: &str, recommended: &str) -> Option<Ordering> {
  fn parts(value: &str) -> Option<Vec<u32>> {
    let parsed: Option<Vec<u32>> = value
      .split('.')
      .map(|segment| segment.parse::<u32>().ok())
      .collect();

    parsed.filter(|segments| !segments.is_empty())
  }

  let installed_parts = parts(installed)?;
  let recommended_parts = parts(recommended)?;
  let max_len = installed_parts.len().max(recommended_parts.len());

  for idx in 0..max_len {
    let lhs = *installed_parts.get(idx).unwrap_or(&0);
    let rhs = *recommended_parts.get(idx).unwrap_or(&0);

    match lhs.cmp(&rhs) {
      Ordering::Equal => continue,
      other => return Some(other),
    }
  }

  Some(Ordering::Equal)
}

fn run_command(command: &str, args: &[String]) -> Result<String, String> {
  let mut last_error: Option<String> = None;

  for candidate in command_candidates(command) {
    match build_command(&candidate).args(args).output() {
      Ok(output) => {
        if output.status.success() {
          return Ok(String::from_utf8_lossy(&output.stdout).to_string());
        }

        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
          "{} exited with status {}. Stdout: {}\nStderr: {}",
          candidate,
          output.status,
          String::from_utf8_lossy(&output.stdout),
          stderr
        ));
      }
      Err(err) => {
        if err.kind() == ErrorKind::NotFound {
          continue;
        }

        last_error = Some(format!("{}: {err}", candidate));
      }
    }
  }

  Err(last_error.unwrap_or_else(|| "Command not found".to_string()))
}

fn detect_installed_version(spec: &DependencySpec) -> Result<Option<String>, String> {
  let args: Vec<String> = spec.args.clone();
  let mut last_error: Option<String> = None;

  for candidate in command_candidates(&spec.command) {
    match build_command(&candidate).args(&args).output() {
      Ok(output) => {
        if !output.status.success() {
          let stderr = String::from_utf8_lossy(&output.stderr);
          return Err(format!(
            "{} exited with status {}. Stderr: {}",
            candidate, output.status, stderr
          ));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let version = extract_version(&stdout);
        return Ok(version);
      }
      Err(err) => {
        if err.kind() == ErrorKind::NotFound {
          continue;
        }

        last_error = Some(format!("{}: {err}", candidate));
      }
    }
  }

  if last_error.is_some() {
    Err(last_error.unwrap())
  } else {
    Ok(None)
  }
}

fn build_status(spec: &DependencySpec) -> DependencyStatus {
  let install_cmd = resolve_install_command(spec);

  match detect_installed_version(spec) {
    Ok(Some(installed)) => {
      if let Some(ordering) = compare_versions(&installed, &spec.recommended_version) {
        if ordering == Ordering::Less {
          return DependencyStatus {
            id: spec.id.clone(),
            name: spec.name.clone(),
            recommended_version: spec.recommended_version.clone(),
            installed_version: Some(installed.clone()),
            status: "outdated".to_string(),
            message: Some(format!(
              "Recommended version is {}",
              spec.recommended_version
            )),
            can_install: install_cmd.is_some(),
            install_label: install_cmd.and_then(|cmd| cmd.display_label.clone()),
          };
        }
      }

      DependencyStatus {
        id: spec.id.clone(),
        name: spec.name.clone(),
        recommended_version: spec.recommended_version.clone(),
        installed_version: Some(installed),
        status: "installed".to_string(),
        message: None,
        can_install: false,
        install_label: None,
      }
    }
    Ok(None) => DependencyStatus {
      id: spec.id.clone(),
      name: spec.name.clone(),
      recommended_version: spec.recommended_version.clone(),
      installed_version: None,
      status: "missing".to_string(),
      message: Some("Not detected in PATH".to_string()),
      can_install: install_cmd.is_some(),
      install_label: install_cmd.and_then(|cmd| cmd.display_label.clone()),
    },
    Err(err) => DependencyStatus {
      id: spec.id.clone(),
      name: spec.name.clone(),
      recommended_version: spec.recommended_version.clone(),
      installed_version: None,
      status: "error".to_string(),
      message: Some(err),
      can_install: install_cmd.is_some(),
      install_label: install_cmd.and_then(|cmd| cmd.display_label.clone()),
    },
  }
}

fn render_install_args(template_args: &[String], version: &str) -> Vec<String> {
  template_args
    .iter()
    .map(|arg| arg.replace("{version}", version))
    .collect()
}

#[tauri::command]
pub fn list_dependencies() -> Result<Vec<DependencyStatus>, String> {
  Ok(DEPENDENCIES.iter().map(build_status).collect())
}

#[tauri::command]
pub async fn install_dependency(
  app: tauri::AppHandle,
  id: String,
) -> Result<DependencyStatus, String> {
  let spec = DEPENDENCIES
    .iter()
    .find(|entry| entry.id == id)
    .cloned()
    .ok_or_else(|| format!("Unknown dependency {id}"))?;

  let install = resolve_install_command(&spec)
    .ok_or_else(|| format!("No automated install configured for {}", spec.name))?;

  let args = render_install_args(&install.args, &spec.recommended_version);
  let command = install.command.clone();

  app
    .emit(
      "dependency-install",
      DependencyInstallEvent {
        id: spec.id.clone(),
        status: "started".to_string(),
        message: None,
      },
    )
    .ok();

  let run_result = spawn_blocking(move || run_command(&command, &args))
    .await
    .map_err(|err| err.to_string())?;

  if let Err(err) = run_result {
    app
      .emit(
        "dependency-install",
        DependencyInstallEvent {
          id: spec.id.clone(),
          status: "error".to_string(),
          message: Some(err.clone()),
        },
      )
      .ok();

    return Err(err);
  }

  let status = build_status(&spec);

  app
    .emit(
      "dependency-install",
      DependencyInstallEvent {
        id: spec.id,
        status: "completed".to_string(),
        message: None,
      },
    )
    .ok();

  Ok(status)
}