// DeepDive's native shell.
//
// There is deliberately almost nothing here. The app is the same
// static site that GitHub Pages serves; this wraps it so it can be
// installed, and does two things the browser does for free:
//
//   1. receives the deepdive://callback deep link, because a custom
//      scheme has no page to navigate to, and
//   2. opens external links in the system browser rather than in the
//      app window (SECURITY-BASELINE.md Part 6).
//
// Everything else — storage, auth, the Spotify calls — stays in the
// web layer, so the native builds cannot drift away from the web app.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{Emitter, Manager};

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // A single window, named so capabilities/default.json can
            // scope permissions to it.
            let handle = app.handle().clone();
            app.deep_link().on_open_url(move |event| {
                for url in event.urls() {
                    // Handed straight to the web layer, which owns the
                    // PKCE state and the token exchange. The shell does
                    // not parse or store any part of it.
                    let _ = handle.emit("deep-link", url.to_string());
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running DeepDive");
}
