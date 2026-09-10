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
export function librarySuggestions(tracks, { exclude = new Set(), limit = 6, seed = 0 } = {}) {
  const picks = [];
  const seen = new Set(exclude);

  // Three times what's shown, so a refresh has somewhere to go. Without
  // a seed the top of each list is used, which keeps the row stable
  // across renders; with one, a different handful comes from the same
  // candidates rather than re-reading anything.
  const oneOffs = artistsWithOneTrack(tracks, { limit: limit * 3 });
  const stale = artistsNotAddedRecently(tracks, { limit: limit * 3 });

  // Interleave so the row isn't all one kind of prompt.
  const half = Math.ceil(limit / 2);
  const take = (list, n) => (seed ? seededPick(list, n, seed) : list.slice(0, n));
  for (const list of [take(oneOffs, half), take(stale, limit)]) {
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
  push(lateNightCard(tracks));
  push(oneEachArtistCard(tracks, seed));
  push(deepAlbumsCard(tracks));
  push(looseTracksCard(tracks));
  push(middleLengthCard(tracks));
  push(collabsCard(tracks));
  push(soloCard(tracks));
  push(dayOneCard(tracks));
  push(slowBurnCard(tracks));
  push(retrospectiveCard(tracks, seed));
  push(bigDayCard(tracks));
  cards.push(...yearCards(tracks).slice(0, maxYears));
  cards.push(...decadeCards(tracks).slice(0, maxDecades));
  cards.push(...releaseYearCards(tracks).slice(0, maxYears));
  cards.push(...seasonCards(tracks));
  return cards;
}

// Date accessors used by the generators below. The cache stores
// `added_at` as an ISO string and the release date on the album, which
// may be a year, a year-month, or a full date depending on the release.
function addedDate(t) {
  const raw = t && t.added_at;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function releaseDate(t) {
  const raw = (t && t.album && t.album.release_date) || "";
  if (!raw) return null;
  // A bare year parses as a UTC instant, which is fine for comparisons
  // measured in years but would be wrong to present as a day.
  const d = new Date(raw.length === 4 ? `${raw}-01-01` : raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function releaseYear(t) {
  const y = parseInt(((t && t.album && t.album.release_date) || "").slice(0, 4), 10);
  return Number.isNaN(y) ? null : y;
}

// ---------------------------------------------------------------------
// Custom mixes
//
// The generated cards are fixed recipes. This is the same machinery
// with the filters exposed, so anything the cache knows about can be
// combined — decade and length, one artist and an era, liked-in-a-year
// and under three minutes — rather than waiting for a card that happens
// to ask the right question.
// ---------------------------------------------------------------------

export const CUSTOM_SORTS = ["random", "oldest-release", "newest-release", "oldest-added", "newest-added", "shortest", "longest"];

/**
 * @param filters.decade        e.g. 1990 for the nineties
 * @param filters.releaseFrom   inclusive release year
 * @param filters.releaseTo     inclusive release year
 * @param filters.addedYear     year the track was liked
 * @param filters.artistId      restrict to one artist
 * @param filters.minSeconds    length floor
 * @param filters.maxSeconds    length ceiling
 * @param filters.collabsOnly   only multi-artist credits
 * @param filters.oneEachArtist at most one track per artist
 * @param filters.limit         cap the result
 * @param filters.sort          one of CUSTOM_SORTS
 */
export function customMix(tracks, filters = {}, seed = 0) {
  const f = filters || {};
  let out = (tracks || []).filter(Boolean);

  if (f.decade) {
    out = out.filter((t) => {
      const y = releaseYear(t);
      return y && y >= f.decade && y < f.decade + 10;
    });
  }
  if (f.releaseFrom) out = out.filter((t) => { const y = releaseYear(t); return y && y >= f.releaseFrom; });
  if (f.releaseTo) out = out.filter((t) => { const y = releaseYear(t); return y && y <= f.releaseTo; });
  if (f.addedYear) out = out.filter((t) => (t.added_at || "").slice(0, 4) === String(f.addedYear));
  if (f.artistId) out = out.filter((t) => (t.artists || []).some((a) => a.id === f.artistId));
  if (f.minSeconds) out = out.filter((t) => (t.duration_ms || 0) >= f.minSeconds * 1000);
  if (f.maxSeconds) out = out.filter((t) => (t.duration_ms || 0) > 0 && (t.duration_ms || 0) <= f.maxSeconds * 1000);
  if (f.collabsOnly) out = out.filter((t) => (t.artists || []).length > 1);

  // Applied after filtering, so "one each" means one each of whatever
  // survived rather than one each of the whole library.
  if (f.oneEachArtist) {
    const seen = new Set();
    out = out.filter((t) => {
      const a = (t.artists || [])[0];
      const k = a && a.id;
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  switch (f.sort) {
    case "oldest-release": out.sort((a, b) => (releaseYear(a) || 0) - (releaseYear(b) || 0)); break;
    case "newest-release": out.sort((a, b) => (releaseYear(b) || 0) - (releaseYear(a) || 0)); break;
    case "oldest-added": out.sort((a, b) => (a.added_at || "").localeCompare(b.added_at || "")); break;
    case "newest-added": out.sort((a, b) => (b.added_at || "").localeCompare(a.added_at || "")); break;
    case "shortest": out.sort((a, b) => (a.duration_ms || 0) - (b.duration_ms || 0)); break;
    case "longest": out.sort((a, b) => (b.duration_ms || 0) - (a.duration_ms || 0)); break;
    default: out = seededPick(out, out.length, seed || 1); break;
  }

  if (f.limit && out.length > f.limit) out = out.slice(0, f.limit);
  return out;
}

/** A short sentence describing what a custom mix asked for. */
export function describeCustom(f = {}) {
  const bits = [];
  if (f.artistName) bits.push(f.artistName);
  if (f.decade) bits.push(`the ${String(f.decade).slice(2)}s`);
  else if (f.releaseFrom || f.releaseTo) bits.push(`released ${f.releaseFrom || "any"}–${f.releaseTo || "now"}`);
  if (f.addedYear) bits.push(`liked in ${f.addedYear}`);
  if (f.minSeconds && f.maxSeconds) bits.push(`${f.minSeconds}–${f.maxSeconds} seconds`);
  else if (f.maxSeconds) bits.push(`under ${Math.round(f.maxSeconds / 60)} minutes`);
  else if (f.minSeconds) bits.push(`over ${Math.round(f.minSeconds / 60)} minutes`);
  if (f.collabsOnly) bits.push("collaborations");
  if (f.oneEachArtist) bits.push("one per artist");
  return bits.length ? bits.join(", ") : "everything in your library";
}

// ---------------------------------------------------------------------
// More generators
//
// The set was fifteen, most of them about *when* a track was liked or
// released. These add the other axes the cache already knows about:
// length, artist shape, album shape, and the calendar of your own
// listening. Each returns null when it hasn't enough to be worth
// showing, so a thin library simply sees fewer cards rather than a row
// of near-empty ones.
// ---------------------------------------------------------------------

/** Everything from a single year of *release*, not of liking. */
function releaseYearCards(tracks) {
  const by = new Map();
  for (const t of tracks) {
    const y = releaseYear(t);
    if (!y) continue;
    if (!by.has(y)) by.set(y, []);
    by.get(y).push(t);
  }
  const out = [];
  for (const [y, list] of [...by.entries()].sort((a, b) => b[0] - a[0])) {
    if (list.length < MIN_CARD_TRACKS) continue;
    out.push({
      id: `released-${y}`,
      title: `Released in ${y}`,
      subtitle: "whenever you got to it",
      count: list.length,
      tracks: list,
    });
  }
  return out;
}

/** Tracks liked in the same season, across every year. */
function seasonCards(tracks) {
  const seasons = [
    ["winter", "Winter", [12, 1, 2]],
    ["spring", "Spring", [3, 4, 5]],
    ["summer", "Summer", [6, 7, 8]],
    ["autumn", "Autumn", [9, 10, 11]],
  ];
  const out = [];
  for (const [id, label, months] of seasons) {
    const list = tracks.filter((t) => {
      const d = addedDate(t);
      return d && months.includes(d.getUTCMonth() + 1);
    });
    if (list.length < MIN_CARD_TRACKS) continue;
    out.push({
      id: `season-${id}`,
      title: `${label} finds`,
      subtitle: `everything you added in ${label.toLowerCase()}, any year`,
      count: list.length,
      tracks: list,
    });
  }
  return out;
}

/** Liked at night — by the hour you saved them, not the hour you played. */
function lateNightCard(tracks) {
  const list = tracks.filter((t) => {
    const d = addedDate(t);
    if (!d) return false;
    const h = d.getUTCHours();
    return h >= 23 || h < 5;
  });
  if (list.length < MIN_CARD_TRACKS) return null;
  return {
    id: "late-night",
    title: "Small hours",
    subtitle: "saved between eleven and five",
    count: list.length,
    tracks: list,
  };
}

/** Artists you've liked a lot of, one track each — a tour of your core. */
function oneEachArtistCard(tracks, seed) {
  const heavy = [...byArtist(tracks).values()].filter((a) => a.count >= 4);
  if (heavy.length < MIN_CARD_TRACKS) return null;
  const picked = [];
  for (const a of heavy) {
    const theirs = tracks.filter((t) => (t.artists || []).some((x) => x.id === a.id));
    if (theirs.length) picked.push(seededPick(theirs, 1, seed + a.id.length)[0]);
  }
  if (picked.length < MIN_CARD_TRACKS) return null;
  return {
    id: "one-each-artist",
    title: "One each",
    subtitle: "a single track from every artist you've collected",
    count: picked.length,
    tracks: picked,
  };
}

/** Albums you've liked most of, rather than a track from. */
function deepAlbumsCard(tracks) {
  const by = new Map();
  for (const t of tracks) {
    const al = t.album;
    if (!al || !al.id) continue;
    if (!by.has(al.id)) by.set(al.id, []);
    by.get(al.id).push(t);
  }
  const deep = [];
  for (const list of by.values()) if (list.length >= 5) deep.push(...list);
  if (deep.length < MIN_CARD_TRACKS) return null;
  return {
    id: "deep-albums",
    title: "Albums you went deep on",
    subtitle: "five or more tracks from one record",
    count: deep.length,
    tracks: deep,
  };
}

/** Singles and one-offs: tracks from releases you own one song from. */
function looseTracksCard(tracks) {
  const by = new Map();
  for (const t of tracks) {
    const al = t.album;
    if (!al || !al.id) continue;
    if (!by.has(al.id)) by.set(al.id, []);
    by.get(al.id).push(t);
  }
  const loose = [];
  for (const list of by.values()) if (list.length === 1) loose.push(list[0]);
  if (loose.length < MIN_CARD_TRACKS) return null;
  return {
    id: "loose-tracks",
    title: "Loose ends",
    subtitle: "one track and nothing else from that release",
    count: loose.length,
    tracks: loose,
  };
}

/** Middle-length tracks — neither an epic nor a sprint. */
function middleLengthCard(tracks) {
  const mid = tracks.filter((t) => {
    const d = t.duration_ms || 0;
    return d >= 180 * 1000 && d <= 240 * 1000;
  });
  if (mid.length < MIN_CARD_TRACKS) return null;
  return {
    id: "three-minute",
    title: "The three-minute rule",
    subtitle: "classic single length",
    count: mid.length,
    tracks: mid,
  };
}

/** Collaborations — anything credited to more than one artist. */
function collabsCard(tracks) {
  const list = tracks.filter((t) => (t.artists || []).length > 1);
  if (list.length < MIN_CARD_TRACKS) return null;
  return {
    id: "collabs",
    title: "Two names on the label",
    subtitle: "everything with a featured artist",
    count: list.length,
    tracks: list,
  };
}

/** Solo credits only — the opposite of the above. */
function soloCard(tracks) {
  const list = tracks.filter((t) => (t.artists || []).length === 1);
  if (list.length < MIN_CARD_TRACKS) return null;
  return {
    id: "solo",
    title: "One name only",
    subtitle: "no features, no guests",
    count: list.length,
    tracks: list,
  };
}

/** Liked the same week it came out. */
function dayOneCard(tracks) {
  const list = tracks.filter((t) => {
    const added = addedDate(t);
    const rel = releaseDate(t);
    if (!added || !rel) return false;
    const days = (added - rel) / 86400000;
    return days >= 0 && days <= 7;
  });
  if (list.length < MIN_CARD_TRACKS) return null;
  return {
    id: "day-one",
    title: "There on day one",
    subtitle: "liked within a week of release",
    count: list.length,
    tracks: list,
  };
}

/** The gap between release and liking, at its widest. */
function slowBurnCard(tracks) {
  const scored = tracks
    .map((t) => {
      const added = addedDate(t);
      const rel = releaseDate(t);
      if (!added || !rel) return null;
      return { t, gap: (added - rel) / 86400000 };
    })
    .filter((x) => x && x.gap > 365 * 10)
    .sort((a, b) => b.gap - a.gap)
    .map((x) => x.t);
  if (scored.length < MIN_CARD_TRACKS) return null;
  return {
    id: "slow-burn",
    title: "Took your time",
    subtitle: "found more than a decade after release",
    count: scored.length,
    tracks: scored,
  };
}

/** A run from one artist, in album order — a mini retrospective. */
function retrospectiveCard(tracks, seed) {
  const heavy = [...byArtist(tracks).values()].filter((a) => a.count >= 8);
  if (!heavy.length) return null;
  const pick = seededPick(heavy, 1, seed + 7)[0];
  const theirs = tracks
    .filter((t) => (t.artists || []).some((x) => x.id === pick.id))
    .sort((a, b) => String(releaseDate(a) || "").localeCompare(String(releaseDate(b) || "")));
  if (theirs.length < MIN_CARD_TRACKS) return null;
  return {
    id: "retrospective",
    title: `${pick.name}, in order`,
    subtitle: "their tracks you own, oldest first",
    count: theirs.length,
    tracks: theirs,
  };
}

/** Everything added on the busiest single day you ever had. */
function bigDayCard(tracks) {
  const by = new Map();
  for (const t of tracks) {
    const d = addedDate(t);
    if (!d) continue;
    const key = d.toISOString().slice(0, 10);
    if (!by.has(key)) by.set(key, []);
    by.get(key).push(t);
  }
  let best = null;
  for (const [day, list] of by.entries()) {
    if (!best || list.length > best.list.length) best = { day, list };
  }
  if (!best || best.list.length < MIN_CARD_TRACKS) return null;
  const when = new Date(best.day).toLocaleDateString([], { day: "numeric", month: "long", year: "numeric" });
  return {
    id: "big-day",
    title: "That one afternoon",
    subtitle: `everything you added on ${when}`,
    count: best.list.length,
    tracks: best.list,
  };
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
 * "If you like X" mixes.
 *
 * Last.fm knows which artists resemble each other. On its own that
 * gives you names you can't play — a recommendation for an artist
 * whose music you don't own is a shopping list, not a mix.
 *
 * So the recommendation is the intersection: artists Last.fm says
 * resemble one you play constantly, that you already own and have
 * barely touched. That's a mix you can press play on, made of music
 * you'd forgotten you had.
 *
 * @param similarByArtist Map of lowercased seed artist -> [{name, match}]
 */
export function recommendationCards(tracks, similarByArtist, { minTracks = 6, limit = 6, maxPerSeed = 40 } = {}) {
  if (!similarByArtist || !similarByArtist.size) return [];
  const owned = byArtist(tracks);
  const ownedByName = new Map();
  for (const a of owned.values()) ownedByName.set((a.name || "").trim().toLowerCase(), a);

  const cards = [];
  for (const [seed, similar] of similarByArtist.entries()) {
    const seedEntry = ownedByName.get(seed);
    if (!seedEntry) continue;
    const picked = [];
    const seen = new Set();
    for (const sim of similar) {
      const key = (sim.name || "").trim().toLowerCase();
      // Excluding the seed itself: a mix of the artist you already
      // play constantly isn't a recommendation.
      if (key === seed || seen.has(key)) continue;
      const match = ownedByName.get(key);
      if (!match) continue;
      seen.add(key);
      for (const t of tracks) {
        if ((t.artists || []).some((a) => a.id === match.id)) picked.push(t);
      }
      if (picked.length >= maxPerSeed) break;
    }
    if (picked.length < minTracks) continue;
    cards.push({
      id: `rec-${seedEntry.id}`,
      title: `If you like ${seedEntry.name}`,
      subtitle: `${seen.size} similar artist${seen.size === 1 ? "" : "s"} you already own`,
      count: picked.length,
      tracks: picked,
      isRecommendation: true,
    });
  }
  return cards.sort((a, b) => b.count - a.count).slice(0, limit);
}

/**
 * A mix of artists similar to a named one, drawn from what you own.
 *
 * `recommendationCards` seeds from artists you already play most, so
 * the seed is necessarily one you own. This doesn't require that: you
 * can ask "if you like Radiohead" while owning no Radiohead at all,
 * and still get the artists in your library that resemble them. That
 * is arguably the more useful direction — the point is what comes out,
 * not what went in.
 */
export function similarOwnedMix(tracks, similar, seedName, { maxTracks = 60 } = {}) {
  const owned = new Map();
  for (const a of byArtist(tracks).values()) owned.set((a.name || "").trim().toLowerCase(), a);

  const seedKey = (seedName || "").trim().toLowerCase();
  const picked = [];
  const matched = [];
  const seen = new Set();
  for (const sim of similar || []) {
    const key = (sim.name || "").trim().toLowerCase();
    // Excluding the seed: a mix of the artist you asked about isn't a
    // recommendation, it's a dive.
    if (key === seedKey || seen.has(key)) continue;
    const hit = owned.get(key);
    if (!hit) continue;
    seen.add(key);
    matched.push(hit.name);
    for (const t of tracks) {
      if ((t.artists || []).some((a) => a.id === hit.id)) picked.push(t);
    }
    if (picked.length >= maxTracks) break;
  }
  return { tracks: picked, artists: matched };
}

/**
 * Artists ranked by how much of them you own.
 *
 * Genre tagging costs one request per artist, so the order matters: an
 * artist you have thirty tracks by will carry a genre mix on their own,
 * one you have a single track by mostly won't. Fetching in this order
 * means the first fifty requests produce nearly all the useful mixes.
 */
export function artistsByWeight(tracks) {
  return [...byArtist(tracks).values()]
    .filter((a) => a.id && a.name)
    .sort((a, b) => b.count - a.count)
    .map((a) => ({ id: a.id, name: a.name, count: a.count }));
}

/**
 * Genre mixes from tags already fetched.
 *
 * @param tagsByArtist Map of lowercased artist name -> [{name, weight}]
 * @param minWeight    Last.fm's 0-100 count. A defining tag scores high;
 *                     one person's joke scores low.
 * @param minTracks    A genre with four tracks isn't a mix.
 */
export function genreCards(tracks, tagsByArtist, { minWeight = 25, minTracks = 8, limit = 14 } = {}) {
  if (!tagsByArtist || !tagsByArtist.size) return [];
  const byTag = new Map();
  for (const t of tracks || []) {
    const seen = new Set();
    for (const a of t.artists || []) {
      const tags = tagsByArtist.get((a.name || "").trim().toLowerCase());
      if (!tags) continue;
      for (const tag of tags) {
        if (tag.weight < minWeight || seen.has(tag.name)) continue;
        // A track credited to two artists sharing a tag counts once.
        seen.add(tag.name);
        if (!byTag.has(tag.name)) byTag.set(tag.name, []);
        byTag.get(tag.name).push(t);
      }
    }
  }
  return [...byTag.entries()]
    .filter(([, list]) => list.length >= minTracks)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, limit)
    .map(([tag, list]) => ({
      id: `genre-${tag.replace(/\s+/g, "-")}`,
      title: titleCase(tag),
      subtitle: `${list.length} tracks tagged ${tag}`,
      count: list.length,
      tracks: list,
      isGenre: true,
    }));
}

function titleCase(s) {
  return (s || "").replace(/\b\w/g, (c) => c.toUpperCase());
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
