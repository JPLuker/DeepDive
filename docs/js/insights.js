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
/** Smallest available image URL from a Spotify images array. */
function smallestImage(images) {
  if (!images || !images.length) return null;
  return images[images.length - 1].url || null;
}

/**
 * The middle variant, for 56px tiles.
 *
 * Spotify's smallest album image is 64px and its smallest artist image
 * is 160px. A 56px CSS tile is ~168 device pixels on a 3x phone, so the
 * smallest album variant was being upscaled almost threefold — which is
 * why suggestion tiles looked pixelated even once the dive was fixed.
 * The middle variant (300px album / 320px artist) covers 3x comfortably
 * at a fraction of the bytes of the 640px original.
 */
function tileImage(images) {
  if (!images || !images.length) return null;
  if (images.length >= 2) return images[1].url || images[0].url || null;
  return images[0].url || null;
}

/** Spotify orders images largest first. Used where the art is displayed
 *  big — a 64px thumbnail stretched to 260px looks like a mistake. */
function largestImage(images) {
  if (!images || !images.length) return null;
  return images[0].url || null;
}

function byArtist(tracks) {
  const map = new Map();
  for (const t of tracks || []) {
    const a = (t.artists || [])[0];
    if (!a || !a.id) continue;
    let entry = map.get(a.id);
    if (!entry) {
      entry = { id: a.id, name: a.name, count: 0, oldest: null, newest: null, image_url: null, trackIds: [] };
      map.set(a.id, entry);
    }
    entry.count += 1;
    if (t.id) entry.trackIds.push(t.id);
    // Artist photos need one API request each, which is exactly the sort
    // of per-item call that gets rate-limited. The cache already holds
    // each track's album — artwork included — so use that instead. It
    // isn't the artist's portrait, but it's a record they made, it's
    // free, and it's instant.
    if (!entry.image_url && t.album) {
      entry.image_url = tileImage(t.album.images);
      entry.image_url_large = largestImage(t.album.images);
    }
    const added = t.added_at || "";
    if (added) {
      if (!entry.oldest || added < entry.oldest) entry.oldest = added;
      if (!entry.newest || added > entry.newest) entry.newest = added;
    }
  }
  return map;
}

/**
 * Artwork for artists already in the cached library, keyed by artist id
 * AND lowercased name. Lets the listening half borrow artwork it would
 * otherwise have to fetch.
 */
export function artworkFromCache(tracks) {
  const byId = new Map();
  const byName = new Map();
  // Large variants kept separately for screens that display art big.
  const largeById = new Map();
  const largeByName = new Map();
  for (const a of byArtist(tracks).values()) {
    if (!a.image_url) continue;
    byId.set(a.id, a.image_url);
    if (a.image_url_large) largeById.set(a.id, a.image_url_large);
    if (a.name) {
      const k = a.name.trim().toLowerCase();
      byName.set(k, a.image_url);
      if (a.image_url_large) largeByName.set(k, a.image_url_large);
    }
  }
  return { byId, byName, largeById, largeByName };
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
      out.push({ id: a.id, name: a.name, image_url: a.image_url, reason: "1 song liked", _sort: a.newest || "" });
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
    out.push({ id: a.id, name: a.name, image_url: a.image_url, reason: `last added ${year}`, _sort: a.newest });
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

// ---------------------------------------------------------------------
// Playlist cards (2.3)
// ---------------------------------------------------------------------
// Each card describes a playlist that could be built from the cached
// library, along with the tracks it would contain. Nothing here touches
// the network, so the row is instant and works offline.
//
// Cards are *offers*, not playlists: a card is only shown if it would
// actually produce something, and nothing is created until the user
// confirms. Showing a card that yields an empty playlist would be worse
// than not showing it at all.

const MIN_CARD_TRACKS = 5;

function sortedByAdded(tracks, dir = "asc") {
  const withDate = tracks.filter((t) => t && t.added_at);
  withDate.sort((a, b) => dir === "asc"
    ? a.added_at.localeCompare(b.added_at)
    : b.added_at.localeCompare(a.added_at));
  return withDate;
}

/** One card per calendar year that has enough tracks to be worth it. */
function yearCards(tracks) {
  const byYear = new Map();
  for (const t of tracks) {
    const y = (t.added_at || "").slice(0, 4);
    if (!y) continue;
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y).push(t);
  }
  const cards = [];
  for (const [year, list] of byYear) {
    if (list.length < MIN_CARD_TRACKS) continue;
    cards.push({
      id: `year-${year}`,
      title: `Your ${year}`,
      subtitle: "what you added that year",
      count: list.length,
      // Chronological within the year reads like a diary rather than a
      // shuffle.
      tracks: sortedByAdded(list, "asc"),
    });
  }
  // Most recent year first.
  cards.sort((a, b) => b.id.localeCompare(a.id));
  return cards;
}

