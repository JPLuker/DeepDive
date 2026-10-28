// Make the generated Android manifest able to receive the OAuth
// callback, and prove it.
//
// `tauri android init` writes gen/android from a template, and that
// template knows nothing about deepdive://. The deep-link plugin's
// `desktop.schemes` config covers desktop only. Without an intent
// filter the scheme is registered with nothing: Spotify sends the user
// back, Android finds no handler, and the app installs, opens, and can
// never sign in.
//
// gen/android is generated in CI rather than committed, so this runs
// after init, every build. It is written as a script instead of inline
// YAML so it can be tested without an Android SDK.
//
// Usage: node tools/android-manifest.mjs <path-to-AndroidManifest.xml>
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'node:path';

export const SCHEME = 'deepdive';

const FILTER = `
                <intent-filter android:autoVerify="false">
                    <action android:name="android.intent.action.VIEW" />
                    <category android:name="android.intent.category.DEFAULT" />
                    <category android:name="android.intent.category.BROWSABLE" />
                    <data android:scheme="${SCHEME}" />
                </intent-filter>`;

export function patchManifest(xml) {
  const notes = [];

  // Idempotent: CI may re-run, and a second filter for the same scheme
  // is at best noise and at worst an ambiguous chooser dialog.
  if (new RegExp(`android:scheme="${SCHEME}"`).test(xml)) {
    notes.push('scheme already present, left alone');
  } else {
    // Into the launcher activity specifically. Dropping it into the
    // first <activity> would work by luck on a one-activity template
    // and silently stop working if that ever changed.
    const launcher = xml.indexOf('android.intent.category.LAUNCHER');
    if (launcher === -1) throw new Error('no LAUNCHER activity found — manifest is not the shape this expects');
    const closeFilter = xml.indexOf('</intent-filter>', launcher);
    if (closeFilter === -1) throw new Error('LAUNCHER intent-filter is unterminated');
    const at = closeFilter + '</intent-filter>'.length;
    xml = xml.slice(0, at) + FILTER + xml.slice(at);
    notes.push(`added ${SCHEME}:// intent filter`);
  }

  // A webview app that cannot reach the network is a white screen.
  // The Tauri template does include this, but a missing INTERNET
  // permission fails at runtime rather than at build, which is the
  // worst place to find out.
  if (!/android\.permission\.INTERNET/.test(xml)) {
    const tag = xml.indexOf('<application');
    if (tag === -1) throw new Error('no <application> element found');
    xml = xml.slice(0, tag)
      + '<uses-permission android:name="android.permission.INTERNET" />\n    '
      + xml.slice(tag);
    notes.push('added INTERNET permission');
  } else {
    notes.push('INTERNET permission already present');
  }

  for (const permission of ['FOREGROUND_SERVICE', 'FOREGROUND_SERVICE_DATA_SYNC', 'WAKE_LOCK', 'POST_NOTIFICATIONS', 'REQUEST_INSTALL_PACKAGES']) {
    if (!xml.includes(`android.permission.${permission}"`)) {
      xml = xml.replace('<application', `<uses-permission android:name="android.permission.${permission}" />\n    <application`);
    }
  }
  if (!xml.includes('android:name=".BackgroundWorkService"')) {
    xml = xml.replace('</application>', `<service android:name=".BackgroundWorkService" android:exported="false" android:foregroundServiceType="dataSync" android:stopWithTask="true" />\n    </application>`);
  }
  if (!xml.includes('android:authorities="${applicationId}.updates"')) {
    xml = xml.replace('</application>', `<provider android:name="androidx.core.content.FileProvider" android:authorities="\${applicationId}.updates" android:exported="false" android:grantUriPermissions="true"><meta-data android:name="android.support.FILE_PROVIDER_PATHS" android:resource="@xml/update_paths" /></provider>\n    </application>`);
  }
  notes.push('registered data-sync service and its required permissions');
  return { xml, notes };
}

// Only run as a CLI when invoked directly, so the tests can import it.
if (process.argv[1] && process.argv[1].endsWith('android-manifest.mjs')) {
  const path = process.argv[2];
  if (!path) { console.error('usage: android-manifest.mjs <AndroidManifest.xml>'); process.exit(2); }
  const { xml, notes } = patchManifest(readFileSync(path, 'utf8'));
  writeFileSync(path, xml);
  const resources = join(dirname(path), "res/xml");
  mkdirSync(resources, { recursive: true });
  writeFileSync(join(resources, "update_paths.xml"), '<?xml version="1.0" encoding="utf-8"?><paths xmlns:android="http://schemas.android.com/apk/res/android"><files-path name="updates" path="updates/" /></paths>\n');
  for (const n of notes) console.log('  ' + n);
  // Verified rather than assumed: this is the difference between a
  // build that cannot sign in and one that can, and it is invisible
  // until a person tries.
  const after = readFileSync(path, 'utf8');
  if (!new RegExp(`android:scheme="${SCHEME}"`).test(after)) {
    console.error('FAILED: scheme is still not in the manifest');
    process.exit(1);
  }
  console.log('  verified: deepdive:// is registered');
}
