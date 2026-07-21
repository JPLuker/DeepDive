"""
Spotify Web API client, written against the **February 2026 Dev Mode**
API surface (see Spotify's "February 2026 Web API Dev Mode Changes"
migration guide).

Why this file talks to the API directly instead of using spotipy's
convenience methods: as of the Feb 2026 changes, Development Mode apps
lost access to every batch/bulk endpoint, several endpoints were
renamed, and library writes moved to a new generic endpoint. spotipy's
methods still target the old shapes, so calling them produces 403s.
Requests are built here explicitly so what's on the wire is exactly
what the current API expects.

What changed, and how this file handles it:

  Removed (403 for Dev Mode apps)   ->  What's used instead
  --------------------------------------------------------------------
  GET  /tracks?ids=                     GET /tracks/{id}   (one by one)
  GET  /albums?ids=                     GET /albums/{id}   (one by one)
  GET  /artists?ids=                    GET /artists/{id}  (one by one)
  PUT  /me/tracks                       PUT /me/library?uris=  (40 max)
  POST /users/{id}/playlists            POST /me/playlists
  POST /playlists/{id}/tracks           POST /playlists/{id}/items
  GET  /playlists/{id}/tracks           GET  /playlists/{id}/items

  Limit changes
  --------------------------------------------------------------------
  GET /search                           max 10 (was 50), default 5
  GET /artists/{id}/albums              max 10 (was 50), default 5
  GET /me/tracks                        max 50 (unchanged)

  Field changes
  --------------------------------------------------------------------
  artist.popularity                     removed
  playlist.tracks                       renamed -> playlist.items
  playlist item .track                  renamed -> .item (both still
                                        present in the schema; .item is
                                        read first with a fallback)
  track.external_ids (ISRC)             REMOVED THEN REVERTED — still
                                        present, which is why DeepDive's
                                        ISRC matching still works at all

The expensive consequence: ISRC only comes back on *full* track objects
(GET /tracks/{id}), never on the simplified track objects inside album
responses. With batch fetches gone, reading ISRC for a whole catalog
would be one request per track. See get_artist_catalog_tracks() and
get_tracks_with_isrc() for how that's avoided.
"""

import threading
import time

import requests
import requests.exceptions
import spotipy
from spotipy.exceptions import SpotifyException
from spotipy.oauth2 import SpotifyOAuth

SCOPE = (
    "user-library-read user-library-modify playlist-read-private "
    "playlist-modify-private playlist-modify-public user-top-read "
    "user-read-recently-played"
)

API_BASE = "https://api.spotify.com/v1/"

# Per the Feb 2026 API schema. These are not guesses — they're read
# straight from Spotify's published OpenAPI spec.
SEARCH_LIMIT_MAX = 10          # was 50
ARTIST_ALBUMS_LIMIT_MAX = 10   # was 50
LIKED_TRACKS_LIMIT_MAX = 50    # unchanged
LIBRARY_SAVE_URIS_MAX = 40     # PUT /me/library
PLAYLIST_ADD_URIS_MAX = 100    # POST /playlists/{id}/items
PLAYLIST_ITEMS_LIMIT_MAX = 50

# Shared session so a long paginated read isn't paying for a fresh
# TCP + TLS handshake on every single request.
_session = requests.Session()

REQUEST_TIMEOUT = 20
MAX_ATTEMPTS = 4
RETRY_BASE_DELAY = 1.5

# 429 is a normal, expected condition now that batch endpoints are gone
# and everything costs more requests. Spotify tells us how long to wait
# via Retry-After; honour it rather than hammering.
MAX_RATE_LIMIT_ATTEMPTS = 6
MAX_RATE_LIMIT_WAIT_SECONDS = 90

# Hard per-attempt ceiling, enforced independently of REQUEST_TIMEOUT.
HARD_CALL_TIMEOUT = 25


def make_oauth(client_id, client_secret, redirect_uri, cache_path=".cache-deepdive"):
    return SpotifyOAuth(
        client_id=client_id,
        client_secret=client_secret,
        redirect_uri=redirect_uri,
        scope=SCOPE,
        cache_path=cache_path,
        show_dialog=False,
    )


def get_client(token_info) -> spotipy.Spotify:
    # spotipy is still used for OAuth/token handling, which the Feb 2026
    # changes didn't touch. Its API *methods* are not used — see the
    # module docstring.
    return spotipy.Spotify(auth=token_info["access_token"], requests_timeout=REQUEST_TIMEOUT)


def _chunk(lst, size):
    for i in range(0, len(lst), size):
        yield lst[i:i + size]


