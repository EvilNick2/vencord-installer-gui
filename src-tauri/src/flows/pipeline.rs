use serde::Serialize;
use std::path::Path;

use crate::options;

use super::{backup, discord_clients};

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

  pub fn pending(message: impl Into<String>) -> Self {
    Self {
      status: StepStatus::Pending,
      message: Some(message.into()),
      detail: None,
    }
  }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PatchFlowResult {
  pub close_discord: StepResult<Vec<String>>,
  pub backup: StepResult<backup::BackupResult>,
  pub clone_repo: StepResult<String>,
  pub build: StepResult<String>,
  pub inject: StepResult<String>,
  pub reopen_discord: StepResult<Vec<String>>,
}

#[tauri::command]
pub fn run_patch_flow(source_path: String) -> Result<PatchFlowResult, String> {
  let options = options::read_user_options()?;

  let discord_state = discord_clients::close_discord_clients(options.close_discord_on_backup);

  let close_step = if discord_state.closing_skipped {
    StepResult::skipped("Closing Discord is disabled in settings")
  } else {
    StepResult::completed(discord_state.closed_clients.clone())
  };

  let backup_path = backup::move_vencord_install(Path::new(&source_path))?;

  let backup_result = backup::BackupResult {
    source_path: source_path.clone(),
    backup_path: backup_path.to_string_lossy().into_owned(),
    closed_clients: discord_state.closed_clients.clone(),
    restarted_clients: Vec::new(),
    closing_skipped: discord_state.closing_skipped,
  };

  let backup_step = StepResult::completed(backup_result);

  let clone_step =
    StepResult::pending("Repository clone step placeholder; implement Vencord sync next");
  let build_step = StepResult::pending("Build step placeholder; wire to installer build command");
  let inject_step = StepResult::pending("Inject step placeholder; add patching logic after build");

  let reopen_step = if discord_state.closing_skipped {
    StepResult::skipped("Discord was not closed; no restart needed")
  } else {
    let restarted = discord_clients::restart_processes(&discord_state.processes);
    StepResult::completed(restarted)
  };

  Ok(PatchFlowResult {
    close_discord: close_step,
    backup: backup_step,
    clone_repo: clone_step,
    build: build_step,
    inject: inject_step,
    reopen_discord: reopen_step,
  })
}