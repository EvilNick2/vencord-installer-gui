// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod discord;
mod options;

fn main() {
  #[cfg(target_os = "linux")]
  std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");

  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![
      discord::get_discord_installs,
      options::get_user_options,
      options::update_user_options,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application")
}