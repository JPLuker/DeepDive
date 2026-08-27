/**
 * matching.js — client-side port of DeepDive's matching.py.
 *
 * Decides whether a catalog track is (a) already liked, (b) the same
 * recording as something already liked under a different release, or
 * (c) genuinely new.
 *
 * Primary signal is ISRC; fuzzy title+duration+artist matching is the
 * fallback. This is a faithful port of the Python — behaviour is meant
 * to be identical, verified against matching.py's own test cases.
 *
 * The one non-obvious piece is `sequenceRatio`, a from-scratch port of
 * Python's difflib.SequenceMatcher.ratio(). JavaScript has no built-in
 * equivalent and it is NOT a standard edit-distance metric, so a generic
 * string-similarity library would produce different numbers and silently
 * change matching behaviour. This reimplements Python's actual algorithm
 * (b2j mapping with the autojunk heuristic, recursive longest-matching-
 * blocks) so the ratio matches CPython's to the bit.
 */

// ---------------------------------------------------------------------
// difflib.SequenceMatcher.ratio() port
// ---------------------------------------------------------------------

/**
 * Build the b2j map: for each element in b, the sorted list of indices
 * where it occurs — with Python's "autojunk" heuristic applied: for
 * sequences of 200+ items, any element appearing in more than 1% of
 * positions (plus a small constant) is treated as popular and removed
 * from the map (ignored as a matching anchor).
 */
function buildB2J(b) {
  const b2j = new Map();
  for (let i = 0; i < b.length; i++) {
    const ch = b[i];
    if (!b2j.has(ch)) b2j.set(ch, []);
    b2j.get(ch).push(i);
  }
  // autojunk
  const n = b.length;
  if (n >= 200) {
    const ntest = Math.floor(n / 100) + 1;
    for (const [ch, idxs] of Array.from(b2j.entries())) {
      if (idxs.length > ntest) {
        b2j.delete(ch);
      }
    }
  }
  return b2j;
}

/**
 * find_longest_match(a, b, b2j, alo, ahi, blo, bhi) — port of CPython's.
 * Returns [besti, bestj, bestsize].
 */
function findLongestMatch(a, b2j, alo, ahi, blo, bhi) {
  let besti = alo, bestj = blo, bestsize = 0;
  let j2len = new Map();

  for (let i = alo; i < ahi; i++) {
    const newj2len = new Map();
    const idxs = b2j.get(a[i]);
    if (idxs) {
      for (const j of idxs) {
        if (j < blo) continue;
        if (j >= bhi) break;
        const k = (j2len.get(j - 1) || 0) + 1;
        newj2len.set(j, k);
        if (k > bestsize) {
          besti = i - k + 1;
          bestj = j - k + 1;
          bestsize = k;
        }
      }
    }
    j2len = newj2len;
  }

  // Extend the best match to include equal elements on either side that
  // aren't in b2j (junk). DeepDive uses no explicit junk set, but with
  // autojunk this still matters for long strings — mirror CPython exactly.
  while (besti > alo && bestj > blo && a[besti - 1] === bBackref(bestj - 1)) {
    // note: only used when there IS junk; kept structurally faithful.
    besti--; bestj--; bestsize++;
  }
  while (besti + bestsize < ahi && bestj + bestsize < bhi &&
         a[besti + bestsize] === bBackref(bestj + bestsize)) {
    bestsize++;
  }

  return [besti, bestj, bestsize];
}

// findLongestMatch needs access to b by index for the extension step.
// We stash it in a closure-scoped variable set by sequenceRatio.
let _bRef = null;
function bBackref(j) { return _bRef[j]; }

/**
 * matchingBlocks(a, b, b2j) — port of get_matching_blocks(): recursively
 * finds all non-overlapping longest matching blocks. Returns total number
 * of matched elements M (we only need the count for ratio()).
 */
