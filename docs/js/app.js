/**
 * app.js — the DeepDive client controller.
 *
 * Ties the verified logic modules (auth, spotify, matching, search,
 * watchlist) to the DOM. This is the browser-only orchestration + view
 * layer — the client-side equivalent of app.py's routes + Jinja
 * templates. Views are rendered into #view-root; there's no server, so
 * "navigation" is just swapping what's rendered there.
 */

import * as auth from "./auth.js";
import { SpotifyClient } from "./spotify.js";
import * as search from "./search.js";
import * as watchlist from "./watchlist.js";
import { LibraryCache } from "./library-cache.js";
import * as insights from "./insights.js";
import * as matching from "./matching.js";
import { bestStore } from "./storage.js";
import * as history from "./history.js";

// Build marker. Twice now, diagnosing a problem has meant reasoning
// about which version was actually loaded from indirect evidence — slow
// and easy to get wrong. Showing it removes the guesswork.
export const BUILD = "2.9.0";

const client = new SpotifyClient(auth.getToken);
// Incremental liked-songs cache: read the whole library once, then only
// fetch changes on later searches. Persisted in IndexedDB. See
// library-cache.js for the correctness (checksum) design.
const libraryCache = new LibraryCache(client, bestStore());

// When Spotify rate-limits us the client waits and retries, which can be
// tens of seconds. Without this the progress bar just appears to freeze,
// so say what's happening instead.
client.onRateLimit = (waitMs) => {
  const secs = Math.max(1, Math.round(waitMs / 1000));
  const el = document.getElementById("prog-stage");
  if (el) el.textContent = `Spotify is rate-limiting us — waiting ${secs}s, then carrying on…`;
};

const root = document.getElementById("view-root");
const flashSlot = document.getElementById("flash-slot");

// A place to hold the most recent search/scrub result for the results view.
let lastResult = null;
let scrubCancel = { cancelled: false };

// ---- helpers ----
function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function fmtDur(ms) {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms / 1000) % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
function flash(msg, isError = false) {
  flashSlot.innerHTML = `<div class="wrap" style="padding-bottom:0;"><div class="flash${isError ? " error" : ""}">${esc(msg)}</div></div>`;
  setTimeout(() => { flashSlot.innerHTML = ""; }, 6000);
}
function setTitle(t) { document.title = t; }

// Sort a list of track objects by the chosen mode. Returns a new array;
// does not mutate. "album" = discography order: albums chronologically,
// tracks in disc/track order within each; non-album releases (singles,
// comps) after, by date. "found" preserves original order.
function sortTracks(tracks, mode) {
  const withIdx = tracks.map((t, i) => ({ t, i }));
  const rd = (t) => (t.album && t.album.release_date) || "";
  const title = (t) => (t.name || "").toLowerCase();
  const isAlbum = (t) => t.album && t.album.album_type === "album";
  const artist = (t) => (((t.artists || [])[0] || {}).name || "").toLowerCase();

  withIdx.sort((a, b) => {
    if (mode === "date-desc") return rd(b.t).localeCompare(rd(a.t)) || a.i - b.i;
    if (mode === "date-asc") return rd(a.t).localeCompare(rd(b.t)) || a.i - b.i;
    if (mode === "title") return title(a.t).localeCompare(title(b.t)) || a.i - b.i;
    if (mode === "artist") {
      // Group an artist's tracks together, then order sensibly within
      // each: by album release, then album, then track number. Sorting
      // by artist alone would leave their tracks in arbitrary order,
      // which defeats the point of grouping them.
      const byArtist = artist(a.t).localeCompare(artist(b.t));
      if (byArtist) return byArtist;
      const byDate = rd(a.t).localeCompare(rd(b.t));
      if (byDate) return byDate;
      const byAlbum = ((a.t.album && a.t.album.name) || "").localeCompare((b.t.album && b.t.album.name) || "");
      if (byAlbum) return byAlbum;
      const byTrack = (a.t.track_number || 0) - (b.t.track_number || 0);
      if (byTrack) return byTrack;
      return a.i - b.i;
    }
    if (mode === "album") {
      // Album-first tracks grouped and ordered; everything else after.
      const aAlb = isAlbum(a.t), bAlb = isAlbum(b.t);
      if (aAlb !== bAlb) return aAlb ? -1 : 1;           // album tracks first
      if (aAlb && bAlb) {
        // chronological by album release, then album name (stable tie),
        // then disc, then track number.
        const byDate = rd(a.t).localeCompare(rd(b.t));
        if (byDate) return byDate;
        const byName = ((a.t.album.name || "")).localeCompare(b.t.album.name || "");
        if (byName) return byName;
        const byDisc = (a.t.disc_number || 1) - (b.t.disc_number || 1);
        if (byDisc) return byDisc;
        const byTrack = (a.t.track_number || 0) - (b.t.track_number || 0);
        if (byTrack) return byTrack;
        return a.i - b.i;
      }
      // both non-album: by date, then original order
      return rd(a.t).localeCompare(rd(b.t)) || a.i - b.i;
    }
    return a.i - b.i; // "found"
  });
  return withIdx.map((x) => x.t);
}

// ---- nav drawer ----
(function initNav() {
  const drawer = document.getElementById("nav-drawer");
  const backdrop = document.getElementById("nav-backdrop");
  const open = () => { drawer.classList.add("open"); backdrop.classList.add("open"); };
  const close = () => { drawer.classList.remove("open"); backdrop.classList.remove("open"); };
  document.getElementById("nav-open-btn").addEventListener("click", open);
  document.getElementById("nav-close-btn").addEventListener("click", close);
  backdrop.addEventListener("click", close);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
  document.querySelectorAll("[data-nav]").forEach((el) => {
    el.addEventListener("click", () => {
      close();
      const dest = el.getAttribute("data-nav");
      if (dest === "logout") { auth.logout(); render(); }
      else if (dest === "refresh-library") { refreshLibrary(); }
      else navigate(dest);
    });
  });
})();

// ---- theme toggle (light / dark / system) ----
(function initTheme() {
  const KEY = "deepdive_theme";
  const mql = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

  function resolve(pref) {
    if (pref === "dark") return true;
    if (pref === "light") return false;
    return !!(mql && mql.matches); // system
  }
  function current() { try { return localStorage.getItem(KEY) || "system"; } catch (e) { return "system"; } }
  function apply(pref) {
    if (resolve(pref)) document.documentElement.setAttribute("data-theme", "dark");
    else document.documentElement.removeAttribute("data-theme");
    document.querySelectorAll("[data-theme-choice]").forEach((b) =>
      b.classList.toggle("active", b.dataset.themeChoice === pref));
  }

  // Event delegation: one listener on the document, so it works no matter
  // when the theme buttons were added to the DOM (avoids any load-order
  // race between this and the buttons existing).
  document.addEventListener("click", (e) => {
    const btn = e.target.closest && e.target.closest("[data-theme-choice]");
    if (!btn) return;
    const pref = btn.dataset.themeChoice;
    try { localStorage.setItem(KEY, pref); } catch (err) {}
    apply(pref);
  });

  if (mql) mql.addEventListener("change", () => { if (current() === "system") apply("system"); });

  apply(current());
})();

async function refreshLibrary() {
  if (!auth.isLoggedIn()) { flash("Connect Spotify first.", true); return; }
  // Also clear any learned rate-limit pacing. This is the natural place
  // for it: the throttle persists across reloads, so without a way to
  // clear it one bad session would slow every later search permanently.
  if (typeof client.resetPacing === "function") client.resetPacing();
  flash("Refreshing your library from Spotify…");
  try {
    const tracks = await libraryCache.getLikedTracks({ forceFull: true });
    flash(`Library refreshed — ${tracks.length} liked songs synced.`);
  } catch (e) {
    flash(`Couldn't refresh library: ${e.message || e}`, true);
  }
}

function navigate(view) {
  if (!auth.getClientId()) return renderSetup();
  if (!auth.isLoggedIn()) return renderConnect();
  if (view === "home") return renderHome();
  if (view === "scrub") return renderScrubForm();
  if (view === "watchlist") return renderWatchlist();
  if (view === "history") return renderHistory();
  if (view === "about") return renderLanding();
  if (view === "setup") return renderSetup();
  return renderHome();
}

// ============================================================
// Setup (credentials)
// ============================================================
function renderSetup() {
  setTitle("DeepDive · Configuration");
  const rUri = auth.redirectUri();
  const currentId = auth.getClientId();
  // The app moved to /app/ in 2.7.1, which changes the redirect URI.
  // Anyone set up before that has the old one registered and will hit
  // INVALID_CLIENT until they add this one — worth saying plainly rather
  // than leaving them to decode Spotify's error message.
  const moved = /\/app\/?$/.test(rUri)
    ? `<p class="crate-note" style="margin-bottom:14px;">Used DeepDive before the address changed? Add the URI below <em>alongside</em> your existing one — Spotify allows several — or logging in will fail.</p>`
    : "";
  root.innerHTML = `
    <div class="card">
      <h1>Spotify setup</h1>
      <p class="muted">DeepDive uses your own Spotify app so it stays entirely yours — no shared server, no data leaving your browser. This is a one-time setup.</p>
      ${moved}
      <ol class="muted" style="line-height:1.9;">
        <li>Go to the <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noopener" style="color:var(--accent);text-decoration:underline;">Spotify Developer Dashboard</a> and click <strong>Create app</strong> (any name).</li>
        <li>In the app's settings, add this exact <strong>Redirect URI</strong>, then click Add <em>and</em> Save at the bottom:<br><code class="env">${esc(rUri)}</code><br><span style="font-size:13px;">Copy it exactly — the <code class="env">/app/</code> and the trailing slash both matter, and Spotify treats <code class="env">http</code> and <code class="env">https</code> as different.</span></li>
        <li>Copy your <strong>Client ID</strong> and paste it below. No client secret needed — this app uses PKCE, so there isn't one.</li>
      </ol>
      <div style="margin-top:20px;">
        <label class="mono" style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);">Client ID</label>
        <input type="text" id="client-id-input" placeholder="e.g. 0287b6335f0b4a4bae283bb94bfc2f05" value="${esc(currentId)}" style="margin-top:6px;">
      </div>
      <div class="actions">
        <button class="btn btn-primary" id="save-creds-btn">Save & continue</button>
      </div>
    </div>`;
  document.getElementById("save-creds-btn").addEventListener("click", () => {
    const id = document.getElementById("client-id-input").value.trim();
    if (!id) { flash("Enter your Client ID first.", true); return; }
    auth.setClientId(id);
    flash("Saved.");
    renderConnect();
  });
}

// ============================================================
// Connect (login)
// ============================================================
function renderConnect() {
  setTitle("DeepDive");
  root.innerHTML = `
    <div style="margin-top:60px; text-align:center;">
      <span class="wordmark-hero"><img src="../assets/dd-logo.png" alt="" class="wordmark-hero-icon">DeepDive</span>
      <p class="muted" style="max-width:460px; margin:20px auto 0;">
        DeepDive checks an artist's discography against your Liked Songs, finds recordings you've already liked under a different release, and helps you fold in the ones you're missing — then builds a playlist of everything you still haven't liked.
      </p>
      <div style="margin-top:26px;"><button class="btn btn-primary" id="connect-btn">Connect Spotify</button></div>
    </div>`;
  document.getElementById("connect-btn").addEventListener("click", async () => {
    try { await auth.beginLogin(); }
    catch (e) { flash(`Couldn't start login: ${e.message}`, true); }
  });
}

// ============================================================
// Home (search + autofill + recommendations + To-Dive)
// ============================================================
async function renderHome() {
  setTitle("DeepDive");
  setActiveTab("home");
  root.innerHTML = `
    <div class="search-shell">
      <div class="search-pill-form">
        <input type="text" id="artist-input" placeholder="Search an artist" autocomplete="off" autofocus>
        <button type="button" class="settings-icon-btn" id="settings-toggle-btn" aria-label="Search options" title="Search options">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>
        </button>
        <button type="button" class="search-icon-btn" id="search-go-btn" aria-label="Search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        </button>
      </div>
      <div class="autofill-list" id="autofill-list"></div>
    </div>
    <div id="suggestions-row"></div>
    <div id="playlist-cards"></div>
    <div class="bmc-row${showBmc() ? "" : " hidden"}">
      <a class="bmc-link" href="https://buymeacoffee.com/OSJoseph" target="_blank" rel="noopener">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M17 8h1a4 4 0 0 1 0 8h-1"/>
          <path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/>
          <line x1="6" y1="2" x2="6" y2="4"/>
          <line x1="10" y1="2" x2="10" y2="4"/>
          <line x1="14" y1="2" x2="14" y2="4"/>
        </svg>
        Buy me a coffee
      </a>
    </div>`;

  wireSearchBar();
  loadSuggestions();
  loadPlaylistCards();
}

// ---- playlist suggestion cards (2.3) ----
// Built entirely from the cached library: no API calls, instant, and
// available offline. A card is an offer rather than a playlist — nothing
// is created until it's confirmed, because silently adding playlists to
// someone's Spotify account on a single click would be presumptuous.
let _cards = [];
let _allCards = [];

