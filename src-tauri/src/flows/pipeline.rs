use serde::{Deserialize, Serialize};
use std::path::PathBuf;

use crate::{discord, options};
use tauri::Emitter;

use super::{backup, discord_clients, repo, themes};

#[derive(Serialize, Clone, Copy)]
#[serde[rename_all = "camelCase"]]
enum PatchFlowStep {
  CloseDiscord,
  Backup,
  SyncRepo,
  Build,
  Inject,
  DownloadThemes,
  ReopenDiscord,
}

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
#[derive(Serialize, Clone, Copy)]
#[serde(rename_all = "camelCase")]
pub enum StepStatus {
  Running,
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

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct StepEventPayload {
  step: PatchFlowStep,
  status: StepStatus,
  message: Option<String>,
  detail: Option<serde_json::Value>,
}

impl<T> StepResult<T> {
  pub fn completed(detail: T) -> Self {
    Self {
      status: StepStatus::Completed,
      message: None,
      detail: Some(detail),
    }
  }

  pub fn running(message: impl Into<String>) -> Self {
    Self {
      status: StepStatus::Running,
      message: Some(message.into()),
      detail: None,
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

async fn run_blocking<T, F>(task: F) -> Result<T, String>
where
  T: Send + 'static,
  F: FnOnce() -> Result<T, String> + Send + 'static,
{
  tauri::async_runtime::spawn_blocking(task)
    .await
    .map_err(|err| err.to_string())?
}

fn emit_step_event<T: Serialize>(
  app: &tauri::AppHandle,
  step: PatchFlowStep,
  result: &StepResult<T>,
) {
  let detail = result
    .detail
    .as_ref()
    .and_then(|value| serde_json::to_value(value).ok());

  let payload = StepEventPayload {
    step,
    status: result.status,
    message: result.message.clone(),
    detail,
  };

  let _ = app.emit("patch-flow-step", payload);
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
pub async fn run_patch_flow(app: tauri::AppHandle) -> Result<PatchFlowResult, String> {
  let options = run_blocking(options::read_user_options).await?;
  let plugin_urls = options::resolve_plugin_repositories(&options);
  let themes = options::resolve_themes(&options);

  emit_step_event(
    &app,
    PatchFlowStep::CloseDiscord,
    &StepResult::<()>::running("Closing Discord clients"),
  );

  let discord_state = run_blocking({
    let close_enabled = options.close_discord_on_backup;
    move || Ok(discord_clients::close_discord_clients(close_enabled))
  })
  .await?;

  let close_step = if discord_state.closing_skipped {
    StepResult::skipped("Closing Discord is disabled in settings")
  } else {
    StepResult::completed(discord_state.closed_clients.clone())
  };
  emit_step_event(&app, PatchFlowStep::CloseDiscord, &close_step);

  let vencord_install = PathBuf::from(&options.vencord_repo_dir);

  emit_step_event(
    &app,
    PatchFlowStep::Backup,
    &StepResult::<()>::running("Backing up Vencord installation"),
  );

  let backup_path = run_blocking({
    let vencord_install = vencord_install.clone();
    move || backup::move_vencord_install(&vencord_install)
  })
  .await?;

  let backup_result = backup::BackupResult {
    source_path: vencord_install.to_string_lossy().into_owned(),
    backup_path: backup_path.to_string_lossy().into_owned(),
    closed_clients: discord_state.closed_clients.clone(),
    restarted_clients: Vec::new(),
    closing_skipped: discord_state.closing_skipped,
  };

  let backup_step = StepResult::completed(backup_result);
  emit_step_event(&app, PatchFlowStep::Backup, &backup_step);

  emit_step_event(
    &app,
    PatchFlowStep::SyncRepo,
    &StepResult::<()>::running("Syncing Vencord repository"),
  );

  let sync_path = match run_blocking({
    let repo_url = options.vencord_repo_url.clone();
    let repo_dir = options.vencord_repo_dir.clone();
    let plugin_urls = plugin_urls.clone();
    move || repo::sync_vencord_repo(&repo_url, &repo_dir, &plugin_urls)
  })
  .await
  {
    Ok(path) => path,
    Err(err) => {
      if !discord_state.closing_skipped {
        let _ = run_blocking({
          let processes = discord_state.processes.clone();
          move || Ok(discord_clients::restart_processes(&processes))
        })
        .await;
      }

      return Err(err);
    }
  };

  let sync_step = StepResult::completed(sync_path.clone());
  emit_step_event(&app, PatchFlowStep::SyncRepo, &sync_step);

  emit_step_event(
    &app,
    PatchFlowStep::Build,
    &StepResult::<()>::running("Building Vencord artifacts"),
  );

  let build_step = match run_blocking({
    let sync_path = sync_path.clone();
    move || repo::build_vencord_repo(&sync_path)
  })
  .await
  {
    Ok(message) => StepResult::completed(message),
    Err(err) => {
      if !discord_state.closing_skipped {
        let _ = run_blocking({
          let processes = discord_state.processes.clone();
          move || Ok(discord_clients::restart_processes(&processes))
        })
        .await;
      }

      return Err(err);
    }
  };
  emit_step_event(&app, PatchFlowStep::Build, &build_step);

  emit_step_event(
    &app,
    PatchFlowStep::Inject,
    &StepResult::<()>::running("Injecting patched files"),
  );

  let inject_locations = match run_blocking({
    let selected = options.selected_discord_clients.clone();
    move || resolve_selected_discord_locations(&selected)
  })
  .await
  {
    Ok(locations) => locations,
    Err(err) => {
      if !discord_state.closing_skipped {
        let _ = run_blocking({
          let processes = discord_state.processes.clone();
          move || Ok(discord_clients::restart_processes(&processes))
        })
        .await;
      }

      return Err(err);
    }
  };

  let inject_step = if inject_locations.is_empty() {
    StepResult::skipped("No Discord clients selected for injection")
  } else {
    match run_blocking({
      let sync_path = sync_path.clone();
      move || repo::inject_vencord_repo(&sync_path, &inject_locations)
    })
    .await
    {
      Ok(message) => StepResult::completed(message),
      Err(err) => {
        if !discord_state.closing_skipped {
          let _ = run_blocking({
            let processes = discord_state.processes.clone();
            move || Ok(discord_clients::restart_processes(&processes))
          })
          .await;
        }

        return Err(err);
      }
    }
  };
  emit_step_event(&app, PatchFlowStep::Inject, &inject_step);

  emit_step_event(
    &app,
    PatchFlowStep::DownloadThemes,
    &StepResult::<()>::running("Downloading themes"),
  );

  let themes_step = if themes.is_empty() {
    StepResult::skipped("No themes enabled; skipping download")
  } else {
    match run_blocking({
      let themes = themes.clone();
      move || themes::download_themes(&themes)
    })
    .await
    {
      Ok(message) => StepResult::completed(message),
      Err(err) => {
        if !discord_state.closing_skipped {
          let _ = run_blocking({
            let processes = discord_state.processes.clone();
            move || Ok(discord_clients::restart_processes(&processes))
          })
          .await;
        }

        return Err(err);
      }
    }
  };
  emit_step_event(&app, PatchFlowStep::DownloadThemes, &themes_step);

  emit_step_event(
    &app,
    PatchFlowStep::ReopenDiscord,
    &StepResult::<()>::running("Restarting Discord clients"),
  );

  let reopen_step = if discord_state.closing_skipped {
    StepResult::skipped("Discord was not closed; no restart needed")
  } else {
    let restarted = run_blocking({
      let processes = discord_state.processes.clone();
      move || Ok(discord_clients::restart_processes(&processes))
    })
    .await
    .unwrap_or_default();

    StepResult::completed(restarted)
  };
  emit_step_event(&app, PatchFlowStep::ReopenDiscord, &reopen_step);

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
