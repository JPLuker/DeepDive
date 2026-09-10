// Last.fm — the optional second source.
//
// It exists because Spotify removed or deprecated the data underneath
// three features: track popularity, similar artists, and anything
// finer-grained than a broad artist genre. Everything here is
// read-only public data needing only an API key.
import { readFileSync } from 'fs';
import { normalizeTag, tagLabel, _internals } from '../docs/js/lastfm.js';
const lfm = readFileSync(new URL('../docs/js/lastfm.js', import.meta.url), 'utf8');
const src = readFileSync(new URL('../docs/js/app.js', import.meta.url), 'utf8');

let pass = 0, fail = 0;
function check(l, c) { if (c) pass++; else { fail++; console.log('FAIL:', l); } }

// Per-user keys. A shipped key would be readable in a browser-only app,
// pooled across every user, and revocable because of one person.
check('key is stored per user', /const KEY_STORAGE = "deepdive_lastfm_key"/.test(lfm));
check('no key is embedded', !/api_key\s*[:=]\s*["'][0-9a-f]{20,}/.test(lfm));
check('setup offers the key', /id="lastfm-key-input"/.test(src));
check('settings offers it too', /id="set-lastfm-key"/.test(src));
check('setup marks it optional', /<span class="qual">optional<\/span>/.test(src));
check('an empty key is a valid answer', /Last\.fm key removed/.test(src));

// Optional means optional: a missing key must never break a screen.
check('no key returns nothing rather than throwing', /if \(!key\) return null;/.test(lfm));
check('hasKey is exposed for callers to branch on', /export function hasKey/.test(lfm));

// Their terms allow 5 requests per second per IP, averaged over five
// minutes. Unlike Spotify there is no quota to exhaust, only a rate.
check('requests are paced', _internals.PACING_MS >= 200);
check('pacing is applied before each call', /await pace\(\);/.test(lfm));

// Last.fm answers with HTTP 200 and an error code in the body as often
// as it uses a status code, so both have to be checked.
check('body errors are caught', /if \(body && body\.error\) throw new LastfmError/.test(lfm));
check('status errors are caught too', /if \(!resp\.ok\) throw new LastfmError/.test(lfm));
check('rate limit is identifiable', _internals.ERR_RATE_LIMIT === 29);
check('a suspended key is distinguished', /this\.suspended = code === ERR_KEY_SUSPENDED/.test(lfm));

// The three endpoints, and their single-result shape — Last.fm returns
// a bare object rather than an array when there is exactly one.
for (const m of ['artist.getTopTracks', 'artist.getSimilar', 'artist.getTopTags']) {
  check(`${m} is wired`, lfm.includes(`"${m}"`));
}
check('single results are still arrays', (lfm.match(/Array\.isArray\(raw\) \? raw : \[raw\]/g) || []).length === 3);

// Tags are user-applied, so the same genre arrives spelled several
// ways and would otherwise become several mixes of the same music.
check('hyphens collapse', normalizeTag('Hip-Hop') === 'hip hop');
check('spacing collapses', normalizeTag('hip hop') === 'hip hop');
check('concatenation collapses', normalizeTag('HipHop') === 'hip hop');
check('abbreviations collapse', normalizeTag('DnB') === 'drum and bass');
check('real genres survive', normalizeTag('  Shoegaze ') === 'shoegaze');
check('subgenres survive', normalizeTag('Midwest Emo') === 'midwest emo');
// Tags describing the listener rather than the music rank highly on
// well-known artists and would produce a "Your seen live" mix.
check('shelving tags are dropped', normalizeTag('Seen live') === '');
check('so are decades', normalizeTag('90s') === '' && normalizeTag('1980s') === '');
check('weights are kept for filtering', /weight: parseInt\(t\.count, 10\)/.test(lfm));
check('labels are presentable', tagLabel('midwest emo') === 'Midwest Emo');

// Genre mixes: the first feature built on the key.
import { genreCards, artistsByWeight } from '../docs/js/insights.js';

const tracks = [];
for (let i = 0; i < 60; i++) {
  tracks.push({
    id: 't' + i, name: 'S' + i,
    artists: [{ id: 'a' + (i % 4), name: 'Artist ' + (i % 4) }],
    album: { id: 'al', release_date: '2000-01-01', images: [] },
    added_at: '2020-01-01T00:00:00Z',
  });
}
const tagMap = new Map([
  ['artist 0', [{ name: 'shoegaze', weight: 100 }, { name: 'noise pop', weight: 40 }]],
  ['artist 1', [{ name: 'shoegaze', weight: 80 }]],
  ['artist 2', [{ name: 'midwest emo', weight: 90 }]],
  ['artist 3', [{ name: 'shoegaze', weight: 10 }]],
]);
const gc = genreCards(tracks, tagMap, { minWeight: 25, minTracks: 8 });

check('genres become cards', gc.length > 0);
check('cards carry their tracks', gc.every((c) => c.tracks.length === c.count));
// The 0-100 weight is what separates a defining tag from a joke.
check('low-weight tags are ignored', !gc.some((c) => c.tracks.some((t) => t.artists[0].name === 'Artist 3')));
check('a genre too small to be a mix is dropped', genreCards(tracks, tagMap, { minTracks: 999 }).length === 0);
check('no tags means no cards, not an error', genreCards(tracks, new Map()).length === 0);
check('biggest genre leads', gc[0].count >= gc[gc.length - 1].count);

// One request per artist, so the order decides how quickly it becomes
// useful: an artist you own thirty tracks by carries a mix alone.
const ranked = artistsByWeight(tracks);
check('artists are ranked by how much you own', ranked[0].count >= ranked[ranked.length - 1].count);

// The fetch is never silent — every slowness confusion in this project
// came from work happening invisibly.
check('fetch is cancellable', /function cancelGenreFetch/.test(src));
check('progress is reported', /if \(onProgress\) onProgress\(done, artists\.length, failed\)/.test(src));
check('cost is stated before spending it', /one request per artist/.test(src));
// A bad key fails identically for every artist, so stop on the first.
check('a rejected key stops the run', /if \(e && e\.suspended\) throw e;/.test(src));
check('one artist failing does not stop the rest', /_genreTags\.set\(key, \[\]\);/.test(src));
// Without a key the section explains rather than breaking.
check('no key is explained, not errored', /needs Last\.fm<\/span>/.test(src));
check('and points at settings', /data-tab="settings">Add a key/.test(src));

// Recommendations: similar artists crossed with what you own.
import { recommendationCards } from '../docs/js/insights.js';
const recTracks = [];
for (let i = 0; i < 40; i++) {
  recTracks.push({
    id: 'r' + i, name: 'S' + i,
    artists: [{ id: 'a' + (i % 4), name: 'Artist ' + (i % 4) }],
    album: { id: 'al', release_date: '2010-01-01', images: [] },
    added_at: '2020-01-01T00:00:00Z',
  });
}
const sim = new Map([['artist 0', [
  { name: 'Artist 1', match: 0.9 },
  { name: 'Nobody I Own', match: 0.8 },
  { name: 'Artist 2', match: 0.7 },
]]]);
const recs = recommendationCards(recTracks, sim, { minTracks: 6 });

check('recommendations become mixes', recs.length === 1);
// Similar artists alone are names you cannot play; the recommendation
// is the intersection with what you already own.
check('only artists you own are used', recs[0].subtitle.startsWith('2 similar'));
check('the seed itself is excluded', !recs[0].tracks.some((t) => t.artists[0].name === 'Artist 0'));
check('named after what explains it', /^If you like /.test(recs[0].title));
check('no similarity data means no cards', recommendationCards(recTracks, new Map()).length === 0);
check('too few tracks is not a mix', recommendationCards(recTracks, sim, { minTracks: 999 }).length === 0);

// Same cost model as tags: one request per seed, on a button.
check('recommendations are fetched on demand', /id="rec-go"/.test(src));
check('cost is stated', /\$\{seeds\.length\} requests, about/.test(src));
check('a rejected key stops it', /Last\.fm rejected the key/.test(src));
check('recommendations lead the page', src.indexOf('id="rec-section"') < src.indexOf('id="playlist-cards"'));
// Genres are mixes too, so the original row had to be renamed.
check('library row renamed', /<h2>From your library<\/h2>/.test(src));
// The page has no title or description: Dives doesn't either, the tab
// already says where you are, and each section's own heading said it
// better than the paragraph above them did.
check('mixes opens straight into recommendations', /<div id="rec-section"><\/div>/.test(src));

// Caching is required, not optional. Last.fm's terms, clause 4.4:
// "You agree to cache similar artist and any chart data (top tracks,
// top artists, top albums) for a minimum of one week." That is the
// opposite of Spotify's rule, and assuming Spotify's applied here is
// what left this data in memory only, re-fetched on every reload.
check('cache exists', /export function attachStore/.test(lfm));
check('and is persistent, not per-session', /_store\.set\(CACHE_KEY, _cache\)/.test(lfm));
check('minimum retention is a week', /CACHE_MIN_MS = 7 \* 24 \* 60 \* 60 \* 1000/.test(lfm));
check('actual retention meets it', /CACHE_TTL_MS = 30 \* 24 \* 60 \* 60 \* 1000/.test(lfm));
check('all three endpoints read through it', (lfm.match(/return cached\("/g) || []).length === 3);
check('the store is attached at startup', /lastfm\.attachStore\(bestStore\(\)\)/.test(src));
// The session maps are empty on reload even when the cache is warm.
check('session maps rehydrate', /async function hydrateFromCache/.test(src));
// One cache read rather than an isCached check per artist. With 1,500
// artists that was 1,500 round trips to rebuild a map the cache
// already is — and it was re-prompting on reload despite the data
// being there.
check('rehydrating makes no requests', /const known = await lastfm\.allCached\(bucket\);/.test(src));
check('the whole bucket is read at once', /export async function allCached/.test(lfm));
check('and only fresh entries count', /if \(fresh\(entry\)\) out\.set\(name, entry\.data\)/.test(lfm));
check('genres rehydrate before deciding', /hydrateFromCache\("tags"/.test(src));
check('recommendations too', /hydrateFromCache\("similar"/.test(src));

// "If you like…" for any artist. The generated recommendations seed
// from the twelve you play most, so the seed is always something you
// already love. This asks the more interesting question: what in my
// library sounds like the thing I just heard?
import { similarOwnedMix } from '../docs/js/insights.js';
const askTracks = [];
for (let i = 0; i < 30; i++) {
  askTracks.push({
    id: 'k' + i, name: 'S' + i,
    artists: [{ id: 'a' + (i % 3), name: 'Artist ' + (i % 3) }],
    album: { id: 'al' }, added_at: '2020-01-01T00:00:00Z',
  });
}
const askSim = [{ name: 'Artist 1' }, { name: 'Nobody I Own' }, { name: 'Artist 2' }];
const asked = similarOwnedMix(askTracks, askSim, 'Radiohead');

check('a seed you do not own still works', asked.tracks.length > 0);
check('only artists you own contribute', asked.artists.every((a) => a.startsWith('Artist')));
check('the seed itself is excluded', !similarOwnedMix(askTracks, [{ name: 'Artist 0' }], 'Artist 0').tracks.length);
check('no similar artists means no mix', similarOwnedMix(askTracks, [], 'Anyone').tracks.length === 0);

check('the ask card leads the row', /data-rec-ask/.test(src));
check('and opens its own screen', /async function renderAskSimilar/.test(src));
check('it uses the shared artist search', /inputId: "artist-input",[\s\S]{0,200}renderAskSimilar|renderAskSimilar[\s\S]{0,900}wireArtistSearch/.test(src));
// Spotify's search, not the library, or you could only name artists you
// already own — which defeats the point.
check('any artist can be named', /source: \(q\) => client\.searchArtists\(q, 6\),[\s\S]{0,120}onChoose: \(it\) => build\(it\.name\)/.test(src));
// Being specific about why an empty result is empty.
check('owning too few is explained', /you own too few of them to build a mix/.test(src));
check('an unknown artist is explained', /doesn't know who sounds like/.test(src));

// A broader mix alongside the per-artist ones. They each answer "if you
// like X"; this answers the question they imply — across all of them,
// what am I neglecting?
import { neglectedNeighboursCard } from '../docs/js/insights.js';
const negTracks = [];
for (let i = 0; i < 30; i++) negTracks.push({ id: 'h' + i, name: 'S' + i, artists: [{ id: 'a0', name: 'Artist 0' }], album: { id: 'al' }, added_at: '2020-01-01T00:00:00Z' });
for (const n of [1, 2, 3]) for (let i = 0; i < 3; i++) negTracks.push({ id: 'x' + n + i, name: 'T' + i, artists: [{ id: 'a' + n, name: 'Artist ' + n }], album: { id: 'al' }, added_at: '2020-01-01T00:00:00Z' });
const negSim = new Map([['artist 0', [{ name: 'Artist 1' }, { name: 'Artist 2' }, { name: 'Artist 3' }]]]);
const neg = neglectedNeighboursCard(negTracks, negSim);

check('a broader recommendation exists', !!neg);
// Returning your favourites back to you is not a recommendation.
check('heavily played artists are excluded', !neg.tracks.some((t) => t.artists[0].id === 'a0'));
check('it needs enough to be a mix', !neglectedNeighboursCard(negTracks, negSim, { minTracks: 999 }));
check('and is wired in', /insights\.neglectedNeighboursCard\(cached, _similarBySeed\)/.test(src));

// Genres: the broad tags always outrank the subgenres the landing page
// promises, so the list has to be expandable.
check('all genres are reachable', /id="genre-expand"/.test(src));
check('and collapsible again', /id="genre-collapse"/.test(src));
check('the prompt says what is already cached', /already looked up and remembered/.test(src));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