function totalMatches(a, b, b2j) {
  const la = a.length, lb = b.length;
  let matches = 0;
  // queue of [alo, ahi, blo, bhi]
  const queue = [[0, la, 0, lb]];
  while (queue.length) {
    const [alo, ahi, blo, bhi] = queue.pop();
    const [i, j, k] = findLongestMatch(a, b2j, alo, ahi, blo, bhi);
    if (k) {
      matches += k;
      if (alo < i && blo < j) queue.push([alo, i, blo, j]);
      if (i + k < ahi && j + k < bhi) queue.push([i + k, ahi, j + k, bhi]);
    }
  }
  return matches;
}

/**
 * sequenceRatio(a, b) — equivalent of SequenceMatcher(None, a, b).ratio().
 * Case-SENSITIVE, exactly like Python (callers lowercase first, in
 * normalizeTitle, matching the Python code path).
 */
export function sequenceRatio(a, b) {
  const T = a.length + b.length;
  if (T === 0) return 1.0; // Python: ratio of two empty strings is 1.0
  _bRef = b;
  const b2j = buildB2J(b);
  const M = totalMatches(a, b, b2j);
  _bRef = null;
  return (2.0 * M) / T;
}

// ---------------------------------------------------------------------
// Tunables — mirror matching.py exactly
// ---------------------------------------------------------------------

export const DURATION_TOLERANCE_MS = 3000;
export const TITLE_SIMILARITY_THRESHOLD = 0.90;
export const CANDIDATE_DURATION_TOLERANCE_MS = 5000;
export const CANDIDATE_SIMILARITY_THRESHOLD = 0.72;

// ---------------------------------------------------------------------
// Title normalisation
// ---------------------------------------------------------------------

// Each entry ports a Python regex. Python used re.IGNORECASE and the
// titles are lowercased first anyway; we use the 'i' flag to match.
// '$' anchors and '.*' behave the same in JS for these single-line
// strings. Order preserved from matching.py.
const NOISE_PATTERNS = [
  /\s*-\s*single version/i,
  /\s*\(single version\)/i,
  /\s*-\s*radio edit/i,
  /\s*\(radio edit\)/i,
  /\s*-\s*album version/i,
  /\s*\(album version\)/i,
  /\s*-\s*mono version/i,
  /\s*\(mono version\)/i,
  /\s*-\s*stereo version/i,
  /\s*\(stereo version\)/i,
  /\s*-\s*bonus track/i,
  /\s*\(bonus track\)/i,
  /\s*-\s*original mix/i,
  /\s*\(original mix\)/i,
  /\s*-\s*.*remaster.*/i,
  /\s*\(.*remaster.*\)/i,
  /\s*-\s*from .*/i,
  /\s*\(feat\.?[^)]*\)/i,
  /\s*\(ft\.?[^)]*\)/i,
  /\s*\(with [^)]*\)/i,
  /\s*-\s*feat\.?.*$/i,
  /\s*-\s*ft\.?.*$/i,
  // A bare trailing "version" after some descriptor is noise: an
  // "Audiotree Live version" and an "Audiotree Live" are the same
  // recording. Specific named versions (album/single/mono/stereo/radio)
  // are already handled above; this catches the rest. Anchored to the
  // end so it only strips a trailing word, never mid-title.
  /\s+version\s*$/i,
];

export function normalizeTitle(title) {
  let t = (title || "").toLowerCase().trim();
  t = t.replace(/\[/g, "(").replace(/\]/g, ")");
  for (const pat of NOISE_PATTERNS) {
    t = t.replace(pat, "");
  }
  t = t.replace(/\s+/g, " ").trim();
  return t;
}

function bracketsToParens(s) {
  return (s || "").replace(/\[/g, "(").replace(/\]/g, ")");
}

// ---------------------------------------------------------------------
// Optional exclusion filters — conservative, annotation-only matches
// ---------------------------------------------------------------------

const LIVE_PATTERNS = [
  /\(live[^)]*\)/i,
  /-\s*live\b.*$/i,
  /\blive at\b/i,
  /\blive from\b/i,
  /\bmtv unplugged\b/i,
];

