use chrono::{DateTime,  Local};
use serde::Serialize;
use std::{
  cmp::Ordering,
  fs, io,
  path::{Path, PathBuf},
  time::SystemTime,
};

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

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BackupInfo {
  pub name: String,
  pub path: String,
  pub size_bytes: u64,
  pub created_at: Option<String>,
}

#[derive(Clone)]
struct BackupEntry {
  name: String,
  path: PathBuf,
  modified: SystemTime,
  size_bytes: u64,
}

fn backups_root() -> Result<PathBuf, String> {
  let dir = app_config_dir().map_err(|err| format!("Failed to get config directory: {err}"))?;
  let backups = dir.join("backups");

  fs::create_dir_all(&backups).map_err(|err| {
    format!(
      "Failed to create backup directory {}: {err}",
      backups.display()
    )
  })?;

  Ok(backups)
}

fn backup_destination() -> Result<PathBuf, String> {
  let backups = backups_root()?;

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
        return err.kind() == io::ErrorKind::CrossesDevices;
      }

      #[cfg(target_os = "windows")]
      {
        return false;
      }
    }
  }
}

fn dir_size(path: &Path) -> Result<u64, String> {
  let mut total: u64 = 0;
  let mut stack = vec![path.to_path_buf()];

  while let Some(dir) = stack.pop() {
    let entries = fs::read_dir(&dir)
      .map_err(|err| format!("Failed to read directory {}: {err}", dir.display()))?;

    for entry in entries {
      let entry =
        entry.map_err(|err| format!("Failed to read entry in {}: {err}", dir.display()))?;
      let path = entry.path();
      let metadata = entry
        .metadata()
        .map_err(|err| format!("failed to read metadata for {}: {err}", path.display()))?;

      if metadata.is_dir() {
        stack.push(path);
      } else {
        total = total.saturating_add(metadata.len());
      }
    }
  }

  Ok(total)
}

fn collect_backups() -> Result<Vec<BackupEntry>, String> {
  let backups_dir = backups_root()?;
  let mut backups = Vec::new();

  for entry in
    fs::read_dir(&backups_dir).map_err(|err| format!("Failed to read backups directory: {err}"))?
  {
    let entry = entry.map_err(|err| format!("Failed to read backup entry: {err}"))?;
    let path = entry.path();

    if !path.is_dir() {
      continue;
    }

    let name = match path.file_name().and_then(|name| name.to_str()) {
      Some(value) => value.to_string(),
      None => continue,
    };

    let metadata = fs::metadata(&path)
      .map_err(|err| format!("Failed to read metadata for {}: {err}", path.display()))?;
    let modified = metadata.modified().unwrap_or(SystemTime::UNIX_EPOCH);
    let size_bytes = dir_size(&path)?;

    backups.push(BackupEntry {
      name,
      path,
      modified,
      size_bytes,
    });
  }

  backups.sort_by(|a, b| match a.modified.cmp(&b.modified) {
    Ordering::Less => Ordering::Greater,
    Ordering::Greater => Ordering::Less,
    Ordering::Equal => a.name.cmp(&b.name),
  });

  Ok(backups)
}

pub fn apply_backup_limits(max_count: Option<u32>, max_size_mb: Option<u64>) -> Result<(), String> {
  if max_count.is_none() && max_size_mb.is_none() {
    return Ok(());
  }

  let mut backups = collect_backups()?;

  if let Some(limit) = max_count {
    if backups.len() > limit as usize {
      let mut to_remove = backups.split_off(limit as usize);
      for entry in to_remove.drain(..) {
        fs::remove_dir_all(&entry.path).map_err(|err| {
          format!(
            "Failed to remove old backup {}: {err}",
            entry.path.display()
          )
        })?;
      }
    }
  }

  if let Some(max_mb) = max_size_mb {
    let mut backups = collect_backups()?;
    let max_bytes = max_mb.saturating_mul(1024 * 1024);
    let mut total: u64 = backups.iter().map(|entry| entry.size_bytes).sum();

    if total <= max_bytes {
      return Ok(());
    }

    while total > max_bytes {
      if let Some(oldest) = backups.pop() {
        fs::remove_dir_all(&oldest.path)
          .map_err(|err| format!("Failed to remove backup {}: {err}", oldest.path.display()))?;
        total = total.saturating_sub(oldest.size_bytes);
      } else {
        break;
      }
    }
  }

  Ok(())
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

  apply_backup_limits(options.max_backup_count, options.max_backup_size_mb)?;

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

fn to_backup_info(entries: Vec<BackupEntry>) -> Vec<BackupInfo> {
  entries
    .into_iter()
    .map(|entry| BackupInfo {
      name: entry.name,
      path: entry.path.to_string_lossy().into_owned(),
      size_bytes: entry.size_bytes,
      created_at: Some(DateTime::<Local>::from(entry.modified).to_rfc3339()),
    })
    .collect()
}

#[tauri::command]
pub fn list_backups() -> Result<Vec<BackupInfo>, String> {
  let backups = collect_backups()?;
  Ok(to_backup_info(backups))
}

fn is_valid_backup_name(name: &str) -> bool {
  !name.is_empty() && !name.contains(['/', '\\']) && !name.contains("..")
}

#[tauri::command]
pub fn delete_backups(names: Vec<String>) -> Result<(), String> {
  if names.is_empty() {
    return Ok(());
  }

  let root = backups_root()?;

  for name in names {
    if !is_valid_backup_name(&name) {
      return Err(format!("Invalid backup name: {name}"));
    }

    let target = root.join(&name);

    if !target.exists() {
      continue;
    }

    let canonical_root = dunce::canonicalize(&root)
      .map_err(|err| format!("Failed to resolve backup directory: {err}"))?;
    let canonical_target = dunce::canonicalize(&target)
      .map_err(|err| format!("Failed to resolve backup path {}: {err}", target.display()))?;

    if !canonical_target.starts_with(&canonical_root) {
      return Err(format!(
        "Refusing to delete path outside backups directory: {}",
        target.display()
      ));
    }

    fs::remove_dir_all(&canonical_target).map_err(|err| {
      format!(
        "Failed to delete backup {}: {err}",
        canonical_target.display()
      )
    })?;
  }

  Ok(())
}