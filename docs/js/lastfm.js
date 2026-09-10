/**
 * Last.fm — the data Spotify stopped giving us.
 *
 * Three things live here, all read-only public data needing nothing but
 * an API key:
 *
 *   - artist.getTopTracks   popularity, which Spotify removed
 *   - artist.getSimilar     related artists, deprecated at Spotify
 *   - artist.getTopTags     genres and subgenres, far more granular
 *                           than Spotify's artist-level genres
 *
 * **Every user brings their own key.** A key shipped in the bundle
 * would be readable by anyone who opened devtools, its rate limit
 * pooled across everyone using DeepDive, and revocable because of one
 * person's behaviour. The app already asks for a Spotify Client ID, so
 * this is the same kind of ask rather than a new one.
 *
 * **Nothing here is required.** Without a key, every call resolves to
 * an empty result rather than throwing, and the features built on it
 * are simply absent. A missing optional integration must never break a
 * screen.
 */

const KEY_STORAGE = "deepdive_lastfm_key";
const BASE = "https://ws.audioscrobbler.com/2.0/";

// Their terms allow 5 requests per second per IP, averaged over five
// minutes. 250ms is comfortably inside that with room for the browser
// doing other things, and unlike Spotify there is no per-account quota
// to exhaust — only a rate to respect.
const PACING_MS = 250;

// Last.fm answers with HTTP 200 and an error code in the body as often
// as it uses a status code, so both have to be checked. 29 is the rate
// limit; 26 means the key was suspended, which is terminal and worth
// saying plainly rather than retrying into.
const ERR_RATE_LIMIT = 29;
const ERR_KEY_SUSPENDED = 26;
const ERR_INVALID_KEY = 10;

export function getKey() {
  try { return localStorage.getItem(KEY_STORAGE) || ""; } catch (e) { return ""; }
}

export function setKey(key) {
  try {
    const v = (key || "").trim();
    if (v) localStorage.setItem(KEY_STORAGE, v);
    else localStorage.removeItem(KEY_STORAGE);
  } catch (e) {}
}

export function hasKey() {
  return !!getKey();
}

export class LastfmError extends Error {
  constructor(code, message) {
    super(message || `Last.fm error ${code}`);
    this.name = "LastfmError";
    this.code = code;
    this.suspended = code === ERR_KEY_SUSPENDED || code === ERR_INVALID_KEY;
    this.rateLimited = code === ERR_RATE_LIMIT;
  }
}

let _lastCallAt = 0;

async function pace() {
  const since = Date.now() - _lastCallAt;
  if (since < PACING_MS) await new Promise((r) => setTimeout(r, PACING_MS - since));
  _lastCallAt = Date.now();
}

/**
 * One request. Returns null when there is no key, rather than throwing:
 * callers treat "no Last.fm" as a normal state, not an error.
 */
async function call(method, params = {}) {
  const key = getKey();
  if (!key) return null;

  await pace();
  const qs = new URLSearchParams({ ...params, method, api_key: key, format: "json" });
  let resp;
  try {
    resp = await fetch(`${BASE}?${qs}`, { headers: { Accept: "application/json" } });
  } catch (e) {
    // Network, CORS or an extension blocking it. Not worth failing a
    // whole screen over an optional source.
    throw new LastfmError(0, `Couldn't reach Last.fm: ${e.message || e}`);
  }

  let body = null;
  try { body = await resp.json(); } catch (e) { body = null; }

  // The error can arrive as a status code, as a code in the body, or
  // both — their API isn't consistent about it.
  if (body && body.error) throw new LastfmError(body.error, body.message);
  if (!resp.ok) throw new LastfmError(resp.status, `Last.fm returned ${resp.status}`);
  return body;
}

// ---------------------------------------------------------------------
// Caching
//
// Not an optimisation — a requirement. Last.fm's API terms, clause 4.4:
// "You agree to cache similar artist and any chart data (top tracks,
// top artists, top albums) for a minimum of one week."
//
// That is the exact opposite of Spotify's terms, which forbid retaining
// content beyond immediate use. Two sources, two rules, and assuming
// the Spotify rule applied here is what left this data in memory only,
// re-fetched on every reload.
//
// A week is the floor, not the target. Tags and similarity barely move,
// so thirty days is well within the spirit of it and spares the user
// several hundred requests a month.
// ---------------------------------------------------------------------