const CENSORED_PATTERNS = [
  /\(radio edit\)/i,
  /\(radio version\)/i,
  /-\s*radio edit\b/i,
  /-\s*radio version\b/i,
  /\(clean(\s+version)?\)/i,
  /-\s*clean(\s+version)?\s*$/i,
  /\(censored(\s+version)?\)/i,
  /-\s*censored(\s+version)?\s*$/i,
];

const INSTRUMENTAL_PATTERNS = [
  /\(instrumental[^)]*\)/i,
  /-\s*instrumental\s*$/i,
  /-\s*instrumental\s+version\s*$/i,
];

const ACAPPELLA_PATTERNS = [
  /\(a\s*cappella[^)]*\)/i,
  /-\s*a\s*cappella\s*$/i,
];

const REMASTER_PATTERNS = [
  /\(.*remaster(ed)?.*\)/i,
  /-\s*.*remaster(ed)?.*$/i,
];

function anyMatch(patterns, s) {
  return patterns.some((p) => p.test(s));
}

export function isLiveRecording(track) {
  const name = bracketsToParens((track && track.name) || "");
  const albumName = bracketsToParens((track && track.album && track.album.name) || "");
  return anyMatch(LIVE_PATTERNS, name) || anyMatch(LIVE_PATTERNS, albumName);
}

export function isRadioEditOrCensored(track) {
  return anyMatch(CENSORED_PATTERNS, bracketsToParens((track && track.name) || ""));
}

export function isInstrumental(track) {
  return anyMatch(INSTRUMENTAL_PATTERNS, bracketsToParens((track && track.name) || ""));
}

export function isACappella(track) {
  return anyMatch(ACAPPELLA_PATTERNS, bracketsToParens((track && track.name) || ""));
}

export function isRemaster(track) {
  return anyMatch(REMASTER_PATTERNS, bracketsToParens((track && track.name) || ""));
}

function titleSimilarity(a, b) {
  return sequenceRatio(normalizeTitle(a), normalizeTitle(b));
}

// ---------------------------------------------------------------------
// Liked-library indexes
// ---------------------------------------------------------------------

export function buildLikedIndexes(likedTracks) {
  const byId = new Map();
  const byIsrc = new Map();
  for (const t of likedTracks) {
    if (!t) continue;
    byId.set(t.id, t);
    const isrc = t.external_ids && t.external_ids.isrc;
    if (isrc) byIsrc.set(isrc, t);
  }
  return { by_id: byId, by_isrc: byIsrc, all: likedTracks };
}

function artistNameSet(track) {
  const set = new Set();
  for (const a of (track.artists || [])) {
    if (a && a.name) set.add(a.name.toLowerCase());
  }
  return set;
}

function setsIntersect(s1, s2) {
  for (const x of s1) if (s2.has(x)) return true;
  return false;
}

function findFuzzyMatch(t, allLiked, threshold = TITLE_SIMILARITY_THRESHOLD,
                        durationToleranceMs = DURATION_TOLERANCE_MS) {
  const candidateNames = artistNameSet(t);
  let bestMatch = null, bestSim = 0.0;
  for (const lt of allLiked) {
    if (!setsIntersect(candidateNames, artistNameSet(lt))) continue;
    const durDiff = Math.abs((lt.duration_ms || 0) - (t.duration_ms || 0));
    if (durDiff > durationToleranceMs) continue;
    const sim = titleSimilarity(lt.name, t.name);
    if (sim >= threshold && sim > bestSim) {
      bestMatch = lt;
      bestSim = sim;
    }
  }
  if (bestMatch) return [bestMatch, bestSim];
  return [null, null];
}

function passesFilters(t, excludeLive, excludeCensored, excludeInstrumental, excludeAcappella) {
  if (excludeLive && isLiveRecording(t)) return false;
  if (excludeCensored && isRadioEditOrCensored(t)) return false;
  if (excludeInstrumental && isInstrumental(t)) return false;
  if (excludeAcappella && isACappella(t)) return false;
  return true;
}

