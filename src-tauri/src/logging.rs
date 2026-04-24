use std::{fs, io::{self, Write}, path::Path, path::PathBuf};

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
struct LazyFileWriter {
  path: PathBuf,
  file: Option<fs::File>,
}

impl LazyFileWriter {
  fn new(path: PathBuf) -> Self {
    Self { path, file: None }
  }

  fn get_or_create(&mut self) -> io::Result<&mut fs::File> {
    if self.file.is_none() {
      self.file = Some(
        fs::OpenOptions::new()
          .create(true)
          .append(true)
          .open(&self.path)?,
      );
    }

    Ok(self.file.as_mut().unwrap())
  }
}

impl Write for LazyFileWriter {
  fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
    self.get_or_create()?.write(buf)
  }

  fn flush(&mut self) -> io::Result<()> {
    if let Some(ref mut f) = self.file {
      f.flush()
    } else {
      Ok(())
    }
  }
}

fn rotate_latest_log(log_dir: &Path) {
  let latest = log_dir.join("latest.log");

  let meta = match fs::metadata(&latest) {
    Ok(m) => m,
    Err(_) => return,
  };

  if meta.len() == 0 {
    let _ = fs::remove_file(&latest);
    return;
  }

  let timestamp = meta
    .modified()
    .ok()
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

    let writer: Box<dyn Write + Send> = Box::new(LazyFileWriter::new(path.join("latest.log")));

    let dispatch = fern::Dispatch::new()
      .format(|out, message, record| {
        out.finish(format_args!(
          "[{} {:<5} {}] {}",
          Local::now().format("%Y-%m-%dT%H:%M:%S"),
          record.level(),
          record.target(),
          message,
        ))
      })
      .chain(writer);

    targets.push(Target::new(TargetKind::Dispatch(dispatch)));
  }

  builder.plugin(
    LogBuilder::default()
      .level(LevelFilter::Info)
      .targets(targets)
      .build(),
  )
}
