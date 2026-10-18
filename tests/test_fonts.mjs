// Fonts are self-hosted (2.9.109).
//
// The app and the landing page both linked Google Fonts, so every load
// handed the visitor's IP to Google. That broke PRIVACY.md's "no runtime
// third-party requests" rule and made the app's own privacy copy —
// "the only external requests are to Spotify and Last.fm" — untrue.
import { readFileSync, existsSync, statSync } from 'fs';
const app = readFileSync(new URL('../docs/app/index.html', import.meta.url), 'utf8');
const landing = readFileSync(new URL('../docs/index.html', import.meta.url), 'utf8');
let pass = 0, fail = 0;
function check(l, c) { if (c) pass++; else { fail++; console.log('FAIL:', l); } }

for (const [name, html] of [['app', app], ['landing', landing]]) {
  check(`${name} loads no font CDN`, !/fonts\.(googleapis|gstatic)\.com/.test(html));
  check(`${name} ships no remote stylesheet at all`, !/<link[^>]+rel="stylesheet"[^>]+https?:/.test(html));
  check(`${name} declares Geist locally`, /@font-face\s*\{[^}]*'Geist'[^}]*Geist-Variable\.woff2/.test(html));
  check(`${name} declares Geist Mono locally`, /@font-face\s*\{[^}]*'Geist Mono'[^}]*GeistMono-Variable\.woff2/.test(html));
  // A variable file covers every weight from one request.
  check(`${name} uses the variable weight range`, (html.match(/font-weight: 100 900;/g) || []).length >= 2);
  const decls = html.match(/font-family:[^;}\n]*/g) || [];
  check(`${name} has no banned face left in a declaration`,
    !decls.some((d) => /Inter|IBM Plex/.test(d)));
  check(`${name} actually uses Geist`, decls.some((d) => /'Geist'/.test(d)));
}

// The files have to exist, or the swap silently falls back to system-ui.
for (const f of ['Geist-Variable.woff2', 'GeistMono-Variable.woff2']) {
  const p = new URL('../docs/assets/' + f, import.meta.url);
  check(`${f} is bundled`, existsSync(p));
  check(`${f} is a real font, not a stub`, existsSync(p) && statSync(p).size > 20000);
}
// SIL OFL requires the licence to travel with the font.
check('the font licence ships with them', existsSync(new URL('../docs/assets/Geist-LICENSE.txt', import.meta.url)));

// The privacy claim is only true while this stays true.
check('the app still claims Spotify and Last.fm only',
  /only external requests are to Spotify and Last\.fm/.test(landing));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
