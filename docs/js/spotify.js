/**
 * spotify.js — client-side port of spotify_client.py.
 *
 * Talks to the Spotify Web API directly from the browser (no backend),
 * written against the February 2026 Dev Mode API surface. Every endpoint
 * and request shape here was confirmed working browser-side in the Phase 0
 * CORS reality check.
 *
 * The big structural difference from the Python: everything is async.
 * The Python retry wrapper blocks with time.sleep() inside a background
 * thread; in the browser we await a promise-based delay instead, so every
 * function that makes a request — and every caller up the chain — is async.
 *
 * Auth note: this module does NOT hold a client secret. It's handed a
 * live access token (from auth.js, PKCE flow) and uses it as a Bearer
 * token. Token acquisition/refresh lives in auth.js, matching how the
 * Python kept OAuth separate in app.py.
 */

const API_BASE = "https://api.spotify.com/v1/";

// Feb 2026 schema limits — from Spotify's published spec, not guesses.
export const SEARCH_LIMIT_MAX = 10;
export const ARTIST_ALBUMS_LIMIT_MAX = 10;
export const LIKED_TRACKS_LIMIT_MAX = 50;
export const LIBRARY_SAVE_URIS_MAX = 40;   // PUT /me/library
export const PLAYLIST_ADD_URIS_MAX = 100;  // POST /playlists/{id}/items
export const PLAYLIST_ITEMS_LIMIT_MAX = 50;

const MAX_ATTEMPTS = 4;
const RETRY_BASE_DELAY_MS = 1500;
const MAX_RATE_LIMIT_ATTEMPTS = 6;
const MAX_RATE_LIMIT_WAIT_MS = 90000;
const HARD_CALL_TIMEOUT_MS = 25000;

const SCOPE = (
  "user-library-read user-library-modify playlist-read-private " +
  "playlist-modify-private playlist-modify-public user-top-read " +
  "user-read-recently-played"
);
export { SCOPE };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * An error carrying the HTTP status, mirroring Python's SpotifyException
 * so the retry logic can branch on status the same way.
 */
export class SpotifyApiError extends Error {
  constructor(status, message, { retryAfter = null, reason = null } = {}) {
    super(message);
    this.name = "SpotifyApiError";
    this.status = status;
    this.retryAfter = retryAfter;
    this.reason = reason;
  }
}

/**
 * A Spotify client bound to one access token. `getToken` is an async
 * function returning a currently-valid token string — passing a function
 * (rather than a raw token) lets auth.js refresh transparently mid-run,
 * the same way the Python get_token() refreshed when expired.
 */
export class SpotifyClient {
  constructor(getToken) {
    this._getToken = getToken;
  }

  // One HTTP request. Throws SpotifyApiError on >=400 so the retry
  // wrapper can branch. Honors a hard per-attempt timeout via AbortController.
  async _request(method, pathOrUrl, { params = null, jsonBody = null } = {}) {
    let url = pathOrUrl.startsWith("http") ? pathOrUrl : API_BASE + pathOrUrl;
    if (params) {
      const qs = new URLSearchParams(params).toString();
      url += (url.includes("?") ? "&" : "?") + qs;
    }
    const token = await this._getToken();
    const headers = { Authorization: "Bearer " + token };
    const init = { method, headers };
    if (jsonBody !== null) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(jsonBody);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HARD_CALL_TIMEOUT_MS);
    init.signal = controller.signal;

    let resp;
    try {
      resp = await fetch(url, init);
    } catch (e) {
      clearTimeout(timer);
      // AbortError (our timeout) or a network/CORS failure. Mark as
      // retryable by giving it no HTTP status (status 0).
      throw new SpotifyApiError(0, `Network/timeout: ${e.name}: ${e.message}`);
    }
    clearTimeout(timer);

    if (resp.status >= 400) {
      let msg = null, reason = null;
      try {
        const body = await resp.json();
        const err = body.error || {};
        msg = err.message; reason = err.reason;
      } catch (e) {
        try { msg = await resp.text(); } catch (e2) { msg = null; }
      }
      throw new SpotifyApiError(resp.status, `${url}: ${msg}`, {
        retryAfter: resp.headers.get("Retry-After"),
        reason,
      });
    }

