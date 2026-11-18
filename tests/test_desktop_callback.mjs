// Desktop sign-in returns to the app that started it (Joseph, Linux,
// 18 Nov: "I do the sign in but it keeps bringing me back to the last
// part of setup").
//
// Two causes, both seen in the published 2.9.155 .deb:
//   1. Its .desktop file said `Exec=deepdive` with no `%u`, so when the
//      browser opened deepdive://callback?code=… Linux started DeepDive
//      WITHOUT the URL: a fresh window on Connect Spotify, every time.
//   2. On Linux and Windows a deep link always starts a second process.
//      Nothing passed its URL to the window already open, which is the
//      one holding the sign-in in progress.
import { readFileSync } from 'node:fs';
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
let pass = 0, fail = 0;
const check = (l, c) => { if (c) pass++; else { fail++; console.log('FAIL:', l); } };

const desktop = read('src-tauri/linux/deepdive.desktop');
check('the .desktop template passes the link to DeepDive', /^Exec=\{\{exec\}\} %u$/m.test(desktop));
check('and still declares the deepdive:// handler', /MimeType=\{\{mime_type\}\}/.test(desktop));
const conf = JSON.parse(read('src-tauri/tauri.conf.json'));
check('the .deb uses it', conf.bundle?.linux?.deb?.desktopTemplate === 'linux/deepdive.desktop');
check('and so does the .rpm', conf.bundle?.linux?.rpm?.desktopTemplate === 'linux/deepdive.desktop');
check('the scheme is still registered for desktop', (conf.plugins?.['deep-link']?.desktop?.schemes || []).includes('deepdive'));

const cargo = read('src-tauri/Cargo.toml');
check('desktop builds include single-instance with its deep-link feature',
  /\[target\.'cfg\(any\(target_os = "linux", target_os = "windows", target_os = "macos"\)\)'\.dependencies\]\s*\ntauri-plugin-single-instance = \{ version = "2", features = \["deep-link"\] \}/.test(cargo));

const lib = read('src-tauri/src/lib.rs');
const si = lib.indexOf('tauri_plugin_single_instance::init');
const dl = lib.indexOf('.plugin(tauri_plugin_deep_link::init())');
check('single-instance is registered before every other plugin, as its docs require', si > 0 && dl > si);
check('only on desktop (Android delivers links to the running activity)', /#\[cfg\(desktop\)\]\s*\{\s*builder = builder\.plugin\(tauri_plugin_single_instance::init/.test(lib));
check('the running window comes forward', /get_webview_window\("main"\)[\s\S]{0,200}set_focus\(\)/.test(lib));
check('an AppImage registers deepdive:// itself at startup', /#\[cfg\(any\(windows, target_os = "linux"\)\)\]\s*\{\s*if let Err\(error\) = app\.deep_link\(\)\.register_all\(\)/.test(lib));
check('a registration failure is logged, not swallowed', /couldn't register deepdive:\/\/ links/.test(lib));

const fp = read('tools/flatpak-manifest.sh');
check('the Flatpak launcher passes the link too', /Exec=deepdive %u/.test(fp));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