// Shown per load. Small enough to scan, with a much larger pool behind
// it so refreshing is worth doing.
const CARDS_PER_LOAD = 6;

async function loadPlaylistCards() {
  const el = document.getElementById("playlist-cards");
  if (!el) return;
  try {
    const cached = await Promise.race([
      libraryCache.peek(),
      new Promise((resolve) => setTimeout(() => resolve([]), 2500)),
    ]);
    if (!cached || !cached.length) { el.innerHTML = ""; return; }
    // A fresh seed each load, so a refresh brings different ideas. The
    // artist suggestions above are deliberately session-stable — you
    // should be able to come back to one you spotted — but playlists are
    // a browsing surface where repetition is the bigger risk.
    const seed = (Date.now() >>> 0) ^ Math.floor(Math.random() * 0xffffffff);
    _allCards = insights.playlistCards(cached, { seed });
    if (!_allCards.length) { el.innerHTML = ""; return; }
    _cards = insights.seededPick(_allCards, CARDS_PER_LOAD, seed);

    renderCardRow(el);
  } catch (e) {
    el.innerHTML = "";
    console.error("[DeepDive] playlist cards failed:", e);
  }
}

/**
 * All cards, always. This row sits at the bottom of the page, so length
 * costs nothing here — and hiding ideas behind a "more" click means
 * people never find the ones below the fold.
 *
 * The card face carries the title and what it is; the exact track count
 * belongs in the dialog where the length is actually chosen. Printing a
 * total here implied the card was a fixed playlist rather than a
 * starting point.
 */
function renderCardRow(el) {
  el.innerHTML = `
    <div class="row-head"><h2>Playlists</h2><span class="qual">from your library</span></div>
    <div class="card-row">
      ${_cards.map((c, i) => `
        <button class="pcard" data-card="${esc(c.id)}" style="--h:${(200 + i * 47) % 360};">
          <span class="pcard-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="16" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg></span>
          <span class="pcard-title">${esc(c.title)}</span>
          <span class="pcard-sub">${esc(c.subtitle)}</span>
        </button>`).join("")}
    </div>`;
  el.querySelectorAll("[data-card]").forEach((b) =>
    b.addEventListener("click", () => openCardModal((_allCards.length ? _allCards : _cards).find((c) => c.id === b.dataset.card))));
}

/**
 * Artists the sampler draws from: ones you've barely explored.
 *
 * Sampling artists you already play constantly is pointless — you know
 * what they sound like. The useful case is an artist you liked once or
 * twice and never followed up on, which is also exactly the group the
 * home page's "1 song liked" prompt surfaces.
 *
 * Populated from the cache when suggestions load, so building the row
 * costs nothing extra.
 */
let _samplerPool = [];

/**
 * A fresh handful each time. Drawing the top twelve by recency meant the
 * same artists appeared in every sampler — one of them turned up in
 * every playlist in a row — which defeats the purpose of sampling.
 */
function samplerSourceArtists() {
  if (_samplerPool.length <= SAMPLER_MAX_ARTISTS) return _samplerPool.slice();
  const seed = (Date.now() >>> 0) ^ Math.floor(Math.random() * 0xffffffff);
  return insights.seededPick(_samplerPool, SAMPLER_MAX_ARTISTS, seed);
}

/**
 * Two steps, because tapping the button used to begin twelve requests
 * immediately with no way back — a look became a commitment. This asks
 * first, and the fetch can be abandoned while it runs.
 */
function openSampler(artists) {
  const modal = document.getElementById("card-modal");
  if (!modal) return;
  document.getElementById("card-title").textContent = "Sampler";
  document.getElementById("card-sub").textContent =
    `A few tracks each from ${artists.length} artists you've barely heard. This takes a moment — one request per artist.`;
  document.getElementById("card-name").value = "";
  document.getElementById("card-len").innerHTML = "";
  document.getElementById("card-preview").innerHTML = "";
  document.getElementById("card-preview-summary").textContent = "Preview";
  document.getElementById("card-reuse-block")?.classList.add("hidden");
  document.getElementById("card-export")?.classList.add("hidden");
  document.querySelector(".playlist-name-field")?.classList.add("hidden");
  document.querySelector("#card-modal details")?.classList.add("hidden");
  const msg = document.getElementById("card-msg");
  msg.classList.add("hidden");

  const goEl = document.getElementById("card-go");
  const cancelEl = document.getElementById("card-cancel");
  const freshGo = goEl.cloneNode(true); goEl.replaceWith(freshGo);
  const freshCancel = cancelEl.cloneNode(true); cancelEl.replaceWith(freshCancel);
  freshGo.textContent = "Build sampler";
  freshGo.disabled = false;

  const close = () => modal.classList.add("hidden");
  freshCancel.addEventListener("click", close);
  modal.addEventListener("click", (e) => { if (e.target === modal) close(); });
  freshGo.addEventListener("click", () => runSampler(artists));

  modal.classList.remove("hidden");
}

async function runSampler(artists) {
  const modal = document.getElementById("card-modal");
  const msg = document.getElementById("card-msg");
  const lenRow = document.getElementById("card-len");
  const preview = document.getElementById("card-preview");
  const summary = document.getElementById("card-preview-summary");
  if (!modal) return;

  document.querySelector(".playlist-name-field")?.classList.remove("hidden");
  document.querySelector("#card-modal details")?.classList.remove("hidden");
  document.getElementById("card-title").textContent = "Sampler";
  document.getElementById("card-sub").textContent = `a few tracks each from ${artists.length} artists you've barely heard`;
  document.getElementById("card-name").value = `DeepDive · Sampler ${new Date().toISOString().slice(0,10)}`;
  msg.classList.remove("hidden", "error");
  msg.textContent = "Fetching top tracks…";
  // Clear the options entirely while loading — leaving the "How many
  // tracks" heading above an empty space looks broken, which is how the
  // failure case presented.
  lenRow.innerHTML = "";
  lenRow.classList.add("hidden");
  // Hide these now rather than when the fetch completes. Otherwise the
  // dialog spends the whole loading period showing controls that then
  // disappear, which reads as a glitch.
  document.getElementById("card-reuse-block")?.classList.add("hidden");
  document.getElementById("card-export")?.classList.add("hidden");
  preview.innerHTML = "";
  summary.textContent = "Preview";
  modal.classList.remove("hidden");

  _samplerCancelled = false;
  // Cancel stays live during the fetch — the whole problem was that
  // starting it left no way out.
  const cancelDuring = document.getElementById("card-cancel");
  if (cancelDuring) {
    const fresh = cancelDuring.cloneNode(true); cancelDuring.replaceWith(fresh);
    fresh.addEventListener("click", () => {
      _samplerCancelled = true;
      document.getElementById("card-modal").classList.add("hidden");
    });
  }
  const goDuring = document.getElementById("card-go");
  if (goDuring) { goDuring.disabled = true; goDuring.textContent = "Building…"; }

  let tracks = [];
  try {
    tracks = await buildSampler(artists, 3, (done, total) => {
      msg.textContent = `Fetching tracks… (${done}/${total})`;
    });
    if (_samplerCancelled) return;
  } catch (e) {
    const info = explainError(e);
    msg.textContent = `${info.headline}. ${info.detail}`;
    msg.classList.add("error");
    return;
  }
  if (!tracks.length) {
    // Say why. "Couldn't fetch any tracks" leaves the only diagnosis in
    // the console, which is exactly the problem 2.1.5 set out to fix.
    const first = (tracks.failures || [])[0];
    if (first) {
      const info = explainError(first.error);
      msg.innerHTML = `<div style="font-weight:700;margin-bottom:4px;">${esc(info.headline)}</div><div>${esc(info.detail)}</div>`;
    } else {
      msg.textContent = "None of these artists returned any tracks.";
    }
    msg.classList.add("error");
    return;
  }
  msg.classList.add("hidden");
  lenRow.classList.remove("hidden");

  // Kept in build order: grouped by artist, each led by a track you
  // already liked. Interleaving or shuffling would undo that.
  //
  // Date the name rather than asking whether to reuse: each sampler is a
  // snapshot of a moment, so overwriting the last one would be wrong and
  // asking about it is a question with an obvious answer.
  const stamp = new Date().toISOString().slice(0, 10);
  const card = {
    id: "sampler",
    title: "Sampler",
    subtitle: `a few tracks each from ${artists.length} artists you've barely heard`,
    count: tracks.length,
    tracks,
    simple: true,
    name: `DeepDive · Sampler ${stamp}`,
  };
  _cards = _cards.filter((c) => c.id !== "sampler").concat(card);
  openCardModal(card);
}

// ---------------------------------------------------------------------
// Playlist tooling (2.4)
// ---------------------------------------------------------------------
// Length, ordering and destination were previously decided in three
// different places with three different sets of options. These are the
// shared pieces, so every playlist in the app offers the same controls.

const PLAYLIST_LENGTHS = [10, 20, 30, 40, 50, 100, "all"];

const PLAYLIST_ORDERS = [
  { id: "found", label: "As found" },
  { id: "album", label: "Album order" },
  { id: "date-desc", label: "Newest first" },
  { id: "date-asc", label: "Oldest first" },
  { id: "artist", label: "By artist" },
  { id: "title", label: "Title A–Z" },
  { id: "shuffle", label: "Shuffle" },
];

/**
 * Apply length and ordering to a track list. Ordering runs first so the
 * length trims from a meaningfully ordered set — cutting first and then
 * sorting would give you an arbitrary subset in a tidy order, which is
 * not the same thing.
 */
function applyPlaylistOptions(tracks, { order = "found", length = "all" } = {}) {
  let out = order === "shuffle"
    // Seeded per call so a shuffle is genuinely different each time,
    // unlike the daily-stable "Surprise me" card.
    ? insights.seededPick(tracks, tracks.length, (Date.now() ^ tracks.length) >>> 0)
    : sortTracks(tracks, order);
  if (length !== "all") out = out.slice(0, length);
  return out;
}

/** Renders the shared length + order controls into a container. */
function renderPlaylistOptions(el, state, onChange, total) {
  const lengths = PLAYLIST_LENGTHS.filter((n) => n === "all" || n < total);
  el.innerHTML = `
    <div class="settings-panel-title">How many tracks</div>
    <div class="card-len" data-group="length">
      ${lengths.map((n) => `<button type="button" class="len-opt${n === state.length ? " active" : ""}" data-len="${n}">${n === "all" ? `All ${total}` : n}</button>`).join("")}
    </div>
    <div class="settings-panel-title" style="margin-top:14px;">Order</div>
    <div class="card-len" data-group="order">
      ${PLAYLIST_ORDERS.map((o) => `<button type="button" class="len-opt${o.id === state.order ? " active" : ""}" data-order="${o.id}">${esc(o.label)}</button>`).join("")}
    </div>`;
  el.querySelectorAll("[data-len]").forEach((b) => b.addEventListener("click", () => {
    const v = b.dataset.len;
    state.length = v === "all" ? "all" : parseInt(v, 10);
    onChange();
  }));
  el.querySelectorAll("[data-order]").forEach((b) => b.addEventListener("click", () => {
    state.order = b.dataset.order;
    onChange();
  }));
}

/** Plain-text export. Kept simple so it pastes anywhere useful. */
function tracksToText(tracks) {
  return tracks.map((t, i) => {
    const artist = (t.artists && t.artists[0] && t.artists[0].name) || "";
    const album = (t.album && t.album.name) || "";
    return `${i + 1}. ${t.name}${artist ? ` — ${artist}` : ""}${album ? ` (${album})` : ""}`;
  }).join("\n");
}

/** CSV export, quoted properly so commas in titles don't break it. */
function tracksToCsv(tracks) {
  const q = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
  const rows = [["#", "Track", "Artist", "Album", "Spotify URL"].map(q).join(",")];
  tracks.forEach((t, i) => {
    rows.push([
      i + 1,
      t.name,
      (t.artists && t.artists[0] && t.artists[0].name) || "",
      (t.album && t.album.name) || "",
      t.id ? `https://open.spotify.com/track/${t.id}` : "",
    ].map(q).join(","));
  });
  return rows.join("\n");
}

