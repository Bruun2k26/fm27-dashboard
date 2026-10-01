// FM27 Manager Dashboard – Desktop-App (Tauri).
// Die App selbst ist dieselbe wie im Browser (index.html + js/ + style.css); Tauri liefert nur das Fenster.
// Kein Konsolenfenster unter Windows im Release-Build:
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("FM27 Dashboard konnte nicht gestartet werden");
}