def _run_with_hard_timeout(fn, timeout_seconds, *args, **kwargs):
    """Wall-clock deadline via a daemon thread, so a hung call can never
    block the process from exiting."""
    holder = {}

    def _run():
        try:
            holder["result"] = fn(*args, **kwargs)
        except Exception as err:
            holder["error"] = err

    worker = threading.Thread(target=_run, daemon=True)
    worker.start()
    worker.join(timeout=timeout_seconds)

    if worker.is_alive():
        raise TimeoutError(f"Request took longer than {timeout_seconds}s and was abandoned.")
    if "error" in holder:
        raise holder["error"]
    return holder["result"]


def _call(fn, *args, **kwargs):
    """Retries transient failures (timeouts, connection errors, 5xx) and
    rate limits (429, honouring Retry-After). Anything else raises
    immediately — a 403 from a removed endpoint will never succeed on
    retry, so failing fast surfaces it instead of hiding it."""
    attempt = 0
    rate_limit_attempts = 0
    while True:
        attempt += 1
        try:
            return _run_with_hard_timeout(fn, HARD_CALL_TIMEOUT, *args, **kwargs)
        except (requests.exceptions.Timeout, requests.exceptions.ConnectionError, TimeoutError):
            if attempt >= MAX_ATTEMPTS:
                raise
            time.sleep(RETRY_BASE_DELAY * attempt)
        except SpotifyException as e:
            if e.http_status == 429:
                rate_limit_attempts += 1
                if rate_limit_attempts > MAX_RATE_LIMIT_ATTEMPTS:
                    raise
                retry_after = (e.headers or {}).get("Retry-After")
                try:
                    wait = min(float(retry_after), MAX_RATE_LIMIT_WAIT_SECONDS)
                except (TypeError, ValueError):
                    wait = 15
                time.sleep(wait)
            elif e.http_status in (500, 502, 503, 504):
                if attempt >= MAX_ATTEMPTS:
                    raise
                time.sleep(RETRY_BASE_DELAY * attempt)
            else:
                raise


def _request(sp, method, path_or_url, params=None, json_body=None):
    """One request. Raises SpotifyException on error to match what the
    retry logic expects."""
    url = path_or_url if path_or_url.startswith("http") else API_BASE + path_or_url
    headers = {"Authorization": f"Bearer {sp._auth}"}
    if json_body is not None:
        headers["Content-Type"] = "application/json"
    resp = _session.request(
        method, url, params=params, json=json_body,
        headers=headers, timeout=REQUEST_TIMEOUT,
    )
    if resp.status_code >= 400:
        try:
            err = resp.json().get("error", {})
            msg, reason = err.get("message"), err.get("reason")
        except ValueError:
            msg, reason = (resp.text or None), None
        raise SpotifyException(resp.status_code, -1, f"{resp.url}: {msg}",
                               reason=reason, headers=resp.headers)
    if resp.status_code == 204 or not resp.content:
        return None
    return resp.json()


def _get(sp, path_or_url, params=None):
    return _call(_request, sp, "GET", path_or_url, params)


def health_check(sp):
    """Cheap synchronous checks that this token can actually do what a
    search/scrub is about to ask of it. Added after the playlist scope
    bug (v1.7.2) shipped a token that looked fine (had a valid access
    token, refreshed fine) but 403'd on GET /me/playlists a full search
    later, once results were already sitting there ready to confirm.

    Exercises one read from each scope area DeepDive depends on:
      - GET /me                 basic auth is working at all
      - GET /me/tracks?limit=1  user-library-read
      - GET /me/playlists?limit=1  playlist-read-private

    Raises SpotifyException (or a network error) on the first failure;
    callers should run this before starting a long job, not during one,
    so a problem is a few seconds of delay instead of a wasted scan.
    Write scopes (library-modify, playlist-modify-*) aren't tested here
    since there's no side-effect-free way to probe a write endpoint —
    those still surface at confirm time if something's wrong, same as
    before.
    """
    _get(sp, "me")
    _get(sp, "me/tracks", {"limit": 1})
    _get(sp, "me/playlists", {"limit": 1})


# ---------------------------------------------------------------------
# Reads
# ---------------------------------------------------------------------

def get_all_liked_tracks(sp, on_progress=None) -> list[dict]:
    """The user's Liked Songs. These come back as FULL track objects —
    ISRC included — which is what makes matching possible at all now
    that the catalog side can't be read in bulk."""
    tracks = []
    results = _get(sp, "me/tracks", {"limit": LIKED_TRACKS_LIMIT_MAX})
    total = results.get("total", 0) or 1
    while results:
        for item in results["items"]:
            if item.get("track"):
                tracks.append(item["track"])
        if on_progress:
            on_progress(len(tracks), total)
        results = _get(sp, results["next"]) if results.get("next") else None
    return tracks