/** Trigger a download without a server. */
function downloadFile(filename, contents, mime) {
  try {
    const blob = new Blob([contents], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Revoke on the next tick; revoking immediately can cancel the
    // download in some browsers.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch (e) {
    return false;
  }
}

const CARD_LENGTHS = PLAYLIST_LENGTHS;

/**
 * Sampler: a few top tracks from each of several artists. The first
 * generator that needs the network, which is why it isn't one of the
 * cache-derived cards — those are instant and cannot be rate-limited,
 * and mixing a network-dependent card in among them would make that
 * property untrue without it being visible.
 *
 * Requests are per artist, so the count is capped and the artists are
 * fetched sequentially through the client's existing pacing rather than
 * in parallel.
 */
const SAMPLER_MAX_ARTISTS = 12;

let _samplerCancelled = false;

/**
 * Three tracks per artist: the one you already liked, then two you
 * haven't. The familiar one leads so each artist opens with a reason to
 * keep listening — a sampler of nothing but strangers is easy to skip.
 *
 * Tracks stay grouped by artist for the same reason. Interleaving or
 * shuffling would scatter the anchors and the structure would be lost.
 */
async function buildSampler(artists, perArtist, onProgress) {
  const picked = artists.slice(0, SAMPLER_MAX_ARTISTS);
  const out = [];
  const failures = [];
  const seenTrackIds = new Set();
  for (let i = 0; i < picked.length; i++) {
    // Checked between artists rather than mid-request: a run is a dozen
    // separate calls, so stopping at the next boundary is quick enough
    // and avoids aborting a request that's already in flight.
    if (_samplerCancelled) break;
    const a = picked[i];
    if (!a || !a.id) continue;
    try {
      // Two routes, because /artists/{id}/top-tracks is refused for this
      // app — consistent with the other endpoints Spotify restricted for
      // Dev Mode in Feb 2026. Search returns tracks for an artist in
      // roughly popularity order and costs the same single request, so
      // it serves the same purpose.
      //
      // No market parameter anywhere: "from_token" is deprecated and
      // fails outright, while omitting it uses the token's own market.
      let tracks = [];
      try {
        const res = await client.get(`artists/${a.id}/top-tracks`);
        tracks = (res && res.tracks) || [];
      } catch (topErr) {
        const res = await client.get("search", {
          q: `artist:"${a.name}"`, type: "track", limit: 10,
        });
        tracks = ((res && res.tracks && res.tracks.items) || [])
          // Search matches loosely, so keep only tracks actually by this
          // artist rather than ones merely mentioning the name.
          .filter((t) => (t.artists || []).some((ar) => ar.id === a.id));
      }
      // Collapse cross-release duplicates first. Search happily returns
      // the same recording several times — album, single, compilation —
      // each with its own track id, which is how the sampler ended up
      // with three copies of one song. The searches already do this;
      // the sampler didn't.
      tracks = matching.collapseDuplicateRecordings(tracks).tracks;

      // Split what came back into the already-liked and the rest.
      const liked = new Set(a.likedTrackIds || []);
      const known = tracks.filter((t) => liked.has(t.id));
      const unknown = tracks.filter((t) => !liked.has(t.id));

      // One familiar track, then fill with unfamiliar ones. If nothing
      // familiar comes back — the liked track may not be in the top
      // results — just use unfamiliar ones rather than dropping the
      // artist entirely.
      const forArtist = [];
      if (known.length) forArtist.push(known[0]);
      for (const t of unknown) {
        if (forArtist.length >= perArtist) break;
        forArtist.push(t);
      }
      // Also guard across artists — a collaboration can legitimately be
      // returned for both parties, and the same track twice in one
      // playlist is a bug either way.
      for (const t of forArtist) {
        if (!seenTrackIds.has(t.id)) { seenTrackIds.add(t.id); out.push(t); }
      }
    } catch (e) {
      // One artist failing shouldn't sink the sampler — a missing act is
      // better than no playlist. But the reason has to be recoverable,
      // or a total failure reports nothing useful.
      failures.push({ name: a.name, error: e });
      console.warn("[DeepDive] sampler: skipped", a.name, e && e.message);
    }
    if (onProgress) onProgress(i + 1, picked.length);
  }
  // Surface the first failure so the caller can explain a total wipeout
  // rather than shrugging.
  out.failures = failures;
  return out;
}


function openCardModal(card) {
  if (!card) return;
  const modal = document.getElementById("card-modal");
  const title = document.getElementById("card-title");
  const sub = document.getElementById("card-sub");
  const nameInput = document.getElementById("card-name");
  const lenRow = document.getElementById("card-len");
  const preview = document.getElementById("card-preview");
  const summary = document.getElementById("card-preview-summary");
  const msg = document.getElementById("card-msg");
  if (!modal) return;

  title.textContent = card.title;
  sub.textContent = card.subtitle;
  nameInput.value = card.name || `DeepDive · ${card.title}`;
  msg.classList.add("hidden");
  msg.textContent = "";

  // Default to everything for small sets, otherwise a sensible slice.
  // Cards arrive already ordered meaningfully (chronological years,
  // longest-first epics), so "as found" is the right default order.
  // The sampler is a "just give me something" action, so it takes no
  // options: twenty tracks, shuffled, in a dated playlist. Offering
  // length, order and a reuse toggle for a throwaway mix was friction
  // for no gain.
  const simple = !!card.simple;
  const opts = simple
    // "found" preserves the order the sampler built: grouped by artist,
    // each led by a track already liked. Shuffling would scatter the
    // anchors, which is the whole structure.
    ? { length: 20, order: "found" }
    : { length: card.count <= 50 ? "all" : 50, order: "found" };

  const tracksFor = () => applyPlaylistOptions(card.tracks, opts);

  const paint = () => {
    if (simple) lenRow.innerHTML = "";
    else renderPlaylistOptions(lenRow, opts, paint, card.count);
    const list = tracksFor();
    summary.textContent = `Preview ${list.length} track${list.length === 1 ? "" : "s"}`;
    preview.innerHTML = list.slice(0, 100).map((t) => `
      <div class="track-row newt">
        <div class="track-meta">
          <div class="track-name">${esc(t.name)}</div>
          <div class="track-sub">${esc((t.artists && t.artists[0] && t.artists[0].name) || "")}${t.album && t.album.name ? ` · ${esc(t.album.name)}` : ""}</div>
        </div>
      </div>`).join("") + (list.length > 100 ? `<p class="crate-note" style="margin-top:10px;">…and ${list.length - 100} more.</p>` : "");
  };
  paint();

  const reuseBlock = document.getElementById("card-reuse-block");
  const exportBtnEl = document.getElementById("card-export");
  if (reuseBlock) reuseBlock.classList.toggle("hidden", simple);
  if (exportBtnEl) exportBtnEl.classList.toggle("hidden", simple);

  modal.classList.remove("hidden");
  const close = () => modal.classList.add("hidden");

  // Rebind cleanly so handlers don't accumulate across openings.
  const goEl = document.getElementById("card-go");
  const cancelEl = document.getElementById("card-cancel");
  const freshGo = goEl.cloneNode(true); goEl.replaceWith(freshGo);
  const freshCancel = cancelEl.cloneNode(true); cancelEl.replaceWith(freshCancel);
  // cloneNode copies the live state, so a button left reading "Building…"
  // and disabled by an earlier step arrives here still stuck. Reset it
  // explicitly rather than inheriting whatever the previous phase left.
  freshGo.textContent = "Create playlist";
  freshGo.disabled = false;
  freshCancel.textContent = "Cancel";
  freshCancel.disabled = false;

  freshCancel.addEventListener("click", close);
  modal.addEventListener("click", (e) => { if (e.target === modal) close(); });

  // Export needs no Spotify call at all, so it works even when the API
  // is rate-limited or the account can't write playlists.
  // One export. CSV opens in a spreadsheet and still reads acceptably as
  // plain text, so offering both formats bought little and cost a
  // cluttered row.
  const oldExport = document.getElementById("card-export");
  if (oldExport) {
    const btn = oldExport.cloneNode(true); oldExport.replaceWith(btn);
    btn.addEventListener("click", () => {
      const list = tracksFor();
      if (!list.length) return;
      const safe = ((nameInput.value || card.title) + "").replace(/[^\w\d\- ]+/g, "").trim() || "deepdive";
      const done = downloadFile(`${safe}.csv`, tracksToCsv(list), "text/csv;charset=utf-8");
      btn.textContent = done ? "Saved" : "Failed";
      setTimeout(() => { btn.textContent = "Export"; }, 1600);
    });
  }

  freshGo.addEventListener("click", async () => {
    const list = tracksFor();
    if (!list.length) { msg.textContent = "Nothing to add."; msg.classList.remove("hidden"); return; }
    freshGo.disabled = true;
    freshGo.textContent = "Creating…";
    try {
      const res = await client.addTracksToPlaylistDeduped(
        (nameInput.value || "").trim() || `DeepDive · ${card.title}`,
        `${card.subtitle}, built by DeepDive.`,
        list.map((t) => t.id),
        { forceNew: simple || !!document.getElementById("card-force-new")?.checked }
      );
      msg.innerHTML = `Playlist ${res.reused ? "updated" : "created"}: added ${res.added_count}${res.already_present_count ? `, ${res.already_present_count} already present` : ""}. <a href="${esc(res.url)}" target="_blank" rel="noopener" style="color:var(--accent);text-decoration:underline;">Open playlist</a>`;
      msg.classList.remove("hidden", "error");
      // Recorded so it can be removed from History. Only newly created
      // playlists are offered for removal — taking away one that already
      // existed and was merely updated would delete something the user
      // built themselves.
      if (!res.reused && res.id) {
        history.recordAction({
          type: "playlist",
          label: `Created "${(nameInput.value || card.title).trim()}"`,
          playlistId: res.id,
          playlistUrl: res.url,
          undoable: false,
        });
      }
    } catch (e) {
      const info = explainError(e);
      msg.textContent = `${info.headline}. ${info.detail}`;
      msg.classList.remove("hidden");
      msg.classList.add("error");
    } finally {
      freshGo.disabled = false;
      freshGo.textContent = "Create playlist";
    }
  });
}

// ============================================================
// Intent chooser (2.1)
// ============================================================
// Replaces the old hidden settings panel. The filters were always there
// but lived behind an icon almost nobody clicked, so in practice every
// search ran on defaults. Asking "what are you after?" makes the same
// options discoverable, and presets mean most people never touch the
// individual toggles.
//
// IMPORTANT: "standard" reproduces the previous default behaviour
// exactly (albums + singles, no exclusions). Changing what a default
// search returns would silently alter results for anyone already using
// DeepDive, so the presets add options rather than moving the baseline.

const INTENTS = [
  {
    id: "standard",
    name: "Standard dive",
    desc: "Albums and singles, nothing filtered out. The usual.",
    opts: {},
  },
  {
    id: "studio",
    name: "Studio recordings only",
    desc: "Skips live takes, radio edits, instrumentals and a cappellas — just the proper studio versions.",
    opts: { excludeLive: true, excludeCensored: true, excludeInstrumental: true, excludeAcappella: true },
  },
  {
    id: "everything",
    name: "Everything they've touched",
    desc: "Adds compilations and guest appearances. Can be many times slower — for prolific artists this means hundreds of extra requests, so DeepDive will pace itself and may pause when Spotify asks it to.",
    opts: { includeAppearsOn: true },
  },
  {
    id: "custom",
    name: "Custom",
    desc: "Set the filters yourself.",
    opts: null, // read from the checkboxes
  },
];

const INTENT_KEY = "deepdive_intent";
const INTENT_SKIP_KEY = "deepdive_intent_skip";
const INTENT_CUSTOM_KEY = "deepdive_intent_custom";

function savedIntentId() {
  try { return localStorage.getItem(INTENT_KEY) || "standard"; } catch (e) { return "standard"; }
}
function intentSkipped() {
  try { return localStorage.getItem(INTENT_SKIP_KEY) === "1"; } catch (e) { return false; }
}
function savedCustomOpts() {
  try { return JSON.parse(localStorage.getItem(INTENT_CUSTOM_KEY) || "{}"); } catch (e) { return {}; }
}

/** Turn an intent id into the option flags runSearch expects. */
function optionsForIntent(id, customOpts) {
  const intent = INTENTS.find((i) => i.id === id) || INTENTS[0];
  const base = {
    excludeLive: false, excludeCensored: false, excludeInstrumental: false,
    excludeAcappella: false, matchRemasters: false, includeAppearsOn: false,
  };
  if (intent.id === "custom") return { ...base, ...(customOpts || savedCustomOpts()) };
  return { ...base, ...intent.opts };
}

let _pendingArtist = null;

function openIntentModal(artistName, { force = false } = {}) {
  // If they've opted out of being asked, go straight to the search —
  // unless this was opened deliberately from the options icon.
  if (!force && intentSkipped() && artistName) {
    return runSearchWithOptions(artistName, optionsForIntent(savedIntentId()));
  }

  _pendingArtist = artistName;
  const modal = document.getElementById("intent-modal");
  const list = document.getElementById("intent-list");
  const sub = document.getElementById("intent-artist");
  const custom = document.getElementById("intent-custom");
  const goBtn = document.getElementById("intent-go");
  if (!modal || !list) return;

  sub.textContent = artistName
    ? `Diving into ${artistName}. You can change this any time.`
    : "Pick a default. You can change this any time.";
  goBtn.textContent = artistName ? "Dive" : "Save";

  let selected = savedIntentId();

  const paint = () => {
    list.innerHTML = INTENTS.map((i) => `
      <button type="button" class="intent-opt${i.id === selected ? " selected" : ""}" data-intent="${i.id}">
        <span class="intent-radio"></span>
        <span class="intent-text">
          <span class="intent-name">${esc(i.name)}</span>
          <span class="intent-desc">${esc(i.desc)}</span>
        </span>
      </button>`).join("");
    custom.classList.toggle("hidden", selected !== "custom");
    // Only warn when the slow option is actually chosen — a warning
    // that's always on screen stops being read.
    const warn = document.getElementById("intent-warning");
    if (warn) {
      const heavy = selected === "everything" ||
        (selected === "custom" && !!document.getElementById("opt-appears-on")?.checked);
      warn.classList.toggle("hidden", !heavy);
    }
    list.querySelectorAll("[data-intent]").forEach((b) =>
      b.addEventListener("click", () => { selected = b.dataset.intent; paint(); }));
  };
  paint();

  // Prefill the custom checkboxes from whatever was last used.
  const c = savedCustomOpts();
  const setBox = (id, v) => { const el = document.getElementById(id); if (el) el.checked = !!v; };
  setBox("opt-live", c.excludeLive);
  setBox("opt-censored", c.excludeCensored);
  setBox("opt-instrumental", c.excludeInstrumental);
  setBox("opt-acappella", c.excludeAcappella);
  setBox("opt-remaster", c.matchRemasters);
  setBox("opt-appears-on", c.includeAppearsOn);

  // In Custom, ticking the appeared-on box should raise the same warning.
  const appearsBox = document.getElementById("opt-appears-on");
  if (appearsBox) appearsBox.addEventListener("change", () => {
    const warn = document.getElementById("intent-warning");
    if (warn && selected === "custom") warn.classList.toggle("hidden", !appearsBox.checked);
  });

  const remember = document.getElementById("intent-remember");
  if (remember) remember.checked = intentSkipped();

  modal.classList.remove("hidden");

  const close = () => modal.classList.add("hidden");
  const confirm = () => {
    const customOpts = readCustomOptions();
    try {
      localStorage.setItem(INTENT_KEY, selected);
      localStorage.setItem(INTENT_CUSTOM_KEY, JSON.stringify(customOpts));
      localStorage.setItem(INTENT_SKIP_KEY, remember && remember.checked ? "1" : "0");
    } catch (e) {}
    close();
    if (_pendingArtist) {
      const artist = _pendingArtist;
      _pendingArtist = null;
      runSearchWithOptions(artist, optionsForIntent(selected, customOpts));
    }
  };

  // Rebind cleanly each time so handlers don't stack across opens.
  const goEl = document.getElementById("intent-go");
  const cancelEl = document.getElementById("intent-cancel");
  const freshGo = goEl.cloneNode(true); goEl.replaceWith(freshGo);
  const freshCancel = cancelEl.cloneNode(true); cancelEl.replaceWith(freshCancel);
  freshGo.addEventListener("click", confirm);
  freshCancel.addEventListener("click", () => { _pendingArtist = null; close(); });
  modal.addEventListener("click", (e) => { if (e.target === modal) { _pendingArtist = null; close(); } });
  document.addEventListener("keydown", function onKey(e) {
    if (modal.classList.contains("hidden")) { document.removeEventListener("keydown", onKey); return; }
    if (e.key === "Escape") { _pendingArtist = null; close(); document.removeEventListener("keydown", onKey); }
    if (e.key === "Enter") { confirm(); document.removeEventListener("keydown", onKey); }
  });
}

function readCustomOptions() {
  return {
    excludeLive: !!document.getElementById("opt-live")?.checked,
    excludeCensored: !!document.getElementById("opt-censored")?.checked,
    excludeInstrumental: !!document.getElementById("opt-instrumental")?.checked,
    excludeAcappella: !!document.getElementById("opt-acappella")?.checked,
    matchRemasters: !!document.getElementById("opt-remaster")?.checked,
    includeAppearsOn: !!document.getElementById("opt-appears-on")?.checked,
  };
}

function wireSearchBar() {
  const input = document.getElementById("artist-input");
  const goBtn = document.getElementById("search-go-btn");
  const list = document.getElementById("autofill-list");
  const settingsBtn = document.getElementById("settings-toggle-btn");

  // The options icon now opens the intent chooser directly. It's the way
  // back in for anyone who ticked "Don't ask again" — without it, that
  // choice would be permanent with no visible escape.
  settingsBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const n = input.value.trim();
    openIntentModal(n || null, { force: true });
  });

  const go = () => { const n = input.value.trim(); if (n) startSearch(n); };
  goBtn.addEventListener("click", go);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !list.classList.contains("open")) go(); });

  // autofill
  let timer = null, items = [], active = -1;
  const close = () => { list.classList.remove("open"); list.innerHTML = ""; items = []; active = -1; };
  const choose = (it) => { input.value = it.name; close(); startSearch(it.name); };
  input.addEventListener("input", () => {
    const q = input.value.trim();
    clearTimeout(timer);
    if (q.length < 2) return close();
    timer = setTimeout(async () => {
      try {
        items = await client.searchArtists(q, 6);
        if (!items.length) return close();
        // Each result gets a pin button. Pinning from here is the whole
        // point: you're already typing the artist's name, so "save for
        // later" should be one button away rather than a separate page.
        // It also stores the real Spotify artist and image rather than a
        // typed string, which the old To-Dive page couldn't do.
        list.innerHTML = items.map((it, i) => `
          <div class="autofill-item" data-i="${i}">
            ${it.image_url ? `<img src="${esc(it.image_url)}" alt="">` : ""}
            <span class="autofill-name">${esc(it.name)}</span>
            <button type="button" class="autofill-pin" data-pin-i="${i}" title="Pin for later" aria-label="Pin ${esc(it.name)} for later">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>
          </div>`).join("");
        list.classList.add("open");
        active = -1;
        list.querySelectorAll(".autofill-item").forEach((el) => {
          el.addEventListener("mousedown", (ev) => {
            // Don't fire the search when the pin button was the target.
            if (ev.target.closest(".autofill-pin")) return;
            ev.preventDefault();
            choose(items[+el.dataset.i]);
          });
        });
        list.querySelectorAll("[data-pin-i]").forEach((btn) => {
          btn.addEventListener("mousedown", (ev) => { ev.preventDefault(); ev.stopPropagation(); });
          btn.addEventListener("click", (ev) => {
            ev.preventDefault(); ev.stopPropagation();
            const it = items[+btn.dataset.pinI];
            if (!it) return;
            watchlist.pin(it.name, { spotifyId: it.id, imageUrl: it.image_url || null });
            flash(`Pinned ${it.name}.`);
            close();
            input.value = "";
            addPinToRow(it.name);
          });
        });
      } catch (e) { close(); }
    }, 250);
  });
  input.addEventListener("keydown", (e) => {
    if (!list.classList.contains("open")) return;
    const els = Array.from(list.querySelectorAll(".autofill-item"));
    if (e.key === "ArrowDown") { e.preventDefault(); active = Math.min(active + 1, els.length - 1); els.forEach((el, i) => el.classList.toggle("active", i === active)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); active = Math.max(active - 1, 0); els.forEach((el, i) => el.classList.toggle("active", i === active)); }
    else if (e.key === "Enter" && active >= 0) { e.preventDefault(); choose(items[active]); }
    else if (e.key === "Escape") close();
  });
  document.addEventListener("click", (e) => { if (!list.contains(e.target) && e.target !== input) close(); });
}

