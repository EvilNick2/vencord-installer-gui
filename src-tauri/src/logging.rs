use std::{fs, io, path::PathBuf};

use log::LevelFilter;
use tauri::{Builder, Runtime};
use tauri_plugin_log::{Builder as LogBuilder, Target, TargetKind};

use crate::config::app_config_dir;

pub fn installer_logs_dir() -> io::Result<PathBuf> {
  let log_dir = app_config_dir()?.join("logs");
  fs::create_dir_all(&log_dir)?;

  Ok(log_dir)
}

pub fn with_tauri_logger<R: Runtime>(builder: Builder<R>) -> Builder<R> {
  let log_dir: Option<PathBuf> = dirs::config_dir()
    .map(|base| base.join("vencord-installer-gui").join("logs"))
    .and_then(|dir| fs::create_dir_all(&dir).ok().map(|_| dir));

  let mut targets = vec![Target::new(TargetKind::Stdout)];

  if let Some(path) = log_dir {
    targets.push(Target::new(TargetKind::Folder {
      path,
      file_name: None,
    }));
  }

  builder.plugin(
    LogBuilder::default()
      .level(LevelFilter::Info)
      .targets(targets)
      .build(),
  )
}
