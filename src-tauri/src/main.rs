// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod config;
mod discord;
mod logging;
mod options;

fn main() {
  #[cfg(target_os = "linux")]
  std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");

  logging::with_tauri_logger(
    tauri::Builder::default()
        .setup(|_app| {
          logging::installer_logs_dir()?;
          Ok(())
        })
        .invoke_handler(tauri::generate_handler![
          discord::get_discord_installs,
          options::get_user_options,
          options::update_user_options,
        ]),
  )
  .run(tauri::generate_context!())
  .expect("error while running tauri application")
}
