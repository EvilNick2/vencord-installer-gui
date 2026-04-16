use serde::Serialize;
use std::path::{Path, PathBuf};

#[derive(Serialize)]
pub struct DiscordInstall {
  pub id: String,
  pub name: String,
  pub path: String,
}

fn resolve_candidate_path(path: &Path) -> Option<PathBuf> {
  if path.exists() && path.is_dir() {
    return dunce::canonicalize(path)
      .ok()
      .or_else(|| Some(path.to_path_buf()));
  }

  let nested_candidates = [path.join("Discord"), path.join("discord")];

  for nested in nested_candidates {
    if nested.exists() && nested.is_dir() {
      return dunce::canonicalize(&nested)
        .ok()
        .or_else(|| Some(nested.to_path_buf()));
    }
  }

  None
}

fn add_candidates(installs: &mut Vec<DiscordInstall>, candidates: &[(&str, &str, PathBuf)]) {
  for (id, name, path) in candidates {
    if installs.iter().any(|install| install.id == *id) {
      continue;
    }

    if let Some(resolved_path) = resolve_candidate_path(path) {
      installs.push(DiscordInstall {
        id: (*id).to_string(),
        name: (*name).to_string(),
        path: resolved_path.to_string_lossy().into_owned(),
      });
    }
  }
}

#[cfg(target_os = "linux")]
fn parse_version_tuple(name: &str) -> Option<Vec<u32>> {
  let mut parts = Vec::new();

  for part in name.split('.') {
    if part.is_empty() {
      return None;
    }

    let value = part.parse::<u32>().ok()?;
    parts.push(value);
  }

  if parts.is_empty() {
    return None;
  }

  Some(parts)
}

#[cfg(target_os = "linux")]
fn latest_versioned_subdir(base: &Path) -> Option<PathBuf> {
  let entries = std::fs::read_dir(base).ok()?;

  entries
    .filter_map(Result::ok)
    .filter_map(|entry| {
      let path = entry.path();
      if !path.is_dir() {
        return None;
      }

      let name = path.file_name()?.to_str()?;
      let version = parse_version_tuple(name)?;

      Some((version, path))
    })
    .max_by(|(a, _), (b, _)| a.cmp(b))
    .map(|(_, path)| path)
}

fn detect_discord_installs() -> Vec<DiscordInstall> {
  let mut installs = Vec::new();

  #[cfg(target_os = "windows")]
  {
    use std::env;

    let add_from_env = |var: &str, installs: &mut Vec<DiscordInstall>| {
      if let Ok(path) = env::var(var) {
        let base = PathBuf::from(path);

        let candidates = [
          ("stable", "Discord Stable", base.join("Discord")),
          ("ptb", "Discord PTB", base.join("DiscordPTB")),
          ("canary", "Discord Canary", base.join("DiscordCanary")),
        ];

        add_candidates(installs, &candidates);
      }
    };

    add_from_env("LOCALAPPDATA", &mut installs);

    if installs.is_empty() {
      add_from_env("APPDATA", &mut installs);
    }
  }

  #[cfg(target_os = "linux")]
  {
    let system_candidates = [
      // Arch-like distro package locations
      (
        "stable",
        "Discord Stable",
        PathBuf::from("/usr/lib/discord"),
      ),
      ("ptb", "Discord PTB", PathBuf::from("/usr/lib/discord-ptb")),
      (
        "canary",
        "Discord Canary",
        PathBuf::from("/usr/lib/discord-canary"),
      ),
      // Debian/Ubuntu style package locations
      (
        "stable",
        "Discord Stable",
        PathBuf::from("/usr/share/discord"),
      ),
      (
        "ptb",
        "Discord PTB",
        PathBuf::from("/usr/share/discord-ptb"),
      ),
      (
        "canary",
        "Discord Canary",
        PathBuf::from("/usr/share/discord-canary"),
      ),
      // Upstream tarball installs
      ("stable", "Discord Stable", PathBuf::from("/opt/discord")),
      (
        "stable",
        "Discord Stable",
        PathBuf::from("/opt/discord/Discord"),
      ),
      ("ptb", "Discord PTB", PathBuf::from("/opt/discordptb")),
      (
        "ptb",
        "Discord PTB",
        PathBuf::from("/opt/discordptb/Discord"),
      ),
      (
        "canary",
        "Discord Canary",
        PathBuf::from("/opt/discordcanary"),
      ),
      (
        "canary",
        "Discord Canary",
        PathBuf::from("/opt/discordcanary/Discord"),
      ),
      ("stable", "Discord Stable", PathBuf::from("/opt/Discord")),
      ("ptb", "Discord PTB", PathBuf::from("/opt/DiscordPTB")),
      (
        "canary",
        "Discord Canary",
        PathBuf::from("/opt/DiscordCanary"),
      ),

    ];

    add_candidates(&mut installs, &system_candidates);

    if let Some(home) = dirs::home_dir() {
      let config = home.join(".config");
      let stable_base = config.join("discord");
      let ptb_base = config.join("discordptb");
      let canary_base = config.join("discordcanary");

      let config_candidates = [
        (
          "stable",
          "Discord Stable",
          latest_versioned_subdir(&stable_base).unwrap_or(stable_base),
        ),
        (
          "ptb",
          "Discord PTB",
          latest_versioned_subdir(&ptb_base).unwrap_or(ptb_base),
        ),
        (
          "canary",
          "Discord Canary",
          latest_versioned_subdir(&canary_base).unwrap_or(canary_base),
        ),
      ];

      add_candidates(&mut installs, &config_candidates);

      let flatpak_stable_base = home.join(".var/app/com.discordapp.Discord/config/discord");
      let flatpak_ptb_base = home.join(".var/app/com.discordapp.DiscordPTB/config/discordptb");
      let flatpak_canary_base =
        home.join(".var/app/com.discordapp.DiscordCanary/config/discordcanary");

      let flatpak_candidates = [
        (
          "stable",
          "Discord Stable (Flatpak)",
          latest_versioned_subdir(&flatpak_stable_base).unwrap_or(flatpak_stable_base),
        ),
        (
          "ptb",
          "Discord PTB (Flatpak)",
          latest_versioned_subdir(&flatpak_ptb_base).unwrap_or(flatpak_ptb_base),
        ),
        (
          "canary",
          "Discord Canary (Flatpak)",
          latest_versioned_subdir(&flatpak_canary_base).unwrap_or(flatpak_canary_base),
        ),
      ];

      add_candidates(&mut installs, &flatpak_candidates);
    }
  }

  #[cfg(target_os = "macos")]
  {
    if let Some(home) = dirs::home_dir() {
      let app_support = home.join("Library").join("Application Support");
      let candidates = [
        ("stable", "Discord Stable", app_support.join("discord")),
        ("ptb", "Discord PTB", app_support.join("discordptb")),
        (
          "canary",
          "Discord Canary",
          app_support.join("discordcanary"),
        ),
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
