// Expanded mixes and the custom builder.
//
// The generated set was fifteen recipes plus year and decade cards,
// almost all of them about *when* a track was liked or released. These
// add the other axes the cache already holds — length, artist shape,
// album shape, the calendar of your own listening — and expose the same
// filtering directly, so a combination nobody wrote a card for is still
// reachable.
import { readFileSync } from 'fs';
import { customMix, describeCustom, playlistCards, CUSTOM_SORTS } from '../docs/js/insights.js';
const ins = readFileSync(new URL('../docs/js/insights.js', import.meta.url), 'utf8');
const src = readFileSync(new URL('../docs/js/app.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../docs/app/index.html', import.meta.url), 'utf8');

let pass = 0, fail = 0;
function check(l, c) { if (c) pass++; else { fail++; console.log('FAIL:', l); } }

// A library varied enough to trip most generators.
const lib = [];
for (let i = 0; i < 300; i++) {
  lib.push({
    id: 't' + i, name: 'Song ' + i,
    duration_ms: 60000 + (i * 3700) % 420000,
    artists: i % 5 === 0
      ? [{ id: 'a' + (i % 25), name: 'Artist ' + (i % 25) }, { id: 'guest', name: 'Guest' }]
      : [{ id: 'a' + (i % 25), name: 'Artist ' + (i % 25) }],
    album: { id: 'al' + (i % 45), name: 'Album ' + (i % 45), release_date: (1965 + (i % 58)) + '-06-15', images: [] },
    added_at: (2014 + (i % 11)) + '-' + String((i % 12) + 1).padStart(2, '0') + '-1' + (i % 9) + 'T' + String(i % 24).padStart(2, '0') + ':00:00Z',
  });
}

const cards = playlistCards(lib, { seed: 42 });
check('many more card types than before', cards.length >= 40);
check('every card has tracks', cards.every((c) => c.tracks && c.tracks.length));
check('every card is titled', cards.every((c) => c.title && c.subtitle));
check('ids are unique', new Set(cards.map((c) => c.id)).size === cards.length);

// The new axes.
for (const id of ['late-night', 'one-each-artist', 'deep-albums', 'three-minute', 'collabs', 'solo', 'retrospective']) {
  check(`generator ${id} is registered`, ins.includes(`id: "${id}"`));
}
check('release-year cards exist', ins.includes('function releaseYearCards'));
check('season cards exist', ins.includes('function seasonCards'));
// A thin library should see fewer cards, not a row of near-empty ones.
check('thin libraries produce nothing', playlistCards([{ id: 'x', name: 'x', artists: [], album: {} }], { seed: 1 }).length === 0);

// Custom filtering
check('decade filter narrows', customMix(lib, { decade: 1990 }).length < lib.length);
check('length filter narrows', customMix(lib, { maxSeconds: 180 }).every((t) => t.duration_ms <= 180000));
check('artist filter is exact', customMix(lib, { artistId: 'a3' }).every((t) => t.artists.some((a) => a.id === 'a3')));
check('collabs filter is exact', customMix(lib, { collabsOnly: true }).every((t) => t.artists.length > 1));
// The point of the feature: filters combine.
const combo = customMix(lib, { decade: 1990, maxSeconds: 200, collabsOnly: true });
check('filters combine', combo.every((t) => t.artists.length > 1 && t.duration_ms <= 200000));
// One-per-artist applies after filtering, not before.
const each = customMix(lib, { decade: 1990, oneEachArtist: true });
check('one per artist, of what survived', new Set(each.map((t) => t.artists[0].id)).size === each.length);
check('cap is honoured', customMix(lib, { limit: 7 }).length === 7);
check('sorts are offered', CUSTOM_SORTS.length >= 6);
check('sorting works', (() => {
  const l = customMix(lib, { sort: 'shortest' });
  return l.every((t, i) => i === 0 || l[i - 1].duration_ms <= t.duration_ms);
})());
check('an impossible combination returns nothing', customMix(lib, { minSeconds: 9999 }).length === 0);
check('description reads as a sentence', /the 90s/.test(describeCustom({ decade: 1990 })));

