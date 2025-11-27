use std::{fs, path::PathBuf, process::Command};

fn vencord_repo_path(dir: &str) -> PathBuf {
  PathBuf::from(dir)
}

fn run_git(args: &[&str]) -> Result<(), String> {
  let output = Command::new("git")
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
  let output = Command::new("git")
    .args(["-C", repo_path_str, "rev-parse", "--is-inside-work-tree"])
    .output()
    .map_err(|err| format!("Failed to run git: {err}"))?;

  if output.status.success() {
    return Ok(true);
  }

  let stderr= String::from_utf8_lossy(&output.stderr);

  if stderr.contains("not a git repository") {
    return Ok(false);
  }

  Err(format!(
    "Git command failed with status {}: {}",
    output.status, stderr
  ))
}

pub fn sync_vencord_repo(repo_url: &str, repo_dir: &str) -> Result<String, String> {
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

  Ok(repo_path_str.to_string())
}