export const CACHE_MIN_MS = 7 * 24 * 60 * 60 * 1000;
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const CACHE_KEY = "deepdive_lastfm_cache";

let _store = null;
let _cache = null; // { [method]: { [artist]: { at, data } } }

/** Called once at startup with the same store the library cache uses. */
export function attachStore(store) {
  _store = store;
}

let _loading = null;

/**
 * Load once, share the same promise.
 *
 * The previous version set `_cache` to an empty object, awaited the
 * store, then *reassigned* `_cache` to a merged one. Mixes starts three
 * renders at once, so the second caller saw `_cache` already set,
 * returned the empty object immediately, and kept a reference to an
 * object the first caller then threw away — permanently empty, for the
 * life of the page. That is why genres asked to be found again on every
 * reload while the data sat in IndexedDB.
 *
 * Now concurrent callers await the same promise, and the loaded data is
 * merged *into* the existing object rather than replacing it, so no
 * reference can go stale.
 */
async function loadCache() {
  if (_cache) return _cache;
  if (_loading) return _loading;
  _loading = (async () => {
    const fresh = { tags: {}, similar: {}, toptracks: {} };
    if (_store) {
      try {
        const saved = await _store.get(CACHE_KEY);
        if (saved && typeof saved === "object") {
          for (const k of Object.keys(fresh)) {
            if (saved[k] && typeof saved[k] === "object") Object.assign(fresh[k], saved[k]);
          }
        }
      } catch (e) { /* a cold cache is not an error */ }
    }
    _cache = fresh;
    _loading = null;
    return _cache;
  })();
  return _loading;
}

async function saveCache() {
  if (!_store || !_cache) return;
  try { await _store.set(CACHE_KEY, _cache); } catch (e) {}
}

function fresh(entry) {
  return entry && (Date.now() - entry.at) < CACHE_TTL_MS;
}

/** Read-through: cached if fresh, fetched and stored if not. */
async function cached(bucket, artist, fetcher) {
  const key = (artist || "").trim().toLowerCase();
  const c = await loadCache();
  if (!c[bucket]) c[bucket] = {};
  if (fresh(c[bucket][key])) return c[bucket][key].data;
  const data = await fetcher();
  c[bucket][key] = { at: Date.now(), data };
  await saveCache();
  return data;
}

/** How much is already known, for telling the user what a run will cost. */
export async function cachedCount(bucket) {
  const c = await loadCache();
  return Object.values(c[bucket] || {}).filter(fresh).length;
}

/**
 * Everything already known for one bucket, as a Map.
 *
 * The alternative was asking `isCached` per artist and re-reading each
 * one — sixteen hundred round trips through the cache to rebuild a map
 * the cache already is. One read is both faster and impossible to get
 * subtly wrong.
 */
export async function allCached(bucket) {
  const c = await loadCache();
  const out = new Map();
  for (const [name, entry] of Object.entries(c[bucket] || {})) {
    if (fresh(entry)) out.set(name, entry.data);
  }
  return out;
}

export async function isCached(bucket, artist) {
  const c = await loadCache();
  return fresh((c[bucket] || {})[(artist || "").trim().toLowerCase()]);
}

export async function clearCache() {
  _cache = { tags: {}, similar: {}, toptracks: {} };
  await saveCache();
}

/** An artist's most-played tracks, ordered by listeners. */
export async function topTracks(artist, limit = 50) {
  return cached("toptracks", artist, () => fetchTopTracks(artist, limit));
}

async function fetchTopTracks(artist, limit) {
  const body = await call("artist.getTopTracks", { artist, limit, autocorrect: 1 });
  const raw = (body && body.toptracks && body.toptracks.track) || [];
  const list = Array.isArray(raw) ? raw : [raw];
  return list.map((t) => ({
    name: t.name,
    artist: (t.artist && t.artist.name) || artist,
    playcount: parseInt(t.playcount, 10) || 0,
    listeners: parseInt(t.listeners, 10) || 0,
    rank: parseInt(t["@attr"] && t["@attr"].rank, 10) || 0,
  }));
}

/** Artists Last.fm considers similar, with a 0–1 match score. */
export async function similarArtists(artist, limit = 20) {
  return cached("similar", artist, () => fetchSimilar(artist, limit));
}

