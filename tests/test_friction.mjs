// Session 3: the friction batch and the quota banner.
import { readFileSync } from 'fs';
const src = readFileSync(new URL('../docs/js/app.js', import.meta.url), 'utf8');
const ins = readFileSync(new URL('../docs/js/insights.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../docs/app/index.html', import.meta.url), 'utf8');

let pass = 0, fail = 0;
function check(l, c) { if (c) pass++; else { fail++; console.log('FAIL:', l); } }

// On a phone the keyboard stayed up over the dive screen that had just
// opened, covering the thing the search was for.
check('keyboard dismissed on submit', /input\.blur\(\);\s*\n\s*startSearch\(n\)/.test(src));
check('and when picking an autofill result', /close\(\); input\.blur\(\); startSearch\(it\.name\)/.test(src));

// Refresh draws a different handful from a pool three times the size of
// the row, so it costs no requests.
check('refresh control exists', /id="sugg-refresh"/.test(src));
check('refresh reseeds rather than refetching', /_suggestSeed = \(Date\.now\(\)/.test(src));
check('picker accepts a seed', /librarySuggestions\(tracks, \{ exclude = new Set\(\), limit = 6, seed = 0 \}/.test(ins));
check('seed actually varies the pick', /const take = \(list, n\) => \(seed \? seededPick\(list, n, seed\) : list\.slice\(0, n\)\)/.test(ins));
check('seed reaches the picker', /librarySuggestions\(cached, \{ exclude, limit: 6, seed: _suggestSeed \}\)/.test(src));

// Random dive picks from what's on screen, so it can't offer something
// already blocked or filtered out.
check('random control exists', /id="sugg-random"/.test(src));
check('random picks from the visible row', /const pool = suggestions\.concat\(pins\)/.test(src));
check('random handles an empty row', /Nothing to pick from yet/.test(src));

// The suggestion row touches Spotify on every load, so it is the first
// thing to go quiet — previously it just came back short with no
// explanation anywhere.
check('failure raises a banner', /raiseApiBanner\(e\)/.test(src));
check('banner names the problem', /function apiBannerHtml/.test(src));
check('banner carries an error code', /_apiBanner\.code/.test(src));
check('codes distinguish quota from rate limit', /quotaExhausted \? "DD-QUOTA"/.test(src) && /=== 429\) \? "DD-RATE"/.test(src));
check('banner offers a re-check', /id="api-banner-check"/.test(src));
check('re-check runs the real diagnosis', /const d = await diagnose\(\);/.test(src));
check('and clears itself when things recover', /clearApiBanner\(\);\s*\n\s*flash\(/.test(src));
check('a successful load clears it too', /if \(!listeningFailed\) clearApiBanner\(\);/.test(src));
check('banner appears on both suggestion pages', (src.match(/<div id="api-banner">/g) || []).length === 2);
check('banner is styled as a problem', /\.api-banner \{[\s\S]{0,200}border:1px solid var\(--danger\)/.test(css));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
