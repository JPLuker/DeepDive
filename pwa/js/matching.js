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
