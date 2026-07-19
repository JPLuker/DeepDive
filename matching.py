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

# Duration tolerance (milliseconds) and title-similarity threshold used
# for the FINAL fuzzy decision — i.e. when a track has no ISRC at all
# (rare) or is a remaster being matched by the opt-in toggle. There's no
# ISRC to arbitrate here, so this stays conservative to avoid wrongly
# flagging two different songs as duplicates.
DURATION_TOLERANCE_MS = 3000
TITLE_SIMILARITY_THRESHOLD = 0.90

# Looser tolerance/threshold used only to decide whether a catalog track
# is worth an ISRC lookup at all (matching.find_candidates, phase 1 of
# the two-phase flow). Being generous here is cheap and safe: ISRC is
# the real arbiter in phase 2, so a track that clears this loose bar but
# turns out to be a different recording just gets correctly classified
# as new. A track that DOESN'T clear this bar never gets its ISRC
# checked at all, so being too strict here is what actually causes
# missed duplicates — e.g. a single adding "(feat. Someone)" to a title
# that wasn't on the liked album cut.
CANDIDATE_DURATION_TOLERANCE_MS = 5000
CANDIDATE_SIMILARITY_THRESHOLD = 0.72

# Suffixes/parentheticals that don't change the underlying recording.
# Covers both "- Suffix" and "(Suffix)" styles, since Spotify uses both
# inconsistently across releases of the same recording.
_NOISE_PATTERNS = [
    r"\s*-\s*single version",
    r"\s*\(single version\)",
    r"\s*-\s*radio edit",
    r"\s*\(radio edit\)",
    r"\s*-\s*album version",
    r"\s*\(album version\)",
    r"\s*-\s*mono version",
    r"\s*\(mono version\)",
    r"\s*-\s*stereo version",
    r"\s*\(stereo version\)",
    r"\s*-\s*bonus track",
    r"\s*\(bonus track\)",
    r"\s*-\s*original mix",
    r"\s*\(original mix\)",
    r"\s*-\s*.*remaster.*",
    r"\s*\(.*remaster.*\)",
    r"\s*-\s*from .*",
    # Featured-artist / collaborator credits — these get added, dropped,
    # or reworded between an album cut and its single/reissue without
    # changing the underlying recording.
    r"\s*\(feat\.?[^)]*\)",
    r"\s*\(ft\.?[^)]*\)",
    r"\s*\(with [^)]*\)",
    r"\s*-\s*feat\.?.*$",
    r"\s*-\s*ft\.?.*$",
]


def normalize_title(title: str) -> str:
    t = title.lower().strip()
    # Normalize bracket style so "[Live]" and "(Live)" match the same
    # noise patterns.
    t = t.replace("[", "(").replace("]", ")")
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

_INSTRUMENTAL_PATTERNS = [
    re.compile(r"\(instrumental[^)]*\)", re.IGNORECASE),
    re.compile(r"-\s*instrumental\s*$", re.IGNORECASE),
    re.compile(r"-\s*instrumental\s+version\s*$", re.IGNORECASE),
]

_ACAPPELLA_PATTERNS = [
    re.compile(r"\(a\s*cappella[^)]*\)", re.IGNORECASE),
    re.compile(r"-\s*a\s*cappella\s*$", re.IGNORECASE),
]

_REMASTER_PATTERNS = [
    re.compile(r"\(.*remaster(ed)?.*\)", re.IGNORECASE),
    re.compile(r"-\s*.*remaster(ed)?.*$", re.IGNORECASE),
]


def _brackets_to_parens(s: str) -> str:
    return s.replace("[", "(").replace("]", ")")


def is_live_recording(track: dict) -> bool:
    name = _brackets_to_parens(track.get("name", "") or "")
    album_name = _brackets_to_parens((track.get("album") or {}).get("name", "") or "")
    return any(p.search(name) for p in _LIVE_PATTERNS) or any(p.search(album_name) for p in _LIVE_PATTERNS)


def is_radio_edit_or_censored(track: dict) -> bool:
    name = _brackets_to_parens(track.get("name", "") or "")
    return any(p.search(name) for p in _CENSORED_PATTERNS)


def is_instrumental(track: dict) -> bool:
    name = _brackets_to_parens(track.get("name", "") or "")
    return any(p.search(name) for p in _INSTRUMENTAL_PATTERNS)


