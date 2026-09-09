// Dips — an artist's best hour.
//
// The feature the Last.fm key was obtained for. Spotify removed track
// popularity and refuses artist.getTopTracks in Development Mode, so
// the ordering has to come from somewhere else.
//
// A dip is a dive that keeps only the best hour: same catalogue read,
// same duplicate check, different output.
import { readFileSync } from 'fs';
import { buildDip } from '../docs/js/matching.js';
const src = readFileSync(new URL('../docs/js/app.js', import.meta.url), 'utf8');
const se = readFileSync(new URL('../docs/js/search.js', import.meta.url), 'utf8');
const shell = readFileSync(new URL('../docs/app/index.html', import.meta.url), 'utf8');

let pass = 0, fail = 0;
function check(l, c) { if (c) pass++; else { fail++; console.log('FAIL:', l); } }

const catalog = [];
for (let i = 0; i < 40; i++) {
  catalog.push({ id: 't' + i, name: 'Song ' + i, duration_ms: 210000, album: { name: 'A' } });
}
// The same recording under a different release, as a catalogue always has.
catalog.push({ id: 'dup', name: 'Song 3 - Remastered 2011', duration_ms: 210000, album: { name: 'B' } });

const top = [{ name: 'Song 9' }, { name: 'Song 3' }, { name: 'Song 20' }];
const dip = buildDip(catalog, top);

// Ordering comes from Last.fm, matched on normalised titles because the
// two services spell the same recording differently.
check('most played come first', dip.tracks.slice(0, 3).map((t) => t.name).join() === 'Song 9,Song 3,Song 20');
check('a remaster is not a second copy', dip.tracks.filter((t) => t.name.startsWith('Song 3')).length === 1);

// A duration target, not a track count: twenty tracks of one artist
// might be fifty minutes or two hours.
check('lands near an hour', dip.totalMs >= 55 * 60000 && dip.totalMs <= 65 * 60000);
check('reports how many were ranked', dip.ranked === 3);
const short = buildDip(catalog, top, { targetMs: 20 * 60 * 1000 });
check('target is honoured', short.totalMs <= 24 * 60000 && short.totalMs >= 18 * 60000);

// An artist Last.fm has never heard of should still produce a mix.
check('unranked artists still work', buildDip(catalog, []).tracks.length > 0);
check('an empty catalogue gives nothing, not a crash', buildDip([], top).tracks.length === 0);

// Wiring
check('dip is offered beside dive', /id="intent-dip"/.test(shell));
check('and takes the same options', /confirm\(\{ dip: true \}\)/.test(src));
check('the flag reaches the search', /\.\.\.optionsForIntent\(selected, customOpts\), dip \}/.test(src));
check('dips present their own result', /async function presentDip/.test(src));
check('the catalogue is available to re-rank', /catalog_tracks: catalogTracks/.test(se));
// One extra request on top of the dive it already ran.
check('popularity is fetched once', /await lastfm\.topTracks\(artistName, 50\)/.test(src));
// Without a key it degrades rather than failing.
check('works without a key', /if \(lastfm\.hasKey\(\)\) top = await lastfm\.topTracks/.test(src));
check('and says so if Last.fm is unreachable', /ordering by catalogue instead/.test(src));
check('an empty dip is explained', /Couldn't build a dip for/.test(src));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
