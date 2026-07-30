/**
 * auth.js — browser-side Authorization Code + PKCE for Spotify.
 *
 * This is the client-side replacement for the Python's server-side OAuth
 * (spotipy SpotifyOAuth in spotify_client.make_oauth, driven by app.py's
 * /login, /callback, get_token). The flow here is the same one proven to
 * work in the Phase 0 CORS diagnostic — that page already completed a
 * real PKCE login and token exchange from the browser against the live
 * DeepDive app, so this module is that validated flow turned into a
 * reusable piece.
 *
 * Differences from the Python, all inherent to being client-side:
 *   - NO client secret. PKCE replaces it. This is the whole reason a
 *     client-side app is safe to distribute.
 *   - The user's Client ID + the tokens live in localStorage, not a
 *     server-side .cache-deepdive file. (Per-browser, not per-machine —
 *     a documented tradeoff in CLIENT_MIGRATION_PLAN.md.)
 *   - Refresh happens transparently via getToken(); callers hand
 *     SpotifyClient this function, so a token can refresh mid-run.
 */

const SCOPE = (
  "user-library-read user-library-modify playlist-read-private " +
  "playlist-modify-private playlist-modify-public user-top-read " +
  "user-read-recently-played"
);

const AUTH_URL = "https://accounts.spotify.com/authorize";
const TOKEN_URL = "https://accounts.spotify.com/api/token";

// localStorage keys
const LS = {
  clientId: "deepdive_client_id",
  access: "deepdive_access_token",
  refresh: "deepdive_refresh_token",
  expiresAt: "deepdive_token_expires_at", // epoch ms
  verifier: "deepdive_pkce_verifier",
  state: "deepdive_pkce_state",
};

// Refresh a bit early so a call never goes out with a token about to
// expire mid-flight.
const EXPIRY_SKEW_MS = 60 * 1000;

// ---- PKCE helpers (identical approach to the CORS diagnostic) ----
function randomString(len) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const vals = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(vals).map((x) => chars[x % chars.length]).join("");
}
async function sha256(plain) {
  return await crypto.subtle.digest("SHA-256", new TextEncoder().encode(plain));
}
function base64url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

// The redirect URI is this page's own origin+path. A client-side app has
// to satisfy Spotify's redirect rule (HTTPS or literal 127.0.0.1); both
// are fine here since we just reuse wherever the app is actually served.
export function redirectUri() {
  return window.location.origin + window.location.pathname;
}

export function getClientId() {
  return localStorage.getItem(LS.clientId) || "";
}
export function setClientId(id) {
  localStorage.setItem(LS.clientId, (id || "").trim());
}

export function isLoggedIn() {
  return !!localStorage.getItem(LS.access) && !!localStorage.getItem(LS.refresh);
}

export function logout() {
  localStorage.removeItem(LS.access);
  localStorage.removeItem(LS.refresh);
  localStorage.removeItem(LS.expiresAt);
  localStorage.removeItem(LS.verifier);
  localStorage.removeItem(LS.state);
  // Deliberately keep the Client ID — logging out shouldn't force the
  // user to re-enter their app credentials, mirroring how the Python
  // kept .env's client id and only cleared the token cache.
}

// Kick off login: build the PKCE challenge, stash the verifier/state,
// and redirect out to Spotify. Returns nothing (navigates away).
export async function beginLogin() {
  const clientId = getClientId();
  if (!clientId) throw new Error("No Client ID set.");

  const verifier = randomString(64);
  const challenge = base64url(await sha256(verifier));
  const state = randomString(16);
  localStorage.setItem(LS.verifier, verifier);
  localStorage.setItem(LS.state, state);

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    scope: SCOPE,
    code_challenge_method: "S256",
    code_challenge: challenge,
    redirect_uri: redirectUri(),
    state,
  });
  window.location.href = `${AUTH_URL}?${params.toString()}`;
}

/**
 * Call once on page load. If we're returning from Spotify with ?code=,
 * completes the token exchange and returns {ok:true}. If there's an
 * ?error=, returns {ok:false, error}. If it's a normal load (no auth
 * params), returns {ok:null} — nothing to do.
 *
 * Cleans the auth params out of the URL either way, so a refresh doesn't
 * re-trigger the exchange with a stale code.
 */
export async function handleRedirectCallback() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const returnedState = params.get("state");
  const error = params.get("error");

  if (error) {
    cleanUrl();
    return { ok: false, error };
  }
  if (!code) return { ok: null };

  const savedState = localStorage.getItem(LS.state);
  if (!savedState || savedState !== returnedState) {
    cleanUrl();
    return { ok: false, error: "state_mismatch" };
  }

  const verifier = localStorage.getItem(LS.verifier);
  const clientId = getClientId();
  cleanUrl();

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri(),
      code_verifier: verifier,
    }),
  });
  if (!res.ok) {
    let detail = "";
    try { detail = JSON.stringify(await res.json()); } catch (e) {}
    return { ok: false, error: `token_exchange_failed: HTTP ${res.status} ${detail}` };
  }
  const data = await res.json();
  storeTokens(data);
  localStorage.removeItem(LS.verifier);
  localStorage.removeItem(LS.state);
  return { ok: true };
}

function cleanUrl() {
  window.history.replaceState({}, document.title, redirectUri());
}

function storeTokens(data) {
  if (data.access_token) localStorage.setItem(LS.access, data.access_token);
  // On refresh, Spotify may omit refresh_token — keep the existing one.
  if (data.refresh_token) localStorage.setItem(LS.refresh, data.refresh_token);
  const expiresInMs = (data.expires_in || 3600) * 1000;
  localStorage.setItem(LS.expiresAt, String(Date.now() + expiresInMs));
}

// Serialize refreshes so concurrent calls don't fire multiple refreshes.
let _refreshInFlight = null;

async function refreshAccessToken() {
  if (_refreshInFlight) return _refreshInFlight;
  _refreshInFlight = (async () => {
    const refreshToken = localStorage.getItem(LS.refresh);
    const clientId = getClientId();
    if (!refreshToken) throw new Error("Not logged in (no refresh token).");
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });
    if (!res.ok) {
      let detail = "";
      try { detail = JSON.stringify(await res.json()); } catch (e) {}
      throw new Error(`Token refresh failed: HTTP ${res.status} ${detail}`);
    }
    const data = await res.json();
    storeTokens(data);
    return localStorage.getItem(LS.access);
  })();
  try {
    return await _refreshInFlight;
  } finally {
    _refreshInFlight = null;
  }
}

/**
 * The function handed to SpotifyClient. Returns a currently-valid access
 * token, refreshing first if it's expired (or within the skew window).
 * This is the client-side equivalent of the Python get_token().
 */
export async function getToken() {
  const access = localStorage.getItem(LS.access);
  const expiresAt = parseInt(localStorage.getItem(LS.expiresAt) || "0", 10);
  if (!access) {
    // No access token but maybe a refresh token — try to refresh.
    if (localStorage.getItem(LS.refresh)) return await refreshAccessToken();
    throw new Error("Not logged in.");
  }
  if (Date.now() >= expiresAt - EXPIRY_SKEW_MS) {
    return await refreshAccessToken();
  }
  return access;
}