// UI
check('custom card leads the row', /class="pcard is-custom" data-custom/.test(src));
check('and opens the builder', /data-custom\]"\)\?\.addEventListener\("click", \(\) => renderCustomMix\(\)\)/.test(src));
check('builder screen exists', /async function renderCustomMix/.test(src));
// Offering a filter that cannot match is worse than not offering it.
check('only real years are offered', /const years = \[\.\.\.new Set\(cached\.map/.test(src));
check('only real artists are offered', /const artists = \[\.\.\.new Map\(cached\.flatMap/.test(src));
check('match count updates live', /const n = insights\.customMix\(cached, f, Date\.now\(\)\)\.length/.test(src));
check('empty result is explained', /Nothing matches that combination/.test(src));
check('ten random picks below', /const CARDS_PER_LOAD = 10;/.test(src));
check('custom card is styled', /\.pcard\.is-custom/.test(css));

// A select holding several hundred artists is unusable on a phone and
// barely better on a desktop.
// Now the same component as the dive search, rather than a datalist
// of its own. Two artist searches that look different was the
// problem; the source differs, the interface shouldn't.
check('artist uses the shared search', /inputId: "cm-artist",\s*\n\s*listId: "cm-artist-list"/.test(src));
check('sourced from the library, not the API', /artists\.filter\(\(a\) => a\.name\.toLowerCase\(\)\.includes\(needle\)\)/.test(src));
check('and shares one implementation', /function wireArtistSearch/.test(src));
check('matched by name, case-insensitively', /artists\.find\(\(a\) => a\.name\.trim\(\)\.toLowerCase\(\) === typed\)/.test(src));
check('an unrecognised name is explained', /No artist called/.test(src));
check('count updates while typing', /c\.addEventListener\("input", update\)/.test(src));

// The cap looked like it might fetch. It doesn't: filtering runs
// against the cached library and makes no requests at all. Only
// creating the playlist talks to Spotify, at one request per hundred.
check('cost is stated for large mixes', /one per hundred tracks/.test(src));
check('and only above a threshold', /n > 300 \?/.test(src));
check('the cap says it reads nothing', /Nothing here reads from Spotify/.test(src));

// Reuse by name is the behaviour now, not an option.
check('force-new control is gone', !/card-force-new/.test(src));
check('and its block with it', !/card-reuse-block/.test(src));
check('throwaway mixes still create their own', /\{ forceNew: simple \}/.test(src));

// Length uses the same choices as every other mix, minus "all" — an
// unbounded custom mix can be thousands of tracks, and every hundred is
// a request when it's created.
check('length reuses the standard choices', /const CUSTOM_LENGTHS = PLAYLIST_LENGTHS\.filter\(\(n\) => n !== "all"\)/.test(src));
check('and is a picker, not a free number', /<select id="cm-limit"/.test(src));
check('no unbounded option', !/id="cm-limit"[\s\S]{0,300}>all</.test(src));

// "As found" meant "whatever order the generator emitted", which is not
// something anyone can reason about.
check('as found is not offered', !/\{ id: "found", label: "As found" \}/.test(src));
check('shuffle is the default for mixes', /order: "shuffle" \}/.test(src));
// It survives where it is structural: the sampler groups each artist
// behind a track already liked, and shuffling scatters the anchors.
check('sampler still keeps its built order', /length: card\.defaultLength \|\| "all"/.test(src));
// Only the sampler is capped now — a mix that decided its own length
// must not be silently trimmed to twenty.
check('only the sampler caps', (src.match(/defaultLength: 20/g) || []).length === 1);
check('custom defaults to shuffled', /<option value="random" selected>Shuffled<\/option>/.test(src));

// An empty Mixes page said nothing at all: three separate paths set
// innerHTML to "" and returned, so "no cache", "no cards" and "it threw"
// were indistinguishable from each other and from having no mixes.
check('no cache is explained', /Your library hasn't been read yet/.test(src));
check('no cards is explained', /Nothing to build a mix from yet/.test(src));
check('a failure is shown, not just logged', /Couldn't build your mixes:/.test(src));
// Scoped to the card loader. Recommendations returns silently when
// there's no key or no cache on purpose: the Genres section and the
// library row on the same page already explain both, and saying it
// three times is noise rather than clarity.
const loader = src.slice(src.indexOf('async function loadPlaylistCards'), src.indexOf('function renderCardRow'));
check('no silent empty returns in the loader', !/\{ el\.innerHTML = ""; return; \}/.test(loader));

// The real cause of the empty Mixes page: nothing filled the library
// cache except running a dive or Settings > Refresh library. Anyone who
// opened Mixes first was told to "open Home and it'll cache in the
// background" — which Home does not do. A loop with no exit.
check('cache can be filled from where you are', /function wireReadLibrary/.test(src));
check('it actually reads the library', /libraryCache\.getLikedTracks\(\{\s*\n\s*onProgress/.test(src));
check('with progress on the button', /Reading… \$\{done\} of \$\{total\}/.test(src));
check('mixes offers it', /data-read-library>Read my library/.test(src));
check('genres offer it', (src.match(/data-read-library/g) || []).length >= 3);
check('the wrong advice is gone', !/Open Home and it'll cache in the background/.test(src));
// hasCache was passed to the suggestion row and never read, so Home
// showed a thinner row and said nothing.
check('home explains its thinner row', /state\.hasCache === false && suggestions\.length/.test(src));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
