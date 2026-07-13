"""
Thin wrapper around spotipy for the calls DeepDive needs:
- fetching the full Liked Songs library
- resolving an artist by name
- enumerating every release (album/single/EP/compilation/appears_on)
  and fetching full track objects (needed for ISRC data)

Every actual network call goes through `_call()`, which retries on
timeouts/connection errors/transient server errors with backoff, since
Spotify's API can be slow under load and a single hiccup shouldn't kill
an otherwise-long-running search.
"""

import time

import requests.exceptions
import spotipy
from spotipy.exceptions import SpotifyException
from spotipy.oauth2 import SpotifyOAuth

SCOPE = "user-library-read user-library-modify playlist-modify-private playlist-modify-public"

# spotipy's own default is 5s, which is easy to trip on a slow connection
# or a heavier batch request. 20s gives real requests room to complete.
REQUEST_TIMEOUT = 20
MAX_ATTEMPTS = 4
RETRY_BASE_DELAY = 1.5  # seconds; grows each attempt (1.5, 3, 4.5)


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
    return spotipy.Spotify(auth=token_info["access_token"], requests_timeout=REQUEST_TIMEOUT)


def _chunk(lst, size):
    for i in range(0, len(lst), size):
        yield lst[i:i + size]


def _call(fn, *args, **kwargs):
    """Runs a spotipy call, retrying with backoff on timeouts, connection
    errors, and transient (5xx / 429) API errors. Anything else (bad
    request, auth failure, 404, etc.) raises immediately — retrying
    wouldn't help."""
    last_exc = None
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            return fn(*args, **kwargs)
        except (requests.exceptions.Timeout, requests.exceptions.ConnectionError) as e:
            last_exc = e
        except SpotifyException as e:
            if e.http_status in (429, 500, 502, 503, 504):
                last_exc = e
            else:
                raise
        if attempt < MAX_ATTEMPTS:
            time.sleep(RETRY_BASE_DELAY * attempt)
    raise last_exc


def get_all_liked_tracks(sp: spotipy.Spotify, on_progress=None) -> list[dict]:
    tracks = []
    results = _call(sp.current_user_saved_tracks, limit=50)
    total = results.get("total", 0) or 1
    while results:
        for item in results["items"]:
            if item.get("track"):
                tracks.append(item["track"])
        if on_progress:
            on_progress(len(tracks), total)
        if results.get("next"):
            results = _call(sp.next, results)
        else:
            break
    return tracks


def find_artist(sp: spotipy.Spotify, name: str) -> dict | None:
    results = _call(sp.search, q=f'artist:"{name}"', type="artist", limit=5)
    items = results.get("artists", {}).get("items", [])
    if not items:
        results = _call(sp.search, q=name, type="artist", limit=5)
        items = results.get("artists", {}).get("items", [])
    if not items:
        return None
    # Prefer exact (case-insensitive) name match, else highest popularity
    exact = [a for a in items if a["name"].lower() == name.lower()]
    if exact:
        return exact[0]
    return sorted(items, key=lambda a: a.get("popularity", 0), reverse=True)[0]


def get_artist_album_ids(sp: spotipy.Spotify, artist_id: str, on_progress=None) -> list[str]:
    """
    Enumerates the artist's own albums/singles/EPs (NOT 'appears_on', to
    avoid pulling in every compilation they're a guest on).
    """
    album_ids = []
    results = _call(sp.artist_albums, artist_id, include_groups="album,single", limit=50)
    total = results.get("total", 0) or 1
    while results:
        for a in results["items"]:
            album_ids.append(a["id"])
        if on_progress:
            on_progress(len(album_ids), total)
        if results.get("next"):
            results = _call(sp.next, results)
        else:
            break
    return album_ids


