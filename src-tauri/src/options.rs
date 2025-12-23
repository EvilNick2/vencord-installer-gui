use log::warn;
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, env, fs, path::PathBuf};

use crate::config::app_config_dir;

fn default_true() -> bool {
  true
}

fn default_repo_base_dir() -> String {
  let home_var = if cfg!(windows) { "USERPROFILE" } else { "HOME" };
  let home_dir = env::var(home_var).unwrap_or_else(|_| ".".to_string());

  PathBuf::from(home_dir)
  .join("Vencord")
  .to_string_lossy()
  .into_owned()
}

fn default_selected_discord_clients() -> Vec<String> {
  vec!["stable".to_string()]
}

fn legacy_repo_base_dir() -> String {
  let home_var = if cfg!(windows) { "USERPROFILE" } else { "HOME" };
  let home_dir = env::var(home_var).unwrap_or_else(|_| ".".to_string());

  PathBuf::from(home_dir)
    .join("Documents")
    .join("Vencord")
    .to_string_lossy()
    .into_owned()
}

const DEFAULT_VENCORD_REPO_URL: &str = "https://github.com/Vendicated/Vencord.git";

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProvidedRepository {
  id: String,
  name: String,
  url: String,
  description: String,
  default_enabled: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProvidedTheme {
  id: String,
  name: String,
  url: String,
  description: String,
  default_enabled: bool,
}

static PROVIDED_REPOSITORIES: Lazy<Vec<ProvidedRepository>> = Lazy::new(|| {
  serde_json::from_str(include_str!("provided_repositories.json"))
    .expect("Failed to parse provided_repositories.json")
});

static PROVIDED_THEMES: Lazy<Vec<ProvidedTheme>> = Lazy::new(|| {
  serde_json::from_str(include_str!("provided_themes.json"))
    .expect("Failed to parse provided_themes.json")
});

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProvidedRepositoryState {
  pub id: String,
  pub enabled: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProvidedRepositoryView {
  pub id: String,
  pub name: String,
  pub url: String,
  pub description: String,
  pub default_enabled: bool,
  pub enabled: bool,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProvidedThemeState {
  pub id: String,
  pub enabled: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProvidedThemeView {
  pub id: String,
  pub name: String,
  pub url: String,
  pub description: String,
  pub default_enabled: bool,
  pub enabled: bool,
}

#[derive(Clone, Debug)]
pub struct ProvidedThemeInfo {
  pub id: String,
  pub name: String,
  pub url: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OptionsResponse {
  pub vencord_repo_url: String,
  #[serde(default = "default_repo_base_dir")]
  pub vencord_repo_dir: String,
  pub user_repositories: Vec<String>,
  #[serde(default)]
  pub user_themes: Vec<String>,
  #[serde(default)]
  pub provided_repositories: Vec<ProvidedRepositoryView>,
  #[serde(default)]
  pub provided_themes: Vec<ProvidedThemeView>,
  #[serde(default = "default_true")]
  pub close_discord_on_backup: bool,
  #[serde(default = "default_selected_discord_clients")]
  pub selected_discord_clients: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserOptions {
  pub vencord_repo_url: String,
  #[serde(default = "default_repo_base_dir")]
  pub vencord_repo_dir: String,
  pub vencord_repo_url_default: Option<String>,
  pub user_repositories: Vec<String>,
  #[serde(default)]
  pub user_themes: Vec<String>,
  #[serde(default)]
  pub provided_repositories: Vec<ProvidedRepositoryState>,
  #[serde(default)]
  pub provided_themes: Vec<ProvidedThemeState>,
  #[serde(default = "default_true")]
  pub close_discord_on_backup: bool,
  #[serde(default = "default_selected_discord_clients")]
  pub selected_discord_clients: Vec<String>,
}

impl Default for UserOptions {
  fn default() -> Self {
    Self {
      vencord_repo_url: DEFAULT_VENCORD_REPO_URL.to_string(),
      vencord_repo_url_default: Some(DEFAULT_VENCORD_REPO_URL.to_string()),
      vencord_repo_dir: default_repo_base_dir(),
      user_repositories: Vec::new(),
      user_themes: Vec::new(),
      provided_repositories: PROVIDED_REPOSITORIES
        .iter()
        .map(|repo| ProvidedRepositoryState {
          id: repo.id.clone(),
          enabled: repo.default_enabled,
        })
        .collect(),
      provided_themes: PROVIDED_THEMES
        .iter()
        .map(|theme| ProvidedThemeState {
          id: theme.id.clone(),
          enabled: theme.default_enabled,
        })
        .collect(),
      close_discord_on_backup: default_true(),
      selected_discord_clients: default_selected_discord_clients(),
    }
  }
}

fn options_path() -> Result<PathBuf, String> {
  let dir = app_config_dir().map_err(|err| format!("Failed to create options directory: {err}"))?;

  Ok(dir.join("user-options.json"))
}

fn save_options(options: &UserOptions) -> Result<(), String> {
  let path = options_path()?;
  let json = serde_json::to_string_pretty(options)
    .map_err(|err| format!("Failed to serialize options: {err}"))?;

  fs::write(path, json).map_err(|err| format!("Failed to write options file: {err}"))
}

fn reconcile_options(mut options: UserOptions) -> Result<UserOptions, String> {
  let mut updated = false;

  let current_default_url = DEFAULT_VENCORD_REPO_URL.to_string();
  let saved_default_url = options
    .vencord_repo_url_default
    .clone()
    .unwrap_or_else(|| current_default_url.clone());

  if saved_default_url != current_default_url {
    if options.vencord_repo_url == saved_default_url {
      options.vencord_repo_url = current_default_url.clone();
    }

    options.vencord_repo_url_default = Some(current_default_url.clone());
    updated = true;
  }

  let current_default_dir = default_repo_base_dir();
  let legacy_default_dir = legacy_repo_base_dir();

  if options.vencord_repo_dir == legacy_default_dir {
    options.vencord_repo_dir = current_default_dir;
    updated = true;
  }

  let provided: Vec<ProvidedRepositoryState> = PROVIDED_REPOSITORIES
    .iter()
    .map(|repo| ProvidedRepositoryState {
      id: repo.id.clone(),
      enabled: options
        .provided_repositories
        .iter()
        .find(|entry| entry.id == repo.id)
        .map(|entry| entry.enabled)
        .unwrap_or(repo.default_enabled),
    })
    .collect();

  if provided != options.provided_repositories {
    options.provided_repositories = provided;
    updated = true;
  }

  let themes: Vec<ProvidedThemeState> = PROVIDED_THEMES
    .iter()
    .map(|theme| ProvidedThemeState {
      id: theme.id.clone(),
      enabled: options
        .provided_themes
        .iter()
        .find(|entry| entry.id == theme.id)
        .map(|entry| entry.enabled)
        .unwrap_or(theme.default_enabled),
    })
    .collect();

  if themes != options.provided_themes {
    options.provided_themes = themes;
    updated = true;
  }

  if updated {
    save_options(&options)?;
  }

  Ok(options)
}

fn load_options() -> Result<UserOptions, String> {
  let path = options_path()?;

  if path.exists() {
    match fs::read_to_string(&path) {
      Ok(content) => match serde_json::from_str::<UserOptions>(&content) {
        Ok(opts) => return reconcile_options(opts),
        Err(err) => warn!("Failed to parse options file, resetting to defaults: {err}"),
      },
      Err(err) => warn!("Failed to read options file, resetting to defaults: {err}"),
    }
  }

  let defaults = UserOptions::default();
  save_options(&defaults)?;
  Ok(defaults)
}

fn merge_provided_repositories(saved: &[ProvidedRepositoryState]) -> Vec<ProvidedRepositoryView> {
  let saved_map: HashMap<String, bool> = saved
    .iter()
    .map(|entry| (entry.id.clone(), entry.enabled))
    .collect();

  PROVIDED_REPOSITORIES
    .iter()
    .map(|repo| {
      let enabled = saved_map
        .get(&repo.id)
        .copied()
        .unwrap_or(repo.default_enabled);

      ProvidedRepositoryView {
        id: repo.id.clone(),
        name: repo.name.clone(),
        url: repo.url.clone(),
        description: repo.description.clone(),
        default_enabled: repo.default_enabled,
        enabled,
      }
    })
    .collect()
}

fn merge_provided_themes(saved: &[ProvidedThemeState]) -> Vec<ProvidedThemeView> {
  let saved_map: HashMap<String, bool> = saved
    .iter()
    .map(|entry| (entry.id.clone(), entry.enabled))
    .collect();

  PROVIDED_THEMES
    .iter()
    .map(|theme| {
      let enabled = saved_map
        .get(&theme.id)
        .copied()
        .unwrap_or(theme.default_enabled);

      ProvidedThemeView {
        id: theme.id.clone(),
        name: theme.name.clone(),
        url: theme.url.clone(),
        description: theme.description.clone(),
        default_enabled: theme.default_enabled,
        enabled,
      }
    })
    .collect()
}

fn to_response(options: UserOptions) -> OptionsResponse {
  OptionsResponse {
    vencord_repo_url: options.vencord_repo_url,
    vencord_repo_dir: options.vencord_repo_dir,
    user_repositories: options.user_repositories,
    user_themes: options.user_themes,
    provided_repositories: merge_provided_repositories(&options.provided_repositories),
    provided_themes: merge_provided_themes(&options.provided_themes),
    close_discord_on_backup: options.close_discord_on_backup,
    selected_discord_clients: options.selected_discord_clients,
  }
}

fn to_storage(options: OptionsResponse) -> UserOptions {
  let valid_ids: HashMap<_, _> = PROVIDED_REPOSITORIES
    .iter()
    .map(|repo| (repo.id.clone(), repo.default_enabled))
    .collect();

  let provided_repositories = options
    .provided_repositories
    .into_iter()
    .filter(|repo| valid_ids.contains_key(&repo.id))
    .map(|repo| ProvidedRepositoryState {
      id: repo.id,
      enabled: repo.enabled,
    })
    .collect();

  let theme_ids: HashMap<_, _> = PROVIDED_THEMES
    .iter()
    .map(|theme| (theme.id.clone(), theme.default_enabled))
    .collect();

  let provided_themes = options
    .provided_themes
    .into_iter()
    .filter(|theme| theme_ids.contains_key(&theme.id))
    .map(|theme| ProvidedThemeState {
      id: theme.id,
      enabled: theme.enabled,
    })
    .collect();

  UserOptions {
    vencord_repo_url: options.vencord_repo_url,
    vencord_repo_url_default: Some(DEFAULT_VENCORD_REPO_URL.to_string()),
    vencord_repo_dir: options.vencord_repo_dir,
    user_repositories: options.user_repositories,
    user_themes: options.user_themes,
    provided_repositories,
    provided_themes,
    close_discord_on_backup: options.close_discord_on_backup,
    selected_discord_clients: options.selected_discord_clients,
  }
}

#[tauri::command]
pub fn get_user_options() -> Result<OptionsResponse, String> {
  let options = read_user_options()?;
  Ok(to_response(options))
}

#[tauri::command]
pub fn update_user_options(options: OptionsResponse) -> Result<OptionsResponse, String> {
  let storage = to_storage(options);
  save_options(&storage)?;

  let refreshed = load_options()?;
  Ok(to_response(refreshed))
}

pub fn read_user_options() -> Result<UserOptions, String> {
  load_options()
}

#[tauri::command]
pub fn update_selected_discord_clients(selected: Vec<String>) -> Result<(), String> {
  let mut options = read_user_options()?;

  options.selected_discord_clients = selected;

  save_options(&options)
}

pub fn resolve_plugin_repositories(options: &UserOptions) -> Vec<String> {
  let provided_enabled: HashMap<_, _> = options
    .provided_repositories
    .iter()
    .map(|repo| (repo.id.clone(), repo.enabled))
    .collect();

  let mut urls: Vec<String> = PROVIDED_REPOSITORIES
    .iter()
    .filter(|repo| {
      provided_enabled
        .get(&repo.id)
        .copied()
        .unwrap_or(repo.default_enabled)
    })
    .map(|repo| repo.url.clone())
    .collect();

  urls.extend(
    options
      .user_repositories
      .iter()
      .filter(|url| !url.trim().is_empty())
      .cloned(),
  );

  urls
}

pub fn resolve_themes(options: &UserOptions) -> Vec<ProvidedThemeInfo> {
  let provided_enabled: HashMap<_, _> = options
    .provided_themes
    .iter()
    .map(|theme| (theme.id.clone(), theme.enabled))
    .collect();

  let mut themes: Vec<ProvidedThemeInfo> = PROVIDED_THEMES
    .iter()
    .filter(|theme| {
      provided_enabled
        .get(&theme.id)
        .copied()
        .unwrap_or(theme.default_enabled)
    })
    .map(|theme| ProvidedThemeInfo {
      id: theme.id.clone(),
      name: theme.name.clone(),
      url: theme.url.clone(),
    })
    .collect();

  let base_index = themes.len();

  let user_theme_entries = options
    .user_themes
    .iter()
    .enumerate()
    .filter_map(|(idx, url)| {
      let trimmed = url.trim();

      if trimmed.is_empty() {
        return None;
      }

      let id = format!("user-theme-{}", base_index + idx);
      let name = trimmed
        .rsplit('/')
        .next()
        .filter(|segment| !segment.is_empty())
        .unwrap_or(trimmed);

      Some(ProvidedThemeInfo {
        id,
        name: name.to_string(),
        url: trimmed.to_string(),
      })
    });

  themes.extend(user_theme_entries);

  themes
}
