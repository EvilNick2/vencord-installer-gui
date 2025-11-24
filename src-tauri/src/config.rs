use std::{fs, io, path::PathBuf};

pub fn app_config_dir() -> io::Result<PathBuf> {
  let base_dir = dirs::config_dir().or_else(dirs::home_dir).ok_or_else(|| {
    io::Error::new(
      io::ErrorKind::NotFound,
      "Could not determine configuration directory",
    )
  })?;

  let app_dir = base_dir.join("vencord-installer-gui");
  fs::create_dir_all(&app_dir)?;

  Ok(app_dir)
}