// ---------------------------------------------------------------------
// Two-phase classification (see matching.py for the full rationale)
// ---------------------------------------------------------------------

export function findCandidates(catalogTracks, likedIndex, opts = {}) {
  const {
    excludeLive = false,
    excludeCensored = false,
    excludeInstrumental = false,
    excludeAcappella = false,
  } = opts;

  const byId = likedIndex.by_id;
  const allLiked = likedIndex.all;

  const alreadyLiked = [];
  const candidates = [];
  const newTracks = [];
  let excludedCount = 0;

  for (const t of catalogTracks) {
    if (!t || !t.id) continue;
    if (!passesFilters(t, excludeLive, excludeCensored, excludeInstrumental, excludeAcappella)) {
      excludedCount++;
      continue;
    }
    if (byId.has(t.id)) {
      alreadyLiked.push(t);
      continue;
    }
    const [matched, sim] = findFuzzyMatch(
      t, allLiked, CANDIDATE_SIMILARITY_THRESHOLD, CANDIDATE_DURATION_TOLERANCE_MS
    );
    if (matched) {
      candidates.push({ track: t, matched_liked_track: matched, similarity: sim });
    } else {
      newTracks.push(t);
    }
  }

  return {
    already_liked: alreadyLiked,
    candidates,
    new_tracks: newTracks,
    excluded_count: excludedCount,
  };
}

function pct(sim) {
  // Mirror Python's f"{sim:.0%}" — round-half-to-even is not required here
  // since matching.py uses default formatting; JS Math.round matches the
  // common cases. Kept as a helper so the basis strings read identically.
  return `${Math.round(sim * 100)}%`;
}

export function confirmCandidates(fullTracks, candidates, likedIndex, opts = {}) {
  const { matchRemasters = false } = opts;
  const byIsrc = likedIndex.by_isrc;
  const allLiked = likedIndex.all;

  const byId = new Map();
  for (const t of fullTracks) {
    if (t && t.id) byId.set(t.id, t);
  }

  const duplicates = [];
  const newTracks = [];

  // Preserve candidate order (Map keeps insertion order, like the Python
  // dict comprehension it mirrors).
  const candidateById = new Map();
  for (const c of candidates) candidateById.set(c.track.id, c);

  for (const [tid, cand] of candidateById) {
    const full = byId.get(tid);
    if (!full) {
      duplicates.push({
        track: cand.track,
        matched_liked_track: cand.matched_liked_track,
        match_basis: `fuzzy (${pct(cand.similarity)} title match)`,
      });
      continue;
    }

    full.album = (cand.track && cand.track.album) || full.album;

    const isrc = full.external_ids && full.external_ids.isrc;

    if (isrc && byIsrc.has(isrc)) {
      duplicates.push({ track: full, matched_liked_track: byIsrc.get(isrc), match_basis: "isrc" });
    } else if (!isrc) {
      const [matched, sim] = findFuzzyMatch(full, allLiked);
      if (matched) {
        duplicates.push({ track: full, matched_liked_track: matched, match_basis: `fuzzy (${pct(sim)} title match)` });
      } else {
        newTracks.push(full);
      }
    } else if (matchRemasters && isRemaster(full)) {
      const [matched, sim] = findFuzzyMatch(full, allLiked);
      if (matched) {
        duplicates.push({ track: full, matched_liked_track: matched, match_basis: `remaster (${pct(sim)} title match)` });
      } else {
        newTracks.push(full);
      }
    } else {
      newTracks.push(full);
    }
  }

  return { duplicate_candidates: duplicates, new_tracks: newTracks };
}

// ---------------------------------------------------------------------
// Duplicate-recording collapse (fixes the playlist duplicates bug)
// ---------------------------------------------------------------------

