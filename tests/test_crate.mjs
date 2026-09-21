// The Crate.
//
// Pins were a short list on Home that became a wall. Joseph's brief:
// hold a hundred artists and stay usable, like a streaming queue. So it
// reads from the top, Up next leads, and search and sort reach the rest.
import { readFileSync } from 'fs';
const store = new Map();
global.localStorage = {
  getItem: (k) => store.get(k) ?? null,
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
const w = await import('../docs/js/watchlist.js');
const src = readFileSync(new URL('../docs/js/app.js', import.meta.url), 'utf8');
const shell = readFileSync(new URL('../docs/app/index.html', import.meta.url), 'utf8');

let pass = 0, fail = 0;
function check(l, c) { if (c) pass++; else { fail++; console.log('FAIL:', l); } }
const tick = () => new Promise((r) => setTimeout(r, 4));

// --- order ---
w.add('A'); await tick(); w.add('B'); await tick(); w.add('C');
check('newest first by default', w.crateInOrder().map((e) => e.name).join('') === 'CBA');
await tick();
w.moveToTop('A');
check('move to top works', w.crateInOrder()[0].name === 'A');
check('without disturbing the rest', w.crateInOrder().map((e) => e.name).join('') === 'ACB');

// --- the screen ---
check('there is a crate screen', /function renderCrate\(\)/.test(src));
check('dives opens it', /document\.getElementById\("go-pins"\)\?\.addEventListener\("click", \(\) => renderCrate\(\)\)/.test(src));
// At a hundred, scrolling to find one artist isn't a feature.
check('it can be searched', /id="crate-search"/.test(src));
check('and sorted', /id="crate-sort"/.test(src));
check('including by who you have not dived', /\["undived", "Not dived yet"\]/.test(src));
check('up next leads', /<span class="label">Up next<\/span>/.test(src));
check('each tile says where you are with them', /"not dived yet"/.test(src));
// A hundred photos must not all load at once.
check('photos load as they scroll in', /loading="lazy" class="crate-art"/.test(src));
// Repainting the page per keystroke closes a phone's keyboard.
check('search repaints the list only', /search\.addEventListener\("input", \(\) => \{ _crateQuery = search\.value; paint\(\); \}\)/.test(src));
check('one listener for the whole list', /body\.addEventListener\("click", \(ev\) => \{/.test(src));
check('tiles can move to the top', /data-top="\$\{esc\(e\.name\)\}"/.test(src));
check('the grid widens with the screen', /\.crate-grid \{[\s\S]{0,120}auto-fill, minmax\(150px, 1fr\)/.test(shell));

// --- blocked moved out ---
// Blocking changes what the app does, not what you're listening to.
check('blocked has its own screen', /function renderBlocked\(\)/.test(src));
check('reached from settings', /id="go-blocked"/.test(src));
check('and not from the crate', !/function renderCrate\(\)[\s\S]{0,4000}listBlocked/.test(src));

// --- crate sampler ---
check('a sampler can be drawn from the crate', /async function crateSampler\(entries\)/.test(src));
// Always the top of the crate would bring back the same dozen forever.
check('from a random handful, not the top', /insights\.seededPick\(entries, SAMPLER_MAX_ARTISTS, Date\.now\(\) >>> 0\)/.test(src));
check('finding ids for artists added by name', /const found = await client\.findArtist\(e\.name\)/.test(src));
check('and remembering them', /watchlist\.setDetails\(e\.id, found\.id, found\.image_url\)/.test(src));

// --- the word ---
check('no user-facing "pinned" left', !/`Pinned \$\{/.test(src) && !/Pins &amp; blocked/.test(src));
check('storage key unchanged, so no crate is lost', /const KEY = "deepdive_watchlist";/.test(readFileSync(new URL('../docs/js/watchlist.js', import.meta.url), 'utf8')));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