def find_artist(sp, name: str) -> dict | None:
    """Resolve an artist by name.

    Note: artist.popularity was removed in Feb 2026, so ties between
    same-named artists can no longer be broken by popularity. Spotify's
    own search relevance ordering is used as the fallback instead.
    """
    results = _get(sp, "search", {"q": f'artist:"{name}"', "type": "artist", "limit": 5})
    items = (results.get("artists") or {}).get("items") or []
    if not items:
        results = _get(sp, "search", {"q": name, "type": "artist", "limit": 5})
        items = (results.get("artists") or {}).get("items") or []
    if not items:
        return None
    for a in items:
        if a["name"].lower() == name.lower():
            return a
    return items[0]


def search_artists(sp, query: str, limit: int = 6) -> list[dict]:
    """Live artist search for the search-bar autofill dropdown. Unlike
    find_artist (which resolves ONE artist for an actual scan), this
    returns several candidates as the user types, so it deliberately
    does not filter/rank beyond what Spotify's own relevance ordering
    already gives us -- the person picks the right one visually.
    """
    if not query or not query.strip():
        return []
    results = _get(sp, "search", {"q": query.strip(), "type": "artist", "limit": limit})
    items = (results.get("artists") or {}).get("items") or []
    out = []
    for a in items:
        images = a.get("images") or []
        out.append({
            "id": a.get("id"),
            "name": a.get("name"),
            # Smallest image is plenty for a little autofill row icon.
            "image_url": images[-1]["url"] if images else None,
        })
    return out


def get_artist_album_ids(sp, artist_id: str, on_progress=None) -> list[str]:
    """The artist's own albums/singles/EPs. limit max is 10 as of Feb
    2026 (was 50), so this pages more than it used to."""
    album_ids = []
    results = _get(sp, f"artists/{artist_id}/albums", {
        "include_groups": "album,single",
        "limit": ARTIST_ALBUMS_LIMIT_MAX,
    })
    total = results.get("total", 0) or 1
    while results:
        for a in results["items"]:
            album_ids.append(a["id"])
        if on_progress:
            on_progress(len(album_ids), total)
        results = _get(sp, results["next"]) if results.get("next") else None
    return album_ids


def get_artist_catalog_tracks(sp, artist_id: str, on_progress=None) -> list[dict]:
    """
    Every track across the artist's releases, as SIMPLIFIED track
    objects — meaning **no ISRC**. Album responses have never included
    ISRC; it only appears on full track objects.

    One request per album. That's the unavoidable cost of batch
    endpoints being removed: there's no way to read many albums at once
    any more. Track objects are given a minimal `album` dict so the rest
    of the app (and the results templates) can still show which release
    a track came from.
    """
    album_ids = get_artist_album_ids(sp, artist_id)
    total = len(album_ids) or 1

    tracks = []
    seen = set()
    for i, album_id in enumerate(album_ids, start=1):
        album = _get(sp, f"albums/{album_id}")
        album_ref = {
            "id": album.get("id"),
            "name": album.get("name"),
            "release_date": album.get("release_date"),
        }

        page = album.get("tracks") or {}
        while page:
            for t in page.get("items", []):
                if t.get("id") and t["id"] not in seen:
                    seen.add(t["id"])
                    t["album"] = album_ref
                    tracks.append(t)
            # Albums with more tracks than one page (box sets etc.)
            page = _get(sp, page["next"]) if page.get("next") else None

        if on_progress:
            on_progress(i, total)
    return tracks


def get_track_with_isrc(sp, track_id: str) -> dict | None:
    """One full track object (ISRC included). GET /tracks/{id} is the
    only remaining way to read ISRC for a catalog track."""
    return _get(sp, f"tracks/{track_id}")


def get_tracks_with_isrc(sp, track_ids: list[str], on_progress=None) -> list[dict]:
    """Full track objects, one request each.

    Deliberately NOT called for a whole catalog — that would be
    hundreds of requests per artist. Only ever called for the small set
    of tracks already narrowed down to plausible duplicates, where ISRC
    is what actually decides the answer. See matching.find_candidates().
    """
    total = len(track_ids) or 1
    full = []
    for i, tid in enumerate(track_ids, start=1):
        t = get_track_with_isrc(sp, tid)
        if t:
            full.append(t)
        if on_progress:
            on_progress(i, total)
    return full


def get_artists_by_ids(sp, artist_ids: list[str]) -> list[dict]:
    """Artist objects, one request each (GET /artists?ids= is gone).
    Only used for suggestion photos, where the list is ~12."""
    out = []
    for aid in artist_ids:
        try:
            a = _get(sp, f"artists/{aid}")
            if a:
                out.append(a)
        except SpotifyException:
            continue  # a photo isn't worth failing the page over
    return out


def get_top_artists(sp, time_range: str = "medium_term", limit: int = 20) -> list[dict]:
    res = _get(sp, "me/top/artists", {"time_range": time_range, "limit": limit})
    return res.get("items", [])