/** The earliest things in the library — where it all started. */
function firstFiftyCard(tracks) {
  const oldest = sortedByAdded(tracks, "asc").slice(0, 50);
  if (oldest.length < MIN_CARD_TRACKS) return null;
  return {
    id: "first-50",
    title: "Your first 50",
    subtitle: "the earliest things you liked",
    count: oldest.length,
    tracks: oldest,
  };
}

/** One track from each artist you've only ever liked once. */
function oneOffsCard(tracks) {
  const counts = new Map();
  for (const t of tracks) {
    const a = (t.artists || [])[0];
    if (!a || !a.id) continue;
    if (!counts.has(a.id)) counts.set(a.id, []);
    counts.get(a.id).push(t);
  }
  const picks = [];
  for (const list of counts.values()) if (list.length === 1) picks.push(list[0]);
  if (picks.length < MIN_CARD_TRACKS) return null;
  return {
    id: "one-offs",
    title: "One-hit wonders",
    subtitle: "artists you've liked exactly one song by",
    count: picks.length,
    tracks: sortedByAdded(picks, "desc"),
  };
}

/** Things added long ago and not revisited since. */
function forgottenCard(tracks) {
  const oldest = sortedByAdded(tracks, "asc");
  if (oldest.length < MIN_CARD_TRACKS * 2) return null;
  // The older half, minus the very first 50 (those have their own card).
  const half = oldest.slice(50, 50 + Math.max(MIN_CARD_TRACKS, Math.floor(oldest.length / 3)));
  if (half.length < MIN_CARD_TRACKS) return null;
  return {
    id: "forgotten",
    title: "Long forgotten",
    subtitle: "added years ago and buried since",
    count: half.length,
    tracks: half,
  };
}

/**
 * All cards that would actually produce a playlist for this library.
 * Year cards are capped so a long-standing account doesn't produce a
 * dozen near-identical tiles.
 */
/**
 * Everything this library can support. Callers pick a rotating subset —
 * the pool is deliberately larger than what's shown so refreshing
 * surfaces something different rather than the same handful forever.
 */
export function playlistCards(tracks, { maxYears = 6, maxDecades = 5, seed = 0 } = {}) {
  if (!tracks || !tracks.length) return [];
  const cards = [];
  const push = (c) => { if (c) cards.push(c); };

  push(recentlyAddedCard(tracks));
  push(oneOffsCard(tracks));
  push(surpriseCard(tracks));
  push(topArtistsCard(tracks));
  push(albumFavouritesCard(tracks));
  push(artistSpotlightCard(tracks, seed));
  push(thisMonthCard(tracks));
  push(anniversaryCard(tracks));
  push(oldSoulsCard(tracks));
  push(freshPressCard(tracks));
  push(oneEachYearCard(tracks));
  push(epicsCard(tracks));
  push(shortsCard(tracks));
  push(firstFiftyCard(tracks));
  push(forgottenCard(tracks));
  cards.push(...yearCards(tracks).slice(0, maxYears));
  cards.push(...decadeCards(tracks).slice(0, maxDecades));
  return cards;
}

// ---------------------------------------------------------------------
// Additional card types
// ---------------------------------------------------------------------

/** The most recent additions — what you're into right now. */
function recentlyAddedCard(tracks) {
  const newest = sortedByAdded(tracks, "desc").slice(0, 50);
  if (newest.length < MIN_CARD_TRACKS) return null;
  return {
    id: "recent",
    title: "Fresh additions",
    subtitle: "the last 50 things you liked",
    count: newest.length,
    tracks: newest,
  };
}

/** Long tracks. Useful as a set in a way a shuffle isn't. */
function epicsCard(tracks) {
  const long = tracks
    .filter((t) => (t.duration_ms || 0) >= 6 * 60 * 1000)
    .sort((a, b) => (b.duration_ms || 0) - (a.duration_ms || 0));
  if (long.length < MIN_CARD_TRACKS) return null;
  return {
    id: "epics",
    title: "The long ones",
    subtitle: "six minutes and over",
    count: long.length,
    tracks: long,
  };
}

