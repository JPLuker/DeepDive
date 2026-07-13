"""
Matching logic: decide whether a track from an artist's discography
is (a) already liked, (b) the same recording as something already liked
(e.g. liked on the album, but this is the standalone single/EP version),
or (c) genuinely new.

Primary signal: ISRC (International Standard Recording Code). This is
attached per-recording and is usually shared across re-releases of the
exact same recording (album cut reused on a single/EP/compilation).
It is NOT shared across genuinely different recordings (remixes, live
versions, remasters with a new master, acoustic versions, etc.) which
is exactly the distinction we want.

Fallback signal (used only when a track has no ISRC, which happens
occasionally): normalized title + duration tolerance, restricted to
the same primary artist.
"""

import re
from difflib import SequenceMatcher

# Duration tolerance for fallback fuzzy matching (milliseconds)
DURATION_TOLERANCE_MS = 3000

# Similarity threshold for fallback title matching
TITLE_SIMILARITY_THRESHOLD = 0.90

# Suffixes/parentheticals that don't change the underlying recording
_NOISE_PATTERNS = [
    r"\s*-\s*single version",
    r"\s*-\s*radio edit",
    r"\s*-\s*album version",
    r"\s*-\s*mono version",
    r"\s*-\s*stereo version",
    r"\s*-\s*bonus track",
    r"\s*-\s*.*remaster.*",
    r"\s*\(.*remaster.*\)",
    r"\s*-\s*from .*",
]


def normalize_title(title: str) -> str:
    t = title.lower().strip()
    for pat in _NOISE_PATTERNS:
        t = re.sub(pat, "", t, flags=re.IGNORECASE)
    t = re.sub(r"\s+", " ", t).strip()
    return t


# Patterns for optional filtering. Deliberately conservative (require the
# word to appear as a parenthetical/suffix annotation, not a bare word
# match) to avoid false positives on song titles that legitimately contain
# these words, e.g. Taylor Swift's "Clean" or Fleetwood Mac's "Live Life".
_LIVE_PATTERNS = [
    re.compile(r"\(live[^)]*\)", re.IGNORECASE),
    re.compile(r"-\s*live\b.*$", re.IGNORECASE),
    re.compile(r"\blive at\b", re.IGNORECASE),
    re.compile(r"\blive from\b", re.IGNORECASE),
    re.compile(r"\bmtv unplugged\b", re.IGNORECASE),
]

_CENSORED_PATTERNS = [
    re.compile(r"\(radio edit\)", re.IGNORECASE),
    re.compile(r"\(radio version\)", re.IGNORECASE),
    re.compile(r"-\s*radio edit\b", re.IGNORECASE),
    re.compile(r"-\s*radio version\b", re.IGNORECASE),
    re.compile(r"\(clean(\s+version)?\)", re.IGNORECASE),
    re.compile(r"-\s*clean(\s+version)?\s*$", re.IGNORECASE),
    re.compile(r"\(censored(\s+version)?\)", re.IGNORECASE),
    re.compile(r"-\s*censored(\s+version)?\s*$", re.IGNORECASE),
]


def is_live_recording(track: dict) -> bool:
    name = track.get("name", "") or ""
    album_name = (track.get("album") or {}).get("name", "") or ""
    return any(p.search(name) for p in _LIVE_PATTERNS) or any(p.search(album_name) for p in _LIVE_PATTERNS)


def is_radio_edit_or_censored(track: dict) -> bool:
    name = track.get("name", "") or ""
    return any(p.search(name) for p in _CENSORED_PATTERNS)


def _title_similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, normalize_title(a), normalize_title(b)).ratio()


def build_liked_indexes(liked_tracks: list[dict]) -> dict:
    """
    liked_tracks: list of Spotify track objects (full objects, as returned
    by /me/tracks) already flattened (item['track']).

    Returns dict with:
      by_id: {track_id: track}
      by_isrc: {isrc: track}
      all: list of tracks (for fallback fuzzy scan)
    """
    by_id = {}
    by_isrc = {}
    for t in liked_tracks:
        if not t:
            continue
        by_id[t["id"]] = t
        isrc = (t.get("external_ids") or {}).get("isrc")
        if isrc:
            by_isrc[isrc] = t
    return {"by_id": by_id, "by_isrc": by_isrc, "all": liked_tracks}


def classify_tracks(
    artist_tracks: list[dict],
    liked_index: dict,
    exclude_live: bool = False,
    exclude_censored: bool = False,
) -> dict:
    """
    Classifies each track from the artist's discography into:
      - already_liked: track is literally already in the user's Liked Songs
      - duplicate_candidates: not liked directly, but the same recording
        (via ISRC or high-confidence fuzzy match) IS already liked under
        a different release -> candidate to auto-like
      - new_tracks: no match at all -> genuinely new, candidate for playlist

    If exclude_live/exclude_censored are set, matching tracks are dropped
    entirely before classification — they won't appear as matches OR as
    new-track suggestions.

    Deduplicates artist_tracks by ISRC (or normalized title if no ISRC)
    first, so the same recording appearing on album + deluxe + compilation
    only shows up once.
    """
    by_id = liked_index["by_id"]
    by_isrc = liked_index["by_isrc"]
    all_liked = liked_index["all"]

    already_liked = []
    duplicate_candidates = []
    new_tracks = []
    excluded_count = 0

    seen_keys = set()

    for t in artist_tracks:
        if not t or not t.get("id"):
            continue
        if exclude_live and is_live_recording(t):
            excluded_count += 1
            continue
        if exclude_censored and is_radio_edit_or_censored(t):
            excluded_count += 1
            continue

        if t["id"] in by_id:
            already_liked.append(t)
            continue

        isrc = (t.get("external_ids") or {}).get("isrc")
        dedupe_key = isrc if isrc else normalize_title(t["name"])
        if dedupe_key in seen_keys:
            continue

        matched_liked = None
        match_basis = None

        if isrc and isrc in by_isrc:
            matched_liked = by_isrc[isrc]
            match_basis = "isrc"
        elif not isrc:
            # Fallback fuzzy match against liked tracks by the same artist
            candidate_artist_names = {a["name"].lower() for a in t.get("artists", [])}
            for lt in all_liked:
                lt_artist_names = {a["name"].lower() for a in lt.get("artists", [])}
                if not (candidate_artist_names & lt_artist_names):
                    continue
                dur_diff = abs((lt.get("duration_ms") or 0) - (t.get("duration_ms") or 0))
                if dur_diff > DURATION_TOLERANCE_MS:
                    continue
                sim = _title_similarity(lt["name"], t["name"])
                if sim >= TITLE_SIMILARITY_THRESHOLD:
                    matched_liked = lt
                    match_basis = f"fuzzy ({sim:.0%} title match)"
                    break

        seen_keys.add(dedupe_key)

        if matched_liked:
            duplicate_candidates.append({
                "track": t,
                "matched_liked_track": matched_liked,
                "match_basis": match_basis,
            })
        else:
            new_tracks.append(t)

    return {
        "already_liked": already_liked,
        "duplicate_candidates": duplicate_candidates,
        "new_tracks": new_tracks,
        "excluded_count": excluded_count,
    }