// ---- hidden demo mode ----
// Recommendations come from real listening history, so screenshots
// expose whatever happens to be in the library. Demo mode substitutes a
// fixed artist list so marketing images can be staged. Undocumented on
// purpose. Enable with ?demo=Artist+One,Artist+Two (or ?demo=1 for a
// built-in sample set). Persists for the session only.
//
// (These were accidentally removed alongside the old To-Dive row in 2.2
// while the call site remained, throwing a ReferenceError before any
// error guard could catch it — which is why the whole row silently
// failed to render.)
const DEMO_SAMPLE = [
  "Fleetwood Mac", "Big Thief", "Talking Heads", "Fiona Apple",
  "The Beths", "Wednesday", "Radiohead", "Sharon Van Etten",
  "Turnstile", "Alvvays", "MJ Lenderman", "Japanese Breakfast",
];

function demoArtists() {
  try {
    const p = new URLSearchParams(window.location.search).get("demo");
    if (p !== null) {
      const list = p === "1" || p === ""
        ? DEMO_SAMPLE
        : p.split(",").map((x) => x.trim()).filter(Boolean);
      sessionStorage.setItem("deepdive_demo", JSON.stringify(list));
      return list;
    }
    const stored = sessionStorage.getItem("deepdive_demo");
    if (stored) return JSON.parse(stored);
  } catch (e) {}
  return null;
}

async function loadSuggestions() {
  const el = document.getElementById("suggestions-row");
  if (!el) return;

  let demo = null;
  try { demo = demoArtists(); } catch (e) { demo = null; }
  if (demo && demo.length) {
    el.innerHTML = `
      <p class="crate-note" style="margin-top:28px; text-align:center;">Based on what you've been listening to:</p>
      <div class="pill-row" style="justify-content:center;">
        ${demo.map((name) => `
          <div class="pill-wrap">
            <button class="pill" data-search="${esc(name)}">${esc(name)}</button>
          </div>`).join("")}
      </div>`;
    el.querySelectorAll("[data-search]").forEach((b) =>
      b.addEventListener("click", () => startSearch(b.dataset.search)));
    return;
  }

  try {
    await buildSuggestionRow(el);
  } catch (err) {
    // Never fail silently. An empty row with no explanation is
    // indistinguishable from a broken app, which is exactly how the
    // last one presented.
    el.innerHTML = `<p class="crate-note row-label">Couldn't build suggestions: ${esc(err && err.message ? err.message : String(err))}</p>`;
    console.error("[DeepDive] suggestion row failed:", err);
  }
}

async function buildSuggestionRow(el) {
  // Two halves. The listening half needs API calls; the library half is
  // computed from the cache and costs nothing — so if Spotify is slow,
  // rate-limited, or the token is stale, the row still populates.
  const blocked = watchlist.blockedNameSet();
  const pins = watchlist.pinned();
  const pinNames = new Set(pins.map((e) => (e.name || "").trim().toLowerCase()));
  const doneNames = new Set(watchlist.listDone().map((e) => (e.name || "").trim().toLowerCase()));
  const exclude = new Set([...blocked, ...pinNames, ...doneNames]);

  // Paint pins IMMEDIATELY, before anything async.
  //
  // Pins live in localStorage and are synchronously available. They need
  // no network and no IndexedDB, so making them wait on either is simply
  // wrong — and it's why this looked broken for three rounds: the row
  // awaited both halves before rendering even once, which meant up to
  // sixteen seconds of blank page whenever Spotify was slow.
  //
  // Anything the user explicitly asked for should appear at once, and
  // generated suggestions should fill in around it.
  renderSuggestionRow(el, pins, [], false, { pending: true });

  // Stable for the session: something that caught your eye should still
  // be there when you come back to the page.
  let seed;
  try {
    seed = parseInt(sessionStorage.getItem("deepdive_sugg_seed") || "0", 10);
    if (!seed) { seed = Date.now() >>> 0; sessionStorage.setItem("deepdive_sugg_seed", String(seed)); }
  } catch (e) { seed = 12345; }

  const smallest = (imgs) => (imgs && imgs.length ? imgs[imgs.length - 1].url : null);

  // --- library half (free) ---
  // Bounded: storage that hangs rather than fails would otherwise stall
  // the whole row with nothing to show and nothing to report. A missed
  // suggestion is a far better outcome than a blank page.
  let libraryPicks = [];
  let cachedArt = { byId: new Map(), byName: new Map() };
  try {
    const cached = await Promise.race([
      libraryCache.peek(),
      new Promise((resolve) => setTimeout(() => resolve([]), 2500)),
    ]);
    if (cached && cached.length) {
      libraryPicks = insights.librarySuggestions(cached, { exclude, limit: 6 });
      // Artwork for anything already in the library, free of charge.
      cachedArt = insights.artworkFromCache(cached);
      // Sampler candidates come from the same read — no extra cost.
      // Keep the full pool rather than a trimmed twelve, so each run can
      // draw a different handful from it.
      _samplerPool = insights.artistsBarelyExplored(cached, {
        maxTracks: 3, limit: 500,
      }).filter((a) => !blocked.has((a.name || "").trim().toLowerCase()));
    }
  } catch (e) { /* cache unavailable — listening half still works */ }

  // --- listening half (API) ---
  let listeningPicks = [];
  let listeningFailed = false;
  try {
    // Also bounded. If Spotify is rate-limited these retry with backoff
    // for minutes; the row should appear regardless.
    const [top, recent] = await Promise.race([
      Promise.all([
        client.getTopArtists("medium_term", 10),
        client.getRecentlyPlayedArtists(50),
      ]),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timed out")), 8000)),
    ]);
    const seen = new Map();
    for (const a of top) if (!seen.has(a.id)) seen.set(a.id, { id: a.id, name: a.name, image_url: smallest(a.images), reason: "you've been playing them" });
    for (const a of recent) if (!seen.has(a.id)) seen.set(a.id, { id: a.id, name: a.name, image_url: null, reason: "played recently" });
    listeningPicks = Array.from(seen.values()).filter((s2) => {
      const k = (s2.name || "").trim().toLowerCase();
      return !exclude.has(k) && !libraryPicks.some((l) => l.id === s2.id);
    });
    listeningPicks = insights.seededPick(listeningPicks, 6, seed);
  } catch (e) { listeningFailed = true; /* library half still works */ }

  const suggestions = [...listeningPicks, ...libraryPicks];

  // Borrow cached artwork before considering any network request. Most
  // suggested artists are in the library already, so this covers the
  // majority for nothing — and per-artist photo requests were exactly
  // what was silently failing under rate limiting.
  for (const x of suggestions) {
    if (x.image_url) continue;
    x.image_url = cachedArt.byId.get(x.id)
      || cachedArt.byName.get((x.name || "").trim().toLowerCase())
      || null;
  }

  // Render NOW, before fetching any artwork.
  //
  // Artwork is one API request per artist. When the app is rate-limited
  // each of those retries with backoff, so awaiting them before the
  // first render can block the entire row — pins included — for minutes,
  // or forever. Pins are the user's own deliberate choices and must
  // never wait on a decorative lookup.
  try {
    renderSuggestionRow(el, pins, suggestions, false, { listeningFailed, hasCache: libraryPicks.length > 0 });
  } catch (e) {
    el.innerHTML = `<p class="crate-note row-label">Couldn't build suggestions.</p>`;
  }

  // Then enrich in the background and re-render if anything arrives.
  const missing = suggestions.filter((x) => !x.image_url).map((x) => x.id).filter(Boolean);
  if (missing.length) {
    try {
      const details = await client.getArtistsByIds(missing.slice(0, 12));
      const byId = new Map(details.map((a) => [a.id, smallest(a.images)]));
      let changed = false;
      for (const x of suggestions) {
        if (!x.image_url && byId.get(x.id)) { x.image_url = byId.get(x.id); changed = true; }
      }
      // Only redraw if the row is still on screen and something changed;
      // the user may have navigated away while this was in flight.
      if (changed && document.getElementById("suggestions-row") === el) {
        renderSuggestionRow(el, pins, suggestions);
      }
    } catch (e) { /* photos are optional; the row is already up */ }
  }
}