def get_track_ids_from_albums(sp: spotipy.Spotify, album_ids: list[str], on_progress=None) -> list[str]:
    """Reads each album's tracklist. Reports progress per batch of albums fetched."""
    batches = list(_chunk(album_ids, 20))
    total = len(batches) or 1

    track_ids = []
    seen = set()
    for i, batch in enumerate(batches, start=1):
        albums = _call(sp.albums, batch)["albums"]
        for album in albums:
            for t in album["tracks"]["items"]:
                if t["id"] and t["id"] not in seen:
                    seen.add(t["id"])
                    track_ids.append(t["id"])
            # handle albums with >50 tracks (rare, e.g. box sets)
            tr = album["tracks"]
            while tr.get("next"):
                tr = _call(sp.next, tr)
                for t in tr["items"]:
                    if t["id"] and t["id"] not in seen:
                        seen.add(t["id"])
                        track_ids.append(t["id"])
        if on_progress:
            on_progress(i, total)
    return track_ids


def get_full_tracks(sp: spotipy.Spotify, track_ids: list[str], on_progress=None) -> list[dict]:
    """Full track objects (needed for external_ids/ISRC) via batched GET /tracks."""
    batches = list(_chunk(track_ids, 50))
    total = len(batches) or 1

    full = []
    for i, batch in enumerate(batches, start=1):
        res = _call(sp.tracks, batch)
        full.extend([t for t in res["tracks"] if t])
        if on_progress:
            on_progress(i, total)
    return full


def find_playlist_by_name(sp: spotipy.Spotify, user_id: str, name: str) -> dict | None:
    """Finds an existing playlist owned by this user with an exact (case-
    insensitive) name match, so re-running DeepDive for the same artist
    reuses it instead of creating a new one each time."""
    target = name.strip().lower()
    results = _call(sp.current_user_playlists, limit=50)
    while results:
        for p in results["items"]:
            if not p:
                continue
            owner_id = (p.get("owner") or {}).get("id")
            if owner_id == user_id and p["name"].strip().lower() == target:
                return p
        if results.get("next"):
            results = _call(sp.next, results)
        else:
            break
    return None


def get_playlist_track_ids(sp: spotipy.Spotify, playlist_id: str) -> set:
    ids = set()
    results = _call(
        sp.playlist_items, playlist_id,
        fields="items.track.id,next", additional_types=["track"]
    )
    while results:
        for item in results["items"]:
            t = item.get("track")
            if t and t.get("id"):
                ids.add(t["id"])
        if results.get("next"):
            results = _call(sp.next, results)
        else:
            break
    return ids


def like_tracks(sp: spotipy.Spotify, track_ids: list[str]):
    for batch in _chunk(track_ids, 50):
        _call(sp.current_user_saved_tracks_add, tracks=batch)


def add_tracks_to_playlist_deduped(sp: spotipy.Spotify, name: str, description: str, track_ids: list[str]) -> dict:
    """
    Creates the playlist if it doesn't exist yet, or reuses an existing
    playlist with the same name if it does (so running DeepDive again for
    the same artist doesn't spawn duplicate playlists). Either way, any
    track already present in the playlist is skipped rather than added
    again, so re-running never produces duplicate entries.

    Returns: {"url", "reused", "added_count", "already_present_count"}
    """
    user_id = _call(sp.me)["id"]
    existing = find_playlist_by_name(sp, user_id, name)

    if existing:
        playlist_id = existing["id"]
        playlist_url = existing["external_urls"]["spotify"]
        existing_track_ids = get_playlist_track_ids(sp, playlist_id)
        reused = True
    else:
        playlist = _call(sp.user_playlist_create, user_id, name, public=False, description=description)
        playlist_id = playlist["id"]
        playlist_url = playlist["external_urls"]["spotify"]
        existing_track_ids = set()
        reused = False

    seen = set()
    to_add = []
    already_present_count = 0
    for tid in track_ids:
        if tid in seen:
            continue
        seen.add(tid)
        if tid in existing_track_ids:
            already_present_count += 1
            continue
        to_add.append(tid)

    for batch in _chunk(to_add, 100):
        _call(sp.playlist_add_items, playlist_id, batch)

    return {
        "url": playlist_url,
        "reused": reused,
        "added_count": len(to_add),
        "already_present_count": already_present_count,
    }
