// Up next.
//
// Pins are a library — everyone you've meant to get round to — and on
// Home they grew into a wall. Up next is a queue drawn from them: the
// few you've starred to do soon. Home shows the queue; the pins live on
// their own screen under Dives.
import { readFileSync } from 'fs';
const store = new Map();
global.localStorage = {
  getItem: (k) => store.get(k) ?? null,
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
const w = await import('../docs/js/watchlist.js');
const src = readFileSync(new URL('../docs/js/app.js', import.meta.url), 'utf8');

let pass = 0, fail = 0;
function check(l, c) { if (c) pass++; else { fail++; console.log('FAIL:', l); } }

// --- the queue itself ---
w.add('Norah Jones');
w.add('The Warning');
check('nothing starred to begin with', w.listUpNext().length === 0);

w.setUpNext('Norah Jones', true);
check('starring puts them up next', w.isUpNext('Norah Jones'));
check('and only them', !w.isUpNext('The Warning'));

// Up next is a view of the pins, so it can't hold anyone the pins don't.
w.setUpNext('Paramore', true);
check('starring someone unpinned pins them', w.isPinned('Paramore'));
check('the queue runs in the order it was built', w.listUpNext().map((e) => e.name).join() === 'Norah Jones,Paramore');

w.setUpNext('Norah Jones', false);
check('unstarring takes them off', !w.isUpNext('Norah Jones'));
check('but leaves them pinned', w.isPinned('Norah Jones'));

// --- Home ---
check('home shows up next', /pinHeading = "Up next";/.test(src));
// Always the same four meant the rest of the pins never appeared on
// Home at all. Shuffled, but on the session's seed so a tab switch
// doesn't reshuffle them — only refresh does.
check('and falls back to four pins when nothing is starred', /shownPins = insights\.seededPick\(pins, 4,/.test(src));
check('shuffled on the session seed', /\(_suggestSeed \|\| 0\) \^ sessionSeed\(\)/.test(src));
check('one definition of that seed', (src.match(/sessionStorage\.getItem\("deepdive_sugg_seed"\)/g) || []).length === 1);
check('the heading follows what is shown', /<h2>\$\{pinHeading\}<\/h2>/.test(src));
// Dives stops listing pins inline — they have their own screen.
check('dives does not list pins inline', /\} else \{\s*\n\s*shownPins = \[\];/.test(src));

// --- starring ---
check('the pins screen has a star', /data-star="\$\{esc\(e\.name\)\}"/.test(src));
check('and so do pin tiles', /data-upnext="\$\{esc\(p\.name\)\}"/.test(src));
check('and suggestion tiles', /data-upnext="\$\{esc\(sg\.name\)\}"/.test(src));
// A suggestion isn't pinned yet, so starring it has to carry what a pin needs.
check('starring a suggestion carries its details', /watchlist\.setUpNext\(name, on, \{\s*\n\s*spotifyId: b\.dataset\.sid/.test(src));
check('the star says which way it goes', /aria-pressed="\$\{watchlist\.isUpNext\(e\.name\)\}"/.test(src));

// --- the question after a playlist ---
// Whether someone stays on Up next is the one thing only the listener
// knows, so it's asked when it becomes true rather than guessed.
check('the popup asks about queued artists', /data-upnext-ask/.test(src));
check('only about ones actually queued', /const queued = \(artists \|\| \[\]\)\.filter\(\(n\) => n && watchlist\.isUpNext\(n\)\);/.test(src));
check('taking them off works', /for \(const n of queued\) watchlist\.setUpNext\(n, false\);/.test(src));
check('keeping them is an answer too', /data-upnext-keep/.test(src));
check('a dive says who it was for', /artists: \[r\.artist && r\.artist\.name\]/.test(src));
check('so does a mix sheet', /artists: card\.forArtists \|\| \[\]/.test(src));
check('dips tag their artist', (src.match(/forArtists: \[/g) || []).length >= 3);
check('a Multi-Dip tags its whole bill', /forArtists: billed\.map\(\(x\) => x\.artist\.name\)/.test(src));
// "If you like X" isn't a playlist of X, so it shouldn't ask about X.
check('a similar-artist mix asks nothing', !/seedName[\s\S]{0,80}forArtists/.test(src));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
