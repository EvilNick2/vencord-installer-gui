use std::process::Command;

#[cfg(windows)]
use winreg::{
  RegKey,
  enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE},
};

#[cfg(windows)]
pub fn command_candidates(command: &str) -> [String; 3] {
  [
    format!("{command}.cmd"),
    format!("{command}.exe"),
    command.to_string(),
  ]
}

#[cfg(not(windows))]
pub fn command_candidates(command: &str) -> [String; 1] {
  [command.to_string()]
}

#[cfg(windows)]
pub fn build_command(command: &str) -> Command {
  use std::os::windows::process::CommandExt;

  const CREATE_NO_WINDOW: u32 = 0x0800_0000;

  let mut cmd = Command::new(command);
  cmd.creation_flags(CREATE_NO_WINDOW);
  cmd.env("npm_config_manage_package_manager_versions", "false");

  if let Some(path) = refreshed_windows_path() {
    cmd.env("PATH", path);
  }

  cmd
}

#[cfg(not(windows))]
pub fn build_command(command: &str) -> Command {
  let mut cmd = Command::new(command);
  cmd.env("npm_config_manage_package_manager_versions", "false");

  if let Some(path) = augmented_unix_path() {
    cmd.env("PATH", path);
  }

  cmd
}

#[cfg(not(windows))]
fn shell_resolved_path() -> Option<String> {
  use std::sync::OnceLock;
  static CACHE: OnceLock<Option<String>> = OnceLock::new();

  CACHE
    .get_or_init(|| {
      for shell in ["bash", "zsh", "sh"] {
        if let Ok(output) = std::process::Command::new(shell)
          .args(["-lc", "echo $PATH"])
          .output()
        {
          if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout)
              .trim()
              .to_string();

            if !path.is_empty() {
              log::debug!(
                "Resolved login-shell PATH via {shell}: {path}"
              );
              return Some(path);
            }
          }
        }
      }

      log::debug!("Could not resolve PATH from any login shell; falling back to inherited PATH");
      None
    })
    .clone()
}

#[cfg(not(windows))]
fn augmented_unix_path() -> Option<String> {
  let inherited = std::env::var("PATH").unwrap_or_default();
  let shell_path = shell_resolved_path().unwrap_or_default();
  let home = std::env::var("HOME").unwrap_or_default();

  // Prefer the shell-resolved PATH as the base; fall back to the inherited
  // process PATH when the login-shell spawn fails (e.g. no bash/zsh/sh).
  let base = if !shell_path.is_empty() {
    shell_path
  } else {
    inherited
  };

  let mut extras: Vec<String> = vec![
    format!("{home}/.local/bin"),
    format!("{home}/.local/share/pnpm"),
    format!("{home}/.npm-global/bin"),
    format!("{home}/.volta/bin"),
    format!("{home}/.asdf/shims"),
    format!("{home}/.local/share/mise/shims"),
    "/usr/local/bin".to_string(),
    "/home/linuxbrew/.linuxbrew/bin".to_string(),
    "/opt/homebrew/bin".to_string(),
  ];

  if let Ok(pnpm_home) = std::env::var("PNPM_HOME") {
    if !pnpm_home.is_empty() {
      extras.push(pnpm_home);
    }
  }

  let base_parts: Vec<&str> = base.split(':').collect();
  let new_parts: Vec<String> = extras
    .into_iter()
    .filter(|p| !p.is_empty() && !base_parts.contains(&p.as_str()))
    .collect();

  let full = if new_parts.is_empty() {
    base
  } else {
    format!("{}:{}", new_parts.join(":"), base)
  };

  if full.is_empty() {
    None
  } else {
    Some(full)
  }
}

#[cfg(windows)]
fn read_env_from_registry(hive: winreg::HKEY, subkey: &str, name: &str) -> Option<String> {
  let key = RegKey::predef(hive).open_subkey(subkey).ok()?;
  key.get_value::<String, _>(name).ok()
}

#[cfg(windows)]
fn read_env_value(name: &str) -> Option<String> {
  read_env_from_registry(HKEY_CURRENT_USER, "Environment", name).or_else(|| {
    read_env_from_registry(
      HKEY_LOCAL_MACHINE,
      "SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment",
      name,
    )
  })
}

#[cfg(windows)]
fn expand_windows_vars(value: &str) -> String {
  let mut expanded = String::new();
  let mut rest = value;

  while let Some(start_idx) = rest.find('%') {
    expanded.push_str(&rest[..start_idx]);
    let after_start = &rest[start_idx + 1..];

    if let Some(end_idx) = after_start.find('%') {
      let key = & after_start[..end_idx];
      let replacement = read_env_value(key)
        .or_else(|| std::env::var(key).ok())
        .unwrap_or_else(|| format!("%{key}%"));

      expanded.push_str(&replacement);
      rest = &after_start[end_idx + 1..];
    } else {
      expanded.push('%');
      expanded.push_str(after_start);
      rest = "";
      break;
    }
  }

  expanded.push_str(rest);
  expanded
}

#[cfg(windows)]
fn refreshed_windows_path() -> Option<String> {
  let mut segments = Vec::<String>::new();
  let user_path = read_env_from_registry(HKEY_CURRENT_USER, "Environment", "Path");
  let machine_path = read_env_from_registry(
    HKEY_LOCAL_MACHINE,
    "SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment",
    "Path",
  );
  let process_path = std::env::var("PATH").ok();

  for path in [user_path, machine_path, process_path]
    .into_iter()
    .flatten()
  {
    for segment in path.split(';').map(str::trim).filter(|it| !it.is_empty()) {
      let expanded_segment = expand_windows_vars(segment);

      if !segments
        .iter()
        .any(|existing| existing.eq_ignore_ascii_case(&expanded_segment))
      {
        segments.push(expanded_segment);
      }
    }
  }

  if segments.is_empty() {
    None
  } else {
    Some(segments.join(";"))
  }
}