/**
 * library-cache.js — incremental liked-songs cache with a correctness
 * checksum. NOT YET WIRED INTO THE APP — standalone, tested in isolation.
 *
 * ---------------------------------------------------------------------
 * Why this exists
 * ---------------------------------------------------------------------
 * Every search currently re-reads the ENTIRE Liked Songs library (paged
 * 50 at a time) to build the comparison set. That's the same data every
 * time, it's the biggest cost of a search, and repeating it is what
 * trips Spotify's 429 rate limit after a few searches. This caches the
 * library so it's read in full once, then only *changes* are fetched on
 * later searches.
 *
 * ---------------------------------------------------------------------
 * The correctness problem (and the fix)
 * ---------------------------------------------------------------------
 * A naive "just fetch new likes" cache goes silently WRONG when you
 * UNLIKE a song: the removed track is never re-fetched, so the cache
 * keeps treating it as liked, and DeepDive would wrongly call a real
 * new track a duplicate (or vice-versa). For a tool whose whole job is
 * accuracy, a silently-wrong cache is worse than a slow one.
 *
 * The fix is a checksum. Spotify's /me/tracks response reports `total`
 * — the exact number of liked songs — on every page. So:
 *
 *   1. Incremental walk: page from the top (newest-first) collecting
 *      tracks added after our last sync, stopping once we reach tracks
 *      we already have. Usually 1–2 pages.
 *   2. Merge those into the cache.
 *   3. CHECKSUM: if cache.size === total, the cache is provably complete
 *      and correct — cheap path done.
 *   4. If cache.size !== total, something was unliked (or a gap opened)
 *      → discard the incremental result and do a FULL re-read, replacing
 *      the cache. Slow, but only happens when actually needed.
 *   5. Belt-and-suspenders: force a full reconcile if it's been more
 *      than RECONCILE_MAX_AGE_MS since the last full read, to catch the
 *      rare same-count swap (unlike one + like one between syncs, which
 *      leaves total unchanged).
 *
 * This module is storage-agnostic: it's given a `store` object with
 * async get/set. In the app that'll be IndexedDB (libraries can be tens
 * of thousands of tracks — too big for localStorage's ~5MB and its
 * synchronous API). Tests pass an in-memory store.
 */

const CACHE_KEY = "deepdive_library_v1";
const RECONCILE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24h full-reconcile backstop

// Shape persisted to storage:
// { tracks: [ {id, name, artists, duration_ms, album, external_ids, added_at}, ... ],
//   lastFullReconcile: <epoch ms>, syncedTotal: <int> }

export class LibraryCache {
  /**
   * @param client a SpotifyClient (needs .get()).
   * @param store  { async get(key), async set(key, value) } — IndexedDB
   *               wrapper in the app, in-memory map in tests.
   * @param opts   { reconcileMaxAgeMs, now } (now injectable for tests)
   */
  constructor(client, store, opts = {}) {
    this.client = client;
    this.store = store;
    this.reconcileMaxAgeMs = opts.reconcileMaxAgeMs || RECONCILE_MAX_AGE_MS;
    this._now = opts.now || (() => Date.now());
  }

  async _load() {
    try {
      const v = await this.store.get(CACHE_KEY);
      if (v && Array.isArray(v.tracks)) return v;
    } catch (e) {}
    return null;
  }

  async _save(state) {
    await this.store.set(CACHE_KEY, state);
  }

  /** Fetch ALL liked tracks, preserving added_at. Returns {tracks, total}. */
  async _fetchAll(onProgress = null) {
    const tracks = [];
    let results = await this.client.get("me/tracks", { limit: 50 });
    const total = (results && typeof results.total === "number") ? results.total : 0;
    while (results) {
      for (const item of results.items || []) {
        if (item && item.track) tracks.push(withAddedAt(item));
      }
      if (onProgress) onProgress(tracks.length, total || tracks.length);
      results = results.next ? await this.client.get(results.next) : null;
    }
    return { tracks, total: total || tracks.length };
  }