/**
 * Renders pins first (higher intent — you asked for these by name), then
 * the generated suggestions, each labelled with why it's being shown.
 * An unexplained recommendation is clutter; a reason makes it a prompt.
 */
/**
 * Add a pin to the already-rendered row without rebuilding it. Used when
 * pinning from the autofill dropdown: that artist usually isn't in the
 * suggestions at all, so nothing about the suggestions needs to change.
 * Falls back to a full load only if the row hasn't been rendered yet.
 */
function addPinToRow(name) {
  if (!_row || !_row.el || !document.getElementById("suggestions-row")) {
    loadSuggestions();
    return;
  }
  _row.pins = watchlist.pinned();
  const key = (name || "").trim().toLowerCase();
  // If they happened to be suggested too, drop the duplicate.
  _row.suggestions = _row.suggestions.filter((x) => (x.name || "").trim().toLowerCase() !== key);
  renderSuggestionRow(_row.el, _row.pins, _row.suggestions, _row.showAllPins, _row.state);
}

// The last rendered row. Pinning, unpinning and blocking all change only
// which items belong where — none of them need fresh data — so they
// adjust this and redraw rather than re-running the whole build, which
// would fire API calls again and visibly flash the row.
let _row = null;

function renderSuggestionRow(el, pins, suggestions, showAllPins = false, state = {}) {
  _row = { el, pins, suggestions, showAllPins, state };
  const PIN_VISIBLE = 8;
  const shownPins = showAllPins ? pins : pins.slice(0, PIN_VISIBLE);
  const extraPins = pins.length - shownPins.length;

  // Tiles lead with artwork. The reason line stays — an unexplained
  // suggestion is clutter — but it's secondary text now rather than a
  // mono badge competing with the name.
  const initial = (n) => esc((n || "?").trim().charAt(0).toUpperCase());
  const art = (name, imageUrl) => imageUrl
    ? `<img src="${esc(imageUrl)}" alt="" class="tile-art" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'tile-art-fallback',textContent:'${initial(name)}'}))">`
    : `<span class="tile-art-fallback">${initial(name)}</span>`;

  const tile = (name, imageUrl, sub, actions, isPin) => `
    <div class="tile-wrap${isPin ? " is-pin" : ""}">
      <button class="tile" data-search="${esc(name)}">
        ${art(name, imageUrl)}
        <span class="tile-text">
          <span class="tile-title">${esc(name)}</span>
          ${sub ? `<span class="tile-sub">${esc(sub)}</span>` : ""}
        </span>
      </button>
      ${actions ? `<span class="tile-actions">${actions}</span>` : ""}
    </div>`;

  const pinsHtml = shownPins.length ? `
    <div class="row-head"><h2>Pinned</h2></div>
    <div class="tile-grid">
      ${shownPins.map((p) => tile(p.name, p.image_url, null,
        `<button class="tile-btn danger" data-unpin="${esc(p.id)}" data-name="${esc(p.name)}" title="Unpin">&times;</button>`, true)).join("")}
    </div>
    ${extraPins > 0 ? `<div style="text-align:center;margin-top:10px;"><button class="btn btn-ghost btn-small" id="show-more-pins">Show ${extraPins} more</button></div>` : ""}` : "";

  const suggHtml = suggestions.length ? `
    <div class="row-head"><h2>Suggested</h2><span class="qual">for you</span></div>
    <div class="tile-grid">
      ${suggestions.map((sg) => tile(sg.name, sg.image_url, sg.reason,
        `<button class="tile-btn" data-pin="${esc(sg.name)}" data-sid="${esc(sg.id || "")}" data-img="${esc(sg.image_url || "")}" title="Pin for later">+</button>
         <button class="tile-btn danger" data-block="${esc(sg.name)}" data-sid="${esc(sg.id || "")}" title="Never suggest this artist">&minus;</button>`)).join("")}
    </div>` : "";

  // Never leave the row silently blank — an empty area with no
  // explanation reads as broken. Say which half was unavailable.
  let emptyHtml = "";
  if (!suggestions.length) {
    if (state.pending) {
      emptyHtml = `<p class="crate-note row-label">Finding suggestions…</p>`;
    } else if (!shownPins.length) {
      const why = state.listeningFailed
        ? "Couldn't reach Spotify for listening-based suggestions right now."
        : "Run a search first — suggestions are built from your library once it's been read.";
      emptyHtml = `<p class="crate-note row-label">${esc(why)} Pin an artist from the search box to keep it here.</p>`;
    }
  }

  // Two independently-painted sections. Keeping them separate means
  // changing the pins never repaints the suggestions, which is where all
  // the avatars are — repainting those was the visible flash.
  if (!el.querySelector("#pins-section") || !el.querySelector("#sugg-section")) {
    el.innerHTML = `<div id="pins-section"></div><div id="sugg-section"></div>`;
  }
  const pinsSection = el.querySelector("#pins-section");
  const suggSection = el.querySelector("#sugg-section");
  // The sampler belongs at the end of the suggestions, not among the
  // playlist cards: it's about artists you've barely explored, which is
  // the same subject as the row above it.
  const samplerArtists = samplerSourceArtists();
  const samplerHtml = samplerArtists.length >= 2 ? `
    <div class="sampler-row">
      <button class="btn btn-ghost btn-sampler" id="sampler-btn">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        Sampler
      </button>
    </div>` : "";

  if (state.pinsOnly) {
    pinsSection.innerHTML = pinsHtml;
  } else {
    pinsSection.innerHTML = pinsHtml;
    suggSection.innerHTML = suggHtml + emptyHtml + samplerHtml;
  }

  const sampBtn = document.getElementById("sampler-btn");
  if (sampBtn) sampBtn.addEventListener("click", () => openSampler(samplerArtists));

  el.querySelectorAll("[data-search]").forEach((b) =>
    b.addEventListener("click", () => startSearch(b.dataset.search)));

  const redraw = () => renderSuggestionRow(_row.el, _row.pins, _row.suggestions, _row.showAllPins, _row.state);
  // Repaint pins alone — suggestions and their images stay untouched.
  const redrawPins = () => renderSuggestionRow(
    _row.el, _row.pins, _row.suggestions, _row.showAllPins,
    Object.assign({}, _row.state, { pinsOnly: true })
  );

  // Removing a single pill should touch only that pill. Re-rendering the
  // row replaces innerHTML, which tears down and rebuilds every element
  // including all the avatars — that repaint is the flash, and stopping
  // the API calls alone didn't remove it.
  const dropPill = (btn) => {
    const wrap = btn.closest(".tile-wrap");
    if (!wrap) { redraw(); return; }
    const row = wrap.parentElement;
    wrap.remove();
    // If that emptied a section, take its header and row away too,
    // rather than leaving a stranded label.
    if (row && !row.querySelector(".tile-wrap")) {
      const head = row.previousElementSibling;
      if (head && head.classList.contains("row-head")) head.remove();
      row.remove();
    }
  };

  el.querySelectorAll("[data-pin]").forEach((b) => b.addEventListener("click", (ev) => {
    ev.stopPropagation();
    const name = b.dataset.pin;
    watchlist.pin(name, { spotifyId: b.dataset.sid || null, imageUrl: b.dataset.img || null });
    flash(`Pinned ${name}.`);
    // Move it from suggestions to pins locally — the underlying data
    // hasn't changed, only where this artist belongs.
    const key = name.trim().toLowerCase();
    _row.suggestions = _row.suggestions.filter((x) => (x.name || "").trim().toLowerCase() !== key);
    _row.pins = watchlist.pinned();
    dropPill(b);        // remove it from suggestions in place
    redrawPins();       // and repaint only the pins section
  }));

  el.querySelectorAll("[data-unpin]").forEach((b) => b.addEventListener("click", (ev) => {
    ev.stopPropagation();
    // Confirm before removing — a pin was a deliberate act, so losing one
    // to a stray tap would be annoying.
    if (!window.confirm(`Unpin ${b.dataset.name}?`)) return;
    watchlist.unpin(b.dataset.unpin);
    _row.pins = _row.pins.filter((p) => p.id !== b.dataset.unpin);
    dropPill(b);
  }));

  el.querySelectorAll("[data-block]").forEach((b) => b.addEventListener("click", (ev) => {
    ev.stopPropagation();
    const name = b.dataset.block;
    watchlist.block(name, b.dataset.sid || null);
    flash(`${name} won't be suggested again.`);
    const key = name.trim().toLowerCase();
    _row.suggestions = _row.suggestions.filter((x) => (x.name || "").trim().toLowerCase() !== key);
    dropPill(b);
  }));

  const moreBtn = document.getElementById("show-more-pins");
  // Pins are unlimited by design, so long lists collapse rather than
  // being capped — the user decides how messy their own list gets.
  if (moreBtn) moreBtn.addEventListener("click", () => {
    _row.showAllPins = true;
    redraw();
  });
}

// ============================================================
// Search run (progress -> results)
// ============================================================
// Turns a preflight failure into something actionable. A 403 here almost
// always means the connected token is missing a scope DeepDive needs
// (the exact situation the Flask health check was added for) — the fix
// is reconnecting so Spotify re-grants permissions.
async function preflight() {
  try {
    await client.healthCheck();
  } catch (e) {
    const status = e && e.status;
    if (status === 403 || status === 401) {
      throw new Error(
        "Spotify rejected this connection (missing or expired permissions). " +
        "Open the menu and choose Disconnect Spotify, then connect again to re-grant access."
      );
    }
    throw new Error(`Couldn't reach Spotify: ${e.message || e}`);
  }
}

// Entry point from the search bar / pills / watchlist. Shows the intent
// chooser first (unless the user opted out), then runs the search.
function startSearch(artistName) {
  openIntentModal(artistName);
}

async function runSearchWithOptions(artistName, opts) {
  renderProgress(`Digging through ${artistName}…`);
  try {
    // Preflight (issue #3): verify this token can actually do what the
    // scan is about to ask. Ported from the Flask health check, which
    // was added after a token that looked valid 403'd on /me/playlists
    // only AFTER a full search had completed. Costs ~3 cheap requests;
    // saves an entire wasted scan.
    updateProgress(0, "Checking your Spotify connection…");
    await preflight();

    const result = await search.runSearch(client, artistName, {
      ...opts,
      libraryCache,
      onProgress: (pct, stage) => updateProgress(pct, stage),
    });
    lastResult = result;
    history.recordDive({
      artistId: result.artist && result.artist.id,
      artistName: result.artist && result.artist.name,
      imageUrl: result.artist && result.artist.images && result.artist.images.length
        ? result.artist.images[result.artist.images.length - 1].url : null,
      duplicates: (result.duplicate_candidates || []).length,
      newTracks: (result.new_tracks || []).length,
      alreadyLiked: result.already_liked_count || 0,
    });
    renderResults(result);
    // If this artist was pinned, the pin has served its purpose. Ask
    // rather than assume — but ask at the moment it's obvious, which is
    // the moment the dive finishes, not later on a list page.
    maybeOfferUnpin(artistName);
  } catch (e) {
    renderProgressError(e.message || String(e), e);
  }
}

