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
  builder.plugin(
    LogBuilder::default()
      .level(LevelFilter::Info)
      .targets([
        Target::new(TargetKind::LogDir { file_name: None }),
        Target::new(TargetKind::Stdout),
      ])
      .build(),
  )
}
