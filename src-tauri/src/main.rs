// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod config;
mod dependencies;
mod discord;
mod flows;
mod logging;
mod options;

fn main() {
  #[cfg(target_os = "linux")]
  std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");

  logging::with_tauri_logger(
    tauri::Builder::default()
      .plugin(tauri_plugin_dialog::init())
      .plugin(tauri_plugin_updater::Builder::new().build())
      .setup(|_app| {
        logging::installer_logs_dir()?;
        Ok(())
      })
      .invoke_handler(tauri::generate_handler![
        flows::backup::backup_vencord_install,
        dependencies::install_dependency,
        dependencies::list_dependencies,
        flows::discord_clients::list_discord_processes,
        flows::pipeline::run_patch_flow,
        flows::pipeline::run_dev_test,
        discord::get_discord_installs,
        options::get_user_options,
        options::update_user_options,
        options::update_selected_discord_clients,
      ]),
  )
  .run(tauri::generate_context!())
  .expect("error while running tauri application")
}
