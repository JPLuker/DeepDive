// The batch of confirmed bugs from Joseph's testing round.
import { readFileSync } from 'fs';
const src = readFileSync(new URL('../docs/js/app.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../docs/app/index.html', import.meta.url), 'utf8');

let pass = 0, fail = 0;
function check(l, c) { if (c) pass++; else { fail++; console.log('FAIL:', l); } }

// Cancelling a sampler left "(33%) Working" on a tab showing home.
// hideDiveScreen did clear the title; the run's in-flight progress
// callbacks then set it straight back.
check('late progress updates are ignored', /const screen = document\.getElementById\("dive-screen"\);\s*\n\s*if \(!screen \|\| screen\.hidden\) return;/.test(src));
check('hiding still resets the title', /function hideDiveScreen[\s\S]{0,200}setTitle\("DeepDive"\)/.test(src));

// Playlist cleanup showed "0 tracks" for every row.
check('useless track count is gone', !/\$\{p\.tracks\} track/.test(src));

// The outcome was a banner above the buttons, on a page that had just
// been acted on and was no longer actionable.
check('result is a dialog', /function showActionResult/.test(src));
check('dialog is centred over everything', /\.action-result \{[\s\S]{0,200}position:fixed; inset:0/.test(css));
check('dismissing leaves the spent page', /if \(ok\) renderHome\(\);/.test(src));
check('playlist link is offered inside it', /Open playlist<\/a>/.test(src));
check('failures use it too, without navigating away', /headline: "That didn't work"[\s\S]{0,40}ok: false/.test(src));
check('no selection is not treated as success', /headline: "Nothing selected"[\s\S]{0,120}ok: false/.test(src));
check('old banner path is gone', !/msg\.classList\.remove\("hidden", "error"\)/.test(src.slice(src.indexOf('async function confirmResults'), src.indexOf('function showActionResult'))));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