def is_a_cappella(track: dict) -> bool:
    name = _brackets_to_parens(track.get("name", "") or "")
    return any(p.search(name) for p in _ACAPPELLA_PATTERNS)


def is_remaster(track: dict) -> bool:
    name = _brackets_to_parens(track.get("name", "") or "")
    return any(p.search(name) for p in _REMASTER_PATTERNS)


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


def _find_fuzzy_match(
    t: dict,
    all_liked: list[dict],
    threshold: float = TITLE_SIMILARITY_THRESHOLD,
    duration_tolerance_ms: int = DURATION_TOLERANCE_MS,
):
    """Looks for a liked track by the same artist, within duration
    tolerance, with a high-confidence title match. Returns (matched_liked,
    similarity) or (None, None).

    threshold/duration_tolerance_ms default to the strict, final-decision
    values (used when there's no ISRC to arbitrate). Phase 1 candidate
    selection deliberately passes looser values — see CANDIDATE_* above.
    When multiple liked tracks clear the bar, the closest title match
    wins rather than just the first one encountered.
    """
    candidate_artist_names = {a["name"].lower() for a in t.get("artists", [])}
    best_match, best_sim = None, 0.0
    for lt in all_liked:
        lt_artist_names = {a["name"].lower() for a in lt.get("artists", [])}
        if not (candidate_artist_names & lt_artist_names):
            continue
        dur_diff = abs((lt.get("duration_ms") or 0) - (t.get("duration_ms") or 0))
        if dur_diff > duration_tolerance_ms:
            continue
        sim = _title_similarity(lt["name"], t["name"])
        if sim >= threshold and sim > best_sim:
            best_match, best_sim = lt, sim
    if best_match:
        return best_match, best_sim
    return None, None

# ---------------------------------------------------------------------
# Two-phase classification (February 2026 API)
#
# Before Feb 2026, DeepDive fetched the artist's whole catalog as full
# track objects (50 at a time via GET /tracks?ids=), so every catalog
# track arrived with its ISRC already attached and one pass could sort
# everything out.
#
# That batch endpoint is gone for Development Mode apps. ISRC now only
# comes from GET /tracks/{id} — one request per track — so reading it
# for an entire catalog is not affordable.
#
# The way out is noticing that ISRC is only ever load-bearing for one
# question: "is this catalog track the same *recording* as something I
# already liked, or a different recording of the same song?" For a
# track that resembles nothing in your library, ISRC changes nothing —
# it's new either way.
#
# So:
#   Phase 1 (find_candidates)  — free. Uses only simplified track data
#       from album responses. Anything resembling a liked track (same
#       artist, near-identical title, similar duration) becomes a
#       *candidate*. Everything else is definitively new.
#   Phase 2 (confirm_candidates) — costs one request per candidate, and
#       candidates are few (you've liked maybe 5-20 tracks per artist).
#       Real ISRCs decide duplicate vs. different recording.
#
# Honest trade-off: previously an ISRC match could catch a duplicate
# whose title differed from the liked version. Now a track has to look
# similar enough to become a candidate before its ISRC is ever checked.
# Title normalisation plus the duration window make that rare, but it
# is a real (small) loss of recall, accepted to keep the feature
# viable at all.
# ---------------------------------------------------------------------


def _passes_filters(t, exclude_live, exclude_censored, exclude_instrumental, exclude_acappella):
    if exclude_live and is_live_recording(t):
        return False
    if exclude_censored and is_radio_edit_or_censored(t):
        return False
    if exclude_instrumental and is_instrumental(t):
        return False
    if exclude_acappella and is_a_cappella(t):
        return False
    return True


