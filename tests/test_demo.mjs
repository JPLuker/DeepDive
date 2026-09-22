// Demo mode. Screenshots of the real app expose whoever's library is
// loaded, and can't be taken at all while the quota is locked — so the
// presentation session depends on this working.
//
// The version this replaced only swapped artist names into the
// suggestion row, and drew them with the pre-2.2 `pill` markup. It
// rendered a UI the app no longer had, so anything shot from it would
// have advertised the wrong product. The rule now: demo screens go
// through the real renderers, never a second copy of the markup.
import { readFileSync } from 'fs';
import { demoScreen, DEMO_SCREENS, approvedArtists, artistNames, namesFor, searchNames, setApprovedArtists, setArtistNames } from '../docs/js/demo.js';
const src = readFileSync(new URL('../docs/js/app.js', import.meta.url), 'utf8');
const dsrc = readFileSync(new URL('../docs/js/demo.js', import.meta.url), 'utf8');

let pass = 0, fail = 0;
function check(l, c) { if (c) pass++; else { fail++; console.log('FAIL:', l); } }

// --- whitelist and live Spotify data ----------------------------------
check('artist names are configurable', artistNames().length >= 4 && /deepdive_demo_artists/.test(dsrc));
check('bad duplicates are removed', setArtistNames('A\nB\na\nC\nD').join('') === 'ABCD');
check('Spotify artist identities are saved', setApprovedArtists([
  { id: '1', name: 'A' }, { id: '2', name: 'B' }, { id: '3', name: 'C' }, { id: '4', name: 'D' },
])[0].id === '1' && /localStorage\.setItem\(ARTISTS_KEY, JSON\.stringify\(artists\)\)/.test(dsrc));
check('sections receive stable random assignments', namesFor('home', 4).join('|') === namesFor('home', 4).join('|'));
check('search is spoofed from the whitelist', searchNames('definitely-no-match', 4).length === 4);
check('spotify resolves only approved names', /demo\.namesFor\(section, count\)/.test(src) && /client\.findArtist\(name\)/.test(src));
check('real tracks and albums come from Spotify', /type: "track"/.test(src) && /demoTracksFor/.test(src));

// --- routing ----------------------------------------------------------
check('demo runs before any auth check', /const screen = demo\.demoScreen\(\);\s*\n\s*if \(screen\) return renderDemo\(screen\);/.test(src));
check('all screenshot screens are reachable', DEMO_SCREENS.length >= 9);
check('index lists every screen', DEMO_SCREENS.every(([id]) => typeof id === 'string' && id.length));

// --- real renderers ---------------------------------------------------
check('results uses the real renderer', /return renderResults\(demo\.resultsFrom\(group\.artist, group\.tracks\)\)/.test(src));
check('results preloads full Spotify artist artwork', /client\.get\(`artists\/\$\{approved\.id\}`\)\.then\(normaliseArtist\)/.test(src) && /if \(photo\) await preloadPhoto\(photo\)/.test(src));
check('results stage uneven counts and visible duplicates', /already_liked_count: 11/.test(dsrc) && /usable\.slice\(0, 3\)/.test(dsrc) && /new_tracks: usable\.slice\(3\)/.test(dsrc));
check('scan uses the real renderer', /return renderScrubResults\(demo\.scanFrom\(groups\)\)/.test(src));
check('sampler uses the real dialog', /openCardModal\(card\)/.test(src));
check('home uses the real suggestion row', /renderSuggestionRow\(el, demo\.pinsFrom\(pins\), demo\.suggestionsFrom\(suggestions\)\)/.test(src));
check('no second copy of tile markup in demo.js', !/class="tile"/.test(dsrc));
check('the old pill markup is gone', !/class=\\?"pill\\?"/.test(src.slice(src.indexOf('async function loadSuggestions'), src.indexOf('async function loadSuggestions') + 900)));

check('settings exposes Spotify whitelist search', /id="set-demo-artist-search"/.test(src) && /client\.searchArtists\(q, 8\)/.test(src) && /id="set-demo-save"/.test(src));
check('demo refreshes cannot read outside the whitelist', /demo\.demoActive\(\) \? "" : `<button class="row-icon" id="sugg-refresh"/.test(src) && /if \(!demo\.demoActive\(\)\) refreshLibrary\(\)/.test(src));
check('assignments can be shuffled', /id="set-demo-shuffle"/.test(src) && /demo\.reshuffle\(\)/.test(src));
check('demo search never escapes the whitelist', /demo\.searchNames\(query, limit\)/.test(src));
check('crate and multi-dip use approved artists', /demoArtistsFor\("crate"/.test(src) && /demoArtistsFor\("multidip"/.test(src));
check('Dives buttons open staged crate and multi-dip', /go-show"\)\?\.addEventListener\("click", \(\) => demo\.demoActive\(\) \? renderDemo\("multidip"\)/.test(src) && /go-pins"\)\?\.addEventListener\("click", \(\) => demo\.demoActive\(\) \? renderDemo\("crate"\)/.test(src));
check('demo mixes include date album and library recipes', /title: "Released in 2023"/.test(src) && /title: "Albums that landed"/.test(src) && /title: "Your first 50"/.test(src));

// --- session handling --------------------------------------------------
check('demoScreen tolerates no window', typeof demoScreen() === 'object' || demoScreen() === null || typeof demoScreen() === 'string');
check('there is a way out', /export function exitDemo/.test(dsrc) && /demo\.exitDemo\(\)/.test(src));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
