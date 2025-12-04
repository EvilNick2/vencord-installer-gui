use reqwest::blocking::get;
use std::{
  env, fs, io,
  path::{Path, PathBuf},
};

use crate::options::ProvidedThemeInfo;

pub fn theme_dir() -> Result<PathBuf, String> {
  #[cfg(target_os = "windows")]
  {
    if let Ok(appdata) = env::var("APPDATA") {
      return Ok(Path::new(&appdata).join("Vencord").join("themes"));
    }

    if let Some(config) = dirs::config_dir() {
      return Ok(config.join("Vencord").join("themes"));
    }

    return Err("Unable to determine theme directory: APPDATA is not set".to_string());
  }

  #[cfg(target_os = "linux")]
  {
    let config =
      dirs::config_dir().ok_or_else(|| "Unable to determine config directory".to_string())?;
    return Ok(config.join("Vencord").join("themes"));
  }

  #[cfg(target_os = "macos")]
  {
    if let Some(home) = dirs::home_dir() {
      return Ok(
        home
          .join("Library")
          .join("Application Support")
          .join("Vencord")
          .join("themes"),
      );
    }

    return Err("Unable to determine home directory for theme download".to_string());
  }
}

fn theme_file_name(theme: &ProvidedThemeInfo) -> Result<String, String> {
  theme
    .url
    .rsplit('/')
    .next()
    .map(|name| name.to_string())
    .or_else(|| Some(format!("{}.theme.css", theme.id)))
    .ok_or_else(|| format!("could not determine file name from url: {}", theme.url))
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

fn remove_dir(source: &Path) -> Result<(), String> {
  if source.is_dir() {
    fs::remove_dir_all(source)
      .map_err(|err| format!("Failed to remove directory {}: {err}", source.display()))
  } else {
    fs::remove_file(source)
      .map_err(|err| format!("Failed to remove file {}: {err}", source.display()))
  }
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

pub fn move_themes_to_backup(destination: &Path) -> Result<Option<PathBuf>, String> {
  let source = theme_dir()?;

  if !source.exists() {
    return Ok(None);
  }

  let dest_path = destination.join("themes");

  match fs::rename(&source, &dest_path) {
    Ok(_) => Ok(Some(dest_path)),
    Err(err) => {
      if !is_cross_device_link(&err) {
        return Err(format!(
          "Failed to move themes from {} to {}: {err}",
          source.display(),
          dest_path.display()
        ));
      }

      copy_dir_recursive(&source, &dest_path)?;
      remove_dir(&source)?;

      Ok(Some(dest_path))
    }
  }
}

pub fn download_themes(themes: &[ProvidedThemeInfo]) -> Result<String, String> {
  if themes.is_empty() {
    return Ok("No themes enabled; skipping download".to_string());
  }

  let dir = theme_dir()?;

  fs::create_dir_all(&dir)
    .map_err(|err| format!("Failed to create theme directory {}: {err}", dir.display()))?;

  let mut downloaded = Vec::new();

  for theme in themes {
    let file_name = theme_file_name(theme)?;
    let destination = dir.join(&file_name);

    let response =
      get(&theme.url).map_err(|err| format!("Failed to download {}: {err}", theme.url))?;

    if !response.status().is_success() {
      return Err(format!(
        "Theme request failed for {} with status {}",
        theme.url,
        response.status()
      ));
    }

    let content = response
      .text()
      .map_err(|err| format!("Failed to read response body for {}: {err}", theme.url))?;

    fs::write(&destination, content)
      .map_err(|err| format!("Failed to write theme {}: {}", destination.display(), err))?;
    downloaded.push(theme.name.clone());
  }

  Ok(format!(
    "Downloaded {} theme(s): {}",
    downloaded.len(),
    downloaded.join(", ")
  ))
}
