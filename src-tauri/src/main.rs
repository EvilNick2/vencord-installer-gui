// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod command_utils;
mod config;
mod dependencies;
mod discord;
mod flows;
mod logging;
mod options;
mod run_log;

fn main() {
  // WebKitGTK's DMA-BUF buffers die with Wayland protocol error 71 on NVIDIA.
  // Shared memory hands over the frames instead and keeps GPU rendering.
  #[cfg(target_os = "linux")]
  if std::env::var_os("WEBKIT_DMABUF_RENDERER_FORCE_SHM").is_none() {
    std::env::set_var("WEBKIT_DMABUF_RENDERER_FORCE_SHM", "1");
  }

  logging::with_tauri_logger(
    tauri::Builder::default()
      .plugin(tauri_plugin_dialog::init())
      .plugin(tauri_plugin_opener::init())
      .plugin(tauri_plugin_updater::Builder::new().build())
      .setup(|_app| {
        logging::installer_logs_dir()?;
        Ok(())
      })
      .invoke_handler(tauri::generate_handler![
        flows::backup::backup_vencord_install,
        flows::backup::delete_backups,
        flows::backup::list_backups,
        dependencies::install_dependency,
        dependencies::list_dependencies,
        flows::discord_clients::list_discord_processes,
        flows::pipeline::run_patch_flow,
        flows::pipeline::run_dev_test,
        run_log::list_runs,
        run_log::open_runs_dir,
        discord::get_discord_installs,
        options::get_user_options,
        options::update_user_options,
        options::update_selected_discord_clients,
      ]),
  )
  .run(tauri::generate_context!())
  .expect("error while running tauri application")
}
