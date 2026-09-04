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
const actions = src.slice(src.indexOf('<div class="results-actions">'), src.indexOf('data-home>Back to home'));
// Three named actions — Like Songs, Create Playlist, Both — with Both
// as the primary and Back to home on its own row beneath. Joseph's
// call; the earlier single-primary scheme hid what the alternatives
// actually did behind "Just…" phrasing.
check('three named actions', /data-action="like">Like Songs/.test(actions) && /data-action="playlist">Create Playlist/.test(actions) && /data-action="both">Both/.test(actions));
check('both is the primary', /btn btn-primary" data-action="both"/.test(actions));
check('back to home sits under them', /btn-back" data-home>Back to home/.test(src));
check('actions are docked, not inline', /<div class="results-actions">/.test(src));


// --- duplicate rows ---------------------------------------------------
check('duplicates share the row builder', /function dupRow/.test(src));
check('checkbox attribute is passed, not string-replaced', /attr = "data-tid"/.test(src));
check('no html string surgery', !/\.replace\('data-tid=', 'data-dup='\)/.test(src));

// The artist leads, as on the dive: full-bleed photo, name and
// colour-coded counts beneath it, fading as you scroll into the lists.
check('hero escapes the page gutters', /\.results-hero \{[\s\S]*?margin:0 -24px 0;/.test(html));
check('hero has a photo layer', /id="results-hero-photo"/.test(src));
check('hero falls back to a gradient', /\.results-hero-photo\.is-blank/.test(html));
check('counts are colour coded', /\.results-stat \.dot\.dup \{ background:var\(--teal\)/.test(html) && /\.results-stat \.dot\.new \{ background:var\(--gold\)/.test(html));
check('all three counts render', /dot dup/.test(src) && /dot new/.test(src) && /dot liked/.test(src));
check('hero fades on scroll', /function attachHeroFade/.test(src));
// Safari has no scroll-linked CSS animations, and an unthrottled scroll
// handler doing layout is a jank generator.
check('fade is rAF-throttled', /requestAnimationFrame\(apply\)/.test(src));
check('scroll listener is passive', /\{ passive: true \}/.test(src));
check('actions clear the mobile tab bar', /\.results-actions \{ bottom:calc\(60px \+ env\(safe-area-inset-bottom\)\)/.test(html));
check('body clears the docked actions', /\.results-body \{ padding-bottom:132px; \}/.test(html));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
