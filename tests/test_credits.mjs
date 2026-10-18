// Attribution and licence (2.9.85).
//
// Spotify's Developer Terms require content reached through the API to
// be attributed. The landing page has said so since 2.8.x; the app
// itself said nothing, and the repo had no licence at all.
import { readFileSync, existsSync } from 'fs';
const src = readFileSync(new URL('../docs/js/app.js', import.meta.url), 'utf8');
const shell = readFileSync(new URL('../docs/app/index.html', import.meta.url), 'utf8');
const landing = readFileSync(new URL('../docs/index.html', import.meta.url), 'utf8');
const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
const licPath = new URL('../LICENSE', import.meta.url);
let pass = 0, fail = 0;
function check(l, c) { if (c) pass++; else { fail++; console.log('FAIL:', l); } }

// In the app, not only on the page that sells it.
// 2.9.110 moved this out of an ad-hoc <footer> and into the About
// group, where MAINTENANCE.md 1.2 expects the licence and the issue
// link to live. Scoped to that group so the attribution can't drift
// off to some other part of the screen and still pass.
{
  const i = src.indexOf('<div class="set-group-label">About</div>');
  const about = src.slice(i, src.indexOf('`;', i));
  check('there is an About group', i > -1);
  check('the app credits Spotify', /provided by Spotify/.test(about));
  check('and Last\u002efm', /provided by Last\.fm/.test(about));
  check('and says whose the artwork is', /remain the property of their owners/.test(about));
  check('and disclaims affiliation', /not affiliated with Spotify AB or Last\.fm/.test(about));
  check('the licence is named, not just linked', /title: "Licence"/.test(about) && />MIT</.test(about));
  check('and points at the LICENSE file', /blob\/main\/LICENSE/.test(about));
  check('the source is linked', /github\.com\/JPLuker\/DeepDive"/.test(about));
  check('it is readable, not hidden', /\.set-legal \{[^}]*font-size:11\.5px/.test(shell) && !/\.set-legal \{[^}]*display:none/.test(shell));
}

// MAINTENANCE.md 1.2: people need to be told reports are read, and
// given something to paste when they file one.
{
  const i = src.indexOf('<div class="set-group-label">About</div>');
  const about = src.slice(i, src.indexOf('`;', i));
  check('About offers to take an issue', /issues\/new\/choose/.test(about));
  check('and says they are watched', /Issues are monitored/.test(about));
  check('and can hand over diagnostics', /id="set-copy-diagnostics"/.test(about));
}

// The blob is pasted into public issues, so it must not carry the
// user's own Spotify app credentials or their Last.fm key.
{
  const i = src.indexOf('async function diagnosticInfo()');
  const diag = src.slice(i, src.indexOf('\n}', i));
  check('diagnostics exist', i > -1);
  check('they report the build', /DeepDive \$\{BUILD\}/.test(diag));
  check('and whether storage survives a reload', /appStore\.kind\(\)/.test(diag));
  check('the client id is reported as set or not, never printed', /getClientId\(\) \? "set" : "not set"/.test(diag) && !/getClientId\(\)\}/.test(diag));
  check('same for the last\u002efm key', /hasKey\(\) \? "set" : "not set"/.test(diag) && !/getKey\(\)/.test(diag));
  check('no access token anywhere in it', !/token/i.test(diag));
}
check('the landing page still credits them too', /provided by Spotify/.test(landing) && /provided by Last\.fm/.test(landing));

// The licence itself.
{
  check('a LICENSE file exists', existsSync(licPath));
  const lic = existsSync(licPath) ? readFileSync(licPath, 'utf8') : '';
  check('MIT, with a named holder', /MIT License/.test(lic) && /Copyright \(c\) \d{4} Joseph Luker/.test(lic));
  check('the permission grant is intact', /without restriction, including without limitation the rights/.test(lic));
  check('the warranty disclaimer is intact', /WITHOUT WARRANTY OF ANY KIND/.test(lic));
  // The point of the second half: the licence must not read as though
  // it grants anything over Spotify's or Last.fm's content, or over the
  // artist photographs that are on the landing page pending permission.
  check('it covers the code only', /covers DeepDive's own source code only/.test(lic));
  check('it claims nothing over Spotify or Last\u002efm content', /claims no rights in[^]{0,200}Spotify, or tag and popularity data from\s+Last\.fm/.test(lic));
  check('and nothing over the artist photographs', /artist photographs[^]{0,160}not licensed for reuse/.test(lic));
  check('the README points at it', /\[MIT licence\]\(LICENSE\)/.test(readme));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