    if (resp.status === 204) return null;
    const text = await resp.text();
    if (!text) return null;
    return JSON.parse(text);
  }

  // Retry transient failures (network/timeout/5xx) and rate limits (429,
  // honoring Retry-After). Non-transient errors (403, 400, 404, 401)
  // raise immediately — a removed endpoint will never succeed on retry,
  // so failing fast surfaces it. Mirrors _call() in the Python.
  async _call(method, pathOrUrl, opts) {
    let attempt = 0;
    let rateLimitAttempts = 0;
    while (true) {
      attempt += 1;
      try {
        return await this._request(method, pathOrUrl, opts);
      } catch (e) {
        if (!(e instanceof SpotifyApiError)) throw e;

        if (e.status === 0) {
          // network/timeout
          if (attempt >= MAX_ATTEMPTS) throw e;
          await sleep(RETRY_BASE_DELAY_MS * attempt);
        } else if (e.status === 429) {
          rateLimitAttempts += 1;
          if (rateLimitAttempts > MAX_RATE_LIMIT_ATTEMPTS) throw e;
          let wait = 15000;
          const ra = parseFloat(e.retryAfter);
          if (!Number.isNaN(ra)) wait = Math.min(ra * 1000, MAX_RATE_LIMIT_WAIT_MS);
          await sleep(wait);
        } else if ([500, 502, 503, 504].includes(e.status)) {
          if (attempt >= MAX_ATTEMPTS) throw e;
          await sleep(RETRY_BASE_DELAY_MS * attempt);
        } else {
          throw e; // 4xx (incl. 403/401) — fail fast
        }
      }
    }
  }

  get(pathOrUrl, params = null) {
    return this._call("GET", pathOrUrl, { params });
  }

  // -----------------------------------------------------------------
  // health check — same three probes as the Python
  // -----------------------------------------------------------------
  async healthCheck() {
    await this.get("me");
    await this.get("me/tracks", { limit: 1 });
    await this.get("me/playlists", { limit: 1 });
  }

  // -----------------------------------------------------------------
  // Reads
  // -----------------------------------------------------------------
  async getAllLikedTracks(onProgress = null) {
    const tracks = [];
    let results = await this.get("me/tracks", { limit: LIKED_TRACKS_LIMIT_MAX });
    const total = (results && results.total) || 1;
    while (results) {
      for (const item of results.items || []) {
        if (item && item.track) tracks.push(item.track);
      }
      if (onProgress) onProgress(tracks.length, total);
      results = results.next ? await this.get(results.next) : null;
    }
    return tracks;
  }

  async findArtist(name) {
    let results = await this.get("search", { q: `artist:"${name}"`, type: "artist", limit: 5 });
    let items = (results.artists && results.artists.items) || [];
    if (!items.length) {
      results = await this.get("search", { q: name, type: "artist", limit: 5 });
      items = (results.artists && results.artists.items) || [];
    }
    if (!items.length) return null;
    for (const a of items) {
      if (a.name.toLowerCase() === name.toLowerCase()) return a;
    }
    return items[0];
  }

  async searchArtists(query, limit = 6) {
    if (!query || !query.trim()) return [];
    const results = await this.get("search", { q: query.trim(), type: "artist", limit });
    const items = (results.artists && results.artists.items) || [];
    return items.map((a) => {
      const images = a.images || [];
      return {
        id: a.id,
        name: a.name,
        image_url: images.length ? images[images.length - 1].url : null,
      };
    });
  }

  async getArtistAlbumIds(artistId, onProgress = null) {
    const albumIds = [];
    let results = await this.get(`artists/${artistId}/albums`, {
      include_groups: "album,single",
      limit: ARTIST_ALBUMS_LIMIT_MAX,
    });
    const total = (results && results.total) || 1;
    while (results) {
      for (const a of results.items || []) albumIds.push(a.id);
      if (onProgress) onProgress(albumIds.length, total);
      results = results.next ? await this.get(results.next) : null;
    }
    return albumIds;
  }

  // Simplified tracks (NO ISRC), one request per album. Mirrors
  // get_artist_catalog_tracks. Supports a cancel check + checkpoint hook
  // for the scrub-resume design (both optional).
  async getArtistCatalogTracks(artistId, { onProgress = null, isCancelled = null } = {}) {
    const albumIds = await this.getArtistAlbumIds(artistId);
    const total = albumIds.length || 1;
    const tracks = [];
    const seen = new Set();

    for (let i = 0; i < albumIds.length; i++) {
      if (isCancelled && isCancelled()) break;
      const album = await this.get(`albums/${albumIds[i]}`);
      const albumRef = { id: album.id, name: album.name, release_date: album.release_date };
      let page = album.tracks || null;
      while (page) {
        for (const t of page.items || []) {
          if (t.id && !seen.has(t.id)) {
            seen.add(t.id);
            t.album = albumRef;
            tracks.push(t);
          }
        }
        page = page.next ? await this.get(page.next) : null;
      }
      if (onProgress) onProgress(i + 1, total);
    }
    return tracks;
  }

  getTrackWithIsrc(trackId) {
    return this.get(`tracks/${trackId}`);
  }

  // Full track objects (ISRC), one request each. Only ever called for
  // the narrow candidate set — never a whole catalog.
  async getTracksWithIsrc(trackIds, onProgress = null) {
    const total = trackIds.length || 1;
    const full = [];
    for (let i = 0; i < trackIds.length; i++) {
      const t = await this.getTrackWithIsrc(trackIds[i]);
      if (t) full.push(t);
      if (onProgress) onProgress(i + 1, total);
    }
    return full;
  }

  async getArtistsByIds(artistIds) {
    const out = [];
    for (const aid of artistIds) {
      try {
        const a = await this.get(`artists/${aid}`);
        if (a) out.push(a);
      } catch (e) {
        if (e instanceof SpotifyApiError) continue; // a photo isn't worth failing over
        throw e;
      }
    }
    return out;
  }

  async getTopArtists(timeRange = "medium_term", limit = 20) {
    const res = await this.get("me/top/artists", { time_range: timeRange, limit });
    return res.items || [];
  }

  async getRecentlyPlayedArtists(limit = 50) {
    const res = await this.get("me/player/recently-played", { limit });
    const seen = new Map();
    for (const item of res.items || []) {
      const artists = (item.track && item.track.artists) || [];
      const a = artists[0];
      if (a && a.id && !seen.has(a.id)) seen.set(a.id, { id: a.id, name: a.name });
    }
    return Array.from(seen.values());
  }

  // -----------------------------------------------------------------
  // Playlists
  // -----------------------------------------------------------------
  async findPlaylistByName(userId, name) {
    const target = name.trim().toLowerCase();
    let results = await this.get("me/playlists", { limit: 50 });
    while (results) {
      for (const p of results.items || []) {
        if (!p) continue;
        const ownerId = p.owner && p.owner.id;
        if (ownerId === userId && p.name.trim().toLowerCase() === target) return p;
      }
      results = results.next ? await this.get(results.next) : null;
    }
    return null;
  }

  async getPlaylistTrackIds(playlistId) {
    const ids = new Set();
    let results = await this.get(`playlists/${playlistId}/items`, {
      fields: "items.item.id,items.track.id,next",
      additional_types: "track",
      limit: PLAYLIST_ITEMS_LIMIT_MAX,
    });
    while (results) {
      for (const entry of results.items || []) {
        const t = entry.item || entry.track; // .item is the new name, .track the old
        if (t && t.id) ids.add(t.id);
      }
      results = results.next ? await this.get(results.next) : null;
    }
    return ids;
  }

  createPlaylist(name, description) {
    return this._call("POST", "me/playlists", { jsonBody: { name, description, public: false } });
  }

  async addTracksToPlaylist(playlistId, trackIds) {
    for (const batch of chunk(trackIds, PLAYLIST_ADD_URIS_MAX)) {
      const uris = batch.map((tid) => `spotify:track:${tid}`);
      await this._call("POST", `playlists/${playlistId}/items`, { jsonBody: { uris } });
    }
  }

  async addTracksToPlaylistDeduped(name, description, trackIds) {
    const me = await this.get("me");
    const existing = await this.findPlaylistByName(me.id, name);

    let playlistId, playlistUrl, existingIds, reused;
    if (existing) {
      playlistId = existing.id;
      playlistUrl = existing.external_urls.spotify;
      existingIds = await this.getPlaylistTrackIds(playlistId);
      reused = true;
    } else {
      const playlist = await this.createPlaylist(name, description);
      playlistId = playlist.id;
      playlistUrl = playlist.external_urls.spotify;
      existingIds = new Set();
      reused = false;
    }

    const seen = new Set();
    const toAdd = [];
    let alreadyPresent = 0;
    for (const tid of trackIds) {
      if (seen.has(tid)) continue;
      seen.add(tid);
      if (existingIds.has(tid)) { alreadyPresent++; continue; }
      toAdd.push(tid);
    }

    await this.addTracksToPlaylist(playlistId, toAdd);

    return {
      url: playlistUrl,
      reused,
      added_count: toAdd.length,
      already_present_count: alreadyPresent,
    };
  }

  // -----------------------------------------------------------------
  // Library writes
  // -----------------------------------------------------------------
  async likeTracks(trackIds) {
    for (const batch of chunk(trackIds, LIBRARY_SAVE_URIS_MAX)) {
      const uris = batch.map((tid) => `spotify:track:${tid}`).join(",");
      await this._call("PUT", "me/library", { params: { uris } });
    }
  }
}

// Pure local helper — no API calls (mirrors get_distinct_liked_artists).
export function getDistinctLikedArtists(likedTracks) {
  const seen = new Map();
  for (const t of likedTracks) {
    const artists = t.artists || [];
    const a = artists[0];
    if (a && a.id && !seen.has(a.id)) seen.set(a.id, { id: a.id, name: a.name });
  }
  return Array.from(seen.values());
}
