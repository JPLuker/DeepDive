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
//
// Why this is a library and not just main.rs
// ------------------------------------------
// Android does not run an executable. The APK loads a shared library
// and calls into it, so the Tauri CLI builds the crate with `cargo
// build --lib`, and a crate with only a `main.rs` has no library
// target for it to build. That failed with exactly that message —
// "no library targets found in package `deepdive`" — after the
// manifest patch had already succeeded.
//
// So the app lives here, `main.rs` is a three-line shim that calls it
// on desktop, and `mobile_entry_point` gives Android its way in. Both
// platforms run the same `run()`, which is the point: there is one
// definition of what the shell does, not a desktop one and a mobile
// one that can drift apart.

// Emitter for handle.emit; DeepLinkExt for app.deep_link(), which is
// a trait method and fails with "no method named `deep_link`" if the
// trait is not in scope. Manager is deliberately not imported —
// App::handle() is inherent, and importing it only earns a warning.
use tauri::Emitter;
#[cfg(desktop)]
use tauri::Manager;
use tauri_plugin_deep_link::DeepLinkExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default();

    // Desktop: the Spotify callback starts a second process with the URL
    // in its arguments. single-instance (registered first, as its docs
    // require) hands that URL to this process's deep-link plugin and
    // ends the second one, then brings this window forward so the person
    // sees sign-in finish. Without it, Linux showed a fresh DeepDive
    // stuck on Connect Spotify (18 Nov).
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }));
    }

    builder
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // Packages register deepdive:// through their .desktop file or
            // installer; an AppImage has neither, so register at runtime.
            // Harmless when a package already did. A failure only means
            // the AppImage can't receive the callback; say so in the log.
            #[cfg(any(windows, target_os = "linux"))]
            {
                if let Err(error) = app.deep_link().register_all() {
                    eprintln!("DeepDive: couldn't register deepdive:// links: {error}");
                }
            }

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