/** Short tracks — punk, interludes, anything brief. */
function shortsCard(tracks) {
  const short = tracks
    .filter((t) => { const d = t.duration_ms || 0; return d > 0 && d <= 150 * 1000; })
    .sort((a, b) => (a.duration_ms || 0) - (b.duration_ms || 0));
  if (short.length < MIN_CARD_TRACKS) return null;
  return {
    id: "shorts",
    title: "Under two thirty",
    subtitle: "short and to the point",
    count: short.length,
    tracks: short,
  };
}

/**
 * Cards by decade of release (not of liking). Uses the album release
 * date, which the cache already stores.
 */
function decadeCards(tracks) {
  const byDecade = new Map();
  for (const t of tracks) {
    const y = parseInt(((t.album && t.album.release_date) || "").slice(0, 4), 10);
    if (!y || y < 1900) continue;
    const dec = Math.floor(y / 10) * 10;
    if (!byDecade.has(dec)) byDecade.set(dec, []);
    byDecade.get(dec).push(t);
  }
  const cards = [];
  for (const [dec, list] of byDecade) {
    if (list.length < MIN_CARD_TRACKS * 2) continue;   // decades should feel substantial
    cards.push({
      id: `decade-${dec}`,
      title: dec >= 2000 ? `The ${String(dec).slice(2)}s` : `The ${String(dec).slice(2)}s`,
      subtitle: `music released ${dec}–${dec + 9}`,
      count: list.length,
      tracks: list.slice().sort((a, b) =>
        ((a.album && a.album.release_date) || "").localeCompare((b.album && b.album.release_date) || "")),
    });
  }
  cards.sort((a, b) => b.id.localeCompare(a.id));
  return cards;
}

/** A few tracks each from the artists you've liked most. */
function topArtistsCard(tracks) {
  const map = byArtist(tracks);
  const ranked = Array.from(map.values()).filter((a) => a.count >= 3)
    .sort((a, b) => b.count - a.count).slice(0, 20);
  if (ranked.length < 3) return null;
  const byId = new Map();
  for (const t of tracks) {
    const a = (t.artists || [])[0];
    if (!a || !a.id) continue;
    if (!byId.has(a.id)) byId.set(a.id, []);
    byId.get(a.id).push(t);
  }
  const picks = [];
  for (const a of ranked) {
    const list = (byId.get(a.id) || []).slice(0, 3);
    picks.push(...list);
  }
  if (picks.length < MIN_CARD_TRACKS) return null;
  return {
    id: "top-artists",
    title: "Your regulars",
    subtitle: "a few each from the artists you like most",
    count: picks.length,
    tracks: picks,
  };
}

/**
 * A deterministic random slice. Deliberately seeded by day so it changes
 * over time but stays put within a session — a "surprise" that reshuffles
 * while you're looking at it is just noise.
 */
function surpriseCard(tracks) {
  if (tracks.length < MIN_CARD_TRACKS * 4) return null;
  const day = Math.floor(Date.now() / 86400000);
  const picks = seededPick(tracks, Math.min(50, tracks.length), day);
  return {
    id: "surprise",
    title: "Surprise me",
    subtitle: "50 at random from your library",
    count: picks.length,
    tracks: picks,
  };
}

/**
 * Artists you've barely explored — a few liked songs and no more. These
 * are the ones worth sampling: an artist you play constantly needs no
 * introduction, whereas one you've liked twice and never followed up on
 * is exactly the case where hearing a few more tracks might land.
 *
 * Ordered by most recently added, since a recent discovery is a livelier
 * prompt than one from years ago.
 */
export function artistsBarelyExplored(tracks, { maxTracks = 3, limit = 12, seed = null } = {}) {
  const out = [];
  for (const a of byArtist(tracks).values()) {
    if (a.count > maxTracks) continue;
    out.push({
      id: a.id,
      name: a.name,
      image_url: a.image_url,
      count: a.count,
      // The tracks already liked by this artist. One of them anchors the
      // sampler: hearing the song you know before two you don't is what
      // makes it an introduction rather than a pile of strangers.
      likedTrackIds: a.trackIds || [],
      _sort: a.newest || "",
    });
  }

  // Without a seed this returns the most recent, which is the right
  // answer for a fixed list. With one it draws at random from the whole
  // pool — otherwise every sampler picks the same twelve artists and the
  // same names turn up in playlist after playlist, which is the opposite
  // of the point.
  if (seed !== null) {
    return seededPick(out, limit, seed).map(({ _sort, ...rest }) => rest);
  }
  out.sort((x, y) => (y._sort || "").localeCompare(x._sort || ""));
  return out.slice(0, limit).map(({ _sort, ...rest }) => rest);
}