def find_candidates(
    catalog_tracks: list[dict],
    liked_index: dict,
    exclude_live: bool = False,
    exclude_censored: bool = False,
    exclude_instrumental: bool = False,
    exclude_acappella: bool = False,
) -> dict:
    """
    Phase 1. Works on SIMPLIFIED track objects (no ISRC) — costs nothing
    beyond the album reads already done.

    Returns:
      already_liked   - literally already in Liked Songs (matched by id)
      candidates      - [{"track", "matched_liked_track", "similarity"}]
                        plausible duplicates, pending ISRC confirmation
      new_tracks      - resemble nothing liked; definitively new, and
                        never need an ISRC lookup
      excluded_count  - dropped by the filters

    Each catalog track is evaluated independently. Earlier versions
    additionally collapsed tracks sharing a (normalised title, exact
    duration) key, on the theory that the same song across album +
    deluxe + single should show up once — but that collapsing dropped
    the LATER entry unconditionally, before it was even classified. If
    two different *unliked* releases of the same recording happened to
    share that key (common for self-released singles reusing the exact
    same master), only the first one ever got evaluated; the second
    vanished from the results entirely — not shown as a match, not
    shown as new, nothing. That's a real failure, not the cosmetic
    annoyance it was meant to avoid, so this dedup is gone. The mild
    downside is a genuinely new song released three different ways can
    now show up as three separate "new" entries instead of one — worth
    it to guarantee nothing catalog-side is ever silently dropped.
    """
    by_id = liked_index["by_id"]
    all_liked = liked_index["all"]

    already_liked = []
    candidates = []
    new_tracks = []
    excluded_count = 0

    for t in catalog_tracks:
        if not t or not t.get("id"):
            continue
        if not _passes_filters(t, exclude_live, exclude_censored,
                               exclude_instrumental, exclude_acappella):
            excluded_count += 1
            continue

        if t["id"] in by_id:
            already_liked.append(t)
            continue

        matched, sim = _find_fuzzy_match(
            t, all_liked,
            threshold=CANDIDATE_SIMILARITY_THRESHOLD,
            duration_tolerance_ms=CANDIDATE_DURATION_TOLERANCE_MS,
        )
        if matched:
            candidates.append({"track": t, "matched_liked_track": matched, "similarity": sim})
        else:
            new_tracks.append(t)

    return {
        "already_liked": already_liked,
        "candidates": candidates,
        "new_tracks": new_tracks,
        "excluded_count": excluded_count,
    }


def confirm_candidates(
    full_tracks: list[dict],
    candidates: list[dict],
    liked_index: dict,
    match_remasters: bool = False,
) -> dict:
    """
    Phase 2. `full_tracks` are the candidates re-fetched via
    GET /tracks/{id}, so they carry real ISRCs.

    Returns:
      duplicate_candidates - [{"track", "matched_liked_track", "match_basis"}]
                             confirmed same recording -> offer to like
      new_tracks           - looked similar but ISRC says it's a
                             different recording (remaster, live take,
                             re-recording) -> genuinely new
    """
    by_isrc = liked_index["by_isrc"]
    all_liked = liked_index["all"]

    by_id = {t["id"]: t for t in full_tracks if t and t.get("id")}
    candidate_by_id = {c["track"]["id"]: c for c in candidates}

    duplicates = []
    new_tracks = []

    for tid, cand in candidate_by_id.items():
        full = by_id.get(tid)
        if not full:
            # Couldn't re-fetch it (transient failure). Fall back to the
            # phase-1 fuzzy match rather than dropping the track — same
            # confidence level the ISRC-less path has always had.
            duplicates.append({
                "track": cand["track"],
                "matched_liked_track": cand["matched_liked_track"],
                "match_basis": f"fuzzy ({cand['similarity']:.0%} title match)",
            })
            continue

        # Keep the album info from phase 1: GET /tracks/{id} returns its
        # own album object, but phase 1's is what the UI already showed.
        full["album"] = cand["track"].get("album") or full.get("album")

        isrc = (full.get("external_ids") or {}).get("isrc")

        if isrc and isrc in by_isrc:
            duplicates.append({
                "track": full,
                "matched_liked_track": by_isrc[isrc],
                "match_basis": "isrc",
            })
        elif not isrc:
            matched, sim = _find_fuzzy_match(full, all_liked)
            if matched:
                duplicates.append({
                    "track": full,
                    "matched_liked_track": matched,
                    "match_basis": f"fuzzy ({sim:.0%} title match)",
                })
            else:
                new_tracks.append(full)
        elif match_remasters and is_remaster(full):
            matched, sim = _find_fuzzy_match(full, all_liked)
            if matched:
                duplicates.append({
                    "track": full,
                    "matched_liked_track": matched,
                    "match_basis": f"remaster ({sim:.0%} title match)",
                })
            else:
                new_tracks.append(full)
        else:
            # Has an ISRC, and it isn't one we've liked -> a different
            # recording of a song we know. Genuinely new.
            new_tracks.append(full)

    return {"duplicate_candidates": duplicates, "new_tracks": new_tracks}
