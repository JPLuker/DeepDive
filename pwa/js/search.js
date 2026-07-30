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
export async function runSearch(client, artistName, opts = {}) {
  const {
    excludeLive = false, excludeCensored = false,
    excludeInstrumental = false, excludeAcappella = false,
    matchRemasters = false, onProgress = () => {},
  } = opts;

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
  const artist = await client.findArtist(artistName);
  completed += STAGE_WEIGHTS.find_artist;
  if (!artist) {
    throw new Error(`No Spotify artist found matching "${artistName}".`);
  }
  report(`Finding "${artistName}" on Spotify…`);

  report("Reading your Liked Songs…");
  const likedTracks = await client.getAllLikedTracks(stageCb("liked_songs", "Reading your Liked Songs…"));
  completed += STAGE_WEIGHTS.liked_songs;
  const likedIndex = matching.buildLikedIndexes(likedTracks);

  report(`Reading ${artist.name}'s releases…`);
  const catalogTracks = await client.getArtistCatalogTracks(artist.id, {
    onProgress: stageCb("catalog", `Reading ${artist.name}'s releases…`),
  });
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

  const newTracks = phase1.new_tracks.concat(phase2.new_tracks);
  onProgress(100, "Done");

  return {
    mode: "search",
    artist,
    duplicate_candidates: phase2.duplicate_candidates,
    new_tracks: newTracks,
    already_liked_count: phase1.already_liked.length,
    excluded_count: phase1.excluded_count,
    exclude_live: excludeLive,
    exclude_censored: excludeCensored,
    exclude_instrumental: excludeInstrumental,
    exclude_acappella: excludeAcappella,
    match_remasters: matchRemasters,
  };
}

/**
 * runFullScrub — whole-library flow. Reads Liked Songs once, then runs
 * the per-artist catalog+match for each distinct liked artist.
 *
 * Supports cancellation: opts.isCancelled() checked between artists, and
 * passed down into the catalog read so a long artist can bail mid-way.
 * Returns whatever was found up to the cancel point (matching the
 * Python's "cancel still shows partial results").
 */
export async function runFullScrub(client, opts = {}) {
  const {
    excludeLive = false, excludeCensored = false,
    excludeInstrumental = false, excludeAcappella = false,
    matchRemasters = false, onProgress = () => {},
    isCancelled = () => false,
  } = opts;

  onProgress(0, "Reading your Liked Songs…");
  const likedTracks = await client.getAllLikedTracks((cur, total) => {
    onProgress(Math.round(clamp01(cur / Math.max(total, 1)) * 5), "Reading your Liked Songs…");
  });
  const likedIndex = matching.buildLikedIndexes(likedTracks);

  // Distinct primary artists across the library (pure local work).
  const artists = distinctLikedArtists(likedTracks);
  const totalArtists = artists.length || 1;

  const allDuplicates = [];
  const allNew = [];
  const perArtist = [];
  let scanned = 0;

  for (const artist of artists) {
    if (isCancelled()) break;

    const base = 5 + Math.round((scanned / totalArtists) * 93);
    onProgress(base, `Scanning ${artist.name}… (${scanned + 1}/${totalArtists})`);

    try {
      const catalogTracks = await client.getArtistCatalogTracks(artist.id, { isCancelled });
      const phase1 = matching.findCandidates(catalogTracks, likedIndex, {
        excludeLive, excludeCensored, excludeInstrumental, excludeAcappella,
      });
      const candidateIds = phase1.candidates.map((c) => c.track.id);
      let fullTracks = [];
      if (candidateIds.length && !isCancelled()) {
        fullTracks = await client.getTracksWithIsrc(candidateIds);
      }
      const phase2 = matching.confirmCandidates(fullTracks, phase1.candidates, likedIndex, { matchRemasters });

      const artistNew = phase1.new_tracks.concat(phase2.new_tracks);
      for (const d of phase2.duplicate_candidates) allDuplicates.push(d);
      for (const t of artistNew) allNew.push(t);
      perArtist.push({
        artist,
        duplicate_count: phase2.duplicate_candidates.length,
        new_count: artistNew.length,
      });
    } catch (e) {
      // One artist failing shouldn't sink the whole scrub — record and move on.
      perArtist.push({ artist, error: String(e && e.message ? e.message : e) });
    }
    scanned += 1;
  }

  onProgress(100, "Done");
  return {
    mode: "full_scrub",
    duplicate_candidates: allDuplicates,
    new_tracks: allNew,
    per_artist_summary: perArtist,
    artists_scanned: scanned,
    artists_total: artists.length,
  };
}

// Local helper (mirrors spotify_client.get_distinct_liked_artists /
// getDistinctLikedArtists — duplicated here to keep search.js's imports
// to just matching, but identical logic).
function distinctLikedArtists(likedTracks) {
  const seen = new Map();
  for (const t of likedTracks) {
    const a = (t.artists || [])[0];
    if (a && a.id && !seen.has(a.id)) seen.set(a.id, { id: a.id, name: a.name });
  }
  return Array.from(seen.values());
}