/**
 * The catalog often carries the SAME recording on more than one release
 * — e.g. an Audiotree session track released both as a standalone
 * single and on the session EP. Those are different Spotify track IDs,
 * so deduping by ID (which the playlist builder does) can't catch them,
 * and both end up in the generated playlist.
 *
 * findCandidates() compares each catalog track against the user's
 * LIBRARY, but never against the other catalog tracks — so two releases
 * of one recording both fall through to new_tracks. This collapses them.
 *
 * Grouping key, in order of confidence:
 *   1. ISRC when both tracks have one (authoritative — same ISRC is the
 *      same recording, which is DeepDive's whole premise).
 *   2. Otherwise normalized title + duration bucket + shared artist.
 *      Deliberately conservative: the duration must be within
 *      DUPLICATE_DURATION_TOLERANCE_MS, so two genuinely different
 *      recordings that merely share a title (a studio cut and a live
 *      version of very similar length) are only collapsed if they're
 *      also near-identical in length.
 *
 * Note ISRCs are usually ABSENT here: the two-phase design only fetches
 * real ISRCs for candidates, not for every catalog track. So in practice
 * this mostly runs on the title/duration path — which is why that path
 * is written conservatively. Callers that want ISRC precision should
 * enrich the tracks first (see collapseNeedsIsrc()).
 */

// Tighter than the general fuzzy tolerance: we're deciding whether two
// releases carry the SAME recording, not whether two songs are similar.
export const DUPLICATE_DURATION_TOLERANCE_MS = 2000;

// Titles for the same recording often differ by a trailing word or two
// ("- Audiotree Live" vs "- Audiotree Live version"), which an exact
// normalized-string key can't group. A second fuzzy pass catches those.
//
// The threshold is set from real measurements rather than guessed:
//   "…Audiotree Live" vs "…Audiotree Live version"  -> 0.897  (SAME)
//   "Who's Laughing Now" vs "…- Audiotree Live"     -> 0.679  (DIFFERENT)
// A wide gap, so 0.85 clears the duplicate comfortably while leaving
// studio-vs-live well outside. Note the general fuzzy threshold (0.90)
// would have missed the real case by 0.003 — hence a separate constant.
export const DUPLICATE_TITLE_THRESHOLD = 0.85;

function releaseRank(t) {
  // Lower is more canonical. Prefer an album-type release over a single
  // or compilation, then prefer the earliest release date.
  const type = (t.album && t.album.album_type) || "";
  const typeRank = type === "album" ? 0 : type === "single" ? 1 : 2;
  const date = (t.album && t.album.release_date) || "9999";
  return { typeRank, date };
}

/**
 * Picks which of several releases of the same recording to keep.
 * Prefers the earliest album-type release, falling back to the earliest
 * release of any type. (Not simply "album beats everything": a
 * standalone single that later appears on a compilation should keep the
 * single, which the date tiebreak handles.)
 */
function pickCanonical(tracks) {
  return tracks.slice().sort((a, b) => {
    const ra = releaseRank(a), rb = releaseRank(b);
    if (ra.typeRank !== rb.typeRank) return ra.typeRank - rb.typeRank;
    if (ra.date !== rb.date) return ra.date.localeCompare(rb.date);
    return 0; // stable: keep original order
  })[0];
}

/**
 * Collapses tracks that are the same recording on different releases.
 *
 * @returns { tracks, collapsedCount, groups }
 *   tracks         — one per recording, canonical release chosen
 *   collapsedCount — how many were removed (for "6 duplicates excluded")
 *   groups         — the removed alternatives, keyed by kept track id,
 *                    so a UI could offer a different release later
 */