// ---------------------------------------------------------------------
// A wider pool of cards
// ---------------------------------------------------------------------
// Enough variety that a rotating handful stays interesting across
// refreshes rather than showing the same four ideas forever.

/** Albums you liked several tracks from — the ones that actually landed. */
function albumFavouritesCard(tracks) {
  const byAlbum = new Map();
  for (const t of tracks) {
    const name = t.album && t.album.name;
    if (!name) continue;
    if (!byAlbum.has(name)) byAlbum.set(name, []);
    byAlbum.get(name).push(t);
  }
  const picks = [];
  for (const list of byAlbum.values()) if (list.length >= 3) picks.push(...list);
  if (picks.length < MIN_CARD_TRACKS) return null;
  return {
    id: "album-faves",
    title: "Albums that landed",
    subtitle: "records you liked three or more from",
    count: picks.length,
    tracks: picks,
  };
}

/** Everything by one heavily-liked artist. Rotates by seed. */
function artistSpotlightCard(tracks, seed) {
  const map = byArtist(tracks);
  const heavy = Array.from(map.values()).filter((a) => a.count >= 8);
  if (!heavy.length) return null;
  const pick = heavy[Math.abs(seed) % heavy.length];
  const list = tracks.filter((t) => ((t.artists || [])[0] || {}).id === pick.id);
  if (list.length < MIN_CARD_TRACKS) return null;
  return {
    id: `spotlight-${pick.id}`,
    title: `All your ${pick.name}`,
    subtitle: `every ${pick.name} track you've liked`,
    count: list.length,
    tracks: sortedByAdded(list, "asc"),
  };
}

/** Added during this calendar month, any year. */
function thisMonthCard(tracks) {
  const mm = String(new Date().getMonth() + 1).padStart(2, "0");
  const list = tracks.filter((t) => (t.added_at || "").slice(5, 7) === mm);
  if (list.length < MIN_CARD_TRACKS) return null;
  const monthName = new Date().toLocaleString(undefined, { month: "long" });
  return {
    id: "this-month",
    title: `Every ${monthName}`,
    subtitle: "what you've added this month, across the years",
    count: list.length,
    tracks: sortedByAdded(list, "desc"),
  };
}

/** Old music you discovered recently. */
function oldSoulsCard(tracks) {
  const list = tracks.filter((t) => {
    const rel = parseInt(((t.album && t.album.release_date) || "").slice(0, 4), 10);
    const add = parseInt((t.added_at || "").slice(0, 4), 10);
    return rel && add && add - rel >= 20;
  });
  if (list.length < MIN_CARD_TRACKS) return null;
  return {
    id: "old-souls",
    title: "Late to the party",
    subtitle: "music you found twenty years after it came out",
    count: list.length,
    tracks: list,
  };
}

/** Liked in the same year it was released. */
function freshPressCard(tracks) {
  const list = tracks.filter((t) => {
    const rel = ((t.album && t.album.release_date) || "").slice(0, 4);
    const add = (t.added_at || "").slice(0, 4);
    return rel && add && rel === add;
  });
  if (list.length < MIN_CARD_TRACKS) return null;
  return {
    id: "fresh-press",
    title: "Caught it early",
    subtitle: "liked the same year it was released",
    count: list.length,
    tracks: sortedByAdded(list, "desc"),
  };
}

/** One track from each year you've been collecting — a tour of the library. */
function oneEachYearCard(tracks) {
  const byYear = new Map();
  for (const t of sortedByAdded(tracks, "asc")) {
    const y = (t.added_at || "").slice(0, 4);
    if (y && !byYear.has(y)) byYear.set(y, t);
  }
  const list = Array.from(byYear.values());
  if (list.length < MIN_CARD_TRACKS) return null;
  return {
    id: "one-each-year",
    title: "One from every year",
    subtitle: "a single track from each year you've collected",
    count: list.length,
    tracks: list,
  };
}

/** Liked around this date in previous years. */
function anniversaryCard(tracks) {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const thisYear = String(now.getFullYear());
  const list = tracks.filter((t) => {
    const a = t.added_at || "";
    return a.slice(5, 7) === mm && a.slice(0, 4) !== thisYear;
  });
  if (list.length < MIN_CARD_TRACKS) return null;
  return {
    id: "anniversary",
    title: "This time last year",
    subtitle: "and the years before that",
    count: list.length,
    tracks: sortedByAdded(list, "desc"),
  };
}