def get_recently_played_artists(sp, limit: int = 50) -> list[dict]:
    res = _get(sp, "me/player/recently-played", {"limit": limit})
    seen = {}
    for item in res.get("items", []):
        artists = (item.get("track") or {}).get("artists") or []
        if artists and artists[0].get("id") and artists[0]["id"] not in seen:
            seen[artists[0]["id"]] = {"id": artists[0]["id"], "name": artists[0]["name"]}
    return list(seen.values())


def get_distinct_liked_artists(liked_tracks: list[dict]) -> list[dict]:
    """Distinct primary artists across Liked Songs, in order of first
    appearance. Pure local work — no API calls."""
    seen = {}
    for t in liked_tracks:
        artists = t.get("artists") or []
        if artists and artists[0].get("id") and artists[0]["id"] not in seen:
            seen[artists[0]["id"]] = {"id": artists[0]["id"], "name": artists[0]["name"]}
    return list(seen.values())


# ---------------------------------------------------------------------
# Playlists
# ---------------------------------------------------------------------

def find_playlist_by_name(sp, user_id: str, name: str) -> dict | None:
    target = name.strip().lower()
    results = _get(sp, "me/playlists", {"limit": 50})
    while results:
        for p in results.get("items") or []:
            if not p:
                continue
            owner_id = (p.get("owner") or {}).get("id")
            if owner_id == user_id and p["name"].strip().lower() == target:
                return p
        results = _get(sp, results["next"]) if results.get("next") else None
    return None


def _playlist_entry_track(entry: dict) -> dict | None:
    """Playlist entries renamed `.track` -> `.item` in Feb 2026. Both
    are still in the schema, so read the new name first."""
    return entry.get("item") or entry.get("track")


def get_playlist_track_ids(sp, playlist_id: str) -> set:
    """Track IDs already in a playlist. Uses /items (the /tracks form
    was removed)."""
    ids = set()
    results = _get(sp, f"playlists/{playlist_id}/items", {
        "fields": "items.item.id,items.track.id,next",
        "additional_types": "track",
        "limit": PLAYLIST_ITEMS_LIMIT_MAX,
    })
    while results:
        for entry in results.get("items") or []:
            t = _playlist_entry_track(entry)
            if t and t.get("id"):
                ids.add(t["id"])
        results = _get(sp, results["next"]) if results.get("next") else None
    return ids


def create_playlist(sp, name: str, description: str) -> dict:
    """POST /me/playlists — replaces POST /users/{id}/playlists."""
    return _call(_request, sp, "POST", "me/playlists", None,
                 {"name": name, "description": description, "public": False})


def add_tracks_to_playlist(sp, playlist_id: str, track_ids: list[str]):
    """POST /playlists/{id}/items — replaces .../tracks. Still batched
    (100 URIs per request)."""
    for batch in _chunk(track_ids, PLAYLIST_ADD_URIS_MAX):
        uris = [f"spotify:track:{tid}" for tid in batch]
        _call(_request, sp, "POST", f"playlists/{playlist_id}/items", None, {"uris": uris})


def add_tracks_to_playlist_deduped(sp, name: str, description: str, track_ids: list[str]) -> dict:
    """
    Reuses an existing same-named playlist if there is one, and skips
    tracks already present, so re-running never duplicates entries.

    Returns: {"url", "reused", "added_count", "already_present_count"}
    """
    me = _get(sp, "me")
    existing = find_playlist_by_name(sp, me["id"], name)

    if existing:
        playlist_id = existing["id"]
        playlist_url = existing["external_urls"]["spotify"]
        existing_ids = get_playlist_track_ids(sp, playlist_id)
        reused = True
    else:
        playlist = create_playlist(sp, name, description)
        playlist_id = playlist["id"]
        playlist_url = playlist["external_urls"]["spotify"]
        existing_ids = set()
        reused = False

    seen = set()
    to_add = []
    already_present = 0
    for tid in track_ids:
        if tid in seen:
            continue
        seen.add(tid)
        if tid in existing_ids:
            already_present += 1
            continue
        to_add.append(tid)

    add_tracks_to_playlist(sp, playlist_id, to_add)

    return {
        "url": playlist_url,
        "reused": reused,
        "added_count": len(to_add),
        "already_present_count": already_present,
    }


# ---------------------------------------------------------------------
# Library writes
# ---------------------------------------------------------------------

def like_tracks(sp, track_ids: list[str]):
    """PUT /me/library?uris=... — replaces PUT /me/tracks.

    Still batched, which is a genuine relief: 40 URIs per request rather
    than one request per track.
    """
    for batch in _chunk(track_ids, LIBRARY_SAVE_URIS_MAX):
        uris = ",".join(f"spotify:track:{tid}" for tid in batch)
        _call(_request, sp, "PUT", "me/library", {"uris": uris})
