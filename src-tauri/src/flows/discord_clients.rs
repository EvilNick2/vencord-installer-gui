use std::path::PathBuf;
use std::process::Command;

use serde::{Serialize, Serializer};
use sysinfo::{Pid, Process, Signal, System};

#[derive(Clone, Debug, Serialize)]
pub struct DiscordProcess {
  #[serde(serialize_with = "serialize_pid")]
  pub pid: Pid,
  pub name: String,
  pub exe: Option<PathBuf>,
  pub cmd: Vec<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscordClientsState {
  pub closed_clients: Vec<String>,
  pub processes: Vec<DiscordProcess>,
  pub closing_skipped: bool,
}

const DISCORD_PROCESSES: &[&str] = &["discord", "discordptb", "discordcanary"];

fn matches_known_process_name(name: &str) -> bool {
  let name = name.to_lowercase();

  DISCORD_PROCESSES.iter().any(|entry| {
    name == *entry || name == format!("{entry}.exe")
  })
}

fn serialize_pid<S>(pid: &Pid, serializer: S) -> Result<S::Ok, S::Error>
where
  S: Serializer,
{
  serializer.collect_str(pid)
}

fn is_discord_process(process: &Process) -> bool {
  if let Some(exe) = process.exe() {
    if let Some(file_name) = exe
      .file_stem()
      .and_then(|stem| stem.to_str())
    {
      if matches_known_process_name(file_name) {
        return true;
      }
    }

    if let Some(file_name) = exe.file_name().and_then(|name| name.to_str()) {
      if matches_known_process_name(file_name) {
        return true;
      }
    }
  }

  process
    .name()
    .to_str()
    .map(matches_known_process_name)
    .unwrap_or(false)
}

fn capture_discord_processes_with_system(system: &System) -> Vec<DiscordProcess> {
  system
    .processes()
    .iter()
    .filter(|(_, process)| is_discord_process(process))
    .map(|(pid, process)| DiscordProcess {
      pid: *pid,
      name: process.name().to_string_lossy().into_owned(),
      exe: process.exe().map(|path| path.to_path_buf()),
      cmd: process
        .cmd()
        .iter()
        .map(|arg| arg.to_string_lossy().into_owned())
        .collect(),
    })
    .collect()
}

pub fn capture_discord_processes() -> Vec<DiscordProcess> {
  let mut system = System::new_all();
  system.refresh_all();
  capture_discord_processes_with_system(&system)
}

#[tauri::command]
pub fn list_discord_processes() -> Vec<DiscordProcess> {
  capture_discord_processes()
}

pub fn close_processes(processes: &[DiscordProcess]) -> Vec<DiscordProcess> {
  let mut system = System::new_all();
  system.refresh_all();

  let mut closed = Vec::new();

  for proc in processes {
    if let Some(process) = system.process(proc.pid) {
      let killed = process
        .kill_with(Signal::Kill)
        .unwrap_or_else(|| process.kill());

      if killed {
        closed.push(proc.clone());
      }
    }
  }

  closed
}

fn restart_process(proc: &DiscordProcess) -> Result<String, String> {
  let (program, args): (PathBuf, Vec<String>) = if let Some(exe) = &proc.exe {
    (exe.clone(), proc.cmd.iter().skip(1).cloned().collect())
  } else if let Some(first) = proc.cmd.first() {
    (
      PathBuf::from(first),
      proc.cmd.iter().skip(1).cloned().collect(),
    )
  } else {
    return Err(format!(
      "Could not determine restart command for Discord process {}",
      proc.name
    ));
  };

  Command::new(program)
    .args(args)
    .spawn()
    .map(|_| proc.name.clone())
    .map_err(|err| format!("Failed to restart {}: {err}", proc.name))
}

pub fn restart_processes(processes: &[DiscordProcess]) -> Vec<String> {
  processes
    .iter()
    .filter_map(|proc| restart_process(proc).ok())
    .collect()
}

pub fn close_discord_clients(close_enabled: bool) -> DiscordClientsState {
  if !close_enabled {
    return DiscordClientsState {
      closed_clients: Vec::new(),
      processes: Vec::new(),
      closing_skipped: true,
    };
  }

  let processes = capture_discord_processes();
  let closed_processes = close_processes(&processes);
  let closed_clients = closed_processes
    .iter()
    .map(|proc| proc.name.clone())
    .collect();

  DiscordClientsState {
    closed_clients,
    processes: closed_processes,
    closing_skipped: false,
  }
}