function maybeOfferUnpin(artistName) {
  const entry = watchlist.findPinByName(artistName);
  if (!entry) return;  // only ask about artists that were actually pinned
  const slot = document.getElementById("result-msg");
  if (!slot) return;
  slot.classList.remove("hidden", "error");
  slot.innerHTML = `
    <span>${esc(artistName)} is on your pinned list. Done with it?</span>
    <button class="btn btn-ghost btn-small" id="unpin-after-dive" style="margin-left:10px;">Remove pin</button>`;
  const btn = document.getElementById("unpin-after-dive");
  if (btn) btn.addEventListener("click", () => {
    watchlist.unpin(entry.id);
    slot.textContent = `Removed ${artistName} from your pins.`;
  });
}

function renderProgress(title) {
  setTitle("(0%) DeepDive · Working");
  root.innerHTML = `
    <div class="card">
      <h1 id="prog-title">${esc(title)}</h1>
      <p class="muted">This can take a while for artists with large catalogs — DeepDive reads every release track by track.</p>
      <div class="progress-stage" id="prog-stage">Starting…</div>
      <div class="progress-track"><div class="progress-fill" id="prog-fill"></div></div>
      <div class="progress-meta"><span id="prog-pct">0%</span></div>
      <div class="flash error hidden" id="prog-error" style="margin-top:20px;"></div>
      <div class="actions hidden" id="prog-back"><button class="btn btn-ghost" data-nav-home>Back</button></div>
    </div>`;
  root.querySelector("[data-nav-home]")?.addEventListener("click", () => renderHome());
}
function updateProgress(pct, stage) {
  const fill = document.getElementById("prog-fill");
  const pctEl = document.getElementById("prog-pct");
  const stageEl = document.getElementById("prog-stage");
  if (fill) fill.style.width = pct + "%";
  if (pctEl) pctEl.textContent = pct + "%";
  if (stageEl && stage) stageEl.textContent = stage;
  setTitle(`(${pct}%) DeepDive · Working`);
}
// Turn an error into something a person can act on, plus the technical
// detail underneath. The point is that nobody should ever need to open
// the network console to find out what happened — a 429 with a six-hour
// Retry-After should say "wait until 5pm", not "something went wrong".
function explainError(err) {
  const status = err && err.status;
  const ra = err && (err.retryAfterSeconds ?? parseFloat(err.retryAfter));

  if (status === 429 && !Number.isNaN(ra) && ra > 0) {
    const until = new Date(Date.now() + ra * 1000);
    const hrs = Math.floor(ra / 3600);
    const mins = Math.round((ra % 3600) / 60);
    const dur = hrs ? `${hrs}h ${mins}m` : `${Math.max(1, mins)} minutes`;
    const clock = until.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    return {
      headline: "Spotify has paused this app",
      detail:
        `Your Spotify app has been rate-limited for about ${dur} — until roughly ${clock}. ` +
        `This isn't a bug and retrying won't help; the limit is on your Spotify credentials, not DeepDive. ` +
        `It usually follows a lot of scanning in a short period, especially with compilations and guest appearances turned on.`,
      canRetry: false,
    };
  }
  if (status === 429) {
    return {
      headline: "Spotify is rate-limiting us",
      detail: "Too many requests in a short period. Waiting a few minutes usually clears it.",
      canRetry: true,
    };
  }
  if (status === 401 || status === 403) {
    return {
      headline: "Spotify rejected the connection",
      detail: "Your login may have expired or is missing a permission. Open the menu, choose Disconnect Spotify, then connect again.",
      canRetry: false,
    };
  }
  if (status === 0) {
    return {
      headline: "Couldn't reach Spotify",
      detail: "The request timed out or the network dropped. Check your connection and try again.",
      canRetry: true,
    };
  }
  return {
    headline: "Something went wrong",
    detail: (err && err.message) ? String(err.message) : String(err),
    canRetry: true,
  };
}

/** The technical detail, shown on demand — the network-console view. */
function diagnosticsHtml() {
  const log = client.log || { counts: {}, total: 0 };
  const rows = Object.entries(log.counts)
    .sort((a, b) => b[1] - a[1])
    .map(([path, n]) => `<tr><td>${esc(path)}</td><td style="text-align:right;">${n}</td></tr>`)
    .join("");
  const e = log.lastError;
  const errBlock = e ? `
    <div class="diag-block">
      <div class="diag-label">Last failed request</div>
      <div><strong>HTTP ${esc(e.status)}</strong>${e.reason ? ` · ${esc(e.reason)}` : ""}</div>
      ${e.message ? `<div class="diag-mono">${esc(e.message)}</div>` : ""}
      ${e.retryAfter ? `<div>Retry-After: <strong>${esc(e.retryAfter)}s</strong></div>` : "<div>No Retry-After header</div>"}
      <div class="diag-mono">${esc(e.url || "")}</div>
    </div>` : "";
  return `
    ${errBlock}
    <div class="diag-block">
      <div class="diag-label">Requests this session (${log.total})</div>
      <table class="diag-table">${rows || "<tr><td>none</td><td></td></tr>"}</table>
    </div>
    <div class="diag-block">
      <div class="diag-label">Build</div>
      <div>${esc(BUILD)}</div>
    </div>
    <div class="diag-block">
      <div class="diag-label">Pacing</div>
      <div>${client._throttleMs ? `${client._throttleMs}ms between requests (learned from rate limiting)` : "none — running at full speed"}</div>
    </div>`;
}

function renderProgressError(msgOrErr, err) {
  setTitle("DeepDive · Error");
  const info = explainError(err || msgOrErr);
  const box = document.getElementById("prog-error");
  const back = document.getElementById("prog-back");
  if (box) {
    box.classList.remove("hidden");
    box.innerHTML = `
      <div style="font-weight:700; margin-bottom:6px;">${esc(info.headline)}</div>
      <div style="line-height:1.5;">${esc(info.detail)}</div>
      <details class="diag">
        <summary>Technical details</summary>
        ${diagnosticsHtml()}
      </details>`;
  }
  if (back) back.classList.remove("hidden");
}

// ============================================================
// Results (like + playlist)
// ============================================================
function trackRow(t, { checkbox = true, cls = "newt", sub = "" } = {}) {
  return `
    <div class="track-row ${cls}" data-rd="${esc((t.album && t.album.release_date) || "")}" data-title="${esc((t.name || "").toLowerCase())}">
      ${checkbox ? `<input type="checkbox" data-tid="${esc(t.id)}" checked>` : ""}
      <div class="track-meta">
        <div class="track-name">${esc(t.name)}</div>
        <div class="track-sub">${esc(sub || (t.album && t.album.name) || "")}</div>
      </div>
      <div class="track-dur">${t.duration_ms ? fmtDur(t.duration_ms) : ""}</div>
    </div>`;
}

function renderResults(r) {
  setTitle("DeepDive · Results");
  const dups = r.duplicate_candidates || [];
  const news = r.new_tracks || [];
  const artistName = r.artist ? r.artist.name : "";

  root.innerHTML = `
    <div class="card">
      <h1>${esc(artistName)}</h1>
      <p class="muted">${r.already_liked_count} already liked · ${dups.length} to confirm · ${news.length} new${r.excluded_count ? ` · ${r.excluded_count} excluded by filters` : ""}</p>
      ${r.collapsed_count ? `<p class="crate-note">${r.collapsed_count} duplicate recording${r.collapsed_count === 1 ? "" : "s"} collapsed — the same track appeared on more than one release.</p>` : ""}

      ${dups.length ? `
        <div class="crate-header"><span class="label teal">Already yours, elsewhere</span><span class="rule"></span></div>
        <p class="crate-note">Same recording as something in your Liked Songs, under a different release. Checked = will be liked.</p>
        <div id="dup-list">
          ${dups.map((d) => `
            <div class="track-row dup">
              <input type="checkbox" data-dup="${esc(d.track.id)}" checked>
              <div class="track-meta">
                <div class="track-name">${esc(d.track.name)}</div>
                <div class="track-sub">${esc((d.track.album && d.track.album.name) || "")}</div>
                <div class="track-match">${esc(d.match_basis)} · matches "${esc(d.matched_liked_track ? d.matched_liked_track.name : "")}"</div>
              </div>
              <div class="track-dur">${d.track.duration_ms ? fmtDur(d.track.duration_ms) : ""}</div>
            </div>`).join("")}
        </div>` : ""}

      <div class="crate-header"><span class="label gold">New to you</span><span class="rule"></span></div>
      ${news.length ? `
        <div class="sort-row">
          <label for="new-sort">Sort by</label>
          <select id="new-sort" class="sort-select">
            <option value="album" selected>Album order (discography)</option>
            <option value="date-desc">Release date (newest)</option>
            <option value="date-asc">Release date (oldest)</option>
            <option value="title">Title (A–Z)</option>
          </select>
        </div>
        <div id="new-list">${sortTracks(news, "album").map((t) => trackRow(t, { cls: "newt" })).join("")}</div>
      ` : `<p class="empty-note">Nothing new — your library already covers this artist.</p>`}

      <div class="playlist-name-field" id="playlist-name-wrap">
        <label>Playlist name</label>
        <input type="text" id="playlist-name" value="DeepDive · ${esc(artistName)}">
      </div>

      <div class="actions">
        ${dups.length ? `<button class="btn btn-primary" data-action="like">Like Songs</button>` : ""}
        ${news.length ? `<button class="btn btn-primary" data-action="playlist">Create Playlist Only</button>` : ""}
        ${dups.length && news.length ? `<button class="btn btn-primary" data-action="both">Like Songs &amp; Create Playlist</button>` : ""}
        <button class="btn btn-ghost" data-home>Back to search</button>
      </div>
      <div class="flash hidden" id="result-msg" style="margin-top:18px;"></div>
    </div>`;

  root.querySelector("[data-home]").addEventListener("click", () => renderHome());

  // sort — re-render the list from sorted data (preserves which rows are
  // checked by re-reading current checkbox state before re-rendering).
  const sortSel = document.getElementById("new-sort");
  if (sortSel) {
    const listEl = document.getElementById("new-list");
    sortSel.addEventListener("change", () => {
      // Capture current checkbox state so re-render doesn't reset it.
      const allBoxes = Array.from(listEl.querySelectorAll("[data-tid]"));
      const uncheckedIds = new Set(allBoxes.filter((c) => !c.checked).map((c) => c.dataset.tid));
      const sorted = sortTracks(news, sortSel.value);
      listEl.innerHTML = sorted.map((t) => trackRow(t, { cls: "newt" })).join("");
      // Rows render checked by default; re-uncheck the ones that were unchecked.
      listEl.querySelectorAll("[data-tid]").forEach((c) => {
        if (uncheckedIds.has(c.dataset.tid)) c.checked = false;
      });
    });
  }

  document.querySelectorAll("[data-action]").forEach((b) =>
    b.addEventListener("click", () => applyResults(r, b.dataset.action)));
}

async function applyResults(r, action) {
  const btns = Array.from(document.querySelectorAll("[data-action]"));
  const msg = document.getElementById("result-msg");
  btns.forEach((b) => (b.disabled = true));

  // Two distinct groups: checked duplicates ("already yours elsewhere")
  // get LIKED; checked new tracks go to the PLAYLIST. Which of those two
  // actions runs is decided by the button pressed:
  //   like     -> like the checked duplicates only
  //   playlist -> build a playlist from the checked new tracks only
  //   both     -> do both
  const dupIds = Array.from(document.querySelectorAll("[data-dup]:checked")).map((c) => c.dataset.dup);
  const newIds = Array.from(document.querySelectorAll("[data-tid]:checked")).map((c) => c.dataset.tid);
  const playlistName = (document.getElementById("playlist-name")?.value || "").trim() || `DeepDive · ${r.artist ? r.artist.name : ""}`;

  const doLike = action === "like" || action === "both";
  const doPlaylist = action === "playlist" || action === "both";

  const parts = [];
  try {
    if (doLike && dupIds.length) {
      await client.likeTracks(dupIds);
      parts.push(`Liked ${dupIds.length} track${dupIds.length === 1 ? "" : "s"}.`);
      // Recorded so it can be reversed. Spotify offers no bulk unlike,
      // and DeepDive is the only thing that knows exactly which tracks
      // these were.
      history.recordAction({
        type: "like",
        label: `Liked ${dupIds.length} track${dupIds.length === 1 ? "" : "s"} by ${(r.artist && r.artist.name) || "an artist"}`,
        trackIds: dupIds,
      });
    }
    if (doPlaylist && newIds.length) {
      const res = await client.addTracksToPlaylistDeduped(
        playlistName,
        `New-to-you tracks by ${r.artist ? r.artist.name : ""}, found by DeepDive.`,
        newIds
      );
      parts.push(`Playlist ${res.reused ? "updated" : "created"}: added ${res.added_count}${res.already_present_count ? `, ${res.already_present_count} already present` : ""}.`);
      msg.innerHTML = `${esc(parts.join(" "))} <a href="${esc(res.url)}" target="_blank" rel="noopener" style="color:var(--accent);text-decoration:underline;">Open playlist</a>`;
      msg.classList.remove("hidden", "error");
      btns.forEach((b) => (b.disabled = false));
      return;
    }
    msg.textContent = parts.length ? parts.join(" ") : "Nothing selected.";
    msg.classList.remove("hidden", "error");
  } catch (e) {
    msg.textContent = `Something went wrong: ${e.message || e}`;
    msg.classList.remove("hidden");
    msg.classList.add("error");
  } finally {
    btns.forEach((b) => (b.disabled = false));
  }
}

