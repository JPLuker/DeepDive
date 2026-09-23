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
{
  const foot = src.slice(src.indexOf('<footer class="set-footer">'), src.indexOf('</footer>`;'));
  check('the app credits Spotify', /provided by Spotify/.test(foot));
  check('and Last\u002efm', /provided by Last\.fm/.test(foot));
  check('and says whose the artwork is', /remain the property of their owners/.test(foot));
  check('and disclaims affiliation', /not affiliated with Spotify AB or Last\.fm/.test(foot));
  check('and links the source and licence', /github\.com\/JPLuker\/DeepDive[^]{0,40}Source and licence/.test(foot));
  check('it is readable, not hidden', /\.set-legal \{[^}]*font-size:11\.5px/.test(shell) && !/\.set-legal \{[^}]*display:none/.test(shell));
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
