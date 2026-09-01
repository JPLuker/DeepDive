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
const MAX_RATE_LIMIT_ATTEMPTS = 10;
const MAX_RATE_LIMIT_WAIT_MS = 90000;

// ---------------------------------------------------------------------
// Adaptive throttle
// ---------------------------------------------------------------------
// A catalog read is one request per release, and Spotify's Feb 2026
// changes made that worse: the artist-albums page limit dropped 50 -> 10
// and batch ?ids= endpoints were removed, so nothing can be fetched in
// bulk. A normal artist is ~60 releases (fine). With "appeared on"
// widened to compilations and guest spots it can be 300+, fired as fast
// as the browser manages -- which reliably trips rate limiting no matter
// how patient the retry logic is.
//
// Retrying harder does not fix that; not tripping the limit does. So the
// client paces itself: it starts at full speed (most artists never need
// slowing down) and backs off for the rest of the run each time it sees
// a 429. Self-tuning, so small catalogs stay fast and big ones settle
// into a sustainable rate on their own.
const THROTTLE_STEP_MS = 220;
const THROTTLE_MAX_MS = 1200;
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
    // Lightweight request log so the app can explain itself. Keeps
    // counts per endpoint plus the last failure, which is precisely what
    // one would otherwise dig out of the network console.
    this.log = { counts: {}, total: 0, lastError: null, started: Date.now() };
    // Adaptive pacing state. Starts at zero so ordinary searches are
    // unaffected; only a real 429 slows things down.
    // Restore any pacing learned earlier. Without this, a page reload
    // resets to full speed and immediately earns another 429 — the
    // penalty outlives the tab, so the caution should too.
    this._throttleMs = 0;
    try {
      const saved = parseInt(localStorage.getItem("deepdive_throttle_ms") || "0", 10);
      if (saved > 0) this._throttleMs = Math.min(saved, THROTTLE_MAX_MS);
    } catch (e) {}
    this._lastRequestAt = 0;
    // Optional hook so the UI can say "waiting on Spotify" instead of
    // appearing frozen during a long backoff.
    this.onRateLimit = null;
  }

  /** Wait out the current pacing interval before firing a request. */
  async _pace() {
    if (!this._throttleMs) return;
    const since = Date.now() - this._lastRequestAt;
    if (since < this._throttleMs) await sleep(this._throttleMs - since);
  }

  /** Called on every 429: slow down for the rest of this run. */
  _backOff() {
    this._throttleMs = Math.min(this._throttleMs + THROTTLE_STEP_MS, THROTTLE_MAX_MS);
    try { localStorage.setItem("deepdive_throttle_ms", String(this._throttleMs)); } catch (e) {}
  }

  /**
   * Pace deliberately before a run we already know is request-heavy,
   * rather than sprinting until Spotify objects. Backing off only after
   * a 429 means arriving in the penalty box first and then being slow —
   * worst of both. Never lowers an existing (learned) throttle.
   */
  setMinimumPacing(ms) {
    this._throttleMs = Math.max(this._throttleMs, Math.min(ms, THROTTLE_MAX_MS));
  }

  /**
   * Forget learned pacing. Because the throttle now survives reloads, a
   * single bad afternoon would otherwise slow every future search
   * forever with no way back.
   */
  resetPacing() {
    this._throttleMs = 0;
    try { localStorage.removeItem("deepdive_throttle_ms"); } catch (e) {}
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

    // Pace BEFORE arming the timeout. Starting the abort clock first
    // meant a paced request spent part of its own 25s budget waiting to
    // be allowed to start.
    await this._pace();
    this._lastRequestAt = Date.now();

    // Bucket by endpoint shape, not full URL, so ids don't explode it.
    try {
      const path = (url.split("?")[0].split("/v1/")[1] || url)
        .replace(/\/[0-9A-Za-z]{22}(\/|$)/g, "/{id}$1");
      this.log.counts[path] = (this.log.counts[path] || 0) + 1;
      this.log.total += 1;
    } catch (err) {}

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
      const apiErr = new SpotifyApiError(resp.status, `${url}: ${msg}`, {
        retryAfter: resp.headers.get("Retry-After"),
        reason,
      });
      this.log.lastError = {
        status: resp.status,
        url,
        message: msg || null,
        reason: reason || null,
        retryAfter: resp.headers.get("Retry-After"),
        at: Date.now(),
      };
      throw apiErr;
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
          // Slow every subsequent request, not just this retry — the
          // point is to stop hitting the limit again three calls later.
          this._backOff();

          // A Retry-After far beyond any sane wait means a sustained
          // penalty on the app's credentials, not a momentary burst
          // limit. Retrying ten times over two minutes cannot satisfy a
          // six-hour ban; it only turns a clear answer into a confusing
          // loop. Say so immediately instead.
          const raSecs = parseFloat(e.retryAfter);
          if (!Number.isNaN(raSecs) && raSecs * 1000 > MAX_RATE_LIMIT_WAIT_MS) {
            e.sustained = true;
            e.retryAfterSeconds = raSecs;
            throw e;
          }

          if (rateLimitAttempts > MAX_RATE_LIMIT_ATTEMPTS) throw e;
          // No Retry-After usually means a sustained limit rather than a
          // brief one, so escalate rather than retrying every 15s.
          let wait = Math.min(15000 * rateLimitAttempts, MAX_RATE_LIMIT_WAIT_MS);
          const ra = parseFloat(e.retryAfter);
          if (!Number.isNaN(ra)) wait = Math.min(ra * 1000, MAX_RATE_LIMIT_WAIT_MS);
          if (typeof this.onRateLimit === "function") {
            try { this.onRateLimit(wait, rateLimitAttempts); } catch (cbErr) {}
          }
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

  async getArtistAlbumIds(artistId, onProgress = null, includeGroups = "album,single") {
    const albumIds = [];
    let results = await this.get(`artists/${artistId}/albums`, {
      include_groups: includeGroups,
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
  async getArtistCatalogTracks(artistId, { onProgress = null, isCancelled = null, includeGroups = "album,single" } = {}) {
    const albumIds = await this.getArtistAlbumIds(artistId, null, includeGroups);
    const total = albumIds.length || 1;
    const tracks = [];
    const seen = new Set();

    for (let i = 0; i < albumIds.length; i++) {
      if (isCancelled && isCancelled()) break;
      const album = await this.get(`albums/${albumIds[i]}`);
      const albumRef = {
        id: album.id, name: album.name, release_date: album.release_date,
        album_type: album.album_type, // "album" | "single" | "compilation"
      };
      let page = album.tracks || null;
      while (page) {
        for (const t of page.items || []) {
          if (t.id && !seen.has(t.id)) {
            seen.add(t.id);
            t.album = albumRef;
            // Preserve position within the release for track-order sorting.
            t.track_number = t.track_number || null;
            t.disc_number = t.disc_number || null;
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

  /**
   * @param opts.forceNew  Always create a new playlist, even if one with
   *   this name exists. Reusing by name is the sensible default — it
   *   stops repeat dives spawning duplicates — but it's the wrong
   *   behaviour when someone deliberately wants a fresh snapshot, so it
   *   has to be overridable rather than assumed.
   */
  async addTracksToPlaylistDeduped(name, description, trackIds, opts = {}) {
    const { forceNew = false } = opts;
    const me = await this.get("me");
    const existing = forceNew ? null : await this.findPlaylistByName(me.id, name);

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
      id: playlistId,
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

  /**
   * Remove a playlist from the user's library.
   *
   * Spotify has no true delete — you unfollow your own playlist, which
   * takes it out of your library and is what "delete" means in their own
   * apps. The playlist object survives server-side, so this is less
   * destructive than the name suggests.
   */
  async deletePlaylist(playlistId) {
    await this._call("DELETE", `playlists/${playlistId}/followers`);
  }

  /**
   * The inverse of likeTracks, for undo. Same endpoint and the same
   * 40-uri batching; only the method differs.
   */
  async unlikeTracks(trackIds) {
    for (const batch of chunk(trackIds, LIBRARY_SAVE_URIS_MAX)) {
      const uris = batch.map((tid) => `spotify:track:${tid}`).join(",");
      await this._call("DELETE", "me/library", { params: { uris } });
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