// ============================================================
// Full library scrub
// ============================================================
function renderScrubForm() {
  setTitle("DeepDive · Full library scan");
  setActiveTab("scrub");
  root.innerHTML = `
    <div class="card">
      <h1>Scan your whole library</h1>
      <p class="muted">Crawls every artist in your Liked Songs the same way a single search does — catches everything, but for a large library this can take a long time. You can cancel any time and keep what was found.</p>
      <div class="filter-options" style="margin-bottom:20px;">
        <label class="checkbox-option"><input type="checkbox" id="s-live"> Exclude live recordings</label>
        <label class="checkbox-option"><input type="checkbox" id="s-censored"> Exclude radio edits &amp; censored versions</label>
        <label class="checkbox-option"><input type="checkbox" id="s-instrumental"> Exclude instrumentals</label>
        <label class="checkbox-option"><input type="checkbox" id="s-acappella"> Exclude a cappella versions</label>
        <label class="checkbox-option"><input type="checkbox" id="s-remaster"> Count remasters as duplicates</label>
        <label class="checkbox-option"><input type="checkbox" id="s-appears-on"> Include compilations &amp; "appeared on"</label>
      </div>
      <div class="actions" style="margin-top:0;">
        <button class="btn btn-primary" id="scrub-go">Run full library scrub</button>
        <button class="btn btn-ghost" data-home>Cancel</button>
      </div>
    </div>`;
  root.querySelector("[data-home]").addEventListener("click", () => renderHome());
  document.getElementById("scrub-go").addEventListener("click", startScrub);
}

async function startScrub() {
  const opts = {
    excludeLive: document.getElementById("s-live").checked,
    excludeCensored: document.getElementById("s-censored").checked,
    excludeInstrumental: document.getElementById("s-instrumental").checked,
    excludeAcappella: document.getElementById("s-acappella").checked,
    matchRemasters: document.getElementById("s-remaster").checked,
    includeAppearsOn: document.getElementById("s-appears-on").checked,
  };
  scrubCancel = { cancelled: false };
  renderProgress("Scanning your whole library…");
  // add a cancel button to the progress card
  const backSlot = document.getElementById("prog-back");
  backSlot.classList.remove("hidden");
  backSlot.innerHTML = `<button class="btn btn-ghost" id="scrub-cancel">Cancel &amp; show what's found</button>`;
  document.getElementById("scrub-cancel").addEventListener("click", () => { scrubCancel.cancelled = true; });

  try {
    // Preflight before a long scrub (issue #3) — a scope problem found
    // now costs seconds; found 40 minutes in, it costs the whole scan.
    updateProgress(0, "Checking your Spotify connection…");
    await preflight();

    const result = await search.runFullScrub(client, {
      ...opts,
      libraryCache,
      onProgress: (pct, stage) => updateProgress(pct, stage),
      isCancelled: () => scrubCancel.cancelled,
    });
    lastResult = result;
    renderScrubResults(result);
  } catch (e) {
    renderProgressError(e.message || String(e), e);
  }
}

function renderScrubResults(r) {
  setTitle("DeepDive · Scrub results");
  const news = r.new_tracks || [];
  const dups = r.duplicate_candidates || [];
  root.innerHTML = `
    <div class="card">
      <h1>Library scrub ${r.artists_scanned < r.artists_total ? "(cancelled)" : "complete"}</h1>
      <p class="muted">Scanned ${r.artists_scanned} of ${r.artists_total} artists · ${dups.length} duplicates found · ${news.length} new tracks</p>
      ${r.collapsed_count ? `<p class="crate-note">${r.collapsed_count} duplicate recording${r.collapsed_count === 1 ? "" : "s"} collapsed — the same track appeared on more than one release.</p>` : ""}
      <div class="crate-header"><span class="label gold">New to you</span><span class="rule"></span></div>
      ${news.length ? `
        <div class="sort-row">
          <label for="new-sort">Sort by</label>
          <select id="new-sort" class="sort-select">
            <option value="album" selected>Album order (discography)</option>
            <option value="date-desc">Release date (newest)</option>
            <option value="date-asc">Release date (oldest)</option>
            <option value="title">Title (A–Z)</option>
          </select>
        </div>
        <label class="checkbox-option" style="margin-bottom:8px;"><input type="checkbox" id="build-playlist" checked> Build a playlist from these</label>
        <div id="new-list">${sortTracks(news, "album").map((t) => trackRow(t, { cls: "newt", sub: `${(t.artists && t.artists[0] && t.artists[0].name) || ""} · ${(t.album && t.album.name) || ""}` })).join("")}</div>
        <div class="playlist-name-field"><label>Playlist name</label><input type="text" id="playlist-name" value="DeepDive · Library scrub"></div>
        <div class="actions"><button class="btn btn-primary" id="scrub-build">Build playlist</button><button class="btn btn-ghost" data-home>Back to search</button></div>
        <div class="flash hidden" id="result-msg" style="margin-top:18px;"></div>
      ` : `<p class="empty-note">Nothing new found.</p><div class="actions"><button class="btn btn-ghost" data-home>Back to search</button></div>`}
    </div>`;
  root.querySelector("[data-home]")?.addEventListener("click", () => renderHome());

  const sortSel = document.getElementById("new-sort");
  if (sortSel) {
    const listEl = document.getElementById("new-list");
    const subFor = (t) => `${(t.artists && t.artists[0] && t.artists[0].name) || ""} · ${(t.album && t.album.name) || ""}`;
    sortSel.addEventListener("change", () => {
      const allBoxes = Array.from(listEl.querySelectorAll("[data-tid]"));
      const uncheckedIds = new Set(allBoxes.filter((c) => !c.checked).map((c) => c.dataset.tid));
      const sorted = sortTracks(news, sortSel.value);
      listEl.innerHTML = sorted.map((t) => trackRow(t, { cls: "newt", sub: subFor(t) })).join("");
      listEl.querySelectorAll("[data-tid]").forEach((c) => { if (uncheckedIds.has(c.dataset.tid)) c.checked = false; });
    });
  }
  const buildBtn = document.getElementById("scrub-build");
  if (buildBtn) buildBtn.addEventListener("click", async () => {
    const msg = document.getElementById("result-msg");
    buildBtn.disabled = true;
    const ids = Array.from(document.querySelectorAll("[data-tid]:checked")).map((c) => c.dataset.tid);
    const name = (document.getElementById("playlist-name").value || "DeepDive · Library scrub").trim();
    try {
      const res = await client.addTracksToPlaylistDeduped(name, "New-to-you tracks found by DeepDive's full library scrub.", ids);
      msg.innerHTML = `Playlist ${res.reused ? "updated" : "created"}: added ${res.added_count}. <a href="${esc(res.url)}" target="_blank" rel="noopener" style="color:var(--accent);text-decoration:underline;">Open playlist</a>`;
      msg.classList.remove("hidden", "error");
    } catch (e) {
      msg.textContent = `Something went wrong: ${e.message || e}`;
      msg.classList.remove("hidden"); msg.classList.add("error");
    } finally { buildBtn.disabled = false; }
  });
}

// ============================================================
// Watchlist page
// ============================================================
// ---------------------------------------------------------------------
// History, undo, and export/import (2.6)
// ---------------------------------------------------------------------

function renderHistory() {
  setTitle("DeepDive · History");
  setActiveTab("history");
  const dives = history.listDives();
  const created = history.listCreatedPlaylists();
  const undoable = history.lastUndoable();
  const actions = history.listActions();

  root.innerHTML = `
    <div class="card">
      <h1>History</h1>
      <p class="muted">What DeepDive has done, and how to take it back. Stored in this browser only.</p>

      ${undoable ? `
        <div class="crate-header"><span class="label gold">Undo</span><span class="rule"></span></div>
        <div class="watchlist-row">
          <span class="watchlist-name">${esc(undoable.label)}</span>
          <div class="watchlist-actions">
            <button class="btn btn-ghost btn-small" id="undo-last">Undo</button>
          </div>
        </div>
        <p class="nav-hint">Removes those tracks from your Liked Songs. Playlists aren't undone — deleting one you may have edited or shared would be worse than leaving it.</p>
      ` : `<p class="empty-note">Nothing to undo.</p>`}

      ${created.length ? `
        <div class="crate-header"><span class="label teal">Playlists created</span><span class="rule"></span></div>
        ${created.map((p) => `
          <div class="watchlist-row">
            <span class="watchlist-name">
              <span>
                <span style="display:block;">${esc(p.label.replace(/^Created "?|"$/g, ""))}</span>
                <span class="pill-reason">${esc(new Date(p.at).toLocaleDateString())}</span>
              </span>
            </span>
            <div class="watchlist-actions">
              ${p.playlistUrl ? `<a class="btn btn-ghost btn-small" href="${esc(p.playlistUrl)}" target="_blank" rel="noopener">Open</a>` : ""}
              <button class="btn btn-ghost btn-small" data-delete-playlist="${esc(p.id)}" data-pid="${esc(p.playlistId)}" data-label="${esc(p.label)}">Remove</button>
            </div>
          </div>`).join("")}
        <p class="nav-hint">Removing takes the playlist out of your Spotify library. Only playlists DeepDive created are listed — one it merely added to is yours, not ours to remove.</p>
      ` : ""}

      <div class="crate-header"><span class="label teal">Dives</span><span class="rule"></span></div>
      ${dives.length ? dives.map((d) => `
        <div class="watchlist-row">
          <span class="watchlist-name">
            ${d.imageUrl ? `<img src="${esc(d.imageUrl)}" alt="" class="pill-avatar">` : ""}
            <span>
              <span style="display:block;">${esc(d.artistName)}</span>
              <span class="pill-reason">${esc(new Date(d.at).toLocaleDateString())} · ${d.duplicates} dup · ${d.newTracks} new</span>
            </span>
          </span>
          <div class="watchlist-actions">
            <button class="btn btn-ghost btn-small" data-redive="${esc(d.artistName)}">Dive again</button>
          </div>
        </div>`).join("") : `<p class="empty-note">No dives yet.</p>`}
      ${dives.length ? `<div class="actions"><button class="btn btn-ghost btn-small" id="clear-dives">Clear dive history</button></div>` : ""}

      <div class="crate-header"><span class="label gold">Your data</span><span class="rule"></span></div>
      <p class="nav-hint" style="margin-top:0;">Pins, blocked artists, dive history and settings. The library cache isn't included — it rebuilds itself from Spotify in one read, so carrying thousands of tracks around in a file would be a poor trade.</p>
      <div class="actions">
        <button class="btn btn-ghost btn-small" id="export-data">Export backup</button>
        <button class="btn btn-ghost btn-small" id="import-data">Import backup</button>
        <input type="file" id="import-file" accept="application/json,.json" style="display:none;">
      </div>
      <div class="flash hidden" id="history-msg" style="margin-top:14px;"></div>

      <div class="actions"><button class="btn btn-ghost" data-home>Back to search</button></div>
    </div>`;

  root.querySelector("[data-home]")?.addEventListener("click", () => renderHome());
  root.querySelectorAll("[data-redive]").forEach((b) =>
    b.addEventListener("click", () => startSearch(b.dataset.redive)));

  const msg = document.getElementById("history-msg");
  const say = (text, isError) => {
    msg.textContent = text;
    msg.classList.remove("hidden");
    msg.classList.toggle("error", !!isError);
  };

  const undoBtn = document.getElementById("undo-last");
  if (undoBtn) undoBtn.addEventListener("click", async () => {
    if (!window.confirm(`${undoable.label} — remove those from your Liked Songs?`)) return;
    undoBtn.disabled = true;
    undoBtn.textContent = "Undoing…";
    try {
      await client.unlikeTracks(undoable.trackIds);
      history.markUndone(undoable.id);
      renderHistory();
      flash("Undone.");
    } catch (e) {
      const info = explainError(e);
      say(`${info.headline}. ${info.detail}`, true);
      undoBtn.disabled = false;
      undoBtn.textContent = "Undo";
    }
  });

  root.querySelectorAll("[data-delete-playlist]").forEach((b) => b.addEventListener("click", async () => {
    if (!window.confirm(`Remove "${b.dataset.label.replace(/^Created "?|"$/g, "")}" from your Spotify library?`)) return;
    b.disabled = true;
    b.textContent = "Removing…";
    try {
      await client.deletePlaylist(b.dataset.pid);
      history.markUndone(b.dataset.deletePlaylist);
      renderHistory();
      flash("Playlist removed.");
    } catch (e) {
      const info = explainError(e);
      say(`${info.headline}. ${info.detail}`, true);
      b.disabled = false;
      b.textContent = "Remove";
    }
  }));

  const clearBtn = document.getElementById("clear-dives");
  if (clearBtn) clearBtn.addEventListener("click", () => {
    if (!window.confirm("Clear your dive history? This can't be undone.")) return;
    history.clearDives();
    renderHistory();
  });

  document.getElementById("export-data")?.addEventListener("click", () => {
    const stamp = new Date().toISOString().slice(0, 10);
    const ok = downloadFile(`deepdive-backup-${stamp}.json`,
      JSON.stringify(history.exportData(), null, 2), "application/json");
    say(ok ? "Backup saved." : "Couldn't save the file.", !ok);
  });

  const fileInput = document.getElementById("import-file");
  document.getElementById("import-data")?.addEventListener("click", () => fileInput.click());
  fileInput?.addEventListener("change", async () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      // Merge by default: importing onto a device that already has pins
      // shouldn't silently discard them.
      const sum = history.importData(payload, { mode: "merge" });
      say(`Imported: ${sum.pins} pins, ${sum.blocked} blocked, ${sum.dives} dives added.`);
      renderHistory();
    } catch (e) {
      say(e && e.message ? e.message : "Couldn't read that file.", true);
    } finally {
      fileInput.value = "";
    }
  });
}

