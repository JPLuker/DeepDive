// Session 2, stopping point A — the results screen.
//
// The last screen still carrying the original Flask identity: uppercase
// monospace section pills beside a hairline rule, bordered rows with a
// coloured spine, a middle-dot meta string, and three competing primary
// buttons. Home moved to plain Inter headings and filled artwork tiles
// long ago; this brings the rest in line.
import { readFileSync } from 'fs';
const html = readFileSync(new URL('../docs/app/index.html', import.meta.url), 'utf8');
const src = readFileSync(new URL('../docs/js/app.js', import.meta.url), 'utf8');
const sp = readFileSync(new URL('../docs/js/spotify.js', import.meta.url), 'utf8');

let pass = 0, fail = 0;
function check(l, c) { if (c) pass++; else { fail++; console.log('FAIL:', l); } }

// --- section headings ------------------------------------------------
// Shared markup across results, Settings, History and Pins, so restyling
// the class moves all of them at once.
check('headings are no longer uppercase pills', !/\.crate-header \.label \{ font-family:'IBM Plex Mono'/.test(html));
check('headings use the app heading face', /\.crate-header \.label \{[\s\S]*?font-family:'Inter'/.test(html));
check('heading rules are hidden', /\.crate-header \.rule \{ display:none; \}/.test(html));

// --- rows -------------------------------------------------------------
check('rows are filled surfaces', /\.track-row \{[\s\S]*?background:var\(--tile\)/.test(html));
check('rows lost the coloured spine', !/\.track-row::before/.test(html));
check('rows carry artwork', /\.track-art \{ width:56px; height:56px/.test(html));
check('artwork reaches the row', /class="track-art"/.test(src));
check('album art is carried through the catalogue read', /image_url: \(album\.images && album\.images\.length\)/.test(sp));
check('whole row toggles its checkbox', /<label class="track-row/.test(src));
check('preview rows opt out of that', /\.track-row\.is-static \{ cursor:default; \}/.test(html));
check('match line is not monospace', !/\.track-match \{[^\n]*IBM Plex Mono/.test(html));

// --- copy -------------------------------------------------------------
// A meta string of counts joined by middle dots reads as a status bar.
check('summary is sentences, not a meta string', /function resultsSummary/.test(src));
check('old meta string is gone', !/already liked · \$\{dups\.length\} to confirm/.test(src));
check('sort label is not uppercase mono', !/\.sort-row label \{[^\n]*IBM Plex Mono/.test(html));
check('playlist field label is not uppercase mono', !/\.playlist-name-field label \{[^\n]*IBM Plex Mono/.test(html));

// --- actions ----------------------------------------------------------
// Three btn-primary buttons side by side is no hierarchy at all.
const actions = src.slice(src.indexOf('<div class="actions">'), src.indexOf('data-home>Back to search'));
// The three btn-primary occurrences are mutually exclusive branches —
// only one ever renders — so counting them in source proves nothing.
// What matters is that within the branch offering all three choices,
// exactly one is primary and the alternatives are ghosts.
const bothBranch = actions.slice(actions.indexOf('data-action="both"'), actions.indexOf('data-action="playlist">Just'));
check('the combined action is the only primary in its branch',
  /btn-primary/.test(actions.slice(0, actions.indexOf('data-action="both"') + 20)) &&
  (bothBranch.match(/btn-primary/g) || []).length === 0);
check('alternatives are ghosts', (bothBranch.match(/btn-ghost/g) || []).length >= 1);
check('actions say what they do', /Just build the playlist/.test(actions));

// --- duplicate rows ---------------------------------------------------
check('duplicates share the row builder', /function dupRow/.test(src));
check('checkbox attribute is passed, not string-replaced', /attr = "data-tid"/.test(src));
check('no html string surgery', !/\.replace\('data-tid=', 'data-dup='\)/.test(src));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
