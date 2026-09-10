import { readFileSync, existsSync } from 'fs';
const sw = readFileSync(new URL('../docs/app/sw.js', import.meta.url),'utf8');
const src = readFileSync(new URL('../docs/js/app.js', import.meta.url),'utf8');
let pass=0,fail=0; function check(l,c){if(c)pass++;else{fail++;console.log('FAIL:',l);}}

check('service worker exists beside the app', existsSync(new URL('../docs/app/sw.js', import.meta.url)));
check('registered from the app', /navigator\.serviceWorker\.register\("sw\.js"\)/.test(src));
check('registration cannot break boot', /\.catch\(\(e\) => \{[\s\S]{0,120}registration failed/.test(src));
check('registration is feature-detected', /if \(!\("serviceWorker" in navigator\)\) return;/.test(src));

// The critical property: never serve stale code.
check('network-first, not cache-first', sw.indexOf('fetch(request)') < sw.indexOf('caches.match(request)'));
check('cache is only the offline fallback', /\.catch\(async \(\) => \{[\s\S]{0,200}caches\.match\(request\)/.test(sw));
check('only caches successful basic responses', /response\.status === 200 && response\.type === "basic"/.test(sw));

// Must not interfere with Spotify.
check('same-origin only', /url\.origin !== self\.location\.origin/.test(sw));
check('GET only', /request\.method !== "GET"/.test(sw));

// Update behaviour.
check('takes over immediately', /skipWaiting\(\)/.test(sw) && /clients\.claim\(\)/.test(sw));
check('clears old caches on activate', /keys\.filter\(\(k\) => k\.startsWith\("deepdive-shell-"\)/.test(sw));
check('install tolerates a missing asset', /Promise\.allSettled/.test(sw));
check('navigation has an offline fallback', /request\.mode === "navigate"/.test(sw));

// version
// The guard existed because 2.9 was claimed twice without authorisation.
// It has now been earned: Joseph called 3.0 explicitly on 7 Sept, with
// concert prep, which is what the number was always reserved for.
//
// Still not pinned to an exact version, or every bump fails this. The
// intent is that the major only moves when the identity does — 4.x is
// the dashboard and must not arrive by accident either.
check('build is 3.x, as authorised', /export const BUILD = "3\.\d+\./.test(src));
check('and concert prep shipped with it', /async function renderShow/.test(src));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
