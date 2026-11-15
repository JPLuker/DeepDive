// #18: picking "idk" produced a dip for "Artist Unknown".
//
// Two independent routes could swap the artist, and both are covered:
//
//   1. Every dive entry point handed over a bare name and the dive
//      searched Spotify again. findArtist then took the first result
//      when nothing matched exactly, silently. Picks that carry a
//      Spotify id now keep it, and a name-only lookup that lands on
//      someone else is flagged `closestMatch` and shown in the chooser.
//   2. Last.fm's autocorrect folds junk tags like "idk" into its
//      "[unknown]" placeholder, so the dip was ordered by the top
//      tracks of untagged scrobbles. A placeholder correction is now
//      re-asked without autocorrect, and cached placeholder data is
//      refetched.
import { readFileSync } from 'fs';
const store = new Map();
global.localStorage = {
  getItem: (k) => store.get('ls:' + k) ?? null,
  setItem: (k, v) => store.set('ls:' + k, String(v)),
  removeItem: (k) => store.delete('ls:' + k),
};
const { SpotifyClient } = await import('../docs/js/spotify.js');
const src = readFileSync(new URL('../docs/js/app.js', import.meta.url), 'utf8');

let pass = 0, fail = 0;
function check(l, c) { if (c) pass++; else { fail++; console.log('FAIL:', l); } }
const ok = (b) => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => b, text: async () => JSON.stringify(b) });
const artist = (id, name) => ({ id, name, images: [{ url: `https://i.scdn.co/${id}` }] });

// --- findArtist ---------------------------------------------------------
async function find(name, items) {
  const c = new SpotifyClient(async () => 't');
  const asked = [];
  global.fetch = async (u) => { asked.push(String(u)); return ok({ artists: { items } }); };
  const a = await c.findArtist(name);
  return { a, asked };
}
{
  const { a } = await find('idk', [artist('u', 'Artist Unknown'), artist('x', 'Someone')]);
  check('no exact match is flagged as the closest result', a.closestMatch === true);
  check('and remembers what was searched for', a.searchedFor === 'idk');
  check('the closest result is still returned', a.id === 'u');
}
{
  const { a } = await find('idk', [artist('u', 'Artist Unknown'), artist('i', 'IDK')]);
  check('an exact name wins over the top result, ignoring case', a.id === 'i');
  check('an exact match is not flagged', !a.closestMatch);
}
{
  const { a } = await find('idk', [artist('u', 'Artist Unknown'), artist('i', 'i.d.k')]);
  check('a punctuation-only difference still counts as the artist', a.id === 'i' && !a.closestMatch);
}
{
  const { asked } = await find('idk', [artist('i', 'idk')]);
  check('ten results are read, so real matches do not fall off', /limit=10/.test(asked[0]));
}

// --- the pick keeps its id ---------------------------------------------
check('a dive can be started with an identity', /function startSearch\(artistName, identity = \{\}\)/.test(src));
check('and records it before anything looks the name up',
  /rememberArtistChoice\(artistName, identity\);\s*_lastDiveArtist/.test(src) ||
  /rememberArtistChoice\(artistName, identity\);/.test(src.slice(src.indexOf('function startSearch('), src.indexOf('function startSearch(') + 400)));
check('the search list hands over the artist it showed', /onChoose: \(it\) => startSearch\(it\.name, \{ artist: it \}\)/.test(src));
check('Home tiles carry the Spotify id', /data-search="\$\{esc\(name\)\}" data-artist-id=/.test(src)
  && /startSearch\(b\.dataset\.search, \{ id: b\.dataset\.artistId \|\| null \}\)/.test(src));
check('crate tiles carry it', /class="crate-open" data-search="\$\{esc\(e\.name\)\}" data-artist-id="\$\{esc\(e\.spotify_id/.test(src)
  && /startSearch\(open\.dataset\.search, \{ id: open\.dataset\.artistId \|\| null \}\)/.test(src));
check('Dive again carries it', /data-redive="\$\{esc\(d\.artistName\)\}" data-artist-id=/.test(src)
  && /startSearch\(b\.dataset\.redive, \{ id: b\.dataset\.artistId \|\| null \}\)/.test(src));
check('the random pick does not mistake a pin entry id for a Spotify id', /"spotify_id" in pick \? pick\.spotify_id : pick\.id/.test(src));
// No dive entry point is left passing only a name, except typed text.
const bare = [...src.matchAll(/startSearch\(([^)]*)\)/g)].map((m) => m[1])
  .filter((a) => a && !a.includes('{') && !/^artistName/.test(a));
check(`only typed text and retries start a dive by name alone (${bare.join(' | ')})`,
  bare.every((a) => a === 'n' || a === '_lastDiveArtist'));
check('the chooser names who was found when it was not an exact match', /function showClosestMatch\(a\)/.test(src)
  && /showClosestMatch\(a\);/.test(src));

// --- Last.fm placeholder -----------------------------------------------
{
  const url = new URL('../docs/js/lastfm.js', import.meta.url).href;
  const lfm = await import(url + '?identity=1');
  lfm.setKey('test');
  const mem = new Map();
  lfm.attachStore({ async get(k) { return mem.get(k); }, async set(k, v) { mem.set(k, v); }, async del(k) { mem.delete(k); } });
  const calls = [];
  global.fetch = async (u) => {
    const q = new URL(String(u)).searchParams;
    calls.push(q.get('autocorrect'));
    if (q.get('autocorrect') === '1') {
      return ok({ toptracks: { '@attr': { artist: '[unknown]' }, track: [{ name: 'Untitled', artist: { name: '[unknown]' } }] } });
    }
    return ok({ toptracks: { '@attr': { artist: 'idk' }, track: [{ name: 'Real Song', artist: { name: 'idk' } }] } });
  };
  const top = await lfm.topTracks('idk');
  check('a correction to [unknown] is asked again without autocorrect', calls.join(',') === '1,0');
  check('and the artist\'s own tracks come back', top.length === 1 && top[0].name === 'Real Song');

  calls.length = 0;
  global.fetch = async (u) => {
    calls.push(new URL(String(u)).searchParams.get('autocorrect'));
    return ok({ toptracks: { '@attr': { artist: 'The Beatles' }, track: [{ name: 'Help!', artist: { name: 'The Beatles' } }] } });
  };
  await lfm.topTracks('beatles');
  check('ordinary corrections still happen in one request', calls.join(',') === '1');
  check('placeholder detection ignores real names', !lfm.correctedToPlaceholder('beatles', 'The Beatles'));
  check('searching for [unknown] itself is not second-guessed', !lfm.correctedToPlaceholder('[unknown]', '[unknown]'));

  // Data cached before the fix is refetched rather than served for a week.
  const cache = await import(url + '?identity=2');
  cache.setKey('test');
  const stale = new Map([['deepdive_lastfm_cache', { tags: {}, similar: {}, toptracks: { idk: { at: Date.now(), data: [{ name: 'Untitled', artist: '[unknown]' }] } } }]]);
  cache.attachStore({ async get(k) { return stale.get(k); }, async set(k, v) { stale.set(k, v); }, async del(k) { stale.delete(k); } });
  let refetched = 0;
  global.fetch = async () => { refetched++; return ok({ toptracks: { '@attr': { artist: 'idk' }, track: [{ name: 'Real Song', artist: { name: 'idk' } }] } }); };
  const again = await cache.topTracks('idk');
  check('cached placeholder top tracks are refetched', refetched === 1 && again[0].name === 'Real Song');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
