/**
 * search.js — orchestration layer.
 *
 * Client-side port of app.py's run_search_job / run_full_scrub_job. The
 * server versions ran in a background thread and reported progress into a
 * shared registry (progress.py) that the browser polled; here it's just
 * an async function that takes an onProgress callback and returns the
 * result object directly. No threads, no job ids, no RESULTS_CACHE.
 *
 * The two-phase matching flow is unchanged from the Python — read the
 * catalog cheaply (no ISRC), narrow to candidates, then fetch real ISRCs
 * only for those few. See matching.js / matching.py for the reasoning.
 */

import * as matching from "./matching.js";
import { CATALOG_PACING_MS, WIDE_CATALOG_PACING_MS } from "./spotify.js";
import { filterLikedByArtist } from "./library-cache.js";

// Same weights as app.py's STAGE_WEIGHTS, so the progress bar advances
// identically. (classify is folded into the tail; it's instant.)
const STAGE_WEIGHTS = {
  find_artist: 5,
  liked_songs: 20,
  catalog: 50,
  confirm: 20,
  classify: 5,
};

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

/**
 * runSearch — single-artist flow.
 *
 * @param client      a SpotifyClient
 * @param artistName  the name to search for
 * @param opts        { excludeLive, excludeCensored, excludeInstrumental,
 *                      excludeAcappella, matchRemasters,
 *                      onProgress(percent, stageLabel) }
 * @returns result object (same shape the Python put in RESULTS_CACHE)
 *          or throws on failure.
 */
/**
 * Which release groups to read for an artist.
 *
 * These were one toggle, and shouldn't have been. A greatest-hits record
 * is the artist's own work and belongs with their albums; a various-
 * artists compilation they guest on once is somebody else's record.
 * Spotify separates them — "compilation" is the artist's own, while a
 * guest spot lands in "appears_on" — so DeepDive can too.
 *
 * The cost is lopsided as well. Compilations are usually a handful of
 * extra releases. "Appeared on" can be 300-500 for a prolific session
 * player, at one request each. Bundling them meant nobody could take the
 * cheap half without the expensive one.
 */
export function buildIncludeGroups(includeCompilations, includeAppearsOn) {
  const groups = ["album", "single"];
  if (includeCompilations) groups.push("compilation");
  if (includeAppearsOn) groups.push("appears_on");
  return groups.join(",");
}

/** Rounded, and never to the second — false precision on an estimate. */
function fmtEta(secs) {
  if (secs < 60) return `${Math.max(5, Math.round(secs / 5) * 5)} seconds`;
  const mins = Math.round(secs / 30) / 2;
  return mins <= 1 ? "a minute" : `${mins % 1 ? mins.toFixed(1) : mins} minutes`;
}

