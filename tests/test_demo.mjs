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
import { demoScreen, DEMO_SCREENS, DEMO_RESULTS, DEMO_SUGGESTIONS, DEMO_PINS, DEMO_SAMPLER_CARD } from '../docs/js/demo.js';
const src = readFileSync(new URL('../docs/js/app.js', import.meta.url), 'utf8');
const dsrc = readFileSync(new URL('../docs/js/demo.js', import.meta.url), 'utf8');

let pass = 0, fail = 0;
function check(l, c) { if (c) pass++; else { fail++; console.log('FAIL:', l); } }

// --- no network, ever -------------------------------------------------
// The whole point is that these render with the quota locked.
check('demo data has no external urls', !/https?:\/\//.test(dsrc.replace(/^\s*\*.*$/gm, '')));
check('demo module makes no requests', !/fetch\(|client\./.test(dsrc));
check('tiles fall back to the gradient treatment',
  DEMO_SUGGESTIONS.every((s) => s.image_url === null) && DEMO_PINS.every((p) => p.image_url === null));

// --- routing ----------------------------------------------------------
check('demo runs before any auth check', /const screen = demo\.demoScreen\(\);\s*\n\s*if \(screen\) return renderDemo\(screen\);/.test(src));
check('screens are reachable', DEMO_SCREENS.length >= 4);
check('index lists every screen', DEMO_SCREENS.every(([id]) => typeof id === 'string' && id.length));

// --- real renderers ---------------------------------------------------
check('results uses the real renderer', /return renderResults\(demo\.DEMO_RESULTS\)/.test(src));
check('scan uses the real renderer', /return renderScrubResults\(demo\.DEMO_SCAN\)/.test(src));
check('sampler uses the real dialog', /openCardModal\(demo\.DEMO_SAMPLER_CARD\)/.test(src));
check('home uses the real suggestion row', /renderSuggestionRow\(el, demo\.DEMO_PINS, demo\.DEMO_SUGGESTIONS\)/.test(src));
check('no second copy of tile markup in demo.js', !/class="tile"/.test(dsrc));
check('the old pill markup is gone', !/class=\\?"pill\\?"/.test(src.slice(src.indexOf('async function loadSuggestions'), src.indexOf('async function loadSuggestions') + 900)));

// --- data shape matches what the renderers expect ----------------------
check('results has both sections', DEMO_RESULTS.duplicate_candidates.length > 0 && DEMO_RESULTS.new_tracks.length > 0);
check('duplicates carry a match basis', DEMO_RESULTS.duplicate_candidates.every((d) => d.match_basis && d.matched_liked_track));
check('tracks carry an album and duration',
  DEMO_RESULTS.new_tracks.every((t) => t.album && t.album.name && t.duration_ms));
check('suggestions carry a reason', DEMO_SUGGESTIONS.every((s) => s.reason));
check('sampler card has tracks and a count',
  DEMO_SAMPLER_CARD.tracks.length === DEMO_SAMPLER_CARD.count);

// --- session handling --------------------------------------------------
check('demoScreen tolerates no window', typeof demoScreen() === 'object' || demoScreen() === null || typeof demoScreen() === 'string');
check('there is a way out', /export function exitDemo/.test(dsrc) && /demo\.exitDemo\(\)/.test(src));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
