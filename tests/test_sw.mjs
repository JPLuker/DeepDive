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

// version rollback
// Pinning an exact version makes this fail on every bump; what matters
// is that the rollback held and we are in the 2.x range.
check('build is in the rolled-back range', /export const BUILD = "2\.[0-8]\./.test(src));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
