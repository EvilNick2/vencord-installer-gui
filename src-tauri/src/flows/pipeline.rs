use serde::{Deserialize, Serialize};
use std::path::Path;

use crate::{discord, options};

use super::{backup, discord_clients, repo, themes};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum DevTestStep {
  CloseDiscord,
  Backup,
  SyncRepo,
  Build,
  Inject,
  DownloadThemes,
  ReopenDiscord,
}

#[allow(dead_code)]
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub enum StepStatus {
  Completed,
  Skipped,
  Pending,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StepResult<T> {
  pub status: StepStatus,
  pub message: Option<String>,
  pub detail: Option<T>,
}

impl<T> StepResult<T> {
  pub fn completed(detail: T) -> Self {
    Self {
      status: StepStatus::Completed,
      message: None,
      detail: Some(detail),
    }
  }

  pub fn skipped(message: impl Into<String>) -> Self {
    Self {
      status: StepStatus::Skipped,
      message: Some(message.into()),
      detail: None,
    }
  }

  #[allow(dead_code)]
  pub fn pending(message: impl Into<String>) -> Self {
    Self {
      status: StepStatus::Pending,
      message: Some(message.into()),
      detail: None,
    }
  }
}

fn resolve_selected_discord_locations(selected_ids: &[String]) -> Result<Vec<String>, String> {
  if selected_ids.is_empty() {
    return Ok(Vec::new());
  }

  let installs = discord::get_discord_installs();
  let mut locations = Vec::new();
  let mut missing = Vec::new();

  for id in selected_ids {
    if let Some(install) = installs.iter().find(|inst| &inst.id == id) {
      locations.push(install.path.clone());
    } else {
      missing.push(id.clone());
    }
  }

  if !missing.is_empty() {
    return Err(format!(
      "The following Discord client selections are not installed: {}",
      missing.join(", ")
    ));
  }

  Ok(locations)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PatchFlowResult {
  pub close_discord: StepResult<Vec<String>>,
  pub backup: StepResult<backup::BackupResult>,
  pub sync_repo: StepResult<String>,
  pub build: StepResult<String>,
  pub inject: StepResult<String>,
  pub download_themes: StepResult<String>,
  pub reopen_discord: StepResult<Vec<String>>,
}

#[derive(Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum DevTestResult {
  CloseDiscord {
    closed_clients: Vec<String>,
    closing_skipped: bool,
  },
  Backup {
    result: backup::BackupResult,
  },
  SyncRepo {
    path: String,
  },
  Build {
    message: String,
    path: Option<String>,
  },
  Inject {
    message: String,
  },
  DownloadThemes {
    message: String,
  },
  ReopenDiscord {
    restarted: Vec<String>,
    closed_clients: Vec<String>,
    closing_skipped: bool,
  },
}

#[tauri::command]
pub fn run_patch_flow() -> Result<PatchFlowResult, String> {
  let options = options::read_user_options()?;
  let plugin_urls = options::resolve_plugin_repositories(&options);
  let themes = options::resolve_themes(&options);

  let discord_state = discord_clients::close_discord_clients(options.close_discord_on_backup);

  let close_step = if discord_state.closing_skipped {
    StepResult::skipped("Closing Discord is disabled in settings")
  } else {
    StepResult::completed(discord_state.closed_clients.clone())
  };

  let vencord_install = Path::new(&options.vencord_repo_dir);

  let backup_path = backup::move_vencord_install(&vencord_install)?;

  let backup_result = backup::BackupResult {
    source_path: vencord_install.to_string_lossy().into_owned(),
    backup_path: backup_path.to_string_lossy().into_owned(),
    closed_clients: discord_state.closed_clients.clone(),
    restarted_clients: Vec::new(),
    closing_skipped: discord_state.closing_skipped,
  };

  let backup_step = StepResult::completed(backup_result);

  let sync_path = match repo::sync_vencord_repo(
    &options.vencord_repo_url,
    &options.vencord_repo_dir,
    &plugin_urls,
  ) {
    Ok(path) => path,
    Err(err) => {
      if !discord_state.closing_skipped {
        let _ = discord_clients::restart_processes(&discord_state.processes);
      }

      return Err(err);
    }
  };

  let sync_step = StepResult::completed(sync_path.clone());
  let build_step = match repo::build_vencord_repo(&sync_path) {
    Ok(message) => StepResult::completed(message),
    Err(err) => {
      if !discord_state.closing_skipped {
        let _ = discord_clients::restart_processes(&discord_state.processes);
      }

      return Err(err);
    }
  };
  let inject_locations = match resolve_selected_discord_locations(&options.selected_discord_clients)
  {
    Ok(locations) => locations,
    Err(err) => {
      if !discord_state.closing_skipped {
        let _ = discord_clients::restart_processes(&discord_state.processes);
      }

      return Err(err);
    }
  };

  let inject_step = if inject_locations.is_empty() {
    StepResult::skipped("No Discord clients selected for injection")
  } else {
    match repo::inject_vencord_repo(&sync_path, &inject_locations) {
      Ok(message) => StepResult::completed(message),
      Err(err) => {
        if !discord_state.closing_skipped {
          let _ = discord_clients::restart_processes(&discord_state.processes);
        }

        return Err(err);
      }
    }
  };

  let themes_step = if themes.is_empty() {
    StepResult::skipped("No themes enabled; skipping download")
  } else {
    match themes::download_themes(&themes) {
      Ok(message) => StepResult::completed(message),
      Err(err) => {
        if !discord_state.closing_skipped {
          let _ = discord_clients::restart_processes(&discord_state.processes);
        }

        return Err(err);
      }
    }
  };

  let reopen_step = if discord_state.closing_skipped {
    StepResult::skipped("Discord was not closed; no restart needed")
  } else {
    let restarted = discord_clients::restart_processes(&discord_state.processes);
    StepResult::completed(restarted)
  };

  Ok(PatchFlowResult {
    close_discord: close_step,
    backup: backup_step,
    sync_repo: sync_step,
    build: build_step,
    inject: inject_step,
    download_themes: themes_step,
    reopen_discord: reopen_step,
  })
}

#[tauri::command]
pub fn run_dev_test(
  step: DevTestStep,
  source_path: Option<String>,
) -> Result<DevTestResult, String> {
  match step {
    DevTestStep::CloseDiscord => {
      let options = options::read_user_options()?;
      let state = discord_clients::close_discord_clients(options.close_discord_on_backup);

      let mut closed_clients = state.closed_clients;

      if closed_clients.is_empty() && !state.processes.is_empty() {
        closed_clients = state
          .processes
          .iter()
          .map(|proc| proc.name.clone())
          .collect();
      }

      Ok(DevTestResult::CloseDiscord {
        closed_clients,
        closing_skipped: state.closing_skipped,
      })
    }
    DevTestStep::Backup => {
      let path = source_path
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| "Provide a source path before running the backup test".to_string())?;

      let result = backup::backup_vencord_install(path)?;

      Ok(DevTestResult::Backup { result })
    }
    DevTestStep::SyncRepo => {
      let options = options::read_user_options()?;
      let plugins = options::resolve_plugin_repositories(&options);
      let path = repo::sync_vencord_repo(
        &options.vencord_repo_url,
        &options.vencord_repo_dir,
        &plugins,
      )?;

      Ok(DevTestResult::SyncRepo { path })
    }
    DevTestStep::Build => {
      let options = options::read_user_options()?;
      let message = repo::build_vencord_repo(&options.vencord_repo_dir)?;

      Ok(DevTestResult::Build {
        message,
        path: Some(options.vencord_repo_dir),
      })
    }
    DevTestStep::Inject => {
      let options = options::read_user_options()?;
      let locations = resolve_selected_discord_locations(&options.selected_discord_clients)?;

      if locations.is_empty() {
        return Ok(DevTestResult::Inject {
          message: "No Discord clients selected for injection".to_string(),
        });
      }

      let message = repo::inject_vencord_repo(&options.vencord_repo_dir, &locations)?;

      Ok(DevTestResult::Inject { message })
    }
    DevTestStep::DownloadThemes => {
      let options = options::read_user_options()?;
      let themes = options::resolve_themes(&options);

      if themes.is_empty() {
        return Ok(DevTestResult::DownloadThemes {
          message: "No themes enabled; skipping download".to_string(),
        });
      }

      let message = themes::download_themes(&themes)?;

      Ok(DevTestResult::DownloadThemes { message })
    }
    DevTestStep::ReopenDiscord => {
      let last_closed = discord_clients::take_last_closed_state();

      if last_closed.processes.is_empty() {
        return Ok(DevTestResult::ReopenDiscord {
          restarted: Vec::new(),
          closed_clients: Vec::new(),
          closing_skipped: last_closed.closing_skipped,
        });
      }

      let closed_clients = last_closed
        .processes
        .iter()
        .map(|proc| proc.name.clone())
        .collect();
      let restarted = discord_clients::restart_processes(&last_closed.processes);

      Ok(DevTestResult::ReopenDiscord {
        restarted,
        closed_clients,
        closing_skipped: false,
      })
    }
  }
}