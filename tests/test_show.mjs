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
const shell = readFileSync(new URL('../docs/app/index.html', import.meta.url), 'utf8');

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
// Weight comes from a tag now, not from position: getting the billing
// order right was compulsory before the feature would behave, and
// reordering names with an arrow is a chore for something most people
// would shrug at. Equal unless you say otherwise.
check('untagged artists share evenly', Math.abs(show.sets[0].totalMs - show.sets[2].totalMs) < 5 * 60000);
const tagged = buildShow([
  { ...bill[0], emphasis: 'less' }, bill[1], { ...bill[2], emphasis: 'more' },
], { totalMs: 3 * 3600000 });
check('more gets more', tagged.sets[2].totalMs > tagged.sets[1].totalMs);
check('less gets less', tagged.sets[0].totalMs < tagged.sets[1].totalMs);
check('and the night is still the length asked for', Math.abs(tagged.totalMs - 3 * 3600000) < 12 * 60000);
check('the tag is reported back', tagged.sets[2].emphasis === 'more' && !show.sets[0].emphasis);
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
check('tags are togglable', /data-show-emph/.test(src));
// Nothing compulsory: pressing an active tag clears it.
check('and clear when pressed again', /a\.emphasis === b\.dataset\.emph \? null : b\.dataset\.emph/.test(src));
check('the reorder arrows are gone', !/data-show-up/.test(src));
// The bill reused .watchlist-row, which is built for a name and one
// button — not a name, a position, an order control, a marker and a
// button. The name and the controls overlapped.
check('the bill has its own row markup', /class="bill-row"/.test(src));
check('and no longer borrows the watchlist row', !/_showBill\.map\(\(a, i\) => `\s*\n\s*<div class="watchlist-row">/.test(src));
check('the name truncates instead of pushing controls off', /\.bill-name \{[\s\S]{0,200}text-overflow:ellipsis/.test(shell));
check('tags reach the builder', /emphasis: a\.emphasis \|\| null/.test(src));
check('tags are visible on the row', /class="bill-tag-btn/.test(src));
// The gear opens dive options. On Multi-Dip there is no dive about to
// happen, so it did nothing at all.
check('the shell can omit the options gear', /function searchShellHtml\(\{ options = true \} = \{\}\)/.test(src));
check('multidip omits it', /searchShellHtml\(\{ options: false \}\)/.test(src));
check('but keeps the search button', src.includes('` : ""}') && /id="search-go-btn"/.test(src));
check('and the autofill list', /id="autofill-list"/.test(src));
check('artists can be removed', /data-show-rm/.test(src));
check('it uses the shared artist search', /inputId: "artist-input"[\s\S]{0,300}_showBill\.push/.test(src));
// One catalogue read per artist is a dive each, so it says so.
check('the cost is stated as it runs', /Reading \$\{esc\(a\.name\)\} — \$\{i \+ 1\} of/.test(src));
// It kept the rest, but wrote the failure into the progress line that
// the next artist immediately overwrote — so a bill of two quietly
// became a bill of one with nothing said.
check('one artist failing keeps the rest', /failed\.push\(`\$\{a\.name\}: \$\{e\.message \|\| e\}`\)/.test(src));
check('and the ones left out are named', /Left out — /.test(src));
check('including any that returned nothing', /nothing came back/.test(src));
check('and nothing at all is explained', /Nothing came back for anyone on the bill/.test(src));

// What you already own is a setting, not a layer — and it's the same
// question for a dip and for a night, so it's one control.
import { buildDip, FAMILIAR_MODES } from '../docs/js/matching.js';
const solo = Array.from({ length: 20 }, (_, i) => ({
  id: 't' + i, name: 'Song ' + i, duration_ms: 210000, album: { name: 'A' },
}));
const owned = new Set(['t5', 't6', 't7']);
const ranked = solo.map((t) => ({ name: t.name }));

check('three modes', FAMILIAR_MODES.length === 3);
const mixed = buildDip(solo, ranked, { familiar: 'mixed', likedIds: owned });
const first = buildDip(solo, ranked, { familiar: 'known-first', likedIds: owned });
const only = buildDip(solo, ranked, { familiar: 'new-only', likedIds: owned });

check('mixed ignores ownership', mixed.tracks[0].id === 't0');
check('known-first leads with what you own', first.tracks.slice(0, 3).every((t) => owned.has(t.id)));
check('and popularity still orders within that', first.tracks[0].id === 't5');
check('new-only drops what you own', !only.tracks.some((t) => owned.has(t.id)));
// Dropping everything leaves nothing for an artist you own completely,
// which is worse than ignoring the setting.
check('owning everything falls back rather than emptying',
  buildDip(solo, ranked, { familiar: 'new-only', likedIds: new Set(solo.map((t) => t.id)) }).tracks.length > 0);
check('no liked ids behaves as mixed',
  buildDip(solo, ranked, { familiar: 'known-first' }).tracks[0].id === 't0');

// Per artist in a show: the headliner you own three albums of, the
// opener none.
const showEntries = [
  { artist: { name: 'A' }, catalog: solo, topTracks: ranked, likedIds: [] },
  { artist: { name: 'B' }, catalog: solo.map((t) => ({ ...t, id: 'b' + t.id })), topTracks: [], likedIds: ['bt0'] },
];
check('shows take the setting', /familiar = "mixed"/.test(readFileSync(new URL('../docs/js/matching.js', import.meta.url), 'utf8')));
check('and liked ids per artist', /likedIds: entry\.likedIds/.test(readFileSync(new URL('../docs/js/matching.js', import.meta.url), 'utf8')));

// The control appears in both places, and the choice is remembered.
check('offered on concert prep', /id="show-familiar"/.test(src));
check('offered on dives and dips', /id="opt-familiar"/.test(src) || /opt-familiar/.test(readFileSync(new URL('../docs/app/index.html', import.meta.url), 'utf8')));
check('the choice is remembered', /deepdive_familiar/.test(src));
check('the search exposes which tracks you own', /already_liked_ids/.test(readFileSync(new URL('../docs/js/search.js', import.meta.url), 'utf8')));

// Bills live in history rather than their own store.
check('a built bill is recorded', /history\.recordBill\(_showBill/.test(src));
check('and can be reloaded', /data-bill-load/.test(src));
check('or removed', /data-bill-rm/.test(src));
check('the same lineup twice is one entry', /filtered = list\.filter\(\(b\) =>/.test(readFileSync(new URL('../docs/js/history.js', import.meta.url), 'utf8')));

// Reachable from the artist popup, not only from a row on Dives. The
// artist you just searched is almost always on the bill — usually the
// one you're going for — so it seeds the lineup.
check('multidip is offered beside dip and dive', /id="intent-multi"/.test(shell));
check('and says what it does', /several artists, one night/.test(shell));
// The popup has a name, not a resolved artist. Storing the name as the
// id meant it was passed as `resolvedArtist`, so the catalogue read
// asked Spotify for an artist whose id was "Frank Sinatra" — which
// fails, and lost that artist from the bill entirely.
check('it seeds the bill with the searched artist', /_showBill\.push\(\{ id: null, name: artist \}\)/.test(src));
check('and only skips the lookup for a real artist', /resolvedArtist: a && a\.id \? a : null/.test(src));
check('without duplicating someone already on it', /!_showBill\.some\(\(a\) => \(a\.name \|\| ""\)\.toLowerCase\(\) === artist\.toLowerCase\(\)\)/.test(src));
// One name for one feature: it was "Concert prep" on Dives and would
// have been "Multi-Dip" in the popup.
check('one name everywhere', !/Concert prep/.test(src));
check('and that name is Multi-Dip', /<h2>Multi-Dip<\/h2>/.test(src) && /"Multi-Dip", "Everyone on the bill/.test(src));
// One spelling, or the app and its docs drift apart.
check('no unhyphenated spelling remains', !/Multidip/.test(src) && !/Multidip/.test(shell));

// Pinning an artist to an exact song count — four for the opener you've
// never heard, everything for the one you came to see.
const pin = (n, songs) => ({
  artist: { name: n },
  catalog: Array.from({ length: 40 }, (_, i) => ({ id: n[0] + i, name: n + ' S' + i, duration_ms: 210000, album: { name: 'A' } })),
  topTracks: [], songs,
});
const auto = buildShow([pin('Opener'), pin('Middle'), pin('Head')], { totalMs: 3 * 3600000 });
const withPin = buildShow([pin('Opener', 4), pin('Middle'), pin('Head')], { totalMs: 3 * 3600000 });

check('a pinned artist gets exactly that many', withPin.sets[0].tracks.length === 4);
check('and is marked as pinned', withPin.sets[0].pinned && !withPin.sets[1].pinned);
// Pinning one person must not quietly rob the night of its length.
check('the night stays the length asked for', Math.abs(withPin.totalMs - 3 * 3600000) < 12 * 60000);
check('the freed time goes to the others', withPin.sets[2].tracks.length > auto.sets[2].tracks.length);
check('unpinned artists still share what is left', withPin.sets[1].totalMs > 0 && withPin.sets[2].totalMs > 0);
check('pinning everyone still builds', buildShow([pin('A', 3), pin('B', 3)], { totalMs: 3600000 }).tracks.length === 6);

check('the control is on each bill row', /data-show-songs/.test(src));
check('the choice rides with the artist', /_showBill\[\+sel\.dataset\.showSongs\]\.songs/.test(src));
check('and reaches the builder', /songs: a\.songs \|\| null/.test(src));

// Naming took the last name on the list and called them the headliner.
// That was right when position set the weighting; tags replaced
// position in 2.9.7 and this was left behind, so a bill could be named
// "Frank Sinatra and support" while containing mostly Norah Jones.
check('a headliner only exists if one is tagged', /const lead = billed\.find\(\(x\) => x\.emphasis === "more"\) \|\| null;/.test(src));
check('an untagged bill is named as equals', /billed\.map\(\(x\) => x\.artist\.name\)\.join\(" · "\)/.test(src));
check('"and support" only when someone leads', /lead\s*\n\s*\? `DeepDive · \$\{lead\.artist\.name\}\$\{others\.length \? " and support" : ""\}`/.test(src));
check('artists with no tracks are not named', /const billed = show\.sets\.filter\(\(x\) => x\.tracks\.length\);/.test(src));
check('no leftover position-based naming', !/names\[names\.length - 1\]/.test(src));
// So a name that doesn't match the contents is visible rather than a
// guess.
check('the breakdown reports tracks per artist', /\$\{s\.tracks\.length\} tracks\//.test(src));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
