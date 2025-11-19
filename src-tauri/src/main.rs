// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod discord;

fn main() {
  #[cfg(target_os = "linux")]
  std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");

  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![
      discord::get_discord_installs,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application")
}