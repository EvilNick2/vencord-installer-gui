use std::process::Command;

#[cfg(windows)]
use winreg::{
  RegKey,
  enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE},
};

#[cfg(windows)]
pub fn command_candidates(command: &str) -> [String; 3] {
  [
    format!("{command}.cmd"),
    format!("{command}.exe"),
    command.to_string(),
  ]
}

#[cfg(not(windows))]
pub fn command_candidates(command: &str) -> [String; 1] {
  [command.to_string()]
}

#[cfg(windows)]
pub fn build_command(command: &str) -> Command {
  use std::os::windows::process::CommandExt;

  const CREATE_NO_WINDOW: u32 = 0x0800_0000;

  let mut cmd = Command::new(command);
  cmd.creation_flags(CREATE_NO_WINDOW);

  if let Some(path) = refreshed_windows_path() {
    cmd.env("PATH", path);
  }

  cmd
}

#[cfg(not(windows))]
pub fn build_command(command: &str) -> Command {
  Command::new(command)
}

#[cfg(windows)]
fn read_env_from_registry(hive: winreg::HKEY, subkey: &str, name: &str) -> Option<String> {
  let key = RegKey::predef(hive).open_subkey(subkey).ok()?;
  key.get_value::<String, _>(name).ok()
}

#[cfg(windows)]
fn read_env_value(name: &str) -> Option<String> {
  read_env_from_registry(HKEY_CURRENT_USER, "Environment", name).or_else(|| {
    read_env_from_registry(
      HKEY_LOCAL_MACHINE,
      "SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment",
      name,
    )
  })
}

#[cfg(windows)]
fn expand_windows_vars(value: &str) -> String {
  let mut expanded = String::new();
  let mut rest = value;

  while let Some(start_idx) = rest.find('%') {
    expanded.push_str(&rest[..start_idx]);
    let after_start = &rest[start_idx + 1..];

    if let Some(end_idx) = after_start.find('%') {
      let key = & after_start[..end_idx];
      let replacement = read_env_value(key)
        .or_else(|| std::env::var(key).ok())
        .unwrap_or_else(|| format!("%{key}%"));

      expanded.push_str(&replacement);
      rest = &after_start[end_idx + 1..];
    } else {
      expanded.push('%');
      expanded.push_str(after_start);
      rest = "";
      break;
    }
  }

  expanded.push_str(rest);
  expanded
}

#[cfg(windows)]
fn refreshed_windows_path() -> Option<String> {
  let mut segments = Vec::<String>::new();
  let user_path = read_env_from_registry(HKEY_CURRENT_USER, "Environment", "Path");
  let machine_path = read_env_from_registry(
    HKEY_LOCAL_MACHINE,
    "SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment",
    "Path",
  );
  let process_path = std::env::var("PATH").ok();

  for path in [user_path, machine_path, process_path]
    .into_iter()
    .flatten()
  {
    for segment in path.split(';').map(str::trim).filter(|it| !it.is_empty()) {
      let expanded_segment = expand_windows_vars(segment);

      if !segments
        .iter()
        .any(|existing| existing.eq_ignore_ascii_case(&expanded_segment))
      {
        segments.push(expanded_segment);
      }
    }
  }

  if segments.is_empty() {
    None
  } else {
    Some(segments.join(";"))
  }
}