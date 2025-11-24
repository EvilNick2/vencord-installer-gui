mod config;
mod logging;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  logging::with_tauri_logger(tauri::Builder::default().setup(|_app| {
    logging::installer_logs_dir()?;
    Ok(())
  }))
  .run(tauri::generate_context!())
  .expect("error while running tauri application");
}
