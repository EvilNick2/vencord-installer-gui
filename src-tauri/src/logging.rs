use std::{fs, io, path::Path, path::PathBuf};

use chrono::Local;
use log::LevelFilter;
use tauri::{Builder, Runtime};
use tauri_plugin_log::{Builder as LogBuilder, Target, TargetKind};

use crate::config::app_config_dir;

pub fn installer_logs_dir() -> io::Result<PathBuf> {
  let log_dir = app_config_dir()?.join("logs");
  fs::create_dir_all(&log_dir)?;

  Ok(log_dir)
}

fn rotate_latest_log(log_dir: &Path) {
  let latest = log_dir.join("latest.log");

  if !latest.exists() {
    return;
  }

  let timestamp = fs::metadata(&latest)
    .ok()
    .and_then(|m| m.modified().ok())
    .map(|mtime| {
      let dt: chrono::DateTime<Local> = mtime.into();
      dt.format("%Y-%m-%d_%H-%M-%S").to_string()
    })
    .unwrap_or_else(|| Local::now().format("%Y-%m-%d_%H-%M-%S").to_string());

  let dest = log_dir.join(format!("{timestamp}.log"));

  let _ = fs::rename(&latest, dest);
}

pub fn with_tauri_logger<R: Runtime>(builder: Builder<R>) -> Builder<R> {
  let log_dir: Option<PathBuf> = dirs::config_dir()
    .map(|base| base.join("vencord-installer-gui").join("logs"))
    .and_then(|dir| fs::create_dir_all(&dir).ok().map(|_| dir));

  let mut targets = vec![Target::new(TargetKind::Stdout)];

  if let Some(ref path) = log_dir {
    rotate_latest_log(path);

    targets.push(Target::new(TargetKind::Folder {
      path: path.clone(),
      file_name: Some("latest".to_string()),
    }));
  }

  builder.plugin(
    LogBuilder::default()
      .level(LevelFilter::Info)
      .targets(targets)
      .build(),
  )
}
