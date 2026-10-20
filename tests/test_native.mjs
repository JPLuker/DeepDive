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
  // The important one. An unsigned *release* APK is rejected by
  // Android before it runs, so "no signing yet" and "release" cannot
  // both be true — a debug build is the only installable option, and
  // it is signed with Android's debug key.
  check('the APK is a debug build, so it can actually be installed', /android build --apk --debug/.test(wf));
  check('and its name says so', /Android-universal-debug-UNTESTED\.apk/.test(wf));
  check('the version is stamped there too', (wf.match(/Stamp the version/g) || []).length === 2);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
