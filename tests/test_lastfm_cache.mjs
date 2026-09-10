// The Last.fm cache under concurrent load.
//
// Genres asked to be found again after every reload while the data sat
// in IndexedDB. The cause was a race, not a storage failure:
//
//   loadCache() set `_cache` to an empty object, awaited the store,
//   then REASSIGNED `_cache` to a merged one. Mixes renders three
//   sections at once, so the second and third callers saw `_cache`
//   already truthy, returned the empty object immediately, and kept a
//   reference to an object the first caller then discarded. Empty for
//   the life of the page.
//
// This test reproduces that shape: one session writes, a cold module
// reads with three concurrent callers against a store that takes time
// to answer. Verified to fail against the old implementation before
// being kept.
const store = new Map();
global.localStorage = {
  getItem: (k) => store.get('ls:' + k) ?? null,
  setItem: (k, v) => store.set('ls:' + k, String(v)),
  removeItem: (k) => store.delete('ls:' + k),
};
global.fetch = async () => ({
  ok: true, status: 200,
  json: async () => ({ toptags: { tag: [{ name: 'Rock', count: '100' }] } }),
});
// The delay is the point: an instant store hides the race entirely.
const slowStore = {
  async get(k) { await new Promise((r) => setTimeout(r, 25)); return store.get(k); },
  async set(k, v) { store.set(k, v); },
  async del(k) { store.delete(k); },
};

let pass = 0, fail = 0;
function check(l, c) { if (c) pass++; else { fail++; console.log('FAIL:', l); } }

const url = new URL('../docs/js/lastfm.js', import.meta.url).href;

// Session one: fetch and persist.
const first = await import(url + '?session=1');
first.setKey('test'); first.attachStore(slowStore);
await first.topTags('Slowdive');
check('a fetched artist is remembered', (await first.allCached('tags')).size === 1);

// Session two: cold module, warm store, three simultaneous readers —
// exactly what Mixes does.
const second = await import(url + '?session=2');
second.setKey('test'); second.attachStore(slowStore);
const [a, b, c] = await Promise.all([
  second.allCached('tags'), second.allCached('tags'), second.allCached('tags'),
]);
check('the first concurrent reader sees the cache', a.size === 1);
check('so does the second', b.size === 1);
check('and the third', c.size === 1);

// A late reader must see it too.
check('a later reader sees it', (await second.allCached('tags')).size === 1);
// And nothing was re-fetched to achieve any of that.
const third = await import(url + '?session=3');
third.setKey('test'); third.attachStore(slowStore);
let fetched = 0;
global.fetch = async () => { fetched++; return { ok: true, status: 200, json: async () => ({ toptags: { tag: [] } }) }; };
await third.topTags('Slowdive');
check('a cached artist costs no request', fetched === 0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
