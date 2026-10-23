// The Android manifest patch.
//
// Without it an Android build installs, opens, and can never sign in:
// Spotify sends the user back to deepdive://callback, Android finds no
// handler for the scheme, and nothing happens. The deep-link plugin's
// `desktop.schemes` covers desktop only, and gen/android is generated
// in CI from a template that knows nothing about this app.
//
// gen/android cannot exist here — no Android SDK — so the patcher is
// tested against a manifest shaped like the one Tauri generates.
import { patchManifest, SCHEME } from '../tools/android-manifest.mjs';
import { readFileSync } from 'fs';

let pass = 0, fail = 0;
function check(l, c) { if (c) pass++; else { fail++; console.log('FAIL:', l); } }

const TEMPLATE = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <uses-permission android:name="android.permission.INTERNET" />
    <application
        android:label="DeepDive"
        android:usesCleartextTraffic="false">
        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:launchMode="singleTask">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>`;

// --- the scheme gets registered --------------------------------------
{
  const { xml, notes } = patchManifest(TEMPLATE);
  check('the scheme is added', new RegExp(`android:scheme="${SCHEME}"`).test(xml));
  check('as a VIEW intent', /android\.intent\.action\.VIEW/.test(xml));
  // Without BROWSABLE the OS will not hand a URL to the app at all,
  // which is the whole mechanism.
  check('marked BROWSABLE', /android\.intent\.category\.BROWSABLE/.test(xml));
  check('and DEFAULT', /android\.intent\.category\.DEFAULT/.test(xml));
  check('it reports what it did', notes.some((n) => /added .*intent filter/.test(n)));

  // Placed inside the launcher activity, not merely somewhere in the
  // file: an intent filter outside an activity is ignored.
  const appAt = xml.indexOf('<application');
  const actAt = xml.indexOf('<activity');
  const schemeAt = xml.indexOf(`android:scheme="${SCHEME}"`);
  const actClose = xml.indexOf('</activity>');
  check('inside an activity', schemeAt > actAt && schemeAt < actClose && actAt > appAt);
}

// --- running twice is safe -------------------------------------------
// CI may re-run, and a duplicate filter for one scheme is at best
// noise and at worst an ambiguous chooser.
{
  const once = patchManifest(TEMPLATE).xml;
  const twice = patchManifest(once).xml;
  check('patching is idempotent', once === twice);
  const count = (twice.match(new RegExp(`android:scheme="${SCHEME}"`, 'g')) || []).length;
  check('the scheme appears exactly once', count === 1);
}

// --- INTERNET ---------------------------------------------------------
// A webview app that cannot reach the network is a white screen, and a
// missing permission fails at runtime rather than at build.
{
  const stripped = TEMPLATE.replace(/<uses-permission[^>]*INTERNET[^>]*\/>\s*/, '');
  check('the fixture really lacks it', !/INTERNET/.test(stripped));
  const { xml, notes } = patchManifest(stripped);
  check('INTERNET is added when missing', /android\.permission\.INTERNET/.test(xml));
  check('and it is outside <application>', xml.indexOf('INTERNET') < xml.indexOf('<application'));
  check('it says so', notes.some((n) => /added INTERNET/.test(n)));
  check('and is left alone when present', patchManifest(TEMPLATE).notes.some((n) => /already present/.test(n)));
}

// --- it refuses a manifest it does not understand ---------------------
// Better to fail the build than to write a file that looks patched.
{
  let threw = null;
  try { patchManifest('<manifest><application></application></manifest>'); } catch (e) { threw = e.message; }
  check('no LAUNCHER activity is an error, not a silent pass', /LAUNCHER/.test(threw || ''));
}

// --- CI actually calls it ---------------------------------------------
{
  const wf = readFileSync(new URL('../.github/workflows/native.yml', import.meta.url), 'utf8');
  check('the workflow runs the patcher', /android-manifest\.mjs/.test(wf));
  check('after generating the project', wf.indexOf('android init') < wf.indexOf('android-manifest.mjs'));
  check('and before building the APK', wf.indexOf('android-manifest.mjs') < wf.indexOf('android build'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
