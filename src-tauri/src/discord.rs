use serde::Serialize;
use std::path::PathBuf;

#[derive(Serialize)]
pub struct DiscordInstall {
  pub id: String,
  pub name: String,
  pub path: String,
}

fn add_candidates(
  installs: &mut Vec<DiscordInstall>,
  candidates: &[(&str, &str, PathBuf)],
) {
  for (id, name, path) in candidates {
      if path.exists() && path.is_dir() {
        installs.push(DiscordInstall {
          id: (*id).to_string(),
          name: (*name).to_string(),
          path: path.to_string_lossy().into_owned(),
        });
      }
  }
}

fn detect_discord_installs() -> Vec<DiscordInstall> {
  let mut installs = Vec::new();

  #[cfg(target_os = "windows")]
  {
    use std::env;

    if let Ok(roaming) = env::var("APPDATA") {
      let base = PathBuf::from(roaming);

      let candidates = [
        ("stable", "Discord Stable", base.join("discord")),
        ("ptb", "Discord PTB", base.join("discordptb")),
        ("canary", "Discord Canary", base.join("discordcanary")),
      ];

      add_candidates(&mut installs, &candidates);
    }
  }

  #[cfg(target_os = "linux")]
  {
    if let Some(home) = dirs::home_dir() {
      let config = home.join(".config");

      let candidates = [
        ("stable", "Discord Stable", config.join("discord")),
        ("ptb", "Discord PTB", config.join("discordptb")),
        ("canary", "Discord Canary", config.join("discordcanary")),
      ];

      add_candidates(&mut installs, &candidates);
    }
  }

  #[cfg(target_os = "macos")]
  {
    if let Some(home) = dirs::home_dir() {
      let app_support = home.join("Library").join("Application Support");
      let candidates = [
        ("stable", "Discord Stable", app_support.join("discord")),
        ("ptb", "Discord PTB", app_support.join("discordptb")),
        ("canary", "Discord Canary", app_support.join("discordcanary")),
      ];

      add_candidates(&mut installs, &candidates);
    }
  }

  installs
}

#[tauri::command]
pub fn get_discord_installs() -> Vec<DiscordInstall> {
  detect_discord_installs()
}