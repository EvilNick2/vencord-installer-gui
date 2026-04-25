use chrono::Local;
use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf};
use tauri_plugin_opener::OpenerExt;

use crate::{config::app_config_dir, options};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunStep {
  pub id: String,
  pub title: String,
  pub status: String,
  pub friendly_message: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub verbose_detail: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunRecord {
  pub id: String,
  pub started_at: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub completed_at: Option<String>,
  pub overall_status: String,
  pub steps: Vec<RunStep>,
}

pub const FLOW_STEPS: &[(&str, &str)] = &[
  ("closeDiscord", "Close Discord"),
  ("backup", "Backup Vencord"),
  ("syncRepo", "Sync repository"),
  ("build", "Build files"),
  ("inject", "Inject Vencord"),
  ("downloadThemes", "Download themes"),
  ("reopenDiscord", "Reopen Discord"),
];

pub fn new_record() -> RunRecord {
  let now = Local::now();
  RunRecord {
    id: now.format("%Y-%m-%d_%H-%M-%S").to_string(),
    started_at: now.to_rfc3339(),
    completed_at: None,
    overall_status: "failed".to_string(),
    steps: Vec::new(),
  }
}

pub fn fill_pending_steps(record: &mut RunRecord) {
  let existing: Vec<String> =
    record.steps.iter().map(|s| s.id.clone()).collect();

  for (id, title) in FLOW_STEPS {
    if !existing.iter().any(|e| e == id) {
      record.steps.push(RunStep {
        id: id.to_string(),
        title: title.to_string(),
        status: "pending".to_string(),
        friendly_message: "Step did not run".to_string(),
        verbose_detail: None,
      });
    }
  }
}

pub fn finalize(record: &mut RunRecord, overall_status: &str) {
  record.completed_at = Some(Local::now().to_rfc3339());
  record.overall_status = overall_status.to_string();
  fill_pending_steps(record);
}

fn runs_dir() -> Result<PathBuf, String> {
  let base =
    app_config_dir().map_err(|e| format!("Failed to get config directory: {e}"))?;
  let dir = base.join("runs");
  fs::create_dir_all(&dir)
    .map_err(|e| format!("Failed to create runs directory: {e}"))?;
  Ok(dir)
}

pub fn write_run(record: &RunRecord) {
  let dir = match runs_dir() {
    Ok(d) => d,
    Err(e) => {
      log::warn!("[run-log] {e}");
      return;
    }
  };

  let path = dir.join(format!("{}.json", record.id));
  let json = match serde_json::to_string_pretty(record) {
    Ok(j) => j,
    Err(e) => {
      log::warn!("[run-log] Failed to serialize run record: {e}");
      return;
    }
  };

  if let Err(e) = fs::write(&path, &json) {
    log::warn!("[run-log] Failed to write {}: {e}", path.display());
  } else {
    log::info!("[run-log] Written to {}", path.display());
  }

  let max_count = options::read_user_options()
    .map(|o| o.max_run_log_count.unwrap_or(50))
    .unwrap_or(50);

  prune_runs(&dir, max_count);
}

fn prune_runs(dir: &PathBuf, max_count: u32) {
  let mut entries: Vec<PathBuf> = match fs::read_dir(dir) {
    Ok(rd) => rd
      .filter_map(|e| e.ok())
      .map(|e| e.path())
      .filter(|p| p.extension().map_or(false, |ext| ext == "json"))
      .collect(),
    Err(_) => return,
  };

  entries.sort();

  if entries.len() > max_count as usize {
    for old in &entries[..entries.len() - max_count as usize] {
      let _ = fs::remove_file(old);
    }
  }
}

#[tauri::command]
pub fn list_runs() -> Result<Vec<RunRecord>, String> {
  let dir = runs_dir()?;

  let mut records: Vec<RunRecord> = fs::read_dir(&dir)
    .map_err(|e| format!("Failed to read runs directory: {e}"))?
    .filter_map(|entry| entry.ok())
    .filter(|entry| {
      entry
        .path()
        .extension()
        .map_or(false, |ext| ext == "json")
    })
    .filter_map(|entry| {
      let content = fs::read_to_string(entry.path()).ok()?;
      serde_json::from_str::<RunRecord>(&content).ok()
    })
    .collect();

  records.sort_by(|a, b| b.started_at.cmp(&a.started_at));

  Ok(records)
}

#[tauri::command]
pub fn open_runs_dir(app: tauri::AppHandle) -> Result<(), String> {
  let dir = runs_dir()?;
  let dir_str = dir.to_string_lossy().into_owned();
  app
    .opener()
    .open_path(dir_str, None::<&str>)
    .map_err(|e| format!("Failed to open runs directory: {e}"))
}
