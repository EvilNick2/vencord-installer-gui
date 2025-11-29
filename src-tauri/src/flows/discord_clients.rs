use std::collections::HashMap;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::{Mutex, OnceLock};

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

#[derive(Clone, Debug, Default)]
struct LastClosedCache {
  processes: Vec<DiscordProcess>,
  closing_skipped: bool,
}

#[derive(Clone, Debug)]
pub struct LastClosedState {
  pub processes: Vec<DiscordProcess>,
  pub closing_skipped: bool,
}

fn last_closed_cache() -> &'static Mutex<LastClosedCache> {
  static LAST_CLOSED_CACHE: OnceLock<Mutex<LastClosedCache>> = OnceLock::new();

  LAST_CLOSED_CACHE.get_or_init(|| Mutex::new(LastClosedCache::default()))
}

pub fn take_last_closed_state() -> LastClosedState {
  last_closed_cache()
    .lock()
    .map(|mut cache| {
      let closing_skipped = cache.closing_skipped;
      cache.closing_skipped = false;

      LastClosedState {
        processes: cache.processes.drain(..).collect(),
        closing_skipped,
      }
    })
    .unwrap_or(LastClosedState {
      processes: Vec::new(),
      closing_skipped: false,
    })
}

const DISCORD_PROCESSES: &[&str] = &["discord", "discordptb", "discordcanary"];

fn matches_known_process_name(name: &str) -> bool {
  let name = name.to_lowercase();

  DISCORD_PROCESSES
    .iter()
    .any(|entry| name == *entry || name == format!("{entry}.exe"))
}

fn serialize_pid<S>(pid: &Pid, serializer: S) -> Result<S::Ok, S::Error>
where
  S: Serializer,
{
  serializer.collect_str(pid)
}

fn is_discord_process(process: &Process) -> bool {
  if let Some(exe) = process.exe() {
    if let Some(file_name) = exe.file_stem().and_then(|stem| stem.to_str()) {
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

fn process_identity(process: &DiscordProcess) -> (String, String) {
  let exe_name = process
    .exe
    .as_ref()
    .and_then(|path| path.file_name())
    .and_then(|name| name.to_str())
    .map(|name| name.to_string());

  let stem = process
    .exe
    .as_ref()
    .and_then(|path| path.file_stem())
    .and_then(|stem| stem.to_str())
    .map(|stem| stem.to_string())
    .unwrap_or_else(|| process.name.clone());

  let key = stem.to_lowercase();
  let display = exe_name.unwrap_or_else(|| process.name.clone());

  (key, display)
}

fn dedupe_processes(processes: &[DiscordProcess]) -> (Vec<String>, Vec<DiscordProcess>) {
  let mut unique = HashMap::<String, (String, DiscordProcess)>::new();

  for proc in processes {
    let (key, display) = process_identity(proc);

    unique.entry(key).or_insert((display, proc.clone()));
  }

  let mut names = Vec::new();
  let mut deduped = Vec::new();

  for (display, proc) in unique.into_values() {
    names.push(display);
    deduped.push(proc);
  }

  (names, deduped)
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

      system.refresh_all();
      let still_running = system.process(proc.pid).is_some();

      if killed || !still_running {
        closed.push(proc.clone());
      }
    } else {
      closed.push(proc.clone());
    }
  }

  closed
}

fn restart_process(proc: &DiscordProcess) -> Result<String, String> {
  let program = if let Some(exe) = &proc.exe {
    exe.clone()
  } else if let Some(first) = proc.cmd.first() {
    PathBuf::from(first)
  } else {
    return Err(format!(
      "Could not determine restart command for Discord process {}",
      proc.name
    ));
  };

  let mut command = Command::new(program);

  command
    .stdin(Stdio::null())
    .stdout(Stdio::null())
    .stderr(Stdio::null());

  let program_path = command.get_program().to_owned();

  if let Some(dir) = std::path::Path::new(&program_path).parent() {
    command.current_dir(dir);
  }

  #[cfg(unix)]
  {
    use std::os::unix::process::CommandExt;

    command.before_exec(|| unsafe {
      libc::setsid();
      Ok(())
    });
  }

  #[cfg(windows)]
  {
    use std::os::windows::process::CommandExt;

    const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;
    const DETACHED_PROCESS: u32 = 0x0000_0008;

    command.creation_flags(CREATE_NEW_PROCESS_GROUP | DETACHED_PROCESS);
  }

  command
    .spawn()
    .map(|_| proc.name.clone())
    .map_err(|err| format!("Failed to restart {}: {err}", proc.name))
}

pub fn restart_processes(processes: &[DiscordProcess]) -> Vec<String> {
  let (names, deduped) = dedupe_processes(processes);
  let mut restarted = Vec::new();

  for (proc, display) in deduped.iter().zip(names.iter()) {
    match restart_process(proc) {
      Ok(name) => restarted.push(name),
      Err(err) => {
        eprintln!("Failed to restart {display}: {err}");
      }
    }
  }

  restarted
}

pub fn close_discord_clients(close_enabled: bool) -> DiscordClientsState {
  if !close_enabled {
    if let Ok(mut cache) = last_closed_cache().lock() {
      cache.processes.clear();
      cache.closing_skipped = true;
    }

    return DiscordClientsState {
      closed_clients: Vec::new(),
      processes: Vec::new(),
      closing_skipped: true,
    };
  }

  let captured_processes = capture_discord_processes();
  let (captured_labels, _captured_deduped) = dedupe_processes(&captured_processes);
  let closed_processes: Vec<DiscordProcess> = close_processes(&captured_processes);
  
  let closed_snapshot: Vec<DiscordProcess> =
    if closed_processes.is_empty() && !captured_processes.is_empty() {
      captured_processes.clone()
    } else {
      closed_processes.clone()
    };

  let (mut closed_clients, cached_processes) = dedupe_processes(&closed_snapshot);

  if closed_clients.is_empty() && !captured_labels.is_empty() {
    closed_clients = captured_labels.clone();
  }

  if closed_clients.is_empty() && !cached_processes.is_empty() {
    closed_clients = cached_processes
      .iter()
      .map(|proc| proc.name.clone())
      .collect();
  }

  if let Ok(mut cache) = last_closed_cache().lock() {
    cache.processes = cached_processes.clone();
    cache.closing_skipped = false;
  }

  DiscordClientsState {
    closed_clients,
    processes: cached_processes,
    closing_skipped: false,
  }
}