export async function runSearch(client, artistName, opts = {}) {
  const {
    excludeLive = false, excludeCensored = false,
    excludeInstrumental = false, excludeAcappella = false,
    matchRemasters = false, onProgress = () => {}, onArtist = () => {}, onArtwork = () => {},
    libraryCache = null, scopeToArtist = true, resolvedArtist = null,
    includeCompilations = false, includeAppearsOn = false,
  } = opts;

  const includeGroups = buildIncludeGroups(includeCompilations, includeAppearsOn);

  // Pace from the first request, not after the first 429. Every catalog
  // read is one request per release since Spotify removed batch ?ids=,
  // so even a standard dive trips the limit if it sprints — and a
  // 15-second penalty costs more than pacing the whole read. Wide reads
  // are 300+ releases and need more still.
  if (typeof client.setMinimumPacing === "function") {
    client.setMinimumPacing(includeAppearsOn ? WIDE_CATALOG_PACING_MS : CATALOG_PACING_MS);
  }

  let completed = 0;
  const report = (stage) => onProgress(Math.round(completed), stage);

  // Build a per-stage progress callback that maps a stage's own
  // current/total into the global bar, exactly like the Python.
  const stageCb = (stageKey, label) => {
    const weight = STAGE_WEIGHTS[stageKey];
    return (current, total) => {
      total = Math.max(total, 1);
      const frac = clamp01(current / total);
      onProgress(Math.round(completed + weight * frac), label);
    };
  };

  report(`Finding "${artistName}" on Spotify…`);
  // The caller may have resolved the artist already — the dive screen
  // does, so it can load the photo before opening — in which case
  // searching again would spend the request a second time for the same
  // answer.
  const artist = resolvedArtist || await client.findArtist(artistName);
  completed += STAGE_WEIGHTS.find_artist;
  if (!artist) {
    throw new Error(`No Spotify artist found matching "${artistName}".`);
  }
  // Hand the artist back as soon as they're known so the caller can show
  // who's being dived rather than a bare progress bar. Guarded: a display
  // callback must never be able to fail the search.
  //
  // This call sat one line ABOVE the `const artist` declaration, inside
  // that same guard. `const` has no hoisted value, so it threw a
  // ReferenceError on every dive and the catch swallowed it — onArtist
  // never fired at all.
  try { onArtist(artist); } catch (e) {}

  report("Reading your Liked Songs…");
  // With a libraryCache (incremental, browser-persisted), the whole
  // library is only read in full once; later searches fetch just the
  // changes. Without one, fall back to the original full read every time.
  let likedTracks;
  if (libraryCache) {
    likedTracks = await libraryCache.getLikedTracks({
      onProgress: stageCb("liked_songs", "Syncing your Liked Songs…"),
    });
  } else {
    likedTracks = await client.getAllLikedTracks(stageCb("liked_songs", "Reading your Liked Songs…"));
  }
  completed += STAGE_WEIGHTS.liked_songs;

  // Version A scoping: for a single-artist search, compare only against
  // the liked songs credited to that artist, not the whole library. This
  // keeps cross-release duplicate detection (within that artist's tracks)
  // while dropping the full-library fuzzy pass. Falls back to the whole
  // library if scoping is turned off.
  const comparisonSet = scopeToArtist
    ? filterLikedByArtist(likedTracks, artist.id, artist.name)
    : likedTracks;
  const likedIndex = matching.buildLikedIndexes(comparisonSet);

  report(`Reading ${artist.name}'s releases…`);
  // Once the release count is known the rest of this stage is one
  // request each, so the remaining time is arithmetic rather than a
  // guess. A bar moving at an unknown rate is what made a slow dive
  // indistinguishable from a stuck one.
  const catalogTracks = await client.getArtistCatalogTracks(artist.id, {
    onProgress: (done, total) => {
      const left = Math.max(0, total - done);
      const secs = typeof client.estimateSeconds === "function" ? client.estimateSeconds(left) : 0;
      const eta = secs > 5 ? ` — about ${fmtEta(secs)} left` : "";
      stageCb("catalog", `Reading ${artist.name}'s releases…`)(done, total);
      report(`Reading ${artist.name}'s releases… (${done}/${total})${eta}`);
    },
    includeGroups,
  });

  // Smaller acts often have no artist photo on Spotify at all. Their own
  // album art is the obvious stand-in and has just been fetched, so it
  // costs nothing extra.
  // Only a fallback: smaller acts often have no artist photo on Spotify
  // at all, and their own album art is the obvious stand-in since it has
  // just been fetched. The dive shows artist photos by preference — see
  // the `_haveArtistPhoto` gate on the receiving end.
  try {
    const withArt = catalogTracks.find((t) => t.album && t.album.images && t.album.images.length);
    if (withArt) onArtwork(withArt.album.images[0].url);
  } catch (e) {}
  completed += STAGE_WEIGHTS.catalog;

  report("Comparing with your library…");
  const phase1 = matching.findCandidates(catalogTracks, likedIndex, {
    excludeLive, excludeCensored, excludeInstrumental, excludeAcappella,
  });

  const candidateIds = phase1.candidates.map((c) => c.track.id);
  let fullTracks = [];
  if (candidateIds.length) {
    const n = candidateIds.length;
    const label = `Checking ${n} possible match${n === 1 ? "" : "es"}…`;
    report(label);
    fullTracks = await client.getTracksWithIsrc(candidateIds, stageCb("confirm", label));
  }
  completed += STAGE_WEIGHTS.confirm;

  const phase2 = matching.confirmCandidates(fullTracks, phase1.candidates, likedIndex, { matchRemasters });

  const rawNewTracks = phase1.new_tracks.concat(phase2.new_tracks);
  // The catalog can carry the same recording on several releases (e.g. a
  // session track released as both a single and on the session EP).
  // Those are distinct track IDs, so nothing upstream catches them and
  // the playlist ends up with visible duplicates. Collapse to one per
  // recording, keeping the most canonical release.
  const collapsed = matching.collapseDuplicateRecordings(rawNewTracks);
  const newTracks = collapsed.tracks;
  onProgress(100, "Done");

  return {
    mode: "search",
    artist,
    duplicate_candidates: phase2.duplicate_candidates,
    new_tracks: newTracks,
    collapsed_count: collapsed.collapsedCount,
    collapsed_groups: collapsed.groups,
    already_liked_count: phase1.already_liked.length,
    // The ids, not just the count: a dip needs to know which tracks
    // you already know so it can lead with them, or leave them out.
    already_liked_ids: phase1.already_liked.map((t) => t && t.id).filter(Boolean),
    // The whole catalogue, for callers that want to re-rank it rather
    // than take the already-liked / new split. A dip orders it by
    // popularity; nothing else uses it, so it costs only the reference.
    catalog_tracks: catalogTracks,
    excluded_count: phase1.excluded_count,
    exclude_live: excludeLive,
    exclude_censored: excludeCensored,
    exclude_instrumental: excludeInstrumental,
    exclude_acappella: excludeAcappella,
    match_remasters: matchRemasters,
  };
}