function renderWatchlist() {
  setTitle("DeepDive · Pins & blocked");
  setActiveTab("watchlist");
  const pins = watchlist.pinned();
  const blocked = watchlist.listBlocked();
  root.innerHTML = `
    <div class="card">
      <h1>Pins &amp; blocked</h1>
      <p class="muted">Pins appear at the top of your suggestions on the home page. Blocked artists never appear at all. Both are stored in this browser only.</p>

      <div class="crate-header"><span class="label gold">Pinned</span><span class="rule"></span></div>
      ${pins.length ? pins.map((e) => `
        <div class="watchlist-row">
          <span class="watchlist-name">${e.image_url ? `<img src="${esc(e.image_url)}" alt="" class="pill-avatar">` : ""}${esc(e.name)}</span>
          <div class="watchlist-actions">
            <button class="btn btn-ghost btn-small" data-wl-search="${esc(e.name)}">Dive now</button>
            <button class="btn btn-ghost btn-small" data-wl-remove="${esc(e.id)}" data-name="${esc(e.name)}">Unpin</button>
          </div>
        </div>`).join("") : `<p class="empty-note">Nothing pinned. Pin an artist from the search suggestions, or from the dropdown as you type.</p>`}
      ${pins.length ? `<div class="actions"><button class="btn btn-ghost btn-small" id="wipe-pins">Remove all pins</button></div>` : ""}

      <div class="crate-header"><span class="label teal">Never suggest</span><span class="rule"></span></div>
      ${blocked.length ? blocked.map((b) => `
        <div class="watchlist-row">
          <span class="watchlist-name">${esc(b.name)}</span>
          <div class="watchlist-actions">
            <button class="btn btn-ghost btn-small" data-unblock="${esc(b.name)}">Allow again</button>
          </div>
        </div>`).join("") : `<p class="empty-note">Nothing blocked. Use the &minus; button on any suggestion to stop it appearing.</p>`}

      <div class="actions"><button class="btn btn-ghost" data-home>Back to search</button></div>
    </div>`;

  root.querySelector("[data-home]")?.addEventListener("click", () => renderHome());
  root.querySelectorAll("[data-wl-search]").forEach((b) => b.addEventListener("click", () => startSearch(b.dataset.wlSearch)));
  root.querySelectorAll("[data-wl-remove]").forEach((b) => b.addEventListener("click", () => {
    if (!window.confirm(`Unpin ${b.dataset.name}?`)) return;
    watchlist.unpin(b.dataset.wlRemove);
    renderWatchlist();
  }));
  root.querySelectorAll("[data-unblock]").forEach((b) => b.addEventListener("click", () => {
    watchlist.unblock(b.dataset.unblock);
    renderWatchlist();
  }));
  const wipe = document.getElementById("wipe-pins");
  if (wipe) wipe.addEventListener("click", () => {
    if (!window.confirm(`Remove all ${pins.length} pins? This can't be undone.`)) return;
    watchlist.clearAllPins();
    renderWatchlist();
  });
}

// ============================================================
// Boot
// ============================================================
// ---------------------------------------------------------------------
// Landing page
// ---------------------------------------------------------------------
// Arriving cold, the first thing DeepDive used to ask for was a Spotify
// Client ID — a credential, with numbered instructions, before saying
// what any of it was for. This explains the thing first and asks second.

const LANDING_SEEN_KEY = "deepdive_seen_landing";

function landingSeen() {
  try { return localStorage.getItem(LANDING_SEEN_KEY) === "1"; } catch (e) { return false; }
}
function markLandingSeen() {
  try { localStorage.setItem(LANDING_SEEN_KEY, "1"); } catch (e) {}
}

const FEATURES = [
  {
    icon: `<path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/>`,
    title: "Find what you missed",
    body: "You liked a song off an album years ago. The same recording turned up later on an EP, and Spotify showed it to you like it was new. DeepDive reads an artist's whole catalogue against your Liked Songs and finds those near-misses.",
  },
  {
    icon: `<path d="M21 15V6M18.5 18a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM12 12H3M16 6H3M12 18H3"/>`,
    title: "Build the playlist",
    body: "Everything by that artist you genuinely haven't heard, in album order or however you like it — length, ordering and naming all yours. Nothing touches your library until you press the button.",
  },
  {
    icon: `<polygon points="5 3 19 12 5 21 5 3"/>`,
    title: "Sample what you barely know",
    body: "Artists you've liked once or twice and never followed up on. Each one leads with the song you already know, then two you don't.",
  },
  {
    icon: `<path d="M12 2l2.4 7.4H22l-6 4.6 2.3 7.4-6.3-4.6L5.7 21 8 14 2 9.4h7.6z"/>`,
    title: "Playlists from your own history",
    body: "Your 2019. Albums that landed. Music you found twenty years late. One from every year you've been collecting. All built from what's already in your library.",
  },
  {
    icon: `<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l8.8 8.8 8.8-8.8a5.5 5.5 0 0 0 0-7.8z"/>`,
    title: "Pins and suggestions",
    body: "Pin an artist to come back to. Suggestions come half from what you've been playing and half from your own library, and each one tells you why it's there.",
  },
  {
    icon: `<path d="M12 22s8-4.5 8-11a8 8 0 1 0-16 0c0 6.5 8 11 8 11z"/><circle cx="12" cy="11" r="3"/>`,
    title: "Yours alone",
    body: "No server, no account, no data collected — there's nowhere to collect it to. Everything happens in your browser, between you and Spotify.",
  },
];

function renderLanding() {
  setTitle("DeepDive");
  root.innerHTML = `
    <div class="landing">
      <div style="text-align:center;">
        <span class="wordmark-hero"><img src="../assets/dd-logo.png" alt="" class="wordmark-hero-icon">DeepDive</span>
        <p class="landing-lede">You've liked the album version. You missed the single.</p>
        <p class="landing-sub">DeepDive reconciles an artist's catalogue against your Spotify library — finding the recordings you already love hiding under a different release, and everything by them you've never heard at all.</p>
        <div class="landing-cta">
          <button class="btn btn-primary" id="landing-start">Get started</button>
        </div>
        <p class="landing-note">Free. Runs entirely in your browser. Takes about two minutes to set up.</p>
      </div>

      <div class="landing-grid">
        ${FEATURES.map((f) => `
          <div class="landing-card">
            <span class="landing-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${f.icon}</svg></span>
            <h3>${esc(f.title)}</h3>
            <p>${esc(f.body)}</p>
          </div>`).join("")}
      </div>

      <div class="landing-foot">
        <p class="landing-note">Spotify requires every app to have its own credentials, so you'll create a free one on their developer dashboard. It's a form, and you only do it once.</p>
        <button class="btn btn-primary" id="landing-start-2">Set up Spotify</button>
      </div>
    </div>`;

  const go = () => { markLandingSeen(); renderSetup(); };
  document.getElementById("landing-start")?.addEventListener("click", go);
  document.getElementById("landing-start-2")?.addEventListener("click", go);
}

async function render() {
  // Explain before asking. Only on a genuinely first visit — once the
  // landing page has been seen, going straight to setup is the faster
  // path for someone returning to finish the job.
  if (!auth.getClientId() && !landingSeen()) return renderLanding();
  if (!auth.getClientId()) return renderSetup();
  if (!auth.isLoggedIn()) return renderConnect();
  return renderHome();
}

// ---- support link visibility ----
// Some people would rather not see a donate prompt every time they open
// the app. It costs nothing to let them turn it off, and a support link
// that can't be dismissed is worse than one that can.
const BMC_KEY = "deepdive_show_bmc";
function showBmc() {
  try { return localStorage.getItem(BMC_KEY) !== "0"; } catch (e) { return true; }
}
function setShowBmc(on) {
  try { localStorage.setItem(BMC_KEY, on ? "1" : "0"); } catch (e) {}
  // Apply immediately rather than waiting for a re-render — the toggle
  // is in the drawer, with the button visible right behind it.
  document.querySelectorAll(".bmc-row").forEach((r) => r.classList.toggle("hidden", !on));
}

// ---- inline settings in the nav drawer ----
// Configuration used to be a separate page, which meant leaving whatever
// you were doing to change one field. It lives in the drawer now,
// alongside the theme controls, so settings are all in one place.
(function initDrawerSettings() {
  const bmcBox = document.getElementById("opt-show-bmc");
  if (bmcBox) {
    bmcBox.checked = showBmc();
    bmcBox.addEventListener("change", () => setShowBmc(bmcBox.checked));
  }

  const uriEl = document.getElementById("nav-redirect-uri");
  if (uriEl) uriEl.textContent = auth.redirectUri();

  const copyBtn = document.getElementById("nav-copy-uri");
  if (copyBtn) copyBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(auth.redirectUri());
      copyBtn.textContent = "Copied";
      setTimeout(() => { copyBtn.textContent = "Copy"; }, 1600);
    } catch (e) {
      copyBtn.textContent = "Copy failed";
      setTimeout(() => { copyBtn.textContent = "Copy"; }, 1600);
    }
  });

  // Submenu open/close. Settings that are configured once and rarely
  // revisited shouldn't occupy permanent space in the main menu.
  const drawer = document.getElementById("nav-drawer");
  const openBtn = document.getElementById("open-spotify-settings");
  const backBtn = document.getElementById("close-spotify-settings");
  const subPane = document.getElementById("nav-spotify-pane");
  const openSub = () => {
    drawer.classList.add("sub-open");
    if (subPane) subPane.setAttribute("aria-hidden", "false");
  };
  const closeSub = () => {
    drawer.classList.remove("sub-open");
    if (subPane) subPane.setAttribute("aria-hidden", "true");
  };
  if (openBtn) openBtn.addEventListener("click", openSub);
  if (backBtn) backBtn.addEventListener("click", closeSub);
  // Closing the drawer should reset it, so reopening never lands the
  // user in a submenu they didn't ask for.
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSub(); });
  const backdrop = document.getElementById("nav-backdrop");
  if (backdrop) backdrop.addEventListener("click", closeSub);
  const closeNavBtn = document.getElementById("nav-close-btn");
  if (closeNavBtn) closeNavBtn.addEventListener("click", closeSub);

  const idInput = document.getElementById("nav-client-id");
  const saveBtn = document.getElementById("nav-save-client-id");
  if (idInput) idInput.value = auth.getClientId();
  const save = () => {
    const v = (idInput.value || "").trim();
    if (!v) { flash("Enter your Client ID first.", true); return; }
    const changed = v !== auth.getClientId();
    auth.setClientId(v);
    // Changing the Client ID invalidates the current session, since the
    // token belongs to the old app. Say so rather than letting the next
    // request fail confusingly.
    flash(changed
      ? "Client ID saved. Reconnect Spotify for it to take effect."
      : "Client ID saved.");
  };
  if (saveBtn) saveBtn.addEventListener("click", save);
  if (idInput) idInput.addEventListener("keydown", (e) => { if (e.key === "Enter") save(); });
})();

// ---- bottom tab bar ----
// Mirrors the drawer's destinations for phones, where reaching a
// hamburger at the top of the screen is the worst place to put
// navigation. Marks the current section so the app says where you are.
let _currentTab = "home";

function setActiveTab(name) {
  _currentTab = name;
  document.querySelectorAll(".tab").forEach((t) =>
    t.classList.toggle("active", t.dataset.tab === name));
}

(function initTabs() {
  document.addEventListener("click", (e) => {
    const tab = e.target.closest("[data-tab]");
    if (!tab) return;
    const name = tab.dataset.tab;
    setActiveTab(name);
    if (name === "home") return renderHome();
    if (name === "scrub") return renderScrubForm();
    if (name === "watchlist") return renderWatchlist();
    if (name === "history") return renderHistory();
  });
})();

function stampBuild() {
  const el = document.getElementById("build-id");
  if (el) el.textContent = `build ${BUILD}`;
}

async function boot() {
  stampBuild();
  // Handle a PKCE redirect coming back from Spotify.
  const cb = await auth.handleRedirectCallback();
  if (cb.ok === false) {
    flash(`Login failed: ${cb.error}`, true);
    return renderConnect();
  }
  if (cb.ok === true) { flash("Connected to Spotify."); return renderHome(); }
  render();
}

boot();
