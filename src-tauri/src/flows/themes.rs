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

pub fn move_themes_to_backup(
  destination: &Path,
  themes: &[ProvidedThemeInfo],
) -> Result<Option<PathBuf>, String> {
  let source = theme_dir()?;

  if themes.is_empty() || !source.exists() {
    return Ok(None);
  }

  let mut allowed_files = Vec::new();

  for theme in themes {
    let file_name = theme_file_name(theme)?;
    if !file_name.is_empty() {
      allowed_files.push(file_name);
    }
  }

  if allowed_files.is_empty() {
    return Ok(None);
  }

  let dest_path = destination.join("themes");
  let mut moved_any = false;

  for file_name in allowed_files {
    let source_file = source.join(&file_name);

    if !source_file.exists() {
      continue;
    }

    if !moved_any {
      fs::create_dir_all(&dest_path).map_err(|err| {
        format!(
          "Failed to create backup theme directory {}: {err}",
          dest_path.display(),
        )
      })?;
    }

    let dest_file = dest_path.join(&file_name);

    match fs::rename(&source_file, &dest_file) {
      Ok(_) => moved_any = true,
      Err(err) => {
        if !is_cross_device_link(&err) {
          return Err(format!(
            "Failed to move theme {} to backup: {err}",
            source_file.display()
          ));
        }

        fs::copy(&source_file, &dest_file).map_err(|err| {
          format!(
            "Failed to copy {} to {}: {err}",
            source_file.display(),
            dest_file.display()
          )
        })?;
        fs::remove_file(&source_file).map_err(|err| {
          format!(
            "Failed to remove original theme {}: {err}",
            source_file.display(),
          )
        })?;

        moved_any = true;
      }
    }
  }

  if moved_any {
    Ok(Some(dest_path))
  } else {
    Ok(None)
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
