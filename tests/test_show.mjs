// Concert prep — the 3.0 feature.
//
// Not "dips, but several artists". A bill isn't equal: you're there for
// the headliner and you'd like to recognise four songs by the opener.
// The weighting and the running order are the feature; setlist.fm would
// only have improved which songs got picked, and it can't be called
// from a browser anyway.
import { readFileSync } from 'fs';
import { buildShow } from '../docs/js/matching.js';
const src = readFileSync(new URL('../docs/js/app.js', import.meta.url), 'utf8');

let pass = 0, fail = 0;
function check(l, c) { if (c) pass++; else { fail++; console.log('FAIL:', l); } }

const cat = (p) => Array.from({ length: 30 }, (_, i) => ({
  id: p + i, name: p + ' Song ' + i, duration_ms: 210000, album: { name: 'A' },
}));
const bill = [
  { artist: { name: 'Opener' }, catalog: cat('o'), topTracks: [] },
  { artist: { name: 'Middle' }, catalog: cat('m'), topTracks: [] },
  { artist: { name: 'Headliner' }, catalog: cat('h'), topTracks: [] },
];
const show = buildShow(bill, { totalMs: 3 * 60 * 60 * 1000 });

check('every artist gets a set', show.sets.length === 3);
// The point of the weighting: an opener given equal time is not what
// anyone means by getting ready for a show.
check('the headliner gets the most', show.sets[2].totalMs > show.sets[0].totalMs);
check('and the bill rises toward them', show.sets[0].totalMs < show.sets[1].totalMs && show.sets[1].totalMs < show.sets[2].totalMs);
check('the headliner is marked', show.sets[2].headliner && !show.sets[0].headliner);
// A dip is shuffled; a night isn't.
check('openers come first', show.tracks[0].name.startsWith('o'));
check('the headliner closes', show.tracks[show.tracks.length - 1].name.startsWith('h'));
check('it lands near the length asked for', show.totalMs > 2.7 * 3600000 && show.totalMs < 3.4 * 3600000);

const shorter = buildShow(bill, { totalMs: 90 * 60 * 1000 });
check('a shorter night gives shorter sets', shorter.totalMs < show.totalMs);
check('one artist still works', buildShow([bill[0]], { totalMs: 3600000 }).sets.length === 1);
check('an empty bill is not a crash', buildShow([], {}).tracks.length === 0);
check('artists with no catalogue are skipped', buildShow([{ artist: { name: 'X' }, catalog: [] }], {}).sets.length === 0);

// Wiring
check('there is a way in from Dives', /id="go-show"/.test(src));
check('and a screen', /async function renderShow/.test(src));
check('billing order is editable', /data-show-up/.test(src));
check('artists can be removed', /data-show-rm/.test(src));
check('it uses the shared artist search', /inputId: "artist-input"[\s\S]{0,300}_showBill\.push/.test(src));
// One catalogue read per artist is a dive each, so it says so.
check('the cost is stated as it runs', /Reading \$\{esc\(a\.name\)\} — \$\{i \+ 1\} of/.test(src));
check('one artist failing keeps the rest', /Couldn't read \$\{esc\(a\.name\)\}/.test(src));
check('and nothing at all is explained', /Nothing came back for anyone on the bill/.test(src));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
