// Native shell scaffolding — Phase 4.
//
// None of this is proven to build. There is no Rust toolchain here and
// no way to run a .msi, so these checks cover the parts that can be
// wrong on paper: that the web path is untouched, that the OAuth
// redirect only changes inside a native shell, that the hardening
// SECURITY-BASELINE.md Part 6 asks for is actually configured, and
// that the release naming follows RELEASES.md.
//
// Whether it compiles is answered by the first CI run, and whether it
// works by Joseph installing one.
import { readFileSync, existsSync } from 'fs';
const at = (p) => new URL('../' + p, import.meta.url);
const read = (p) => (existsSync(at(p)) ? readFileSync(at(p), 'utf8') : '');
const auth = read('docs/js/auth.js');
const app = read('docs/js/app.js');
const conf = existsSync(at('src-tauri/tauri.conf.json')) ? JSON.parse(read('src-tauri/tauri.conf.json')) : null;
const caps = existsSync(at('src-tauri/capabilities/default.json')) ? JSON.parse(read('src-tauri/capabilities/default.json')) : null;
const wf = read('.github/workflows/native.yml');
const native = read('docs/js/native.js');

let pass = 0, fail = 0;
function check(l, c) { if (c) pass++; else { fail++; console.log('FAIL:', l); } }

// --- the web path is untouched --------------------------------------
// This is the part that matters most. The web app is the one people
// use; a native build must not be able to change how it signs in.
{
  check('redirectUri still returns origin+path by default', /return window\.location\.origin \+ window\.location\.pathname;/.test(auth));
  check('the native branch is gated on a runtime check', /if \(isNativeShell\(\)\) return NATIVE_REDIRECT_URI;/.test(auth));
  check('and the check is defensive', /typeof window !== "undefined"/.test(auth) && /catch \(e\) \{\s*return false;/.test(auth));
  check('the callback still reads location.search when nothing is pending',
    /_pendingNativeCallback \|\| window\.location\.search/.test(auth));
  check('a consumed native callback is cleared', /_pendingNativeCallback = null;/.test(auth));
  check('the listener no-ops in a browser', /if \(!auth\.isNativeShell\(\)\) return;/.test(app));
}

// --- native sign-in opens the system browser ------------------------
//
// On the web, beginLogin navigates to Spotify and the browser comes
// back to the same page with ?code=. A native shell cannot: navigating
// the webview to Spotify leaves the app shell, and the deepdive://
// redirect then has no page to return to. The system browser does it
// and the custom scheme hands the result back.
{
  check('native sign-in uses the opener command', /plugin:opener\|open_url/.test(native));
  check('only in a native shell', /if \(isNativeShell\(\)\) \{\s*await openNativeUrl\(url\)/.test(auth));
  check('the web path still navigates', /window\.location\.href = url;/.test(auth));
  check('a missing bridge reports an error in the app', /throw new Error/.test(native));

  // The app is plain ES modules served statically: no bundler, no
  // import map. A bare specifier like "@tauri-apps/plugin-opener"
  // cannot resolve in the webview, so the API has to come off the
  // window — which only exists when withGlobalTauri is set.
  check('no bare tauri imports in app code',
    !/import\(["']@tauri-apps/.test(auth) && !/import\(["']@tauri-apps/.test(app));
  check('the deep-link listener uses the global too', /__TAURI__\?\.event\?\.listen/.test(native));
  check('and the config turns the global on', conf?.app?.withGlobalTauri === true);
}

// --- Spotify has to accept the redirect -----------------------------
{
  check('the native redirect is a custom scheme', /NATIVE_REDIRECT_URI = "deepdive:\/\/callback"/.test(auth));
  check('the shell registers that scheme', conf?.plugins?.['deep-link']?.desktop?.schemes?.includes('deepdive'));
}

// --- hardening (SECURITY-BASELINE.md Part 6) ------------------------
{
  const csp = conf?.app?.security?.csp || '';
  check('a CSP is set', !!csp);
  check('no remote scripts', /script-src 'self'/.test(csp) && !/script-src[^;]*https?:/.test(csp));
  check('no eval', !/unsafe-eval/.test(csp));
  // The connect list is the README's network table, enforced.
  for (const host of ['https://api.spotify.com', 'https://accounts.spotify.com', 'https://ws.audioscrobbler.com']) {
    check(`connect-src allows ${host}`, csp.includes(host));
  }
  check('images are limited to Spotify and data URIs', /img-src 'self' https:\/\/\*\.scdn\.co data:/.test(csp));
  check('it cannot be framed', /frame-ancestors 'none'/.test(csp));
  check('capabilities are an allowlist, not a wildcard', Array.isArray(caps?.permissions) && !caps.permissions.includes('*'));
  check('and only name what the shell uses', caps.permissions.every((p) => /^(core:|deep-link:|opener:)/.test(p)));
}

// --- identity and version -------------------------------------------
{
  check('the app id is the agreed one', conf?.identifier === 'io.github.jpluker.deepdive');
  // VERSIONING.md Part 4: one source of truth. The repo carries a
  // placeholder and CI stamps the tag in, so the number is never typed
  // in two files that can disagree.
  check('the repo carries a placeholder version', conf?.version === '0.0.0');
  check('and CI stamps the real one', /Stamp the version/.test(wf) && /data\["version"\] = v/.test(wf));
}

// --- icons -----------------------------------------------------------
// The bundle step fails outright without these, which would have
// wasted the first CI run — the one that exists to find out whether
// any of this compiles.
{
  const icons = conf?.bundle?.icon || [];
  check('the bundle names an icon set, not one file', icons.length >= 4);
  // Windows bundles need the .ico; Linux takes the PNGs.
  check('a Windows .ico is included', icons.some((i) => i.endsWith('.ico')));
  check('and PNGs for Linux', icons.filter((i) => i.endsWith('.png')).length >= 3);
  for (const f of icons) check(`${f} exists`, existsSync(at('src-tauri/' + f)));
}

// --- release conventions (RELEASES.md) ------------------------------
{
  check('builds are labelled UNTESTED in the filename', /-UNTESTED\.\$\{ext\}|UNTESTED\.\$\{?ext/.test(wf) || /UNTESTED\./.test(wf));
  // Part 5.1: OS right after the version, so GitHub's alphabetical
  // listing groups a platform together.
  check('the name puts the OS after the version', /DeepDive-\$\{V\}-\$\{\{ matrix\.label \}\}-\$\{\{ matrix\.arch \}\}/.test(wf));
  check('it is run by hand, not on every tag push', /workflow_dispatch/.test(wf) && !/on:\s*\n\s*push:\s*\n\s*tags:/.test(wf));
}

// --- Android ---------------------------------------------------------
// Joseph named Android as a target alongside Windows and Linux. It is
// its own job because it needs a JDK, the SDK, the NDK, four Rust
// targets and a Gradle project that is generated rather than
// committed.
{
  check('there is an Android job', /^  android:/m.test(wf));
  check('it installs an NDK', /NDK_HOME=/.test(wf));
  check('and the four Android Rust targets',
    ['aarch64-linux-android', 'armv7-linux-androideabi', 'i686-linux-android', 'x86_64-linux-android']
      .every((t) => wf.includes(t)));
  check('the Gradle project is generated, not committed', /android init/.test(wf));

  // `android init` bakes the command that invoked it into the Gradle
  // project, so Gradle can call back into the CLI per Rust target.
  // Through npx that becomes "npm run -- tauri ...", which needs a
  // package.json with a "tauri" script — and this repo has none by
  // design. npm exited 254 and Gradle blamed :app:rustBuildArm64Debug.
  //
  // So the Android job must not reach the CLI through npm or npx, and
  // the repo must not acquire a package.json to make npm work. Both
  // are asserted, because either one alone would be undone by a
  // plausible tidy-up.
  // Comments stripped: the block above this step explains the npx
  // problem at length, and a check for "no npx" would match the
  // explanation rather than the commands.
  const androidJob = wf.slice(wf.indexOf('\n  android:')).replace(/^\s*#.*$/gm, '');
  check('Android invokes the CLI as cargo tauri', /cargo tauri android init/.test(androidJob));
  check('and builds the APK the same way', /cargo tauri android build/.test(androidJob));
  check('the Android job never calls npx', !/npx/.test(androidJob));
  check('and the CLI is installed for it', /cargo install tauri-cli/.test(androidJob));
  check('pinned to a 2.x line', /tauri-cli --locked --version "\^2/.test(androidJob));
  check('there is still no package.json', !existsSync(at('package.json')));
}

// --- the shipped web root contains the whole app --------------------
//
// frontendDist pointed at docs/app, which holds index.html,
// manifest.json and sw.js. The page loads ../js/app.js and
// ../assets/* — one level up, outside the bundle. On the web that is
// right, because Pages serves all of docs/. In a native shell nothing
// above frontendDist exists, so every module and font 404'd, no
// JavaScript ran, and the app opened to its static header and tab bar
// and nothing else. All three platforms, all three builds green.
//
// The repair is not frontendDist: "../docs" — that also ships the
// landing page, two diagnostic pages and img/, which holds artist
// photography cleared only for the landing page while permission is
// pending. A bundle must not widen the scope of someone else's
// photographs by accident.
{
  const conf = JSON.parse(read('src-tauri/tauri.conf.json'));
  const wf2 = read('.github/workflows/native.yml');

  check('frontendDist is the staged root', conf.build.frontendDist === '../dist-native');
  check('and not docs/app, which omits js and assets', conf.build.frontendDist !== '../docs/app');
  check('nor all of docs, which ships img/ and the dev pages', conf.build.frontendDist !== '../docs');
  // The staged root keeps the app one level down so the page's own
  // ../js and ../assets resolve without rewriting any markup.
  check('the window opens the app, not the bundle root', conf.app.windows[0].url === 'app/index.html');

  // Staged in every job, before anything reads frontendDist.
  check('both jobs stage the web root',
    (wf2.match(/node tools\/stage-native\.mjs/g) || []).length === 2);
  // Comments stripped before comparing positions: the block above the
  // CLI install discusses `android init` at length, and an ordering
  // check against the raw file compares against the prose rather than
  // the command. It did exactly that on the first attempt.
  const cmds = wf2.replace(/^\s*#.*$/gm, '');
  const androidStart = cmds.indexOf('\n  android:');
  check('android stages before init',
    cmds.indexOf('stage-native.mjs', androidStart) < cmds.indexOf('android init', androidStart));

  // The staged root is generated, so it must not be committed.
  check('the staged root is gitignored', /dist-native/.test(read('.gitignore')));
  check('and is not in the repo', !existsSync(at('dist-native')));

  // The photography hold, asserted rather than remembered.
  const stager = read('tools/stage-native.mjs');
  check('staging is an allow-list, not an exclude-list', /const INCLUDE = \['app', 'js', 'assets'\]/.test(stager));
  check('img/ is not staged', !/'img'/.test(stager.replace(/^\s*\/\/.*$/gm, '')));
  // 2.9.138 replaces ephemeral debug keys with configured release
  // signing. The finished APK must be verified before publication.
  check('the APK is a signed release build', /android build --apk\s*\n/.test(wf) && /android-signing\.mjs/.test(wf));
  check('its name no longer claims debug signing', /Android-universal-UNTESTED\.apk/.test(wf));

  // The shipped APK must come from build/outputs, not from anywhere
  // under gen/android. The old step searched the whole tree and
  // copied every match onto one filename, so the artifact was
  // whichever .apk find happened to reach last — and intermediates/
  // holds unsigned ones, which Android refuses to install.
  check('the APK comes from build/outputs', /build\/outputs\/apk\/universal\/release/.test(wf));
  check('and the build fails if it is not there', /::error title=APK missing/.test(wf));
  const renameBlock = wf.slice(wf.indexOf('SRC="src-tauri/gen/android'));
  check('it no longer copies every apk it can find',
    !/find src-tauri\/gen\/android -name '\*\.apk'/.test(wf));

  // android init copies the template's stock ic_launcher into every
  // mipmap folder and never looks at bundle.icon, so without this the
  // APK ships with the default Tauri icon.
  check('launcher icons are generated', /cargo tauri icon/.test(wf));
  check('after init, which creates the folders it writes into',
    wf.indexOf('cargo tauri icon') > wf.indexOf('cargo tauri android init'));
  check('the version is stamped there too', (wf.match(/Stamp the version/g) || []).length === 2);
}

// --- the crate has a library target --------------------------------
//
// Android never runs an executable: the APK loads a shared library and
// calls into it, so the Tauri CLI builds this crate with `cargo build
// --lib`. With only a main.rs that fails immediately — "no library
// targets found in package `deepdive`" — which is exactly how the
// first APK builds died, after the manifest patch had already worked.
//
// The risk this guards against is subtler than the file going missing.
// Desktop builds fine from main.rs alone, so if the app logic ever
// migrates back there, every desktop build stays green and only
// Android breaks — and Android is the build nobody runs locally.
{
  const cargo = read('src-tauri/Cargo.toml');
  const lib = read('src-tauri/src/lib.rs');
  const main = read('src-tauri/src/main.rs');

  check('there is a lib.rs', lib.length > 0);
  check('Cargo.toml declares a [lib] target', /^\[lib\]/m.test(cargo));
  // cdylib is the one Android actually loads; the others keep desktop
  // and any future test harness linking normally.
  check('the lib is a cdylib', /crate-type\s*=\s*\[[^\]]*"cdylib"/.test(cargo));
  // Sharing the binary's name collides over deepdive.pdb on Windows.
  check('the lib target is named deepdive_lib', /name\s*=\s*"deepdive_lib"/.test(cargo));

  check('the app lives in lib.rs', /pub fn run\(\)/.test(lib));
  check('and lib.rs builds the Tauri app', /tauri::Builder::default\(\)/.test(lib));
  check('with a mobile entry point', /mobile_entry_point/.test(lib));

  // main.rs must stay a shim. If it regrows the builder, desktop keeps
  // working and Android silently loses whatever was added.
  check('main.rs delegates to the library', /deepdive_lib::run\(\)/.test(main));
  check('and does not build the app itself', !/tauri::Builder/.test(main));
  check('the Windows subsystem attribute stayed on the binary', /windows_subsystem = "windows"/.test(main));

  // Both plugins have to be registered where mobile can see them.
  check('deep-link is registered in the library', /tauri_plugin_deep_link::init\(\)/.test(lib));
  check('opener is registered in the library', /tauri_plugin_opener::init\(\)/.test(lib));
  check('the deep link is forwarded to the web layer', /emit\("deep-link"/.test(lib));

  // app.deep_link() is a trait method. Without the trait in scope the
  // build fails with "no method named `deep_link`", which points at
  // the call site rather than at the missing import.
  check('DeepLinkExt is in scope', /use tauri_plugin_deep_link::DeepLinkExt;/.test(lib));

  // External links. Every outbound link is written target="_blank",
  // which is right on the web and inert in a Tauri webview — there is
  // no tab to open. That silently killed the two links onboarding
  // depends on: the Spotify dashboard, where the Client ID comes
  // from, and the Last.fm key page. SECURITY-BASELINE.md Part 6 also
  // requires external links to leave the app window.
  check('external links are intercepted natively', /function interceptExternalLinks/.test(app));
  check('and only inside a native shell', /interceptExternalLinks\(\)[\s\S]{0,120}isNativeShell\(\)/.test(app)
    || /function interceptExternalLinks\(\) \{\s*if \(!auth\.isNativeShell\(\)\) return;/.test(app));
  // Delegated, because screens re-render wholesale and a handler bound
  // to an anchor is discarded with it.
  check('the handler is delegated from the document',
    /interceptExternalLinks[\s\S]{0,400}document\.addEventListener\("click"/.test(app));
  // openNativeUrl, not window.__TAURI__.opener: withGlobalTauri
  // exposes core.invoke and event.listen but not the opener plugin's
  // own API, so the plugin command is invoked directly. Established
  // on a device, and the reason this asserts the helper rather than
  // the global.
  check('it hands off through openNativeUrl',
    /interceptExternalLinks[\s\S]{0,900}openNativeUrl\(href\)/.test(app));
  // Spotify links have their own delegated handler on the same node,
  // and preventDefault there does not stop this one — without the
  // guard a single tap opens the link twice.
  check('spotify links are left to their own handler',
    /interceptExternalLinks[\s\S]{0,600}hasAttribute\("data-spotify"\)/.test(app));
  check('and runs at boot', /async function boot\(\)\s*\{\s*interceptExternalLinks\(\);/.test(app));

  // "../" is the bundle root in a native shell, and the native builds
  // ship the app without the landing page by design, so the link has
  // to be absolute there.
  check('the landing hint is absolute natively', /isNativeShell\(\) \? SITE_URL : "\.\.\/"/.test(app));
  check('SITE_URL is the public site', /SITE_URL = "https:\/\/jpluker\.github\.io\/DeepDive\/"/.test(app));
  // Manager is not: App::handle() is inherent, and importing it only
  // earns an unused-import warning.
  check('Manager is not imported', !/use tauri::\{[^}]*Manager/.test(lib));

  // tauri::generate_context! expands to code naming ::serde_json, so
  // it must be a direct dependency despite nothing here mentioning
  // it. Easy to "clean up" as unused; it is not.
  check('serde_json is a direct dependency', /^serde_json\s*=/m.test(cargo));

  // rust-ini 0.21.3 added public fields to ParseOption — semver
  // compatible, source-breaking for the struct literal inside
  // tauri-plugin-deep-link. Checked directly: 0.21.0 and 0.21.1 have
  // neither field, 0.21.3 has both. The upper bound is the point.
  //
  // This pins around someone else's bug, so it is asserted rather
  // than left as a comment: dropping it silently restores a Linux
  // build failure that nothing in this repo appears to cause.
  check('rust-ini is pinned below the breaking release', /rust-ini\s*=\s*">=0\.21,\s*<0\.21\.3"/.test(cargo));
  check('and only for Linux, where the plugin uses it',
    /\[target\.'cfg\(target_os = "linux"\)'\.dependencies\]/.test(cargo));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