export function collapseDuplicateRecordings(tracks) {
  const byKey = new Map();

  for (const t of tracks) {
    if (!t || !t.id) continue;
    const isrc = (t.external_ids || {}).isrc;
    let key;
    if (isrc) {
      key = `isrc:${isrc}`;
    } else {
      // Bucket the duration so near-identical lengths group together
      // without a fragile exact-match.
      const bucket = Math.round((t.duration_ms || 0) / DUPLICATE_DURATION_TOLERANCE_MS);
      const artist = ((t.artists || [])[0]?.name || "").toLowerCase();
      key = `t:${normalizeTitle(t.name || "")}|${artist}|${bucket}`;
    }
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(t);
  }

  const kept = [];
  const groups = {};
  let collapsedCount = 0;

  for (const group of byKey.values()) {
    if (group.length === 1) {
      kept.push(group[0]);
      continue;
    }
    const canonical = pickCanonical(group);
    kept.push(canonical);
    groups[canonical.id] = group.filter((t) => t.id !== canonical.id);
    collapsedCount += group.length - 1;
  }

  // ---- Pass 2: fuzzy title merge --------------------------------
  // Pass 1 requires an exact normalized-title match, which misses pairs
  // that differ by a trailing word ("Audiotree Live" vs "Audiotree Live
  // version"). Compare the survivors directly: same artist, duration
  // within tolerance, and a high title similarity.
  //
  // Two hard guards, so this can't over-collapse:
  //   - Tracks with DIFFERENT ISRCs are never merged. A differing ISRC
  //     is authoritative evidence of a different recording (this is what
  //     keeps remasters separate from originals).
  //   - Duration is compared directly, not bucketed, so a pair can't
  //     merge just by landing in the same bucket.
  const merged = [];
  const absorbed = new Set();

  for (let i = 0; i < kept.length; i++) {
    const a = kept[i];
    if (absorbed.has(a.id)) continue;
    const cluster = [a];

    for (let j = i + 1; j < kept.length; j++) {
      const b = kept[j];
      if (absorbed.has(b.id)) continue;

      const isrcA = (a.external_ids || {}).isrc;
      const isrcB = (b.external_ids || {}).isrc;
      if (isrcA && isrcB && isrcA !== isrcB) continue; // definitively different

      if (!setsIntersect(artistNameSet(a), artistNameSet(b))) continue;
      const durDiff = Math.abs((a.duration_ms || 0) - (b.duration_ms || 0));
      if (durDiff > DUPLICATE_DURATION_TOLERANCE_MS) continue;

      const sim = sequenceRatio(normalizeTitle(a.name || ""), normalizeTitle(b.name || ""));
      if (sim < DUPLICATE_TITLE_THRESHOLD) continue;

      cluster.push(b);
      absorbed.add(b.id);
    }

    if (cluster.length === 1) {
      merged.push(a);
      continue;
    }
    const canonical = pickCanonical(cluster);
    merged.push(canonical);
    const others = cluster.filter((t) => t.id !== canonical.id);
    groups[canonical.id] = (groups[canonical.id] || []).concat(others);
    // Carry over any alternatives already recorded for absorbed tracks.
    for (const o of others) {
      if (groups[o.id]) {
        groups[canonical.id] = groups[canonical.id].concat(groups[o.id]);
        delete groups[o.id];
      }
    }
    collapsedCount += cluster.length - 1;
  }

  // Preserve the original ordering of whichever track was kept.
  const order = new Map(tracks.map((t, i) => [t.id, i]));
  merged.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

  return { tracks: merged, collapsedCount, groups };
}

/**
 * Duration-bucketing can miss a pair that straddles a bucket boundary
 * (e.g. 3:59.9 and 4:00.1). This returns groups of tracks that look like
 * possible duplicates by title+artist but weren't collapsed, so a caller
 * can fetch real ISRCs for just those few and re-collapse precisely —
 * the same two-phase approach used for candidate matching, rather than
 * fetching ISRCs for the entire catalog.
 */
export function collapseNeedsIsrc(tracks) {
  const byTitle = new Map();
  for (const t of tracks) {
    if (!t || !t.id) continue;
    if ((t.external_ids || {}).isrc) continue; // already precise
    const artist = ((t.artists || [])[0]?.name || "").toLowerCase();
    const key = `${normalizeTitle(t.name || "")}|${artist}`;
    if (!byTitle.has(key)) byTitle.set(key, []);
    byTitle.get(key).push(t);
  }
  return Array.from(byTitle.values()).filter((g) => g.length > 1);
}
