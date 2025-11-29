use chrono::Local;
use serde::Serialize;
use std::{fs, io, path::Path, path::PathBuf};

use crate::{config::app_config_dir, options};

use super::{discord_clients, themes};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupResult {
  pub source_path: String,
  pub backup_path: String,
  pub closed_clients: Vec<String>,
  pub restarted_clients: Vec<String>,
  pub closing_skipped: bool,
}

fn backup_destination() -> Result<PathBuf, String> {
  let dir = app_config_dir().map_err(|err| format!("Failed to get config directory: {err}"))?;
  let backups = dir.join("backups");
  fs::create_dir_all(&backups).map_err(|err| {
    format!(
      "Failed to create backup directory {}: {err}",
      backups.display()
    )
  })?;

  let timestamp = Local::now().format("%Y-%m-%d_%H-%M-%S");

  let destination = backups.join(format!("{timestamp}"));

  fs::create_dir_all(&destination).map_err(|err| {
    format!(
      "Failed to create backup directory {}: {err}",
      destination.display()
    )
  })?;

  Ok(destination)
}

fn copy_dir_recursive(source: &Path, destination: &Path) -> Result<(), String> {
  fs::create_dir(destination).map_err(|err| {
    format!(
      "Failed to create backup directory {}: {err}",
      destination.display()
    )
  })?;

  for entry in fs::read_dir(source)
    .map_err(|err| format!("failed to read directory {}: {err}", source.display()))?
  {
    let entry = entry.map_err(|err| {
      format!(
        "Failed to read directory entry in {}: {err}",
        source.display()
      )
    })?;
    let path = entry.path();
    let dest_path = destination.join(entry.file_name());

    if path.is_dir() {
      copy_dir_recursive(&path, &dest_path)?;
    } else {
      fs::copy(&path, &dest_path).map_err(|err| {
        format!(
          "Failed to copy {} to {}: {err}",
          path.display(),
          dest_path.display()
        )
      })?;
    }
  }

  Ok(())
}


fn is_cross_device_link(err: &io::Error) -> bool {
  match err.raw_os_error() {
    Some(18) => true,
    Some(17) => true,
    _ => {
      #[cfg(not(target_os = "windows"))]
      {
        return err.kind() == io::ErrorKind::CrossDeviceLink;
      }

      #[cfg(target_os = "windows")]
      {
        return false;
      }
    }
  }
}

pub fn move_vencord_install(source: &Path) -> Result<PathBuf, String> {
  if !source.exists() {
    return Err(format!("Vencord install not found at {}", source.display()));
  }

  if let Err(err) = remove_node_modules(source) {
    return Err(err);
  }

  let destination_root = backup_destination()?;
  let destination = destination_root.join("vencord");

  fs::create_dir_all(&destination_root).map_err(|err| {
    format!(
      "Failed to create backup directory {}: {err}",
      destination_root.display()
    )
  })?;

  if let Err(err) = fs::rename(source, &destination) {
    if !is_cross_device_link(&err) {
      return Err(format!(
        "Failed to move Vencord install from {} to {}: {err}",
        source.display(),
        destination.display()
      ));
    }

    if source.is_dir() {
      copy_dir_recursive(source, &destination)?;
      fs::remove_dir_all(source).map_err(|err| {
        format!(
          "Failed to remove original directory {}: {err}",
          source.display()
        )
      })?;
    } else {
      fs::copy(source, &destination).map_err(|err| {
        format!(
          "Failed to copy {} to {}: {err}",
          source.display(),
          destination.display()
        )
      })?;
      fs::remove_file(source)
        .map_err(|err| format!("Failed to remove original file {}: {err}", source.display()))?;
    }
  }

  themes::move_themes_to_backup(&destination_root)?;

  Ok(destination_root)
}

fn remove_node_modules(source: &Path) -> Result<(), String> {
  if !source.exists() {
    return Ok(());
  }

  let mut stack = vec![source.to_path_buf()];

  while let Some(dir) = stack.pop() {
    let entries = fs::read_dir(&dir)
      .map_err(|err| format!("Failed to read directory {}: {err}", dir.display()))?;

    for entry in entries {
      let entry =
        entry.map_err(|err| format!("Failed to read entry in {}: {err}", dir.display()))?;
      let path = entry.path();

      if let Some(name) = path.file_name().and_then(|name| name.to_str()) {
        if name == "node_modules" {
          if path.is_dir() {
            fs::remove_dir_all(&path).map_err(|err| {
              format!(
                "Failed to remove node_modules directory {}: {err}",
                path.display()
              )
            })?;
          } else {
            fs::remove_file(&path).map_err(|err| {
              format!(
                "Failed to remove node_modules entry {}: {err}",
                path.display()
              )
            })?;
          }

          continue;
        }
      }

      if path.is_dir() {
        stack.push(path);
      }
    }
  }

  Ok(())
}

#[tauri::command]
pub fn backup_vencord_install(source_path: String) -> Result<BackupResult, String> {
  let options = options::read_user_options()?;

  let discord_state = discord_clients::close_discord_clients(options.close_discord_on_backup);

  let move_result = move_vencord_install(Path::new(&source_path));

  if let Err(err) = move_result {
    if !discord_state.closing_skipped {
      let _ = discord_clients::restart_processes(&discord_state.processes);
    }
    return Err(err);
  }

  let backup_path = move_result?;

  let theme_sources = options::resolve_themes(&options);

  if let Err(err) = themes::download_themes(&theme_sources) {
    if !discord_state.closing_skipped {
      let _ = discord_clients::restart_processes(&discord_state.processes);
    }

    return Err(err);
  }

  let restarted = if discord_state.closing_skipped {
    Vec::new()
  } else {
    discord_clients::restart_processes(&discord_state.processes)
  };

  Ok(BackupResult {
    source_path,
    backup_path: backup_path.to_string_lossy().into_owned(),
    closed_clients: discord_state.closed_clients,
    restarted_clients: restarted,
    closing_skipped: discord_state.closing_skipped,
  })
}