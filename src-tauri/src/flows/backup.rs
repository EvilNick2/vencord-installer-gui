use serde::Serialize;
use std::{
  fs,
  path::Path,
  path::PathBuf,
  time::{SystemTime, UNIX_EPOCH},
};

use crate::{config::app_config_dir, options};

use super::discord_clients;

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

  let timestamp = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map_err(|err| format!("System time error: {err}"))?
    .as_secs();

  Ok(backups.join(format!("vencord-{timestamp}")))
}

pub fn move_vencord_install(source: &Path) -> Result<PathBuf, String> {
  if !source.exists() {
    return Err(format!("Vencord install not found at {}", source.display()));
  }

  let destination = backup_destination()?;

  fs::rename(source, &destination).map_err(|err| {
    format!(
      "Failed to move Vencord install from {} to {}: {err}",
      source.display(),
      destination.display()
    )
  })?;

  Ok(destination)
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