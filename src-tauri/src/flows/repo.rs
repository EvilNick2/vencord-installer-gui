use std::{
  env, fs,
  path::{Path, PathBuf},
};

use crate::command_utils::{build_command, command_candidates};

fn run_command(
  command: &str,
  args: &[&str],
  working_dir: Option<&str>,
  error_prefix: &str,
) -> Result<(), String> {
  let mut last_error: Option<String> = None;

  for candidate in command_candidates(command) {
    let mut cmd = build_command(&candidate);

    if let Some(dir) = working_dir {
      cmd.current_dir(dir);
    }

    match cmd.args(args).output() {
      Ok(output) => {
        if output.status.success() {
          return Ok(());
        }

        return Err(format!(
          "{error_prefix}: exit status {} when running {}. Stdout: {}\nStderr: {}",
          output.status,
          candidate,
          String::from_utf8_lossy(&output.stdout),
          String::from_utf8_lossy(&output.stderr)
        ));
      }
      Err(err) => last_error = Some(format!("{candidate}: {err}")),
    }
  }

  let path = env::var("PATH").unwrap_or_else(|_| "<not set>".to_string());
  let errors = last_error.unwrap_or_else(|| "unknown error".to_string());

  Err(format!(
    "{error_prefix}: failed to run {command}. Tried: {errors}. Ensure it is installed and available in PATH (current PATH: {path})."
  ))
}

fn check_tool(command: &str, args: &[&str], name: &str) -> Result<(), String> {
  run_command(
    command,
    args,
    None,
    &format!("{name} is not installed or not in PATH"),
  )
}

fn vencord_repo_path(dir: &str) -> PathBuf {
  PathBuf::from(dir)
}

fn vencord_user_plugins_path(repo_dir: &Path) -> PathBuf {
  repo_dir.join("src").join("userplugins")
}

fn repo_folder_name_from_url(url: &str) -> String {
  let last = url
    .trim_end_matches('/')
    .rsplit('/')
    .next()
    .unwrap_or("userplugin");

  last.trim_end_matches(".git").to_string()
}

fn clean_node_modules(repo_dir: &Path) -> Result<(), String> {
  let node_modules = repo_dir.join("node_modules");

  if node_modules.exists() {
    fs::remove_dir_all(&node_modules).map_err(|err| {
      format!(
        "Failed to remove existing node_modules at {}: {err}",
        node_modules.display()
      )
    })?;
  }

  Ok(())
}

fn sync_user_plugin_repos(plugin_urls: &[String], repo_dir: &Path) -> Result<(), String> {
  if plugin_urls.is_empty() {
    return Ok(());
  }

  let plugins_dir = vencord_user_plugins_path(repo_dir);

  if plugins_dir.exists() {
    fs::remove_dir_all(&plugins_dir)
      .map_err(|err| format!("Failed to reset userplugins directory: {err}"))?;
  }

  fs::create_dir_all(&plugins_dir)
    .map_err(|err| format!("Failed to create userplugins directory: {err}"))?;

  for url in plugin_urls {
    let folder_name = repo_folder_name_from_url(url);
    let destination = plugins_dir.join(folder_name);
    let destination_str = destination
      .to_str()
      .ok_or_else(|| "Invalid user plugin destination path".to_string())?;

    run_git(&["clone", url, destination_str]).map_err(|err| {
      format!(
        "Failed to clone user plugin {url} into {}: {err}",
        destination.display()
      )
    })?;
  }

  Ok(())
}

fn run_git(args: &[&str]) -> Result<(), String> {
  let output = build_command("git")
    .args(args)
    .output()
    .map_err(|err| format!("Failed to run git: {err}"))?;

  if !output.status.success() {
    return Err(format!(
      "Git command failed with status {}: {}",
      output.status,
      String::from_utf8_lossy(&output.stderr)
    ));
  }

  Ok(())
}

fn is_git_repo(repo_path_str: &str) -> Result<bool, String> {
  let output = build_command("git")
    .args(["-C", repo_path_str, "rev-parse", "--is-inside-work-tree"])
    .output()
    .map_err(|err| format!("Failed to run git: {err}"))?;

  if output.status.success() {
    return Ok(true);
  }

  let stderr = String::from_utf8_lossy(&output.stderr);

  if stderr.contains("not a git repository") {
    return Ok(false);
  }

  Err(format!(
    "Git command failed with status {}: {}",
    output.status, stderr
  ))
}

pub fn sync_vencord_repo(
  repo_url: &str,
  repo_dir: &str,
  plugin_urls: &[String],
) -> Result<String, String> {
  let repo_path = vencord_repo_path(repo_dir);
  let repo_path_str = repo_path
    .to_str()
    .ok_or_else(|| "Invalid repository path".to_string())?;

  if repo_path.exists() {
    if is_git_repo(repo_path_str)? {
      run_git(&["-C", repo_path_str, "pull", "--ff-only"])?;
    } else if repo_path.is_dir() {
      let mut entries = fs::read_dir(&repo_path)
        .map_err(|err| format!("Failed to read directory {}: {err}", repo_path.display()))?;

      if entries.next().is_some() {
        return Err(format!(
          "Existing path {} is not a git repository. Remove it or choose an empty directory before syncing",
          repo_path.display()
        ));
      }

      run_git(&["clone", repo_url, repo_path_str])?;
    } else {
      return Err(format!(
        "Existing path {} is not a directory. Choose a directory for the Vencord clone",
        repo_path.display()
      ));
    }
  } else {
    if let Some(parent) = repo_path.parent() {
      fs::create_dir_all(parent).map_err(|err| {
        format!(
          "Failed to create parent directory {}: {err}",
          parent.display()
        )
      })?;
    }

    run_git(&["clone", repo_url, repo_path_str])?;
  }

  sync_user_plugin_repos(plugin_urls, &repo_path)?;

  Ok(repo_path_str.to_string())
}

pub fn build_vencord_repo(repo_dir: &str) -> Result<String, String> {
  check_tool("node", &["--version"], "Node.js")?;
  check_tool("npm", &["--version"], "npm")?;

  let repo_path = Path::new(repo_dir);

  clean_node_modules(repo_path)?;

  run_command(
    "npm",
    &["install", "-g", "pnpm"],
    None,
    "Failed to install pnpm via npm",
  )?;

  run_command(
    "pnpm",
    &["install"],
    Some(repo_dir),
    "Failed to install project dependencies with pnpm",
  )?;

  run_command(
    "pnpm",
    &["build"],
    Some(repo_dir),
    "Failed to build Vencord with pnpm",
  )?;

  Ok(format!("Vencord built successfully in {repo_dir}"))
}

pub fn inject_vencord_repo(repo_dir: &str, locations: &[String]) -> Result<String, String> {
  if locations.is_empty() {
    return Ok("No Discord clients selected for injection; skipping".to_string());
  }

  check_tool("pnpm", &["--version"], "pnpm")?;

  for location in locations {
    run_command(
      "pnpm",
      &["inject", "-location", location],
      Some(repo_dir),
      &format!("Failed to inject Vencord into {location} with pnpm"),
    )?;
  }

  Ok(format!(
    "Injected Vencord into {} Discord client(s)",
    locations.len()
  ))
}