/**
 * runFullScrub — duplicate-only whole-library flow.
 *
 * It searches each liked artist's catalogue for alternate Spotify copies
 * of recordings already in Liked Songs. Genuinely new music is discarded:
 * the only output is copies the user can like so later dives recognize
 * them as already owned.
 */
export async function runFullScrub(client, opts = {}) {
  const {
    onProgress = () => {}, isCancelled = () => false, libraryCache = null,
  } = opts;
  const includeGroups = buildIncludeGroups(true, false);
  if (typeof client.setMinimumPacing === "function") client.setMinimumPacing(CATALOG_PACING_MS);

  onProgress(0, "Reading your Liked Songs…");
  let likedTracks;
  if (libraryCache) {
    likedTracks = await libraryCache.getLikedTracks({
      onProgress: (cur, total) => onProgress(Math.round(clamp01(cur / Math.max(total, 1)) * 5), "Reading your Liked Songs…"),
    });
  } else {
    likedTracks = await client.getAllLikedTracks((cur, total) => {
      onProgress(Math.round(clamp01(cur / Math.max(total, 1)) * 5), "Reading your Liked Songs…");
    });
  }

  const artists = distinctLikedArtists(likedTracks);
  const duplicates = [];
  const seen = new Set();
  let scanned = 0;
  for (const artist of artists) {
    if (isCancelled()) break;
    onProgress(5 + Math.round((scanned / Math.max(artists.length, 1)) * 94), `Checking ${artist.name}… (${scanned + 1}/${artists.length})`);
    try {
      const catalog = await client.getArtistCatalogTracks(artist.id, { isCancelled, includeGroups });
      const likedIndex = matching.buildLikedIndexes(filterLikedByArtist(likedTracks, artist.id, artist.name));
      const phase1 = matching.findCandidates(catalog, likedIndex);
      const ids = phase1.candidates.map((candidate) => candidate.track.id);
      const fullTracks = ids.length && !isCancelled() ? await client.getTracksWithIsrc(ids) : [];
      const phase2 = matching.confirmCandidates(fullTracks, phase1.candidates, likedIndex);
      for (const duplicate of phase2.duplicate_candidates) {
        if (!seen.has(duplicate.track.id)) {
          seen.add(duplicate.track.id);
          duplicates.push(duplicate);
        }
      }
    } catch (e) {
      // One unavailable artist should not discard matches already found.
    }
    scanned++;
  }
  onProgress(100, "Done");
  return {
    mode: "full_scrub",
    duplicate_candidates: duplicates,
    new_tracks: [],
    tracks_scanned: likedTracks.length,
    artists_scanned: scanned,
    artists_total: artists.length,
  };
}

function distinctLikedArtists(likedTracks) {
  const seen = new Map();
  for (const track of likedTracks) {
    const artist = (track.artists || [])[0];
    if (artist?.id && !seen.has(artist.id)) seen.set(artist.id, { id: artist.id, name: artist.name });
  }
  return Array.from(seen.values());
}
