/**
 * insights.js — suggestions mined from the cached library.
 *
 * Everything here is pure: it takes the cached track list and returns
 * artists, with no network access at all. That's deliberate. The old
 * home page suggested whatever Spotify's top-artists endpoint returned,
 * which is generic and costs API calls. These come from what's actually
 * in the user's library, cost nothing, work offline, and can say *why*
 * an artist is being suggested — which is the difference between a
 * recommendation and noise.
 *
 * Each suggestion carries a `reason` string for display. An unexplained
 * recommendation is just clutter; "1 song liked" tells you instantly
 * whether it's worth a click.
 */

/** Group cached tracks by primary artist. */
function byArtist(tracks) {
  const map = new Map();
  for (const t of tracks || []) {
    const a = (t.artists || [])[0];
    if (!a || !a.id) continue;
    let entry = map.get(a.id);
    if (!entry) {
      entry = { id: a.id, name: a.name, count: 0, oldest: null, newest: null };
      map.set(a.id, entry);
    }
    entry.count += 1;
    const added = t.added_at || "";
    if (added) {
      if (!entry.oldest || added < entry.oldest) entry.oldest = added;
      if (!entry.newest || added > entry.newest) entry.newest = added;
    }
  }
  return map;
}

/**
 * Artists with exactly one liked track. These are almost always a song
 * that caught your ear once and never got followed up — the single most
 * useful prompt available from the library, and the reason is
 * self-evident once stated.
 */
export function artistsWithOneTrack(tracks, { limit = 20 } = {}) {
  const out = [];
  for (const a of byArtist(tracks).values()) {
    if (a.count === 1) {
      out.push({ id: a.id, name: a.name, reason: "1 song liked", _sort: a.newest || "" });
    }
  }
  // Most recently discovered first — a one-off from last month is a
  // better prompt than one from five years ago.
  out.sort((x, y) => (y._sort || "").localeCompare(x._sort || ""));
  return out.slice(0, limit).map(({ _sort, ...rest }) => rest);
}

/**
 * Artists whose most recent addition is oldest. Note this is "haven't
 * added anything by them in a long time", NOT "haven't listened" —
 * Spotify's API gives no play history, so claiming otherwise would be a
 * lie the data can't support. The reason string says "added" for that
 * reason.
 */
export function artistsNotAddedRecently(tracks, { limit = 20, minTracks = 2 } = {}) {
  const out = [];
  for (const a of byArtist(tracks).values()) {
    if (a.count < minTracks || !a.newest) continue;
    const year = a.newest.slice(0, 4);
    out.push({ id: a.id, name: a.name, reason: `last added ${year}`, _sort: a.newest });
  }
  out.sort((x, y) => (x._sort || "").localeCompare(y._sort || ""));
  return out.slice(0, limit).map(({ _sort, ...rest }) => rest);
}

/**
 * Build the library half of the suggestion row: a mix of the prompts
 * above, deduped, excluding anything already pinned, dismissed, or
 * shown in the listening half.
 */
export function librarySuggestions(tracks, { exclude = new Set(), limit = 6 } = {}) {
  const picks = [];
  const seen = new Set(exclude);

  const oneOffs = artistsWithOneTrack(tracks, { limit: limit * 3 });
  const stale = artistsNotAddedRecently(tracks, { limit: limit * 3 });

  // Interleave so the row isn't all one kind of prompt.
  const half = Math.ceil(limit / 2);
  for (const list of [oneOffs.slice(0, half), stale.slice(0, limit)]) {
    for (const a of list) {
      if (picks.length >= limit) break;
      const key = (a.name || "").trim().toLowerCase();
      if (!a.id || seen.has(a.id) || seen.has(key)) continue;
      seen.add(a.id);
      seen.add(key);
      picks.push(a);
    }
  }
  return picks.slice(0, limit);
}

/**
 * Deterministic shuffle from a seed, so the row is stable for a session
 * rather than reshuffling on every render. Something that caught your
 * eye should still be there when you come back to the page.
 */
export function seededPick(items, count, seed) {
  const arr = items.slice();
  let s = seed >>> 0;
  const rand = () => {
    // xorshift32 — small, deterministic, good enough for shuffling a
    // dozen pills.
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, count);
}