async function fetchSimilar(artist, limit) {
  const body = await call("artist.getSimilar", { artist, limit, autocorrect: 1 });
  const raw = (body && body.similarartists && body.similarartists.artist) || [];
  const list = Array.isArray(raw) ? raw : [raw];
  return list.map((a) => ({ name: a.name, match: parseFloat(a.match) || 0 }));
}

/**
 * An artist's tags, with a 0–100 weight.
 *
 * The weight is what makes these usable. Tags are user-applied, so a
 * popular artist accumulates jokes, personal shelving ("seen live",
 * "favourites") and misspellings alongside real genres. A weight floor
 * removes most of it.
 */
export async function topTags(artist, limit = 20) {
  return cached("tags", artist, () => fetchTopTags(artist, limit));
}

async function fetchTopTags(artist, limit) {
  const body = await call("artist.getTopTags", { artist, limit, autocorrect: 1 });
  const raw = (body && body.toptags && body.toptags.tag) || [];
  const list = Array.isArray(raw) ? raw : [raw];
  return list
    .map((t) => ({ name: normalizeTag(t.name), weight: parseInt(t.count, 10) || 0 }))
    .filter((t) => t.name);
}

// Tags that describe the listener's relationship to the music rather
// than the music. They rank highly on well-known artists and would
// otherwise produce a "Your seen live" mix.
// Keyed on the tag with all spaces removed, so every spacing and
// hyphenation of the same word lands on one entry.
const TAG_ALIASES = {
  hiphop: "hip hop",
  triphop: "trip hop",
  triphopmusic: "trip hop",
  drumandbass: "drum and bass",
  dnb: "drum and bass",
  rnb: "rnb",
  randb: "rnb",
  rhythmandblues: "rnb",
  lofi: "lo fi",
  postrock: "post rock",
  postpunk: "post punk",
  posthardcore: "post hardcore",
  synthpop: "synth pop",
  dreampop: "dream pop",
  indierock: "indie rock",
  indiepop: "indie pop",
  altrock: "alternative rock",
  alternativerock: "alternative rock",
  hardrock: "hard rock",
  classicrock: "classic rock",
  punkrock: "punk rock",
  poppunk: "pop punk",
  singersongwriter: "singer songwriter",
  newwave: "new wave",
  blackmetal: "black metal",
  deathmetal: "death metal",
  heavymetal: "heavy metal",
  folkrock: "folk rock",
};

const NON_GENRE_TAGS = new Set([
  "seen live", "favourites", "favorites", "favourite songs", "favorite songs",
  "albums i own", "vinyl", "spotify", "awesome", "beautiful", "love",
  "love at first listen", "my music", "check out", "todo", "to listen",
  "under 2000 listeners", "female vocalists", "male vocalists", "female vocalist",
  "male vocalist", "singer-songwriter", "00s", "10s", "20s", "30s", "40s",
  "50s", "60s", "70s", "80s", "90s", "2000s", "1990s", "1980s", "1970s",
]);

/**
 * The same idea arrives as "hip-hop", "hip hop" and "HipHop", which
 * would otherwise become three separate mixes of the same music.
 */
export function normalizeTag(name) {
  let t = (name || "").trim().toLowerCase();
  if (!t) return "";
  t = t.replace(/[_]+/g, " ").replace(/\s*-\s*/g, " ").replace(/\s+/g, " ").trim();
  // Spacing rules can't split a word nobody spaced: "hiphop" and "hip
  // hop" are the same genre and would otherwise become two mixes of
  // the same music. Only a handful of tags are written both ways
  // often enough to matter, so this is a list rather than a guess.
  t = TAG_ALIASES[t.replace(/\s+/g, "")] || t;
  if (NON_GENRE_TAGS.has(t)) return "";
  // Decade tags describe era, which DeepDive already derives from
  // release dates far more reliably than a crowd does.
  if (/^(19|20)?\d0s$/.test(t)) return "";
  return t;
}

/** Title case for display, since tags arrive lowercased and messy. */
export function tagLabel(tag) {
  return (tag || "").replace(/\b\w/g, (c) => c.toUpperCase());
}

export const _internals = { PACING_MS, ERR_RATE_LIMIT, NON_GENRE_TAGS };
