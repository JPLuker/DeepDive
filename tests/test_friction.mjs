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

// Pin and remove are occasional actions that held width on every row —
// permanently on touch, where there is no hover to hide behind.
check('overflow control exists', /class="tile-more" data-more/.test(src));
check('actions hidden until revealed', /\.tile-wrap\.show-actions \.tile-actions \{ opacity:1; pointer-events:auto; \}/.test(css));
// opacity alone left them clickable and still occupying width, so
// the invisible buttons intercepted every tap meant for the
// overflow and the space was never given back.
check('hidden actions cannot be clicked', /\.tile-actions \{[\s\S]{0,140}pointer-events:none/.test(css));
check('touch no longer shows them always', !/\.tile-actions \{ opacity:1; \}   \/\* no hover on touch \*\//.test(css));
check('overflow is the way in on touch', /\.tile-more \{ display:block; \}/.test(css));
check('one row open at a time', /el\.querySelectorAll\("\.tile-wrap\.show-actions"\)/.test(src));
check('clicking elsewhere closes it', /document\.addEventListener\("click", \(\) => \{[\s\S]{0,180}show-actions/.test(src));
check('state is announced', /aria-expanded/.test(src));
// The toggle must not also trigger the tile's own search.
check('toggle does not start a dive', /ev\.stopPropagation\(\);\s*\n\s*const wrap = b\.closest\("\.tile-wrap"\)/.test(src));

// Run settings already live in the artist popup — the intent modal has
// held all seven since it was built, so that item needed marking done
// rather than rebuilding.
const shell = readFileSync(new URL('../docs/app/index.html', import.meta.url), 'utf8');
for (const id of ['opt-live','opt-censored','opt-instrumental','opt-acappella','opt-remaster','opt-compilations','opt-appears-on']) {
  check(`${id} is in the artist popup`, shell.includes(`id="${id}"`));
}
check('and inside the intent modal', shell.indexOf('id="intent-modal"') < shell.indexOf('id="opt-live"'));

// Pins and History: filled rows, matching track rows and settings rows.
// The overflow half of that item was deliberately not applied — most of
// these rows carry a single action, and hiding one button behind a menu
// is more taps for nothing. They are full-width rows where acting on
// the entry is the point, not narrow grid cells where two buttons
// crowded out a name.
check('list rows are filled surfaces', /\.watchlist-row \{[\s\S]{0,200}background:var\(--tile\)/.test(css));
check('and no longer a bordered list', !/\.watchlist-row \{[^}]*border-bottom/.test(css));
check('their actions stay visible', /\.watchlist-actions \{ display:flex/.test(css));

// The gold/teal label classes stopped meaning anything when headings
// were restyled from pills to plain type, and the rule spans are hidden
// — both were markup implying colour-coding that no longer exists.
check('no dead colour classes', !/class="label (gold|teal)"/.test(src));
check('no hidden rule spans', !/class="rule"/.test(src));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
