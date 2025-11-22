use log::warn;
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, fs, path::PathBuf};

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

static PROVIDED_REPOSITORIES: Lazy<Vec<ProvidedRepository>> = Lazy::new(|| {
  serde_json::from_str(include_str!("provided_repositories.json"))
      .expect("Failed to parse provided_repositories.json")
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

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OptionsResponse {
  pub vencord_repo_url: String,
  pub user_repositories: Vec<String>,
  #[serde(default)]
  pub provided_repositories: Vec<ProvidedRepositoryView>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserOptions {
  pub vencord_repo_url: String,
  pub vencord_repo_url_default: Option<String>,
  pub user_repositories: Vec<String>,
  #[serde(default)]
  pub provided_repositories: Vec<ProvidedRepositoryState>,
}

impl Default for UserOptions {
  fn default() -> Self {
    Self {
      vencord_repo_url: DEFAULT_VENCORD_REPO_URL.to_string(),
      vencord_repo_url_default: Some(DEFAULT_VENCORD_REPO_URL.to_string()),
      user_repositories: Vec::new(),
      provided_repositories: PROVIDED_REPOSITORIES
          .iter()
          .map(|repo| ProvidedRepositoryState {
            id: repo.id.clone(),
            enabled: repo.default_enabled,
          })
          .collect(),
    }
  }
}

fn options_path() -> Result<PathBuf, String> {
  let base_dir = dirs::config_dir()
      .or_else(dirs::home_dir)
      .ok_or_else(|| "Could not determine configuration directory".to_string())?;
  let dir = base_dir.join("vencord-installer-gui");
  fs::create_dir_all(&dir).map_err(|err| format!("Failed to create options directory: {err}"))?;

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

fn to_response(options: UserOptions) -> OptionsResponse {
  OptionsResponse {
    vencord_repo_url: options.vencord_repo_url,
    user_repositories: options.user_repositories,
    provided_repositories: merge_provided_repositories(&options.provided_repositories),
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

  UserOptions {
    vencord_repo_url: options.vencord_repo_url,
    vencord_repo_url_default: Some(DEFAULT_VENCORD_REPO_URL.to_string()),
    user_repositories: options.user_repositories,
    provided_repositories,
  }
}

#[tauri::command]
pub fn get_user_options() -> Result<OptionsResponse, String> {
  let options = load_options()?;
  Ok(to_response(options))
}

#[tauri::command]
pub fn update_user_options(options: OptionsResponse) -> Result<OptionsResponse, String> {
  let storage = to_storage(options);
  save_options(&storage)?;

  let refreshed = load_options()?;
  Ok(to_response(refreshed))
}