  /**
   * Fetch only tracks added strictly after `sinceIso`, walking from the
   * newest and stopping as soon as we cross that timestamp. Also returns
   * `total` from the first page so the caller can checksum.
   */
  async _fetchSince(sinceIso, knownIds) {
    const newTracks = [];
    let results = await this.client.get("me/tracks", { limit: 50 });
    const total = (results && typeof results.total === "number") ? results.total : 0;
    let done = false;
    while (results && !done) {
      for (const item of results.items || []) {
        if (!item || !item.track) continue;
        const addedAt = item.added_at || "";
        // Order is added_at DESC. Once we reach a track at-or-before the
        // last sync, everything after is already known — stop.
        if (sinceIso && addedAt && addedAt <= sinceIso) { done = true; break; }
        // Defensive: if we somehow see a known id, we've reached old
        // territory (handles equal-timestamp ties at the boundary).
        if (knownIds && knownIds.has(item.track.id)) { done = true; break; }
        newTracks.push(withAddedAt(item));
      }
      if (done) break;
      results = results.next ? await this.client.get(results.next) : null;
    }
    return { newTracks, total: total || 0 };
  }

  /**
   * The main entry point. Returns the current, correct set of liked
   * tracks (plain track objects, added_at stripped for the matcher),
   * reading from Spotify as little as possible.
   *
   * @param onProgress optional (current,total) during a full read.
   * @param forceFull  skip incremental, always full-read (e.g. a manual
   *                   "refresh library" button).
   */
  async getLikedTracks({ onProgress = null, forceFull = false } = {}) {
    const cached = forceFull ? null : await this._load();
    const now = this._now();

    // No usable cache, or a forced/aged-out reconcile → full read.
    const aged = cached && (now - (cached.lastFullReconcile || 0) > this.reconcileMaxAgeMs);
    if (!cached || forceFull || aged) {
      return await this._fullReadAndStore(onProgress, now);
    }

    // Incremental path.
    const lastSince = newestAddedAt(cached.tracks);
    const knownIds = new Set(cached.tracks.map((t) => t.id));
    const { newTracks, total } = await this._fetchSince(lastSince, knownIds);

    // Merge (dedupe by id; new ones are newer so they go first).
    const mergedById = new Map();
    for (const t of newTracks) mergedById.set(t.id, t);
    for (const t of cached.tracks) if (!mergedById.has(t.id)) mergedById.set(t.id, t);
    const merged = Array.from(mergedById.values());

    // CHECKSUM. If the count matches Spotify's reported total, we're
    // provably correct and can trust the cheap path.
    if (total > 0 && merged.length === total) {
      const state = {
        tracks: merged,
        lastFullReconcile: cached.lastFullReconcile || now,
        syncedTotal: total,
      };
      await this._save(state);
      return stripAddedAt(merged);
    }

    // Mismatch → an unlike (or gap) happened. Reconcile fully.
    return await this._fullReadAndStore(onProgress, now);
  }

  async _fullReadAndStore(onProgress, now) {
    const { tracks, total } = await this._fetchAll(onProgress);
    const state = { tracks, lastFullReconcile: now, syncedTotal: total };
    await this._save(state);
    return stripAddedAt(tracks);
  }

  /** For a manual "clear cache" affordance. */
  async clear() {
    try { await this.store.set(CACHE_KEY, null); } catch (e) {}
  }
}

// ---- helpers ----
function withAddedAt(item) {
  const t = item.track;
  // Keep only what the matcher + cache need; attach added_at.
  return {
    id: t.id, name: t.name, artists: t.artists,
    duration_ms: t.duration_ms, album: t.album,
    external_ids: t.external_ids, added_at: item.added_at || "",
  };
}
function stripAddedAt(tracks) {
  // The matcher doesn't want added_at; return clean track objects.
  return tracks.map(({ added_at, ...rest }) => rest);
}
function newestAddedAt(tracks) {
  let newest = "";
  for (const t of tracks) if (t.added_at && t.added_at > newest) newest = t.added_at;
  return newest;
}

/**
 * Version A artist-scoping: given the full liked set and an artist id +
 * name, return only the liked tracks credited to that artist. This is
 * the comparison subset a single-artist search should match against
 * instead of the whole library. Matches by artist id primarily, name as
 * a fallback (some older saved tracks carry a name but a null id).
 */
export function filterLikedByArtist(likedTracks, artistId, artistName) {
  const nameLc = (artistName || "").toLowerCase();
  return likedTracks.filter((t) => {
    for (const a of t.artists || []) {
      if (artistId && a.id === artistId) return true;
      if (nameLc && a.name && a.name.toLowerCase() === nameLc) return true;
    }
    return false;
  });
}
