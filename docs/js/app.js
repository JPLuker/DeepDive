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
import { SpotifyClient, limitedUntil } from "./spotify.js";
import * as search from "./search.js";
import * as watchlist from "./watchlist.js";
import { LibraryCache } from "./library-cache.js";
import * as insights from "./insights.js";
import * as matching from "./matching.js";
import { bestStore } from "./storage.js";
import * as history from "./history.js";
import * as demo from "./demo.js";
import * as lastfm from "./lastfm.js";

// Build marker. Twice now, diagnosing a problem has meant reasoning
// about which version was actually loaded from indirect evidence — slow
// and easy to get wrong. Showing it removes the guesswork.
export const BUILD = "2.8.56";

const client = new SpotifyClient(auth.getToken);
// Incremental liked-songs cache: read the whole library once, then only
// fetch changes on later searches. Persisted in IndexedDB. See
// library-cache.js for the correctness (checksum) design.
const libraryCache = new LibraryCache(client, bestStore());
// Last.fm's terms require caching similar-artist and chart data for at
// least a week, so it shares the same persistent store rather than
// living in memory and being re-fetched on every reload.
lastfm.attachStore(bestStore());

// Last catalogue read, for diagnostics. Whether credit filtering
// engaged was previously invisible, which is how it stayed broken.
let _catalogLog = [];
client.onCatalogAlbum = (entry) => {
  _catalogLog.push(entry);
  if (_catalogLog.length > 400) _catalogLog.shift();
};

// When Spotify rate-limits us the client waits and retries, which can be
// anywhere from fifteen to ninety seconds. Without saying so the dive
// simply appears to freeze.
//
// Note this writes to the dive screen's stage line. It previously
// targeted the old card-based progress element, which the full-screen
// rewrite removed — so the warnings were going nowhere at all.
client.onRateLimit = (waitMs, attempt) => {
  const secs = Math.max(1, Math.round(waitMs / 1000));
  const el = document.getElementById("dive-stage");
  const msg = `Spotify is rate-limiting us — waiting ${secs}s, then carrying on…`
    + (attempt > 1 ? ` (attempt ${attempt})` : "");
  if (el) el.textContent = msg;
  // Also surface it outside a dive, where there's no stage line to write
  // to — a stalled search from the home screen otherwise says nothing.
  else flash(msg);
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
  flashSlot.innerHTML = `<div class="flash${isError ? " error" : ""}">${esc(msg)}</div>`;
  // Restart the timer each time so a second toast isn't cut short by the
  // first one's expiry.
  clearTimeout(flash._t);
  flash._t = setTimeout(() => { flashSlot.innerHTML = ""; }, 4500);
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
  if (view === "settings") return renderSettings();
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
      <div class="crate-header"><span class="label">Last.fm</span><span class="qual">optional</span></div>
      <p class="muted" style="margin-top:0;">Recommended. Spotify no longer exposes how popular a track is, which artists are similar, or anything beyond a broad genre — Last.fm does. With a key, DeepDive can build genre and subgenre mixes and an artist's best hour. Without one, those features simply don't appear; everything else works exactly the same.</p>
      <p class="crate-note">Getting one takes about a minute and is approved instantly: create an app at <a href="https://www.last.fm/api/account/create" target="_blank" rel="noopener" style="color:var(--accent);">last.fm/api/account/create</a> and copy the API key. You only need the key, not the shared secret.</p>
      <div style="margin-top:14px;">
        <label class="nav-field-label" for="lastfm-key-input">Last.fm API key</label>
        <input type="text" id="lastfm-key-input" class="nav-input" placeholder="optional" value="${esc(lastfm.getKey())}" autocomplete="off" spellcheck="false">
      </div>

      <div class="actions">
        <button class="btn btn-primary" id="save-creds-btn">Save & continue</button>
      </div>
    </div>`;
  document.getElementById("save-creds-btn").addEventListener("click", () => {
    const id = document.getElementById("client-id-input").value.trim();
    if (!id) { flash("Enter your Client ID first.", true); return; }
    auth.setClientId(id);
    // Optional, so an empty field is a valid answer rather than an
    // error — saving nothing here simply leaves those features off.
    lastfm.setKey(document.getElementById("lastfm-key-input").value);
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
/**
 * How many tiles fit in a row at this width.
 *
 * Home shows one row of each thing, so it has to agree with the CSS or
 * it leaves a half-empty row. The grid is `auto-fill` with a 230px
 * minimum inside a measure of `clamp(860px, 88vw, 1440px)`, so this
 * mirrors that rather than guessing at breakpoints — which is what left
 * every width between the old steps either cramped or sparse.
 */
function columnsAtWidth() {
  if (typeof window === "undefined") return 2;
  const vw = window.innerWidth;
  if (vw < 900) return 2;
  const measure = Math.min(1440, Math.max(860, vw * 0.88));
  const gutters = 56;
  return Math.max(2, Math.floor((measure - gutters) / 240));
}

/**
 * The search field, shared by Home and Dives.
 *
 * Home keeps one because searching an artist is what people open
 * DeepDive to do, and burying it a tab deep would be perverse. Dives
 * keeps the same one because that's where you land when you came
 * specifically to dive.
 */
function searchShellHtml() {
  return `
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
    </div>`;
}

/**
 * A destination row: what it is, what it does, and a chevron.
 *
 * These were three identical pills with a single warning floating above
 * all of them — so a full library scan, which is the most expensive
 * thing in the app, looked exactly like opening a list of pins. Each
 * row carries its own description now, which is where the cost belongs.
 *
 * Same shape as the settings rows; the classes are shared deliberately
 * so the two pages don't drift apart.
 *
 * The id arrives as a literal attribute string rather than a value to
 * interpolate, so `id="go-scrub"` still appears in the source and the
 * getElementById orphan audit can see it.
 */
function navRow(idAttr, title, detail) {
  return `
    <button class="set-row set-row-nav" ${idAttr}>
      <span class="set-row-text">
        <span class="set-row-title">${title}</span>
        <span class="set-row-detail">${esc(detail)}</span>
      </span>
      <span class="set-row-chevron" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>
      </span>
    </button>`;
}

/** A row heading that links through to the destination owning it. */
function sectionHead(title, qual, tab, linkText) {
  return `
    <div class="row-head">
      <h2>${esc(title)}</h2>
      ${qual ? `<span class="qual">${esc(qual)}</span>` : ""}
      <button class="row-more" data-tab="${esc(tab)}">${esc(linkText)}</button>
    </div>`;
}

/**
 * Home is a summary now: a search field and a taste of each
 * destination. It had become the entire app on one page, which is why
 * everything else was hard to find — there was nowhere else to look.
 */
async function renderHome() {
  setTitle("DeepDive");
  setActiveTab("home");
  root.innerHTML = `
    ${rateLimitBanner()}
    <div id="api-banner">${apiBannerHtml()}</div>
    ${searchShellHtml()}
    <div id="suggestions-row"></div>
    <div id="home-mixes"></div>`;

  wireSearchBar();
  wireApiBanner();
  loadSuggestions({ compact: true });
  // One row of cards, whatever a row holds at this width — the sampler
  // card takes the first slot.
  const perRow = columnsAtWidth();
  loadPlaylistCards({ into: "home-mixes", limit: perRow, headHtml: sectionHead("Mixes", "made from what you've saved", "mixes", "All mixes") });
}

/**
 * Everything about diving in one place: search, the full pin and
 * suggestion lists, a whole-library scan, history and pins.
 */
async function renderDives() {
  setTitle("DeepDive · Dives");
  setActiveTab("dives");
  root.innerHTML = `
    ${rateLimitBanner()}
    <div id="api-banner">${apiBannerHtml()}</div>
    ${searchShellHtml()}
    <div id="suggestions-row"></div>
    <div class="set-group set-group-spaced">
      ${navRow('id="go-scrub"', "Full library scan", "Crawls every artist you've liked. Thorough, and slow — one request per release.")}
      ${navRow('id="go-history"', "Dive history", "What you've dived, what DeepDive built, and how to undo it.")}
      ${navRow('id="go-pins"', "Pins &amp; blocked", "Artists you've pinned, and ones you've told DeepDive to stop suggesting.")}
    </div>`;

  wireSearchBar();
  wireApiBanner();
  loadSuggestions({ showAllPins: true });
  document.getElementById("go-scrub")?.addEventListener("click", () => renderScrubForm());
  document.getElementById("go-history")?.addEventListener("click", () => renderHistory());
  document.getElementById("go-pins")?.addEventListener("click", () => renderWatchlist());
}

/** Mixes — what Playlists were called — with the sampler alongside. */
async function renderMixes() {
  setTitle("DeepDive · Mixes");
  setActiveTab("mixes");
  root.innerHTML = `
    ${rateLimitBanner()}
    <div id="rec-section"></div>
    <div id="playlist-cards"></div>
    <div id="genre-section"></div>`;

  loadPlaylistCards();
  renderRecommendations();
  renderGenreSection();
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
// Ten, because the generated set is now 40-odd and six was a thin
// glimpse of it. These are the "random picks" below the two things you
// build yourself.
const CARDS_PER_LOAD = 10;

/**
 * @param into     Element id to render into; Mixes owns "playlist-cards",
 *                 Home borrows a different one for its short preview.
 * @param limit    How many cards to show. Home shows a taste, Mixes all.
 * @param headHtml Optional heading, so Home's preview can say where the
 *                 rest live rather than looking like the whole set.
 */
async function loadPlaylistCards({ into = "playlist-cards", limit = 0, headHtml = "" } = {}) {
  const el = document.getElementById(into);
  if (!el) return;
  el._cardLimit = limit;
  el._cardHead = headHtml;
  try {
    const cached = await Promise.race([
      libraryCache.peek(),
      new Promise((resolve) => setTimeout(() => resolve([]), 2500)),
    ]);
    if (!cached || !cached.length) {
      // Mixes are built entirely from the cached library, so with no
      // cache there is nothing to build from — which is a state worth
      // naming rather than showing a blank page.
      el.innerHTML = `
        <p class="empty-note">Mixes are built from your Liked Songs, and they haven't been read yet.</p>
        <div class="actions"><button class="btn btn-primary btn-small" data-read-library>Read my library</button></div>`;
      wireReadLibrary(el, () => loadPlaylistCards({ into, limit, headHtml }));
      return;
    }
    // The sampler is a card now, so its pool has to exist wherever
    // cards are drawn. It was only built while loading suggestions,
    // which Mixes doesn't do — so the card would never have appeared
    // there. Same cached read, no extra cost.
    if (!_samplerPool.length) {
      try {
        const mixBlocked = watchlist.blockedNameSet("mixes");
        _samplerPool = insights.artistsBarelyExplored(cached, { maxTracks: 3, limit: 500 })
          .filter((a) => !mixBlocked.has((a.name || "").trim().toLowerCase()));
      } catch (poolErr) { /* the other cards are still worth showing */ }
    }
    // A fresh seed each load, so a refresh brings different ideas. The
    // artist suggestions above are deliberately session-stable — you
    // should be able to come back to one you spotted — but playlists are
    // a browsing surface where repetition is the bigger risk.
    const seed = (Date.now() >>> 0) ^ Math.floor(Math.random() * 0xffffffff);
    // Mix blocks apply to the cards too. They never did — the filter
    // only existed on the suggestion row and the sampler pool, so a
    // blocked artist was barred from one kind of mix and left in all
    // the rest. Filtering the source is simpler than teaching fifteen
    // card builders about it.
    const mixBlocked = watchlist.blockedNameSet("mixes");
    const forMixes = mixBlocked.size
      ? cached.filter((t) => !(t.artists || []).some(
          (a) => mixBlocked.has((a.name || "").trim().toLowerCase())))
      : cached;
    _allCards = insights.playlistCards(forMixes, { seed });
    if (!_allCards.length) {
      el.innerHTML = `<p class="empty-note">Nothing to build a mix from yet — that usually means the cached library is very small.</p>`;
      return;
    }
    _cards = insights.seededPick(_allCards, CARDS_PER_LOAD, seed);

    renderCardRow(el);
  } catch (e) {
    // An empty page with a console line nobody opens is indistinguishable
    // from "you have no mixes". Say what happened on screen.
    console.error("[DeepDive] playlist cards failed:", e);
    el.innerHTML = `<p class="empty-note">Couldn't build your mixes: ${esc(e.message || String(e))}</p>`;
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
  // Mixes shows the lot; Home shows a few with a way through to the
  // rest, so its preview doesn't read as the whole set.
  const limit = el._cardLimit || 0;
  const shown = limit ? _cards.slice(0, limit) : _cards;
  // "Mixes" is the page. Genres are mixes too, so this row needed to
  // say what it actually is: patterns found in the library itself.
  const head = el._cardHead
    || `<div class="row-head"><h2>From your library</h2><span class="qual">patterns in what you've saved</span></div>`;
  // The sampler leads. It is a mix like the rest — a few tracks each
  // from artists you've barely heard — and it used to sit below the
  // suggestion row as a full-width strip of its own, which made it look
  // like a different kind of thing entirely.
  // Custom sits beside the sampler at the head of the row: both are
  // things you start rather than recipes already decided.
  const customCard = `
    <button class="pcard is-custom" data-custom>
      <span class="pcard-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg></span>
      <span class="pcard-title">Build your own</span>
      <span class="pcard-sub">pick an era, a length, an artist — any combination</span>
    </button>`;
  const samplerCard = _samplerPool.length >= 2 ? `
    <button class="pcard is-sampler" data-sampler>
      <span class="pcard-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="6 4 20 12 6 20 6 4"/></svg></span>
      <span class="pcard-title">Sampler</span>
      <span class="pcard-sub">a few tracks each from artists you've barely heard</span>
    </button>` : "";
  el.innerHTML = `
    ${head}
    <div class="card-row">
      ${customCard}
      ${samplerCard}
      ${shown.map((c, i) => `
        <button class="pcard" data-card="${esc(c.id)}" style="--h:${(200 + i * 47) % 360};">
          <span class="pcard-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="16" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg></span>
          <span class="pcard-title">${esc(c.title)}</span>
          <span class="pcard-sub">${esc(c.subtitle)}</span>
        </button>`).join("")}
    </div>`;
  el.querySelector("[data-sampler]")?.addEventListener("click", () => openSampler(samplerSourceArtists()));
  el.querySelector("[data-custom]")?.addEventListener("click", () => renderCustomMix());
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
// Album artwork keyed by artist, built when suggestions load. Kept at
// module scope so the dive screen can borrow it without another read.
let _cachedArt = null;
// Artwork handed over by whatever started the dive.

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
  // A page, not a modal. Watching progress inside a dialog reads as an
  // error state; a dive gets a full screen and so should this.
  renderSamplerIntro(artists);
}

function renderSamplerIntro(artists) {
  setTitle("DeepDive · Sampler");
  root.innerHTML = `
    <div class="card">
      <h1>Sampler</h1>
      <p class="muted">A few tracks each from ${artists.length} artists you've barely heard — one song you already liked, then two you haven't.</p>
      <div class="sampler-faces" id="sampler-faces">
        ${artists.slice(0, 8).map((a) => a.image_url
          ? `<img src="${esc(a.image_url)}" alt="" class="sampler-face">`
          : `<span class="sampler-face sampler-face-blank">${esc((a.name || "?").charAt(0).toUpperCase())}</span>`).join("")}
      </div>
      <p class="nav-hint">This takes a moment — one request per artist.</p>
      <div class="actions">
        <button class="btn btn-primary" id="sampler-start">Build sampler</button>
        <button class="btn btn-ghost" id="sampler-cancel">Back</button>
      </div>
    </div>`;
  document.getElementById("sampler-cancel")?.addEventListener("click", () => renderHome());
  document.getElementById("sampler-start")?.addEventListener("click", () => runSampler(artists));
}

async function runSampler(artists) {
  // Reuses the dive progress screen, so building a sampler looks like
  // any other search rather than a dialog reporting at you.
  // Cancelling has to set the flag the fetch loop checks between
  // artists, or the run continues invisibly after the screen closes.
  if (blockedByRateLimit()) return;

  // Same rule as a single dive: the full screen doesn't open until there
  // is a photo on it. A sampler can't preload all 8-12 without a long
  // spinner, so it waits for the first two — enough that the first
  // rotation has somewhere to go — and streams the rest in as they
  // load. These URLs are already in hand from the suggestion row, so
  // this costs downloads, not requests.
  const photoFor = (a) => (a && (a.image_url_large || a.image_url)) || null;
  const seeds = artists.map(photoFor).filter(Boolean).slice(0, 2);
  showDiveSpinner();
  await Promise.all(seeds.map((u) => preloadPhoto(u)));
  hideDiveSpinner();

  showDiveScreen("Building your sampler…", () => {
    _samplerCancelled = true;
    renderHome();
  });
  // The intro is a page in `root`, and the dive screen is a fixed
  // overlay on top of it — so the intro was still sitting underneath for
  // the whole run, and reappeared the moment the overlay went away, on
  // cancel or on finish. Clear it now rather than rendering home behind
  // it, which would spend requests reloading suggestions mid-sampler.
  root.innerHTML = "";
  // Seeds first, so the two that are already decoded are the two that
  // show while the rest arrive.
  seeds.forEach((u) => addDiveImage(u));
  artists.forEach((a) => addDiveImage(photoFor(a)));
  _samplerCancelled = false;

  // Cancelling is handled by the dive screen's own button, wired in
  // showDiveScreen.


  let tracks = [];
  try {
    tracks = await buildSampler(artists, 3, (done, total) => {
      // Show whose tracks are being fetched, using the same artwork
      // component the dive screen uses.
      const a = artists[Math.min(done, artists.length - 1)];
      updateDiveScreen(Math.round((done / total) * 100), `${a ? a.name : "Fetching"}… (${done}/${total})`);
      if (a) addDiveImage(photoFor(a));
    });
    if (_samplerCancelled) return;
  } catch (e) {
    renderProgressError(e.message || String(e), e);
    return;
  }

  if (!tracks.length) {
    const first = (tracks.failures || [])[0];
    renderProgressError(first ? (first.error && first.error.message) : "No tracks came back for these artists.", first && first.error);
    return;
  }

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
  // Results in the dialog, where the preview and the name field belong —
  // by this point there is something real to show. The dive screen comes
  // down first and home goes back underneath, so the dialog opens over
  // the app rather than over a blank page or a stale sampler intro.
  hideDiveScreen();
  await renderHome();
  document.querySelector(".playlist-name-field")?.classList.remove("hidden");
  document.querySelector("#card-modal details")?.classList.remove("hidden");
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
function applyPlaylistOptions(tracks, { order = "shuffle", length = "all" } = {}) {
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
// Same choices the other mixes offer, without "all" — an unbounded
// custom mix can be thousands of tracks, and every hundred is a request
// when it's created.
const CUSTOM_LENGTHS = PLAYLIST_LENGTHS.filter((n) => n !== "all");

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
// Set the first time /artists/{id}/top-tracks is refused. Deprecated
// endpoints 403 for the whole app, so one refusal answers for the rest
// of the session.
let _topTracksBlocked = false;
// So a failure screen can offer to retry the thing that failed.
let _lastDiveArtist = null;

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
        // Once it has been refused once, it will be refused for every
        // artist in the run — it's an app-level restriction, not a
        // per-artist one. Asking anyway cost a guaranteed-failing
        // request per artist, eight to twelve per sampler, each one
        // spending quota to learn something already known.
        if (_topTracksBlocked) throw new Error("top-tracks unavailable");
        const res = await client.get(`artists/${a.id}/top-tracks`);
        tracks = (res && res.tracks) || [];
      } catch (topErr) {
        if (topErr && topErr.status === 403) _topTracksBlocked = true;
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
      // A clean edit survives that collapse — different ISRC, different
      // title by one annotation — so a mix could carry both cuts of the
      // same song back to back. Correct for a dive, wrong for a mix.
      tracks = matching.preferUncensored(tracks);

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


/**
 * Build your own mix.
 *
 * The generated cards are fixed recipes. This is the same filtering
 * with the controls exposed, so combinations nobody wrote a card for —
 * one artist in one decade under three minutes — are reachable without
 * waiting for a card that happens to ask that question.
 */
async function renderCustomMix() {
  setTitle("DeepDive · Build a mix");
  setActiveTab("mixes");
  root.innerHTML = `
    <div class="row-head"><h2>Build your own</h2></div>
    <p class="nav-hint" style="margin-top:0;">Everything comes from tracks already in your library. Nothing is created until you confirm it.</p>
    <div id="custom-form"><p class="nav-hint">Reading your library…</p></div>`;

  let cached = [];
  try {
    cached = await libraryCache.peek();
  } catch (e) { /* handled below */ }
  if (!cached || !cached.length) {
    document.getElementById("custom-form").innerHTML =
      `<p class="empty-note">Your library hasn't been read yet. Open Home once and it'll cache in the background.</p>`;
    return;
  }

  // Only offer years and artists that exist, so no combination can come
  // back empty for a reason the form didn't show.
  const years = [...new Set(cached.map((t) => (t.added_at || "").slice(0, 4)).filter(Boolean))].sort().reverse();
  const relYears = cached.map((t) => parseInt(((t.album && t.album.release_date) || "").slice(0, 4), 10)).filter((n) => n);
  const minRel = Math.min(...relYears), maxRel = Math.max(...relYears);
  const decades = [...new Set(relYears.map((y) => Math.floor(y / 10) * 10))].sort((a, b) => b - a);
  const artists = [...new Map(cached.flatMap((t) => (t.artists || []).map((a) => [a.id, a.name]))).entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  document.getElementById("custom-form").innerHTML = `
    <div class="set-group">
      <div class="set-group-label">When it came out</div>
      <div class="set-row set-row-block">
        <div class="set-row-text"><div class="set-row-title">Decade</div></div>
        <select id="cm-decade" class="sort-select">
          <option value="">Any</option>
          ${decades.map((d) => `<option value="${d}">${d}s</option>`).join("")}
        </select>
      </div>
      <div class="set-row set-row-block">
        <div class="set-row-text"><div class="set-row-title">Or a range of years</div></div>
        <div class="cm-range">
          <input type="number" id="cm-from" class="nav-input" placeholder="${minRel}" min="${minRel}" max="${maxRel}">
          <span class="cm-dash">to</span>
          <input type="number" id="cm-to" class="nav-input" placeholder="${maxRel}" min="${minRel}" max="${maxRel}">
        </div>
      </div>
    </div>

    <div class="set-group">
      <div class="set-group-label">When you liked it</div>
      <div class="set-row set-row-block">
        <div class="set-row-text"><div class="set-row-title">Year added</div></div>
        <select id="cm-added" class="sort-select">
          <option value="">Any</option>
          ${years.map((y) => `<option value="${y}">${y}</option>`).join("")}
        </select>
      </div>
    </div>

    <div class="set-group">
      <div class="set-group-label">Who</div>
      <div class="set-row set-row-block">
        <div class="set-row-text"><div class="set-row-title">Artist</div>
          <div class="set-row-detail">${artists.length} in your library. Leave blank for anyone.</div></div>
        <div class="search-shell cm-search">
          <div class="search-pill-form">
            <input type="text" id="cm-artist" placeholder="Search an artist" autocomplete="off" spellcheck="false">
            <button type="button" class="search-icon-btn" id="cm-artist-clear" aria-label="Clear artist">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div class="autofill-list" id="cm-artist-list"></div>
        </div>
      </div>
      <div class="set-row">
        <div class="set-row-text"><div class="set-row-title">Collaborations only</div>
          <div class="set-row-detail">Tracks credited to more than one artist.</div></div>
        <div class="set-row-control"><label class="set-switch"><input type="checkbox" id="cm-collabs"><span class="switch-track"><span class="switch-thumb"></span></span></label></div>
      </div>
      <div class="set-row">
        <div class="set-row-text"><div class="set-row-title">One track per artist</div>
          <div class="set-row-detail">A tour rather than a deep dive.</div></div>
        <div class="set-row-control"><label class="set-switch"><input type="checkbox" id="cm-oneeach"><span class="switch-track"><span class="switch-thumb"></span></span></label></div>
      </div>
    </div>

    <div class="set-group">
      <div class="set-group-label">How long</div>
      <div class="set-row set-row-block">
        <div class="set-row-text"><div class="set-row-title">Track length, in seconds</div></div>
        <div class="cm-range">
          <input type="number" id="cm-min" class="nav-input" placeholder="any" min="0">
          <span class="cm-dash">to</span>
          <input type="number" id="cm-max" class="nav-input" placeholder="any" min="0">
        </div>
      </div>
      <div class="set-row set-row-block">
        <div class="set-row-text"><div class="set-row-title">Order</div></div>
        <select id="cm-sort" class="sort-select">
          <option value="random" selected>Shuffled</option>
          <option value="oldest-release">Oldest release first</option>
          <option value="newest-release">Newest release first</option>
          <option value="oldest-added">Longest in your library</option>
          <option value="newest-added">Most recently liked</option>
          <option value="shortest">Shortest first</option>
          <option value="longest">Longest first</option>
        </select>
      </div>
      <div class="set-row set-row-block">
        <div class="set-row-text"><div class="set-row-title">How many tracks</div>
          <div class="set-row-detail">The same choices the other mixes offer. Nothing here reads from Spotify — the mix is built from your cached library.</div></div>
        <select id="cm-limit" class="sort-select">
          ${CUSTOM_LENGTHS.map((n, i) => `<option value="${n}"${i === CUSTOM_LENGTHS.length - 1 ? " selected" : ""}>${n} tracks</option>`).join("")}
        </select>
      </div>
    </div>

    <div class="custom-preview" id="cm-preview"></div>
    <div class="actions">
      <button class="btn btn-primary" id="cm-build">Preview mix</button>
      <button class="btn btn-ghost" data-tab="mixes">Back to mixes</button>
    </div>`;

  const readFilters = () => {
    const num = (id) => { const v = parseInt(document.getElementById(id).value, 10); return Number.isNaN(v) ? 0 : v; };
    // The shared artist search sets `chosenArtist` when a result is
    // picked. A typed string that matches nothing leaves it null, and
    // the rest of the filters still apply.
    const typed = document.getElementById("cm-artist").value.trim().toLowerCase();
    const hit = chosenArtist && chosenArtist.name.trim().toLowerCase() === typed
      ? chosenArtist
      : (typed ? artists.find((a) => a.name.trim().toLowerCase() === typed) : null);
    return {
      decade: num("cm-decade"),
      releaseFrom: num("cm-from"),
      releaseTo: num("cm-to"),
      addedYear: num("cm-added"),
      artistId: hit ? hit.id : null,
      artistName: hit ? hit.name : null,
      artistTyped: typed,
      minSeconds: num("cm-min"),
      maxSeconds: num("cm-max"),
      collabsOnly: document.getElementById("cm-collabs").checked,
      oneEachArtist: document.getElementById("cm-oneeach").checked,
      limit: num("cm-limit"),
      sort: document.getElementById("cm-sort").value,
    };
  };

  // Live count, so an over-narrow combination is obvious before you
  // commit to it rather than after.
  const update = () => {
    const f = readFilters();
    const n = insights.customMix(cached, f, Date.now()).length;
    // Filtering is free — it runs against the cached library and makes
    // no requests. Creating the playlist is what costs, at one request
    // per hundred tracks, so say that rather than leaving the cap
    // looking like it might fetch something.
    const typedMiss = f.artistTyped && !f.artistId;
    const reqs = Math.ceil(n / 100);
    document.getElementById("cm-preview").innerHTML = typedMiss
      ? `<p class="empty-note">No artist called “${esc(document.getElementById("cm-artist").value.trim())}” in your library — the rest of the filters still apply.</p>`
      : n
      ? `<p class="nav-hint"><strong>${n}</strong> track${n === 1 ? "" : "s"} match — ${esc(insights.describeCustom(f))}.
         ${n > 300 ? `<br>Creating this would take about ${reqs} requests, one per hundred tracks. Building the list costs nothing; only creating the playlist talks to Spotify.` : ""}</p>`
      : `<p class="empty-note">Nothing matches that combination. Try loosening one of the filters.</p>`;
  };
  // Same component as the dive search — the app should not have two
  // artist searches that look different. Only the source differs: this
  // one filters the library already in hand rather than asking Spotify,
  // so it costs nothing and can't be rate-limited.
  let chosenArtist = null;
  wireArtistSearch({
    inputId: "cm-artist",
    listId: "cm-artist-list",
    source: async (q) => {
      const needle = q.toLowerCase();
      return artists.filter((a) => a.name.toLowerCase().includes(needle)).slice(0, 6);
    },
    onChoose: (it) => { chosenArtist = it; update(); },
  });
  document.getElementById("cm-artist-clear").addEventListener("click", () => {
    document.getElementById("cm-artist").value = "";
    chosenArtist = null;
    update();
  });

  root.querySelectorAll("#custom-form select, #custom-form input").forEach((c) => {
    c.addEventListener("change", update);
    c.addEventListener("input", update);
  });
  update();

  document.getElementById("cm-build").addEventListener("click", () => {
    const f = readFilters();
    const tracks = insights.customMix(cached, f, Date.now());
    if (!tracks.length) return flash("Nothing matches that combination.");
    openCardModal({
      id: "custom",
      title: "Your mix",
      subtitle: insights.describeCustom(f),
      simple: true,
      name: `DeepDive · ${insights.describeCustom(f)}`,
      count: tracks.length,
      tracks,
    });
  });
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
    // anchors, which is the whole structure. It is no longer offered as
    // a choice — "as found" means nothing to someone who didn't watch
    // it being built — but it remains the right default here.
    ? { length: 20, order: "found" }
    : { length: card.count <= 50 ? "all" : 50, order: "shuffle" };

  const tracksFor = () => applyPlaylistOptions(card.tracks, opts);

  const paint = () => {
    if (simple) lenRow.innerHTML = "";
    else renderPlaylistOptions(lenRow, opts, paint, card.count);
    const list = tracksFor();
    summary.textContent = `Preview ${list.length} track${list.length === 1 ? "" : "s"}`;
    // Read-only preview: same row treatment, no checkbox, and the
    // artist rather than the album underneath since a mix spans many.
    preview.innerHTML = list.slice(0, 100).map((t) => `
      <div class="track-row newt is-static">
        <div class="track-meta">
          <div class="track-name">${esc(t.name)}</div>
          <div class="track-sub">${esc((t.artists && t.artists[0] && t.artists[0].name) || "")}${t.album && t.album.name ? ` · ${esc(t.album.name)}` : ""}</div>
        </div>
      </div>`).join("") + (list.length > 100 ? `<p class="crate-note" style="margin-top:10px;">…and ${list.length - 100} more.</p>` : "");
  };
  paint();

  const exportBtnEl = document.getElementById("card-export");
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
        // Reuse by name is the behaviour: running the same mix again
        // updates the playlist rather than leaving a pile of duplicates.
        // A throwaway mix built from ad-hoc filters has no earlier
        // playlist to reuse, so it creates one either way.
        { forceNew: simple }
      );
      msg.innerHTML = `Playlist ${res.reused ? "updated" : "created"}: added ${res.added_count}${res.already_present_count ? `, ${res.already_present_count} already present` : ""}. <a href="${esc(res.url)}" data-spotify style="color:var(--accent);text-decoration:underline;">Open playlist</a>`;
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
    id: "compilations",
    name: "Include compilations",
    desc: "Adds the artist's own compilations and greatest-hits records. Usually only a handful of extra releases, so barely slower.",
    opts: { includeCompilations: true },
  },
  {
    id: "everything",
    name: "Everything they've touched",
    desc: "Adds compilations plus records they only guest on. Can be many times slower — for prolific artists this means hundreds of extra requests, so DeepDive will pace itself and may pause when Spotify asks it to. Only the tracks they're credited on are kept.",
    opts: { includeCompilations: true, includeAppearsOn: true },
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
function savedCustomOpts() {
  try { return JSON.parse(localStorage.getItem(INTENT_CUSTOM_KEY) || "{}"); } catch (e) { return {}; }
}

/** Turn an intent id into the option flags runSearch expects. */
function optionsForIntent(id, customOpts) {
  const intent = INTENTS.find((i) => i.id === id) || INTENTS[0];
  const base = {
    excludeLive: false, excludeCensored: false, excludeInstrumental: false,
    excludeAcappella: false, matchRemasters: false,
    includeCompilations: false, includeAppearsOn: false,
  };
  if (intent.id === "custom") return { ...base, ...(customOpts || savedCustomOpts()) };
  return { ...base, ...intent.opts };
}

let _pendingArtist = null;

function openIntentModal(artistName, { force = false } = {}) {
  // "Don't ask again" used to make sense: this dialog only chose how
  // deep a dive went, so skipping it meant accepting a default. Now it
  // chooses *what to do* — dip or dive — and skipping it removed Dip
  // from the app entirely, with no other route to it.
  //
  // A choice you can't skip is the right trade here: it is one tap, and
  // the alternative is a feature that silently doesn't exist for anyone
  // who ever ticked the box.

  _pendingArtist = artistName;
  const modal = document.getElementById("intent-modal");
  const list = document.getElementById("intent-list");
  const sub = document.getElementById("intent-artist");
  const custom = document.getElementById("intent-custom");
  if (!modal || !list) return;

  const adjust = document.getElementById("intent-adjust");
  const gear = document.getElementById("intent-gear");
  const dipBtn = document.getElementById("intent-dip");

  // The heading says what you're choosing about; the subtitle says who.
  const titleEl = document.getElementById("intent-title");
  if (titleEl) titleEl.textContent = artistName || "How should DeepDive search?";
  sub.textContent = artistName
    ? "Dip for the highlights, dive for everything."
    : "Pick what a dive does by default. You can change it any time.";

  // Opening the modal from Settings has no artist to act on, so the
  // choices make no sense there — it's the options that are wanted.
  const forArtist = !!artistName;
  document.querySelector(".intent-choices")?.classList.toggle("hidden", !forArtist);
  if (adjust) adjust.classList.toggle("hidden", forArtist);
  if (gear) gear.setAttribute("aria-expanded", String(!forArtist));

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
  setBox("opt-compilations", c.includeCompilations);
  setBox("opt-appears-on", c.includeAppearsOn);

  // In Custom, ticking the appeared-on box should raise the same warning.
  const appearsBox = document.getElementById("opt-appears-on");
  if (appearsBox) appearsBox.addEventListener("change", () => {
    const warn = document.getElementById("intent-warning");
    if (warn && selected === "custom") warn.classList.toggle("hidden", !appearsBox.checked);
  });


  modal.classList.remove("hidden");

  const close = () => modal.classList.add("hidden");
  const confirm = ({ dip = false } = {}) => {
    const customOpts = readCustomOptions();
    try {
      localStorage.setItem(INTENT_KEY, selected);
      localStorage.setItem(INTENT_CUSTOM_KEY, JSON.stringify(customOpts));
      // Clear any skip stored before 2.8.51, or anyone who ticked the
      // old box would keep bypassing the choice they now need.
      localStorage.removeItem(INTENT_SKIP_KEY);
    } catch (e) {}
    close();
    if (_pendingArtist) {
      const artist = _pendingArtist;
      _pendingArtist = null;
      runSearchWithOptions(artist, { ...optionsForIntent(selected, customOpts), dip });
    }
  };

  // Rebind cleanly each time so handlers don't stack across opens.
  const goEl = document.getElementById("intent-go");
  const cancelEl = document.getElementById("intent-cancel");
  const freshGo = goEl.cloneNode(true); goEl.replaceWith(freshGo);
  const freshCancel = cancelEl.cloneNode(true); cancelEl.replaceWith(freshCancel);
  freshGo.addEventListener("click", () => confirm());

  if (gear) {
    const freshGear = gear.cloneNode(true);
    gear.replaceWith(freshGear);
    freshGear.addEventListener("click", (e) => {
      e.stopPropagation();
      const el = document.getElementById("intent-adjust");
      const open = !el.classList.contains("hidden");
      el.classList.toggle("hidden", open);
      freshGear.setAttribute("aria-expanded", String(!open));
    });
  }

  // A dip is a dive that stops early and keeps only the best hour, so
  // it takes the same options and the same route in — the difference is
  // what comes out, not how it is asked for.
  const dipEl = document.getElementById("intent-dip");
  if (dipEl) {
    const freshDip = dipEl.cloneNode(true);
    dipEl.replaceWith(freshDip);
    freshDip.addEventListener("click", () => confirm({ dip: true }));
  }
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
    includeCompilations: !!document.getElementById("opt-compilations")?.checked,
    includeAppearsOn: !!document.getElementById("opt-appears-on")?.checked,
  };
}

/**
 * The one artist search.
 *
 * Every artist search in the app is this: same field, same dropdown,
 * same keyboard handling. Only where the names come from and what
 * happens on choosing one differ. Custom mixes had a `<select>` of
 * several hundred artists, which was unusable and looked like a
 * different feature entirely.
 *
 * @param source    async (query) => [{ id, name, image_url }]
 * @param onChoose  called with the chosen item
 * @param allowPin  show the pin button — only meaningful where the
 *                  result is a real Spotify artist rather than a name
 *                  already in the library
 */
function wireArtistSearch({ inputId, listId, source, onChoose, allowPin = false }) {
  const input = document.getElementById(inputId);
  const list = document.getElementById(listId);
  if (!input || !list) return null;

  let timer = null, items = [], active = -1;
  const close = () => { list.classList.remove("open"); list.innerHTML = ""; items = []; active = -1; };
  const choose = (it) => {
    if (!it) return;
    input.value = it.name;
    close();
    input.blur();
    onChoose(it);
  };

  input.addEventListener("input", () => {
    const q = input.value.trim();
    clearTimeout(timer);
    if (q.length < 2) return close();
    timer = setTimeout(async () => {
      try {
        items = await source(q);
        if (!items || !items.length) return close();
        list.innerHTML = items.map((it, i) => `
          <div class="autofill-item" data-i="${i}">
            ${it.image_url ? `<img src="${esc(it.image_url)}" alt="">` : ""}
            <span class="autofill-name">${esc(it.name)}</span>
            ${allowPin ? `<button type="button" class="autofill-pin" data-pin-i="${i}" title="Pin for later" aria-label="Pin ${esc(it.name)}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>` : ""}
          </div>`).join("");
        list.classList.add("open");
        active = -1;
        list.querySelectorAll(".autofill-item").forEach((el) => {
          el.addEventListener("mousedown", (ev) => {
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
            watchlist.pin(it.name, { spotifyId: it.id, imageUrl: it.image_url || null, imageUrlLarge: it.image_url_large || null });
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
  input.addEventListener("blur", () => setTimeout(close, 120));

  return { close, isOpen: () => list.classList.contains("open") };
}

function wireSearchBar() {
  const input = document.getElementById("artist-input");
  const goBtn = document.getElementById("search-go-btn");
  const list = document.getElementById("autofill-list");
  const settingsBtn = document.getElementById("settings-toggle-btn");

  // The options icon opens the intent chooser directly. It's the way
  // back in for anyone who ticked "Don't ask again" — without it that
  // choice would be permanent with no visible escape.
  settingsBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const n = input.value.trim();
    openIntentModal(n || null, { force: true });
  });

  // Dismiss the keyboard on submit. On a phone it otherwise stays up
  // over the dive screen that just opened, covering the thing the
  // search was for.
  const go = () => {
    const n = input.value.trim();
    if (!n) return;
    input.blur();
    startSearch(n);
  };
  goBtn.addEventListener("click", go);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !list.classList.contains("open")) go(); });

  wireArtistSearch({
    inputId: "artist-input",
    listId: "autofill-list",
    source: (q) => client.searchArtists(q, 6),
    onChoose: (it) => startSearch(it.name),
    allowPin: true,
  });
}


/**
 * @param compact     Home shows a short row with a way through to Dives.
 * @param showAllPins Dives is where the full pin list belongs.
 */
async function loadSuggestions({ compact = false, showAllPins = false } = {}) {
  _suggestOpts = { compact, showAllPins };
  document.getElementById("rl-recheck")?.addEventListener("click", async (ev) => {
    const btn = ev.currentTarget;
    btn.disabled = true;
    btn.textContent = "Checking…";
    const stillLimited = await verifyRateLimit();
    if (stillLimited) {
      btn.disabled = false;
      btn.textContent = "Still paused — check again";
    } else {
      flash("Spotify is responding again.");
      renderHome();
    }
  });

  const el = document.getElementById("suggestions-row");
  if (!el) return;

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
  const blocked = watchlist.blockedNameSet("dives");
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

  // Tiles render at 56px, which is ~168 device pixels on a 3x phone.
  // Spotify's smallest artist image is 160px and its smallest album
  // image is only 64px, so the small variant visibly pixelates. Use the
  // middle one (320/300) for tiles and keep the 640px for full screen.
  const smallest = (imgs) => (imgs && imgs.length
    ? (imgs.length >= 2 ? imgs[1].url : imgs[0].url)
    : null);
  // Spotify returns one photo at three sizes, widest first. Tiles want
  // the small copy; the full-screen dive wants the 640px original, and
  // upscaling the small one is what made dive photos look soft.
  const biggest = (imgs) => (imgs && imgs.length ? imgs[0].url : null);

  // --- library half (free) ---
  // Bounded: storage that hangs rather than fails would otherwise stall
  // the whole row with nothing to show and nothing to report. A missed
  // suggestion is a far better outcome than a blank page.
  let libraryPicks = [];
  let cachedArt = { byId: new Map(), byName: new Map(), largeById: new Map(), largeByName: new Map() };
  try {
    const cached = await Promise.race([
      libraryCache.peek(),
      new Promise((resolve) => setTimeout(() => resolve([]), 2500)),
    ]);
    if (cached && cached.length) {
      libraryPicks = insights.librarySuggestions(cached, { exclude, limit: 6, seed: _suggestSeed });
      // Artwork for anything already in the library, free of charge.
      cachedArt = insights.artworkFromCache(cached);
      _cachedArt = cachedArt;
      // Sampler candidates come from the same read — no extra cost.
      // Keep the full pool rather than a trimmed twelve, so each run can
      // draw a different handful from it.
      // The sampler is a mix, so it honours the mix block rather than
      // the dive one. It used to filter on the dive block — so blocking
      // an artist from suggestions silently barred them from samplers
      // while leaving them in every other mix.
      const mixBlocked = watchlist.blockedNameSet("mixes");
      _samplerPool = insights.artistsBarelyExplored(cached, {
        maxTracks: 3, limit: 500,
      }).filter((a) => !mixBlocked.has((a.name || "").trim().toLowerCase()));
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
    for (const a of top) if (!seen.has(a.id)) seen.set(a.id, { id: a.id, name: a.name, image_url: smallest(a.images), image_url_large: biggest(a.images), reason: "you've been playing them" });
    for (const a of recent) if (!seen.has(a.id)) seen.set(a.id, { id: a.id, name: a.name, image_url: null, reason: "played recently" });
    listeningPicks = Array.from(seen.values()).filter((s2) => {
      const k = (s2.name || "").trim().toLowerCase();
      return !exclude.has(k) && !libraryPicks.some((l) => l.id === s2.id);
    });
    listeningPicks = insights.seededPick(listeningPicks, 6, seed);
  } catch (e) {
    listeningFailed = true; // library half still works
    // The suggestion row is the app's canary: it touches Spotify on
    // every load and is the first thing to go quiet when something is
    // wrong. Rather than leaving a silently short row, raise a banner
    // that says which problem it is.
    raiseApiBanner(e);
  }

  if (!listeningFailed) clearApiBanner();
  const suggestions = [...listeningPicks, ...libraryPicks];

  // Borrow cached artwork before considering any network request. Most
  // suggested artists are in the library already, so this covers the
  // majority for nothing — and per-artist photo requests were exactly
  // what was silently failing under rate limiting.
  for (const x of suggestions) {
    if (x.image_url) continue;
    const key = (x.name || "").trim().toLowerCase();
    x.image_url = cachedArt.byId.get(x.id)
      || cachedArt.byName.get(key)
      || null;
    // The cache keeps a large variant of everything it keeps a small one
    // of. Borrowing only the small copy is what left sampler slideshows
    // and tile-launched dives pixelated: nothing downstream had anything
    // better to reach for.
    x.image_url_large = (cachedArt.largeById && cachedArt.largeById.get(x.id))
      || (cachedArt.largeByName && cachedArt.largeByName.get(key))
      || x.image_url_large
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
    renderSuggestionRow(el, pins, suggestions, _suggestOpts.showAllPins, { listeningFailed, hasCache: libraryPicks.length > 0 });
  } catch (e) {
    el.innerHTML = `<p class="crate-note row-label">Couldn't build suggestions.</p>`;
  }

  // Then enrich in the background and re-render if anything arrives.
  const missing = suggestions.filter((x) => !x.image_url).map((x) => x.id).filter(Boolean);
  if (missing.length) {
    try {
      const details = await client.getArtistsByIds(missing.slice(0, 12));
      const byId = new Map(details.map((a) => [a.id, smallest(a.images)]));
      const bigById = new Map(details.map((a) => [a.id, biggest(a.images)]));
      let changed = false;
      for (const x of suggestions) {
        if (!x.image_url && byId.get(x.id)) {
          x.image_url = byId.get(x.id);
          x.image_url_large = bigById.get(x.id) || null;
          changed = true;
        }
      }
      // Only redraw if the row is still on screen and something changed;
      // the user may have navigated away while this was in flight.
      if (changed && document.getElementById("suggestions-row") === el) {
        renderSuggestionRow(el, pins, suggestions, _suggestOpts.showAllPins);
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
let _suggestOpts = { compact: false, showAllPins: false };
// Bumped by the refresh control so a re-draw picks a different set from
// the same pool rather than returning the same faces.
let _suggestSeed = 0;

function renderSuggestionRow(el, pins, suggestions, showAllPins = false, state = {}) {
  _row = { el, pins, suggestions, showAllPins, state };
  // Home shows a taste and points at Dives; Dives shows everything.
  //
  // The counts are per row rather than absolute. Four items is a full
  // row on a phone and half an empty one on a desktop grid four across,
  // which made Home look unfinished at width rather than deliberately
  // short.
  const compact = _suggestOpts.compact;
  const perRow = columnsAtWidth();
  const PIN_VISIBLE = compact ? perRow : 8;
  if (compact) suggestions = suggestions.slice(0, perRow * 2);
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
      ${actions ? `
        <button class="tile-more" data-more aria-label="More for ${esc(name)}" aria-expanded="false">
          <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>
        </button>
        <span class="tile-actions">${actions}</span>` : ""}
    </div>`;

  const pinsHtml = shownPins.length ? `
    <div class="row-head"><h2>Pinned</h2></div>
    <div class="tile-grid">
      ${shownPins.map((p) => tile(p.name, p.image_url, null,
        `<button class="tile-btn" data-block="${esc(p.name)}" data-sid="${esc(p.spotify_id || "")}" title="Never suggest this artist">&minus;</button>
         <button class="tile-btn danger" data-unpin="${esc(p.id)}" data-name="${esc(p.name)}" title="Unpin">&times;</button>`, true)).join("")}
    </div>
    ${extraPins > 0 ? `<div style="text-align:center;margin-top:10px;"><button class="btn btn-ghost btn-small" id="show-more-pins">Show ${extraPins} more</button></div>` : ""}` : "";

  const suggHtml = suggestions.length ? `
    <div class="row-head"><h2>Suggested</h2><span class="qual">for you</span>
      <button class="row-icon" id="sugg-refresh" title="Show a different set" aria-label="Refresh suggestions">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/></svg>
      </button>
      <button class="row-icon" id="sugg-random" title="Dive one of these at random" aria-label="Random dive">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.4" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1.4" fill="currentColor"/><circle cx="15.5" cy="8.5" r="1.4" fill="currentColor"/></svg>
      </button>
      ${compact ? `<button class="row-more" data-tab="dives">All dives</button>` : ""}</div>
    <div class="tile-grid">
      ${suggestions.map((sg) => tile(sg.name, sg.image_url, sg.reason,
        `<button class="tile-btn" data-pin="${esc(sg.name)}" data-sid="${esc(sg.id || "")}" data-img="${esc(sg.image_url || "")}" data-img-big="${esc(sg.image_url_large || "")}" title="Pin for later">+</button>
         <button class="tile-btn danger" data-block="${esc(sg.name)}" data-sid="${esc(sg.id || "")}" title="Never suggest this artist">&minus;</button>`)).join("")}
    </div>` : "";

  // Never leave the row silently blank — an empty area with no
  // explanation reads as broken. Say which half was unavailable.
  // Half the suggestions come from the library, so without a cache the
  // row is quietly thinner and nothing says why. `hasCache` was already
  // being passed here and never read.
  let cacheHtml = "";
  if (state.hasCache === false && suggestions.length) {
    cacheHtml = `
      <p class="nav-hint">Some suggestions come from your Liked Songs, which haven't been read yet.
        <button class="btn btn-ghost btn-small" data-read-library>Read my library</button></p>`;
  }

  let emptyHtml = "";
  if (!suggestions.length) {
    if (state.pending) {
      // Placeholders in the shape of the answer, rather than a line of
      // text where the results will be.
      emptyHtml = `
        <div class="row-head"><h2>Suggested</h2><span class="qual">for you</span></div>
        <div class="tile-grid">
          ${Array.from({ length: 6 }, () => `
            <div class="tile-skeleton">
              <span class="sk-art"></span>
              <span class="sk-lines"><span class="sk-line"></span><span class="sk-line short"></span></span>
            </div>`).join("")}
        </div>`;
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

  if (state.pinsOnly) {
    pinsSection.innerHTML = pinsHtml;
  } else {
    pinsSection.innerHTML = pinsHtml;
    suggSection.innerHTML = suggHtml + emptyHtml + cacheHtml;
    wireReadLibrary(suggSection, () => loadSuggestions(_suggestOpts));
  }


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
    watchlist.pin(name, { spotifyId: b.dataset.sid || null, imageUrl: b.dataset.img || null, imageUrlLarge: b.dataset.imgBig || null });
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
        watchlist.unpin(b.dataset.unpin);
    _row.pins = _row.pins.filter((p) => p.id !== b.dataset.unpin);
    dropPill(b);
  }));

  // Suggestions are drawn from a much larger pool than the row shows,
  // so a refresh is a re-draw rather than a fetch — no requests spent.
  document.getElementById("sugg-refresh")?.addEventListener("click", () => {
    _suggestSeed = (Date.now() >>> 0) ^ Math.floor(Math.random() * 0xffffffff);
    loadSuggestions(_suggestOpts);
  });

  // Picks from what's on screen, so it can't offer an artist the row
  // has already ruled out as blocked or already-dived.
  document.getElementById("sugg-random")?.addEventListener("click", () => {
    const pool = suggestions.concat(pins);
    if (!pool.length) return flash("Nothing to pick from yet.");
    const pick = pool[Math.floor(Math.random() * pool.length)];
    startSearch(pick.name);
  });

  el.querySelectorAll("[data-block]").forEach((b) => b.addEventListener("click", (ev) => {
    ev.stopPropagation();
    const name = b.dataset.block;
    // From a tile, the block means dives — that's the context you're in.
    // Mixes are blocked separately from Pins & blocked, because not
    // wanting to explore an artist isn't the same as not wanting to
    // hear tracks you already liked.
    watchlist.block(name, b.dataset.sid || null, ["dives"]);
    flash(`${name} won't be suggested for dives.`);
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
/**
 * Tiles used to hand over the image they were already showing, so the
 * dive screen had something up instantly. That image is a thumbnail,
 * and full-screen it was visibly pixelated on every tile-started dive —
 * which is why a dive from the search box looked right and one from a
 * tile did not. The dive now shows a loading field until the real photo
 * is ready, so no caller needs to supply artwork.
 */
function startSearch(artistName) {
  if (blockedByRateLimit()) return;
  _lastDiveArtist = artistName;
  _haveArtistPhoto = false;
  openIntentModal(artistName);
}

async function runSearchWithOptions(artistName, opts) {
  // The full screen is not opened until there is a photo to put on it.
  // Every attempt to fill that gap with something cheap — the tile's own
  // thumbnail — looked pixelated, because a 56px tile image stretched
  // across a phone always will. A spinner on the page you were already
  // on costs a second or two and is never wrong.
  showDiveSpinner();
  let artist = null;
  try {
    await preflight();
    artist = await client.findArtist(artistName);
    if (!artist) {
      throw new Error(`No Spotify artist found matching "${artistName}".`);
    }
    await preloadPhoto(largestImage(artist.images));
  } catch (e) {
    hideDiveSpinner();
    if (!_diveCancelled) renderProgressError(e.message || String(e), e);
    return;
  }
  if (_diveCancelled) { hideDiveSpinner(); return; }

  hideDiveSpinner();
  showDiveScreen(`Diving into ${artist.name}…`, () => renderHome());
  const opening = largestImage(artist.images);
  if (opening) { _haveArtistPhoto = true; addDiveImage(opening); }
  else if (artist.id) fetchArtistImages(artist.id);

  try {
    const result = await search.runSearch(client, artistName, {
      ...opts,
      libraryCache,
      // Already resolved above so the photo could be loaded first —
      // handed over so the search doesn't spend the request again.
      resolvedArtist: artist,
      onProgress: (pct, stage) => updateDiveScreen(pct, stage),
      // Album art is a fallback for acts with no photo on Spotify, not
      // decoration to mix in alongside one.
      onArtwork: (url) => { if (!_haveArtistPhoto) addDiveImage(url); },
    });
    if (_diveCancelled) return;   // abandoned while it ran
    hideDiveScreen();
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
    if (opts && opts.dip) {
      await presentDip(result);
    } else {
      renderResults(result);
    }
    // If this artist was pinned, the pin has served its purpose. Ask
    // rather than assume — but ask at the moment it's obvious, which is
    // the moment the dive finishes, not later on a list page.
    maybeOfferUnpin(artistName);
  } catch (e) {
    hideDiveScreen();
    if (!_diveCancelled) renderProgressError(e.message || String(e), e);
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

// ---------------------------------------------------------------------
// Full-screen dive
// ---------------------------------------------------------------------
// A dive runs for minutes. It gets the whole screen, filled with the
// artist, and reports along the bottom — rather than a progress bar in a
// box in the middle of an empty page.
//
// Photos arrive over time: the artist's own first, then album covers as
// the catalogue is read, and for a multi-artist scan every artist in
// turn. So the slideshow accepts images as they're discovered rather
// than needing the full set up front.

let _diveCancelled = false;
let _diveImages = [];
let _diveSlideTimer = null;
let _diveSlideIndex = 0;

/**
 * Fetch an artist's photos when the search result didn't carry any.
 * Fire-and-forget: the slideshow works without it.
 */
function fetchArtistImages(artistId) {
  client.get(`artists/${artistId}`)
    .then((a) => {
      const photo = largestImage(a && a.images);
      if (photo) { _haveArtistPhoto = true; addDiveImage(photo); }
    })
    .catch(() => {});
}

/**
 * Spotify returns an image set widest-first: the same picture at 640,
 * 320 and 160. Anything smaller than the largest will be upscaled to
 * fill the screen and look soft, so only the first is ever wanted.
 */
function largestImage(images) {
  return (images && images.length) ? images[0].url : null;
}

function showDiveScreen(heading, onCancel) {
  const el = document.getElementById("dive-screen");
  if (!el) return;
  _diveCancelled = false;
  _diveImages = [];
  _diveSlideIndex = 0;
  document.getElementById("dive-slides").innerHTML = "";
  // Back to the loading field: a new dive has no photo yet, and the last
  // dive's artist must not linger behind it.
  const load0 = document.getElementById("dive-loading");
  if (load0) load0.classList.remove("off");
  document.getElementById("dive-heading").textContent = heading;
  document.getElementById("dive-stage").textContent = "Starting…";
  document.getElementById("dive-fill").style.width = "0%";
  const pc0 = document.getElementById("dive-pct");
  if (pc0) pc0.textContent = "0%";
  el.hidden = false;

  const cancel = document.getElementById("dive-cancel");
  if (cancel) {
    const fresh = cancel.cloneNode(true);
    cancel.replaceWith(fresh);
    fresh.addEventListener("click", () => {
      _diveCancelled = true;
      hideDiveScreen();
      if (typeof onCancel === "function") onCancel();
    });
  }
  startSlideshow();
}


/**
 * A spinner over whatever page you were on, shown while the artist is
 * resolved and their photo downloaded. Deliberately not the dive screen:
 * the dive is full-bleed and opening it before there is a photo means
 * showing either a blank field or a stretched thumbnail.
 */
function showDiveSpinner() {
  _diveCancelled = false;
  const el = document.getElementById("dive-spinner");
  if (el) el.hidden = false;
}

function hideDiveSpinner() {
  const el = document.getElementById("dive-spinner");
  if (el) el.hidden = true;
}

/**
 * Resolve once the photo is decoded and ready to paint, so the dive
 * screen opens onto it rather than onto a frame of nothing.
 *
 * Never rejects, and gives up after a few seconds: a slow or broken
 * image must not be able to hold the dive at a spinner indefinitely.
 * Without a URL at all it returns immediately — some artists have no
 * photo, and they still get to be dived into.
 */
function preloadPhoto(url, timeoutMs = 5000) {
  if (!url) return Promise.resolve();
  return new Promise((resolve) => {
    let settled = false;
    const done = () => { if (!settled) { settled = true; resolve(); } };
    const img = new Image();
    img.onload = done;
    img.onerror = done;
    img.src = url;
    setTimeout(done, timeoutMs);
  });
}

/**
 * Add a photo to the rotation. Loads it first, so a broken URL never
 * becomes a blank slide in the cycle. The first one to arrive clears the
 * loading field.
 */function addDiveImage(url) {
  if (!url || _diveImages.includes(url)) return;
  const probe = new Image();
  probe.onload = () => {
    if (_diveImages.includes(url)) return;
    const slides = document.getElementById("dive-slides");
    if (!slides) return;
    _diveImages.push(url);
    const slide = document.createElement("div");
    slide.className = "dive-slide";
    slide.dataset.url = url;
    slide.style.backgroundImage = `url("${url.replace(/"/g, "%22")}")`;
    slides.appendChild(slide);
    // First one in shows immediately; the rest wait their turn.
    if (_diveImages.length === 1) {
      // Two frames: the element must be laid out at opacity 0 before the
      // class is added, or the browser coalesces both into one style
      // computation and the transition never runs — a hard cut instead
      // of the fade the stylesheet describes.
      requestAnimationFrame(() => requestAnimationFrame(() => {
        slide.classList.add("on");
        const load = document.getElementById("dive-loading");
        if (load) load.classList.add("off");
      }));
    }
  };
  probe.src = url;
}



function startSlideshow() {
  clearInterval(_diveSlideTimer);
  _diveSlideTimer = setInterval(() => {
    const slides = document.querySelectorAll("#dive-slides .dive-slide");
    if (slides.length < 2) return;
    slides[_diveSlideIndex % slides.length].classList.remove("on");
    _diveSlideIndex = (_diveSlideIndex + 1) % slides.length;
    slides[_diveSlideIndex].classList.add("on");
  }, 4500);
}

function updateDiveScreen(pct, stage) {
  // A cancelled run keeps reporting progress until its loop notices the
  // flag, and those late callbacks used to re-set the tab title after
  // hideDiveScreen had cleared it — leaving "(33%) Working" on a tab
  // showing the home screen, which read as stuck rather than cancelled.
  const screen = document.getElementById("dive-screen");
  if (!screen || screen.hidden) return;
  const fill = document.getElementById("dive-fill");
  const st = document.getElementById("dive-stage");
  const pc = document.getElementById("dive-pct");
  if (fill) fill.style.width = `${pct}%`;
  if (pc) pc.textContent = `${pct}%`;
  if (st && stage) st.textContent = stage;
  setTitle(`(${pct}%) DeepDive · Working`);
}

function setDiveHeading(text) {
  const h = document.getElementById("dive-heading");
  if (h) h.textContent = text;
}

function hideDiveScreen() {
  const el = document.getElementById("dive-screen");
  if (el) el.hidden = true;
  clearInterval(_diveSlideTimer);
  _diveSlideTimer = null;
  setTitle("DeepDive");
}

/**
 * Show the artist once known. Separate function so multi-artist dives
 * and the sampler can reuse it as a slideshow later.
 */

// Tracks whether a genuine artist photo has been shown, so a later
// album-art fallback can't replace it.
let _haveArtistPhoto = false;



/**
 * Open a Spotify link in the desktop or mobile client where it exists,
 * falling back to the web player.
 *
 * Opens the web player, always.
 *
 * This used to navigate to a `spotify:` URI and race a 900ms timer
 * against a `visibilitychange` to decide whether the desktop app had
 * taken it. Both outcomes look identical from here: a browser that
 * shows an "open this app?" prompt backgrounds the page itself and
 * cancels the fallback, and a silently-blocked custom-scheme navigation
 * fires nothing at all. Someone without the app got neither the app nor
 * the website.
 *
 * The web player works for everyone and offers to hand off to the
 * desktop app itself, so it does the same job without guessing.
 */
function openInSpotify(webUrl) {
  if (!webUrl) return;
  window.open(webUrl, "_blank", "noopener");
}


// Turn an error into something a person can act on, plus the technical
// detail underneath. The point is that nobody should ever need to open
// the network console to find out what happened — a 429 with a six-hour
// Retry-After should say "wait until 5pm", not "something went wrong".
function explainError(err) {
  const status = err && err.status;
  const ra = err && (err.retryAfterSeconds ?? parseFloat(err.retryAfter));

  // A quota limit and a rate limit both arrive as 429 but mean different
  // things, and telling someone to "wait a moment" when their daily
  // budget is spent is worse than saying nothing. Spotify distinguishes
  // them with a reason field; so do we.
  if (err && err.quotaExhausted) {
    return {
      headline: "Your Spotify app has used up its quota",
      detail:
        "This is a limit on your own Spotify credentials, not a fault in DeepDive, " +
        "and it isn't something waiting a few seconds fixes. Spotify groups endpoints " +
        "into separate budgets, which is why the home screen can still load normally " +
        "while a dive can't start — reading an artist's catalogue draws on a different " +
        "budget from your library and listening history. It refills on its own; try " +
        "again later. Dives that read compilations and guest appearances spend far " +
        "more of it than standard ones.",
    };
  }

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
/**
 * Did credit filtering actually engage on the last dive?
 *
 * The point of instrumenting this is that the answer used to be
 * unknowable from outside — the filter could be dead and everything
 * would look normal, only with too many tracks.
 */
function catalogSummaryHtml() {
  if (!_catalogLog.length) return "";
  const guest = _catalogLog.filter((e) => e.creditedOnly);
  const dropped = _catalogLog.reduce((n, e) => n + e.dropped, 0);
  const noGroup = _catalogLog.filter((e) => !e.group).length;
  const rows = guest.slice(-8).map((e) =>
    `<tr><td>${esc(e.name)}</td><td style="text-align:right;">kept ${e.kept}, dropped ${e.dropped}</td></tr>`).join("");
  return `
    <div class="diag-block">
      <div class="diag-label">Last catalogue read</div>
      <div>${_catalogLog.length} releases · ${guest.length} not their own · ${dropped} tracks dropped as uncredited</div>
      ${noGroup ? `<div>${noGroup} releases arrived with no album_group</div>` : ""}
      ${rows ? `<table class="diag-table">${rows}</table>` : ""}
    </div>`;
}

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
    ${catalogSummaryHtml()}
    <div class="diag-block">
      <div class="diag-label">Build</div>
      <div>${esc(BUILD)}</div>
    </div>
    <div class="diag-block">
      <div class="diag-label">Pacing</div>
      <div>${client._throttleMs ? `${client._throttleMs}ms between requests (learned from rate limiting)` : "none — running at full speed"}</div>
    </div>`;
}

/**
 * Renders its own view. It used to unhide elements inside the old
 * progress card, which the full-screen rewrite removed — so a failed
 * dive was showing nothing at all.
 */
function renderProgressError(msgOrErr, err) {
  setTitle("DeepDive · Error");
  hideDiveScreen();
  const info = explainError(err || msgOrErr);
  root.innerHTML = `
    <div class="card">
      <h1>${esc(info.headline)}</h1>
      <p class="muted" style="line-height:1.55;">${esc(info.detail)}</p>
      <div id="err-diagnosis"><p class="nav-hint">Checking what went wrong…</p></div>
      <details class="diag">
        <summary>Technical details</summary>
        ${diagnosticsHtml()}
      </details>
      <div class="actions">
        <button class="btn btn-primary" id="err-home">Back to search</button>
        <button class="btn btn-ghost hidden" id="err-retry">Try again</button>
      </div>
    </div>`;
  document.getElementById("err-home")?.addEventListener("click", () => renderHome());

  // Run on its own rather than waiting to be asked. Half of what went
  // wrong today was self-inflicted and self-repairable, and nobody
  // should have to know to go looking in Advanced for that.
  const slot = document.getElementById("err-diagnosis");
  diagnose().then((d) => {
    if (!slot.isConnected) return;
    slot.innerHTML = renderDiagnosisBlock(d);
    if (d.code === "DD-OK" || d.code === "DD-FIXED" || d.code === "DD-RATE") {
      const retry = document.getElementById("err-retry");
      if (retry && _lastDiveArtist) {
        retry.classList.remove("hidden");
        retry.textContent = `Try ${_lastDiveArtist} again`;
        retry.addEventListener("click", () => startSearch(_lastDiveArtist));
      }
    }
  }).catch(() => {
    if (slot.isConnected) slot.innerHTML = `<p class="nav-hint">The checks couldn't run either — that usually means no connection.</p>`;
  });
}

// ============================================================
// Results (like + playlist)
// ============================================================
/**
 * The line under the artist's name.
 *
 * Was "12 already liked · 3 to confirm · 48 new" — a meta string of
 * counts joined by middle dots, which reads as a status bar rather than
 * an answer. This says what was found, in sentences.
 */
function resultsSummary(r, dupCount, newCount) {
  const parts = [];
  const liked = r.already_liked_count || 0;
  if (liked) parts.push(`You already have ${liked} of these.`);
  if (dupCount) {
    parts.push(dupCount === 1
      ? "1 more is a recording you own under a different release."
      : `${dupCount} more are recordings you own under different releases.`);
  }
  parts.push(newCount === 1 ? "1 track is new to you." : `${newCount} tracks are new to you.`);
  if (r.excluded_count) parts.push(`${r.excluded_count} were filtered out.`);
  return parts.join(" ");
}

/** A track already in the library under some other release. */
function dupRow(d) {
  const matched = d.matched_liked_track ? d.matched_liked_track.name : "";
  return trackRow(d.track, {
    cls: "dup",
    // Confirmed duplicates are collected under a different attribute
    // from new tracks, since they're liked rather than added to a
    // playlist.
    attr: "data-dup",
    match: matched ? `Matches “${matched}” — ${d.match_basis}` : d.match_basis,
  });
}

/**
 * One track. The whole row toggles its checkbox — a 19px box is a poor
 * target on a phone, and the app's tiles already behave this way.
 *
 * `match` is the reason a row is in the "already yours" list; it reads
 * as the row's own explanation rather than an annotation stuck beneath.
 */
function trackRow(t, { checkbox = true, cls = "newt", sub = "", match = "", attr = "data-tid" } = {}) {
  const art = (t.album && t.album.image_url)
    ? `<img src="${esc(t.album.image_url)}" alt="" class="track-art" loading="lazy">`
    : `<span class="track-art-fallback">♪</span>`;
  return `
    <label class="track-row ${cls}" data-rd="${esc((t.album && t.album.release_date) || "")}" data-title="${esc((t.name || "").toLowerCase())}">
      ${art}
      <span class="track-meta">
        <span class="track-name">${esc(t.name)}</span>
        <span class="track-sub">${esc(sub || (t.album && t.album.name) || "")}</span>
        ${match ? `<span class="track-match">${esc(match)}</span>` : ""}
      </span>
      <span class="track-dur">${t.duration_ms ? fmtDur(t.duration_ms) : ""}</span>
      ${checkbox ? `<input type="checkbox" ${attr}="${esc(t.id)}" checked>` : ""}
    </label>`;
}

/**
 * The hero photo fades and drifts as you scroll into the lists. It's an
 * establishing shot — once you're reading track names it's just taking
 * up the screen, and holding it at full strength makes the list feel
 * like it's behind something.
 *
 * Driven off scroll position rather than a scroll-linked CSS animation,
 * which Safari still doesn't support. rAF-throttled so it isn't doing
 * layout work on every scroll event.
 */
function attachHeroFade() {
  const hero = document.getElementById("results-hero");
  const photo = document.getElementById("results-hero-photo");
  if (!hero || !photo) return;
  let ticking = false;
  const apply = () => {
    ticking = false;
    const h = hero.offsetHeight || 1;
    const p = Math.min(1, Math.max(0, window.scrollY / h));
    photo.style.opacity = String(1 - p * 0.85);
    // A little slower than the page, so it recedes rather than sliding off.
    photo.style.transform = `translateY(${(p * h * 0.18).toFixed(1)}px)`;
  };
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(apply);
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  apply();
}

/**
 * A dip's result: the artist's best hour, ready to save.
 *
 * The dive has already read the catalogue and found what you own, so a
 * dip costs one extra request — Last.fm for the popularity ordering.
 * Without a key it still works, just ordered by the catalogue rather
 * than by what people actually play.
 */
async function presentDip(result) {
  const artistName = (result.artist && result.artist.name) || "";
  const pool = (result.catalog_tracks && result.catalog_tracks.length)
    ? result.catalog_tracks
    : [...(result.duplicate_candidates || []).map((d) => d.track), ...(result.new_tracks || [])];

  let top = [];
  try {
    if (lastfm.hasKey()) top = await lastfm.topTracks(artistName, 50);
  } catch (e) {
    // An ordering we couldn't fetch is not a reason to lose the mix.
    flash("Couldn't reach Last.fm — ordering by catalogue instead.");
  }

  const dip = matching.buildDip(pool, top);
  if (!dip.tracks.length) {
    renderProgressError(`Couldn't build a dip for ${artistName} — no tracks came back.`);
    return;
  }
  const mins = Math.round(dip.totalMs / 60000);
  openCardModal({
    id: `dip-${(result.artist && result.artist.id) || artistName}`,
    title: `${artistName}, in an hour`,
    subtitle: top.length
      ? `${dip.tracks.length} tracks, about ${mins} minutes, most played first`
      : `${dip.tracks.length} tracks, about ${mins} minutes`,
    simple: true,
    name: `DeepDive · ${artistName} in an hour`,
    count: dip.tracks.length,
    tracks: dip.tracks,
  });
}

function renderResults(r) {
  setTitle("DeepDive · Results");
  const dups = r.duplicate_candidates || [];
  const news = r.new_tracks || [];
  const artistName = r.artist ? r.artist.name : "";

  const photo = largestImage(r.artist && r.artist.images);
  root.innerHTML = `
    <div class="results-hero" id="results-hero">
      <div class="results-hero-photo${photo ? "" : " is-blank"}" id="results-hero-photo"
           ${photo ? `style="background-image:url('${esc(photo)}')"` : ""}></div>
      <div class="results-hero-veil"></div>
      <div class="results-hero-text">
        <h1>${esc(artistName)}</h1>
        <p class="results-stats">
          ${dups.length ? `<span class="results-stat"><span class="dot dup"></span>${dups.length} duplicate${dups.length === 1 ? "" : "s"}</span>` : ""}
          <span class="results-stat"><span class="dot new"></span>${news.length} new</span>
          ${r.already_liked_count ? `<span class="results-stat"><span class="dot liked"></span>${r.already_liked_count} already liked</span>` : ""}
        </p>
      </div>
    </div>
    <div class="results-body">
      <p class="muted">${resultsSummary(r, dups.length, news.length)}</p>
      ${r.collapsed_count ? `<p class="crate-note">${r.collapsed_count} duplicate recording${r.collapsed_count === 1 ? "" : "s"} collapsed — the same track appeared on more than one release.</p>` : ""}

      ${dups.length ? `
        <div class="crate-header"><span class="label">Already yours, elsewhere</span></div>
        <p class="crate-note">Same recording as something in your Liked Songs, under a different release. Checked = will be liked.</p>
        <div id="dup-list">
          ${dups.map((d) => dupRow(d)).join("")}
        </div>` : ""}

      <div class="crate-header"><span class="label">New to you</span></div>
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

      <div class="flash hidden" id="result-msg" style="margin-top:18px;"></div>

    </div>

    <div class="results-actions">
      <div class="results-actions-row">
        ${dups.length ? `<button class="btn btn-ghost" data-action="like">Like Songs</button>` : ""}
        ${news.length ? `<button class="btn btn-ghost" data-action="playlist">Create Playlist</button>` : ""}
        ${dups.length && news.length ? `<button class="btn btn-primary" data-action="both">Both</button>` : ""}
      </div>
      <button class="btn btn-ghost btn-back" data-home>Back to home</button>
    </div>`;

  root.querySelector("[data-home]").addEventListener("click", () => renderHome());
  attachHeroFade();

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
      btns.forEach((b) => (b.disabled = false));
      showActionResult({ headline: "Done", detail: parts.join(" "), url: res.url });
      return;
    }
    if (parts.length) showActionResult({ headline: "Done", detail: parts.join(" ") });
    else showActionResult({ headline: "Nothing selected", detail: "Tick the tracks you want before choosing an action.", ok: false });
  } catch (e) {
    showActionResult({ headline: "That didn't work", detail: `${e.message || e}`, ok: false });
  } finally {
    btns.forEach((b) => (b.disabled = false));
  }
}

/**
 * The outcome of liking or building, shown in the middle of the screen.
 *
 * It used to appear as a banner above the buttons, with the results
 * list still behind it — a page that had just been acted on and was no
 * longer actionable, inviting a second press of the same button. The
 * dialog closes that page when dismissed.
 */
function showActionResult({ headline, detail, url, ok = true }) {
  const wrap = document.createElement("div");
  wrap.className = "action-result";
  wrap.innerHTML = `
    <div class="action-result-card">
      <div class="action-result-head">${esc(headline)}</div>
      ${detail ? `<p class="action-result-detail">${esc(detail)}</p>` : ""}
      <div class="action-result-actions">
        ${url ? `<a class="btn btn-primary" href="${esc(url)}" data-spotify>Open playlist</a>` : ""}
        <button class="btn ${url ? "btn-ghost" : "btn-primary"}" data-ar-close>Done</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
  const close = () => {
    wrap.remove();
    // The work is finished, so the page it was done on shouldn't remain.
    if (ok) renderHome();
  };
  wrap.querySelector("[data-ar-close]").addEventListener("click", close);
  wrap.addEventListener("click", (e) => { if (e.target === wrap) close(); });
  wrap.querySelector("[data-ar-close]").focus();
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
        <label class="checkbox-option"><input type="checkbox" id="s-compilations"> Include compilations &amp; greatest hits</label>
        <label class="checkbox-option"><input type="checkbox" id="s-appears-on"> Include releases they only guest on</label>
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
    includeCompilations: document.getElementById("s-compilations").checked,
    includeAppearsOn: document.getElementById("s-appears-on").checked,
  };
  scrubCancel = { cancelled: false };
  // Cancelling a scrub keeps what it found, unlike a dive, so it sets the
  // flag the scan checks rather than abandoning outright.
  //
  // This previously wrote a button into the old progress card, which no
  // longer exists — the null reference would have thrown and killed the
  // scan at the first line.
  if (blockedByRateLimit()) return;
  showDiveScreen("Scanning your whole library…", () => { scrubCancel.cancelled = true; });
  const cancelBtn = document.getElementById("dive-cancel");
  if (cancelBtn) cancelBtn.textContent = "Cancel & show what's found";

  try {
    // Preflight before a long scrub (issue #3) — a scope problem found
    // now costs seconds; found 40 minutes in, it costs the whole scan.
    updateDiveScreen(0, "Checking your Spotify connection…");
    await preflight();

    const result = await search.runFullScrub(client, {
      ...opts,
      libraryCache,
      onProgress: (pct, stage) => updateDiveScreen(pct, stage),
      isCancelled: () => scrubCancel.cancelled,
      // A scan touches every artist in the library, so its slideshow is
      // the richest of the lot.
      onArtwork: (url) => addDiveImage(url),
    });
    hideDiveScreen();
    if (_diveCancelled) return;
    lastResult = result;
    renderScrubResults(result);
  } catch (e) {
    hideDiveScreen();
    if (!_diveCancelled) renderProgressError(e.message || String(e), e);
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
      <div class="crate-header"><span class="label">New to you</span></div>
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
      msg.innerHTML = `Playlist ${res.reused ? "updated" : "created"}: added ${res.added_count}. <a href="${esc(res.url)}" data-spotify style="color:var(--accent);text-decoration:underline;">Open playlist</a>`;
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

/**
 * Our own confirm dialog.
 *
 * window.confirm renders the browser's own chrome — a different font,
 * the site's URL, and a jarring break from the app, which is especially
 * obvious once installed as a standalone app. This looks like the rest
 * of DeepDive.
 *
 * Returns a promise so callers read the same as before.
 */
function confirmDialog({ title, body, confirmLabel = "Confirm", danger = false }) {
  return new Promise((resolve) => {
    const wrap = document.createElement("div");
    wrap.className = "modal-backdrop";
    wrap.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <h2>${esc(title)}</h2>
        ${body ? `<p class="modal-sub">${esc(body)}</p>` : ""}
        <div class="modal-actions">
          <span class="spacer"></span>
          <button class="btn btn-ghost" data-c="no">Cancel</button>
          <button class="btn ${danger ? "btn-danger" : "btn-primary"}" data-c="yes">${esc(confirmLabel)}</button>
        </div>
      </div>`;
    document.body.appendChild(wrap);
    const done = (v) => { wrap.remove(); document.removeEventListener("keydown", onKey); resolve(v); };
    function onKey(e) {
      if (e.key === "Escape") done(false);
      if (e.key === "Enter") done(true);
    }
    wrap.querySelector('[data-c="yes"]').addEventListener("click", () => done(true));
    wrap.querySelector('[data-c="no"]').addEventListener("click", () => done(false));
    wrap.addEventListener("click", (e) => { if (e.target === wrap) done(false); });
    document.addEventListener("keydown", onKey);
    wrap.querySelector('[data-c="yes"]').focus();
  });
}

/**
 * Refuse to start long work while Spotify has us paused.
 *
 * Every request would fail on the first call, so starting a scan is
 * worse than useless — it burns the user's time and produces a confusing
 * failure several seconds in rather than an answer immediately.
 */
/**
 * Ask Spotify whether the pause is actually still in effect.
 *
 * The stored time is an upper bound taken from a Retry-After, and the
 * only thing that clears it is a successful response. But the flag
 * blocks dives, samplers and scans before they issue a request — so it
 * blocked the very calls that would have cleared it. With Home served
 * from cache, nothing made a live call at all and the lockout held
 * itself in place until it expired on its own, however wrong it was.
 *
 * One cheap request settles it. A success clears the flag through the
 * normal path in `_call`.
 */
async function verifyRateLimit() {
  if (!limitedUntil()) return false;
  try {
    await client.get("me");
  } catch (e) {
    // Still limited, or offline. Either way leave the flag alone.
  }
  return !!limitedUntil();
}

function blockedByRateLimit() {
  const until = limitedUntil();
  if (!until) return false;
  const mins = Math.max(1, Math.round((until - Date.now()) / 60000));
  const hrs = Math.floor(mins / 60);
  const dur = hrs ? `${hrs}h ${mins % 60}m` : `${mins} minutes`;
  const clock = new Date(until).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  flash(`Spotify has paused this app for about ${dur} — until roughly ${clock}. Nothing will work until then.`, true);
  return true;
}

/** A standing notice while the pause is in effect. */
function rateLimitBanner() {
  const until = limitedUntil();
  if (!until) return "";
  const clock = new Date(until).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return `<div class="flash error" style="margin-bottom:16px;">
    Spotify has paused this app until roughly ${esc(clock)}. Searches will
    fail until then — this is a limit on your Spotify credentials, not a
    fault in DeepDive.
    <button class="btn btn-ghost btn-small" id="rl-recheck" style="margin-top:10px;">Check again</button>
  </div>`;
}

// ---- tile overflow ----
//
// Delegated from the app root once, rather than bound to each button
// after every render. Pinning an artist repaints the pins alone, and
// per-element listeners meant those fresh tiles came back with nothing
// attached — the button was there and did nothing.
//
// The same control is used at every width now. It was hidden above the
// mobile breakpoint, so on a desktop it was invisible and unclickable
// while the hover reveal did the work instead; two behaviours, one of
// which was broken, and no way to tell which you were looking at.
(function initTileOverflow() {
  const closeAll = (except) => {
    document.querySelectorAll(".tile-wrap.show-actions").forEach((w) => {
      if (w === except) return;
      w.classList.remove("show-actions");
      w.querySelector("[data-more]")?.setAttribute("aria-expanded", "false");
    });
  };

  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-more]");
    if (!btn) {
      // A click anywhere else closes an open row, but not one landing on
      // the revealed buttons themselves — that would swallow the action.
      if (!e.target.closest(".tile-actions")) closeAll(null);
      return;
    }
    // The tile behind this is also a button; without stopping here the
    // overflow would start a dive.
    e.preventDefault();
    e.stopPropagation();
    const wrap = btn.closest(".tile-wrap");
    if (!wrap) return;
    const open = wrap.classList.contains("show-actions");
    closeAll(wrap);
    wrap.classList.toggle("show-actions", !open);
    btn.setAttribute("aria-expanded", String(!open));
  });
})();

/**
 * Genres, which need Last.fm and therefore need saying out loud.
 *
 * Three states: no key, key but nothing fetched, and fetched. The
 * middle one states the cost in requests and seconds before spending
 * any of it — this is the only place in the app that asks permission
 * to make a few hundred requests, and it should look like it.
 */
async function renderGenreSection() {
  const el = document.getElementById("genre-section");
  if (!el) return;

  if (!lastfm.hasKey()) {
    el.innerHTML = `
      <div class="crate-header"><span class="label">Genres</span><span class="qual">needs Last.fm</span></div>
      <p class="nav-hint" style="margin-top:0;">Spotify doesn't say what a track sounds like beyond a broad artist genre. Last.fm does, in far more detail — shoegaze, midwest emo, riot grrrl rather than "rock". Add a free API key in Settings and DeepDive can build mixes from it.</p>
      <div class="actions"><button class="btn btn-ghost btn-small" data-tab="settings">Add a key</button></div>`;
    return;
  }

  let cached = [];
  let cacheErr = null;
  try { cached = await libraryCache.peek(); } catch (e) { cacheErr = e; }
  if (!cached || !cached.length) {
    // Same rule as the mixes row: an empty section should say which
    // empty it is. Written moments after criticising the identical
    // pattern elsewhere in this file.
    el.innerHTML = cacheErr
      ? `<p class="empty-note">Couldn't read your cached library: ${esc(cacheErr.message || String(cacheErr))}</p>`
      : `<div class="crate-header"><span class="label">Genres</span></div>
         <p class="nav-hint" style="margin-top:0;">Genres are worked out from your Liked Songs, which haven't been read yet.</p>
         <div class="actions"><button class="btn btn-ghost btn-small" data-read-library>Read my library</button></div>`;
    wireReadLibrary(el, renderGenreSection);
    return;
  }

  const artists = insights.artistsByWeight(cached);
  // Rehydrate from the persistent cache before deciding there is
  // nothing to show: the data survives a reload even though the map
  // doesn't.
  await hydrateFromCache("tags", artists, _genreTags, lastfm.topTags);
  const cards = insights.genreCards(cached, _genreTags);

  if (!cards.length) {
    const n = Math.min(artists.length, 60);
    const secs = Math.ceil((n * 250) / 1000);
    el.innerHTML = `
      <div class="crate-header"><span class="label">Genres</span></div>
      <p class="nav-hint" style="margin-top:0;">DeepDive can ask Last.fm what your artists actually sound like, then build mixes from it. That's one request per artist — <strong>${n}</strong> of them, about <strong>${secs} seconds</strong>, starting with the artists you own the most of. You can stop at any point and keep what's been found.</p>
      <div class="actions">
        <button class="btn btn-ghost btn-small" id="genre-go">Find my genres</button>
        ${artists.length > n ? `<button class="btn btn-ghost btn-small" id="genre-go-all">All ${artists.length} artists</button>` : ""}
      </div>
      <div id="genre-progress"></div>`;

    const run = async (list) => {
      const prog = document.getElementById("genre-progress");
      document.getElementById("genre-go").disabled = true;
      document.getElementById("genre-go-all")?.remove();
      prog.innerHTML = `<p class="nav-hint">Asking Last.fm… <button class="btn btn-ghost btn-small" id="genre-stop">Stop</button></p>`;
      document.getElementById("genre-stop").addEventListener("click", cancelGenreFetch);
      try {
        await fetchGenreTags(list, (done, total) => {
          const p = prog.querySelector(".nav-hint");
          if (p) p.firstChild.textContent = `Asking Last.fm… ${done} of ${total}. `;
        });
      } catch (e) {
        prog.innerHTML = `<p class="empty-note">${esc(e.suspended
          ? "Last.fm rejected the key. Check it in Settings."
          : `Last.fm couldn't be reached: ${e.message || e}`)}</p>`;
        return;
      }
      renderGenreSection();
    };
    document.getElementById("genre-go").addEventListener("click", () => run(artists.slice(0, n)));
    document.getElementById("genre-go-all")?.addEventListener("click", () => run(artists));
    return;
  }

  const untagged = artists.filter((a) => !_genreTags.has(a.name.trim().toLowerCase())).length;
  el.innerHTML = `
    <div class="row-head"><h2>Genres</h2><span class="qual">from Last.fm</span></div>
    <div class="card-row" id="genre-cards"></div>
    ${untagged ? `<p class="nav-hint">${untagged} artist${untagged === 1 ? "" : "s"} not looked up yet.
      <button class="btn btn-ghost btn-small" id="genre-more">Do the rest</button></p>` : ""}`;

  // Same card markup as the mixes row — a genre mix is a mix. The hue
  // offset keeps them visually distinct from the row above without
  // being a different kind of object.
  const row = document.getElementById("genre-cards");
  row.innerHTML = cards.map((c, i) => `
    <button class="pcard" data-genre-card="${esc(c.id)}" style="--h:${(20 + i * 53) % 360};">
      <span class="pcard-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg></span>
      <span class="pcard-title">${esc(c.title)}</span>
      <span class="pcard-sub">${esc(c.subtitle)}</span>
    </button>`).join("");
  row.querySelectorAll("[data-genre-card]").forEach((btn) =>
    btn.addEventListener("click", () =>
      openCardModal(cards.find((c) => c.id === btn.dataset.genreCard))));

  document.getElementById("genre-more")?.addEventListener("click", async () => {
    const rest = artists.filter((a) => !_genreTags.has(a.name.trim().toLowerCase()));
    await fetchGenreTags(rest);
    renderGenreSection();
  });
}

/**
 * Fill the library cache from wherever the user happens to be standing.
 *
 * Nothing filled it except running a dive or Settings > Refresh
 * library, so anyone who opened Mixes first was told to "open Home and
 * it'll cache in the background" — which Home does not do. That is a
 * loop with no exit, and it is what an empty Mixes page actually meant.
 */
function wireReadLibrary(el, onDone) {
  el.querySelector("[data-read-library]")?.addEventListener("click", async (ev) => {
    const btn = ev.currentTarget;
    btn.disabled = true;
    btn.textContent = "Reading…";
    try {
      const tracks = await libraryCache.getLikedTracks({
        onProgress: (done, total) => {
          btn.textContent = total ? `Reading… ${done} of ${total}` : `Reading… ${done}`;
        },
      });
      flash(`${tracks.length} liked songs read.`);
      onDone();
    } catch (e) {
      btn.disabled = false;
      btn.textContent = "Try again";
      flash(`Couldn't read your library: ${e.message || e}`, true);
    }
  });
}

/**
 * Fill an in-memory map from the persistent Last.fm cache.
 *
 * The maps are per-session; the cache is not. Without this a reload
 * showed the "find my genres" prompt again with the answers already on
 * disk — and pressing it would have re-fetched nothing, since the
 * client reads through the cache, but the user would never know that.
 *
 * Only reads what is already cached: `isCached` gates it, so this
 * never makes a request.
 */
async function hydrateFromCache(bucket, artists, map, fetcher) {
  for (const a of artists) {
    const key = (a.name || "").trim().toLowerCase();
    if (map.has(key)) continue;
    try {
      if (await lastfm.isCached(bucket, a.name)) map.set(key, await fetcher(a.name));
    } catch (e) { /* a cold entry is not an error */ }
  }
}

// Similar artists, cached for the session alongside the tags. Same
// shape and the same cost — one request per seed artist.
let _similarBySeed = new Map();

/**
 * Recommendations lead the Mixes page.
 *
 * Last.fm's similar-artist data on its own produces names you can't
 * play. Crossed with your own library it produces the opposite: music
 * you already own, next to the artist that explains why you'd want it.
 */
async function renderRecommendations() {
  const el = document.getElementById("rec-section");
  if (!el) return;
  if (!lastfm.hasKey()) { el.innerHTML = ""; return; }

  let cached = [];
  try { cached = await libraryCache.peek(); } catch (e) { cached = []; }
  if (!cached || !cached.length) { el.innerHTML = ""; return; }

  const seedArtists = insights.artistsByWeight(cached).slice(0, 12);
  await hydrateFromCache("similar", seedArtists, _similarBySeed, lastfm.similarArtists);
  const cards = insights.recommendationCards(cached, _similarBySeed);
  if (!cards.length) {
    // Seeded from the artists you own most of — those are the ones
    // whose neighbours you're most likely to want.
    const seeds = insights.artistsByWeight(cached).slice(0, 12);
    if (!seeds.length) { el.innerHTML = ""; return; }
    const secs = Math.ceil((seeds.length * 250) / 1000);
    el.innerHTML = `
      <div class="crate-header"><span class="label">Recommended</span></div>
      <p class="nav-hint" style="margin-top:0;">DeepDive can ask Last.fm which artists resemble the ones you play most, then build mixes from the ones you already own but rarely reach for. ${seeds.length} requests, about ${secs} seconds.</p>
      <div class="actions"><button class="btn btn-ghost btn-small" id="rec-go">Find recommendations</button></div>
      <div id="rec-progress"></div>`;
    document.getElementById("rec-go").addEventListener("click", async (ev) => {
      const btn = ev.currentTarget;
      btn.disabled = true;
      let done = 0;
      for (const a of seeds) {
        const key = a.name.trim().toLowerCase();
        btn.textContent = `Asking Last.fm… ${++done} of ${seeds.length}`;
        if (_similarBySeed.has(key)) continue;
        try {
          _similarBySeed.set(key, await lastfm.similarArtists(a.name, 30));
        } catch (e) {
          if (e && e.suspended) {
            document.getElementById("rec-progress").innerHTML =
              `<p class="empty-note">Last.fm rejected the key. Check it in Settings.</p>`;
            return;
          }
          _similarBySeed.set(key, []);
        }
      }
      renderRecommendations();
    });
    return;
  }

  el.innerHTML = `
    <div class="row-head"><h2>Recommended</h2><span class="qual">similar to what you play most</span></div>
    <div class="card-row" id="rec-cards"></div>`;
  const row = document.getElementById("rec-cards");
  row.innerHTML = cards.map((c, i) => `
    <button class="pcard" data-rec-card="${esc(c.id)}" style="--h:${(150 + i * 41) % 360};">
      <span class="pcard-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v3"/><path d="M12 18v3"/><path d="M5 12H2"/><path d="M22 12h-3"/><circle cx="12" cy="12" r="5"/></svg></span>
      <span class="pcard-title">${esc(c.title)}</span>
      <span class="pcard-sub">${esc(c.subtitle)}</span>
    </button>`).join("");
  row.querySelectorAll("[data-rec-card]").forEach((btn) =>
    btn.addEventListener("click", () =>
      openCardModal(cards.find((c) => c.id === btn.dataset.recCard))));
}

// ---- genre tags ----
//
// One request per artist, so this is never done quietly in the
// background. Every confusion this project has had about slowness came
// from work happening invisibly — you press a button, you watch it, you
// can stop it.
//
// Artists are fetched heaviest-first: one you own thirty tracks by will
// carry a genre mix alone, one you own a single track by mostly won't,
// so the first fifty requests produce nearly all the useful mixes.
let _genreTags = new Map();   // lowercased artist name -> [{name, weight}]
let _genreFetching = false;
let _genreCancel = false;

function genreState() {
  return { tagged: _genreTags.size, fetching: _genreFetching };
}

async function fetchGenreTags(artists, onProgress) {
  _genreFetching = true;
  _genreCancel = false;
  let done = 0, failed = 0;
  try {
    for (const a of artists) {
      if (_genreCancel) break;
      const key = (a.name || "").trim().toLowerCase();
      if (!_genreTags.has(key)) {
        try {
          _genreTags.set(key, await lastfm.topTags(a.name, 15));
        } catch (e) {
          // A suspended or invalid key will fail for every artist, so
          // stop rather than working through hundreds to learn it once.
          if (e && e.suspended) throw e;
          failed++;
          _genreTags.set(key, []);
        }
      }
      done++;
      if (onProgress) onProgress(done, artists.length, failed);
    }
  } finally {
    _genreFetching = false;
  }
  return { done, failed, cancelled: _genreCancel };
}

function cancelGenreFetch() { _genreCancel = true; }

// ---- api trouble banner ----
//
// Joseph's note: the end user has no idea why things aren't loading.
// The suggestion row is the natural benchmark — it makes requests on
// every load — so when it fails, say so at the top of the page rather
// than quietly showing fewer artists.
let _apiBanner = null;

function raiseApiBanner(err) {
  const info = explainError(err);
  _apiBanner = {
    headline: info.headline,
    detail: info.detail,
    code: err && err.quotaExhausted ? "DD-QUOTA"
      : (err && err.status === 429) ? "DD-RATE"
      : (err && err.status === 401) ? "DD-AUTH"
      : (err && err.status === 0) ? "DD-NET" : null,
  };
  const slot = document.getElementById("api-banner");
  if (slot) slot.innerHTML = apiBannerHtml();
}

function clearApiBanner() {
  _apiBanner = null;
  const slot = document.getElementById("api-banner");
  if (slot) slot.innerHTML = "";
}

function apiBannerHtml() {
  if (!_apiBanner) return "";
  return `
    <div class="api-banner">
      <div class="api-banner-head">${esc(_apiBanner.headline)}</div>
      <p class="api-banner-detail">${esc(_apiBanner.detail)}</p>
      <div class="api-banner-actions">
        <button class="btn btn-ghost btn-small" id="api-banner-check">Check connection</button>
        ${_apiBanner.code ? `<span class="api-banner-code">${esc(_apiBanner.code)}</span>` : ""}
      </div>
    </div>`;
}

/** Wired after each render, since the banner is redrawn with the page. */
function wireApiBanner() {
  document.getElementById("api-banner-check")?.addEventListener("click", async (ev) => {
    const btn = ev.currentTarget;
    btn.disabled = true;
    btn.textContent = "Checking…";
    const d = await diagnose();
    const slot = document.getElementById("api-banner");
    if (!slot) return;
    if (d.code === "DD-OK" || d.code === "DD-FIXED") {
      clearApiBanner();
      flash(d.repaired ? "Fixed — try that again." : "Spotify is responding again.");
      return;
    }
    slot.innerHTML = renderDiagnosisBlock(d);
  });
}

// ---- self-diagnosis ----
//
// Built from the failures this project actually had, in the order they
// were mistaken for each other. Every one of them presented as "it's
// slow" or "it's rate limited" and none could be told apart by looking:
//
//   - a remembered pause that blocked the requests that would clear it
//   - learned pacing that outlived the rate limit that taught it, making
//     a ten-second dive take a minute with nothing failing
//   - a genuinely spent quota, which no amount of retrying fixes
//   - a burst limit, which waiting does fix
//
// So the diagnosis tries the repairs it can make, then names what's
// left with a code stable enough to quote in a bug report.
const DIAG = {
  OK:      { code: "DD-OK",      headline: "Everything is working" },
  REPAIRED:{ code: "DD-FIXED",   headline: "Fixed it" },
  QUOTA:   { code: "DD-QUOTA",   headline: "Your Spotify quota is spent" },
  RATE:    { code: "DD-RATE",    headline: "Spotify is rate-limiting this app" },
  AUTH:    { code: "DD-AUTH",    headline: "Spotify won't accept the login" },
  FORBID:  { code: "DD-FORBID",  headline: "Spotify refused an endpoint" },
  NET:     { code: "DD-NET",     headline: "Couldn't reach Spotify" },
  UNKNOWN: { code: "DD-UNKNOWN", headline: "Something failed and the checks came back clean" },
};

// A pause or a throttle is only trustworthy while the thing that taught
// it is still true. After this long with no fresh 429, it is a guess.
const STALE_LEARNING_MS = 15 * 60 * 1000;

function lastRateLimitAt() {
  try { return parseInt(localStorage.getItem("deepdive_throttle_at") || "0", 10); } catch (e) { return 0; }
}

/**
 * Check, repair what can be repaired, and report. `deep` runs the full
 * endpoint sweep; the shallow version is three requests and is what
 * runs on its own after a failure.
 */
async function diagnose({ deep = false } = {}) {
  const notes = [];
  let repaired = false;

  // 1. A remembered pause that nothing has been able to disprove,
  //    because it blocks the requests that would disprove it.
  if (limitedUntil()) {
    const still = await verifyRateLimit();
    if (!still) { repaired = true; notes.push("Cleared a rate-limit pause that had already lifted."); }
  }

  // 2. Pacing learned from a rate limit that is no longer happening.
  //    This is the one that cost the most time to find: nothing fails,
  //    it is simply five times slower, and nothing says so.
  const pacing = client.currentPacing ? client.currentPacing() : 0;
  const learnedAgo = Date.now() - lastRateLimitAt();
  if (pacing >= 400 && learnedAgo > STALE_LEARNING_MS) {
    const check = await client.probe("me");
    if (check.ok) {
      client.resetPacing();
      repaired = true;
      notes.push(`Cleared ${pacing}ms of pacing left over from an earlier rate limit — dives were slower than they needed to be.`);
    }
  }

  // 3. What actually answers.
  const paths = deep
    ? PROBES
    : [["Account", "me", null],
       ["Artist releases", `artists/${PROBE_ARTIST}/albums`, { include_groups: "album,single", limit: 1 }],
       ["Album tracklist", `albums/${PROBE_ALBUM}`, null]];
  const results = [];
  for (const [label, path, params] of paths) {
    const pr = await client.probe(path, params);
    if (pr.ok) client.noteLatency(pr.ms);
    results.push([label, pr]);
    await new Promise((res) => setTimeout(res, 250));
  }

  const failed = results.filter(([, r]) => !r.ok).map(([, r]) => r);
  let verdict;
  if (!failed.length) verdict = repaired ? DIAG.REPAIRED : DIAG.OK;
  else if (failed.some((r) => r.reason === "QUOTA_EXCEEDED")) verdict = DIAG.QUOTA;
  else if (failed.some((r) => r.status === 429)) verdict = DIAG.RATE;
  else if (failed.some((r) => r.status === 401)) verdict = DIAG.AUTH;
  else if (failed.some((r) => r.status === 403)) verdict = DIAG.FORBID;
  else if (failed.some((r) => r.status === 0)) verdict = DIAG.NET;
  else verdict = DIAG.UNKNOWN;

  return { ...verdict, repaired, notes, results, pacing: client.currentPacing ? client.currentPacing() : 0 };
}

/** What to tell someone for each outcome, and whether to offer a retry. */
function diagnosisAdvice(d) {
  switch (d.code) {
    case "DD-OK":
      return "Every check passed, so whatever went wrong isn't happening now. Worth trying again.";
    case "DD-FIXED":
      return "The checks found something and cleared it. Try again.";
    case "DD-QUOTA":
      return "Your Spotify app has used up its request budget. Waiting is the only fix — it refills on its own. Dives that include compilations and guest appearances spend it far faster.";
    case "DD-RATE":
      return "Too many requests too quickly. This clears on its own within a minute or two; nothing is broken.";
    case "DD-AUTH":
      return "The login has expired or been revoked. Disconnect and reconnect Spotify in Settings.";
    case "DD-FORBID":
      return "Spotify refused an endpoint outright rather than rate-limiting it. That's an app-level restriction, not something waiting will fix.";
    case "DD-NET":
      return "No response at all. Check the connection, and any extension or blocker that might be stopping requests to Spotify.";
    default:
      return "The checks all passed, so the failure was something else. The technical details below are worth quoting if you report this.";
  }
}

function renderDiagnosisBlock(d) {
  const notes = d.notes.length
    ? `<ul class="diag-notes">${d.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>`
    : "";
  const rows = d.results.map(([label, r]) =>
    `<tr><td>${r.ok ? "✓" : "✗"}</td><td>${esc(label)}</td><td>${r.ok ? `${r.ms}ms` : `${r.status}${r.reason ? ` · ${esc(r.reason)}` : ""}`}</td></tr>`).join("");
  const good = d.code === "DD-OK" || d.code === "DD-FIXED";
  return `
    <div class="diag-verdict ${good ? "is-good" : "is-bad"}">
      <div class="diag-verdict-head">${esc(d.headline)}</div>
      <p class="nav-hint" style="margin-top:4px;">${esc(diagnosisAdvice(d))}</p>
      ${notes}
      <table class="diag-table probe-table">${rows}</table>
      <div class="diag-code">${esc(d.code)}</div>
    </div>`;
}

// ---- endpoint diagnostics ----
// Fixed, well-known public ids so the probe doesn't depend on the
// user's library, and so a failure means the endpoint rather than the
// data. Read-only throughout: nothing here writes to an account.
const PROBE_ARTIST = "0hEurMDQu99nJRq8pTxO14";
const PROBE_ALBUM = "4aawyAB9vmqN3uQ7FjRGTy";
const PROBE_TRACK = "11dFghVXANMlKmJXsNCbNl";

// Grouped by what the app uses them for, so the result reads as "which
// part of DeepDive is refused" rather than a list of paths. Whether
// Spotify's own quota buckets follow these groupings is exactly what
// this is meant to find out — the boundaries aren't published.
const PROBES = [
  ["Account", "me", null],
  ["Your library", "me/tracks", { limit: 1 }],
  ["Listening history", "me/top/artists", { limit: 1 }],
  ["Recently played", "me/player/recently-played", { limit: 1 }],
  ["Your playlists", "me/playlists", { limit: 1 }],
  ["Search", "search", { q: "artist:\"Radiohead\"", type: "artist", limit: 1 }],
  ["Artist details", `artists/${PROBE_ARTIST}`, null],
  ["Artist releases — dives start here", `artists/${PROBE_ARTIST}/albums`, { include_groups: "album,single", limit: 1 }],
  ["Album tracklist — the bulk of a dive", `albums/${PROBE_ALBUM}`, null],
  ["Track details", `tracks/${PROBE_TRACK}`, null],
];

async function runEndpointTest(into) {
  into.innerHTML = `<p class="nav-hint">Testing ${PROBES.length} endpoints, one request each…</p>`;
  const rows = [];
  for (const [label, path, params] of PROBES) {
    const r = await client.probe(path, params);
    if (r.ok) client.noteLatency(r.ms);
    rows.push([label, r]);
    into.innerHTML = renderProbeRows(rows, PROBES.length);
    // Paced, so the test itself can't be what trips a rate limit and
    // then reports the endpoints below it as broken.
    await new Promise((res) => setTimeout(res, 350));
  }
  into.innerHTML = renderProbeRows(rows, PROBES.length) + probeVerdict(rows);
}

function renderProbeRows(rows, total) {
  const body = rows.map(([label, r]) => {
    // Spotify's time first, our own wait second. Conflating them made a
    // self-imposed throttle read as a slow API.
    const detail = r.ok
      ? `${r.ms}ms${r.paced ? ` <span class="probe-paced">+${r.paced}ms waiting</span>` : ""}`
      : `${r.status}${r.reason ? ` · ${esc(r.reason)}` : ""}${r.retryAfter ? ` · retry after ${esc(String(r.retryAfter))}s` : ""}`;
    return `<tr><td>${r.ok ? "✓" : "✗"}</td><td>${esc(label)}</td><td>${detail}</td></tr>`;
  }).join("");
  return `<table class="diag-table probe-table">${body}</table>
    ${rows.length < total ? `<p class="nav-hint">${rows.length} of ${total}…</p>` : ""}`;
}

/**
 * The point of the exercise: say what the pattern means, rather than
 * leaving ten status codes for someone to interpret.
 */
function probeVerdict(rows) {
  const failed = rows.filter(([, r]) => !r.ok);
  const paced = client.currentPacing ? client.currentPacing() : 0;
  // The most likely reason a dive feels slow while nothing is failing,
  // and invisible unless it is said out loud: pacing is remembered
  // across sessions and only ever rises on its own.
  const pacingNote = paced >= 400
    ? `<p class="nav-hint">DeepDive is currently waiting <strong>${paced}ms</strong> before every request, learned from an earlier rate limit. On an artist with 40 releases that alone adds about ${Math.round(paced * 40 / 1000)} seconds. If dives feel slow and nothing is being refused, this is why — clear it with Reset pacing above.</p>`
    : "";
  if (!failed.length) {
    return pacingNote + `<p class="nav-hint">Every endpoint answered. If a dive still fails, it's the number of requests it makes rather than the endpoints it uses — try a small artist.</p>`;
  }
  const all = failed.length === rows.length;
  const quota = failed.some(([, r]) => r.reason === "QUOTA_EXCEEDED");
  const limited = failed.some(([, r]) => r.status === 429);
  if (all && quota) {
    return `<p class="nav-hint">Everything is refused with a quota error. This is a limit on your Spotify credentials and only time refills it.</p>`;
  }
  if (all && limited) {
    return `<p class="nav-hint">Everything is rate-limited. That's a burst limit rather than a spent budget — wait a minute and run this again before concluding anything.</p>`;
  }
  if (limited || quota) {
    return `<p class="nav-hint">Some endpoints answer while others are refused, which means the budget is per-group rather than app-wide. The refused ones are the ones to avoid until they recover.</p>`;
  }
  return `<p class="nav-hint">Some endpoints failed without a rate limit — check the status codes above. 403 usually means the endpoint is restricted for this app rather than temporarily unavailable.</p>`;
}

/**
 * One row per setting: a label, a line saying what it does, and the
 * control on the right.
 *
 * The page was headings above loose buttons, which is the shape of a
 * form rather than a list of things you can change, and it left every
 * description floating unattached to the control it described. Rows are
 * the same filled-surface vocabulary as tiles and track rows.
 */
function settingRow({ title, detail = "", control = "", id = "" }) {
  return `
    <div class="set-row"${id ? ` id="${id}"` : ""}>
      <div class="set-row-text">
        <div class="set-row-title">${esc(title)}</div>
        ${detail ? `<div class="set-row-detail">${esc(detail)}</div>` : ""}
      </div>
      <div class="set-row-control">${control}</div>
    </div>`;
}

// Controls are written out with literal ids rather than built from
// arguments. Interpolating an id hides it from the getElementById
// orphan audit, which is the check that catches a handler still bound
// to markup that has been deleted.
const setSwitch = (idAttr, on) => `<label class="set-switch">
    <input type="checkbox" ${idAttr}${on ? " checked" : ""}>
    <span class="switch-track"><span class="switch-thumb"></span></span>
  </label>`;

function renderSettings() {
  setTitle("DeepDive · Settings");
  setActiveTab("settings");
  root.innerHTML = `
    <div class="row-head"><h2>Settings</h2></div>

    <div class="set-group">
      <div class="set-group-label">Appearance</div>
      <div class="set-row set-row-block">
        <div class="set-row-text">
          <div class="set-row-title">Theme</div>
          <div class="set-row-detail">System follows your device.</div>
        </div>
        <div class="theme-toggle" id="theme-toggle" role="group" aria-label="Theme">
          <button class="theme-opt" data-theme-choice="light">Light</button>
          <button class="theme-opt" data-theme-choice="dark">Dark</button>
          <button class="theme-opt" data-theme-choice="system">System</button>
        </div>
      </div>
      ${settingRow({
        title: "Support link",
        detail: "Shows a coffee cup in the top bar.",
        control: setSwitch('id="set-show-bmc"'),
      })}
    </div>

    <div class="set-group">
      <div class="set-group-label">Spotify</div>
      ${settingRow({
        title: "Refresh library",
        detail: "Re-read your Liked Songs. DeepDive does this on its own daily.",
        control: `<button class="btn btn-ghost btn-small" id="set-refresh">Refresh</button>`,
      })}
      ${settingRow({
        title: "Tidy up playlists",
        detail: "Find playlists DeepDive created, including ones made before it kept a record.",
        control: `<button class="btn btn-ghost btn-small" id="find-playlists">Find them</button>`,
      })}
      <div id="playlist-cleanup"></div>
      <div id="playlist-cleanup-all"></div>
      ${settingRow({
        title: "Disconnect",
        detail: "Sign out of Spotify. Your pins and history stay.",
        control: `<button class="btn btn-ghost btn-small" id="set-disconnect">Disconnect</button>`,
      })}
      <p class="set-note">Music metadata and artwork are provided by Spotify. DeepDive is not affiliated with Spotify AB.</p>
    </div>

    <details class="advanced" id="advanced">
      <summary>Advanced</summary>

      <div class="set-group">
        <div class="set-group-label">Speed</div>
        ${settingRow({
          title: "Reset pacing",
          detail: "DeepDive slows down after Spotify rate-limits it and remembers that between sessions. Clear it if dives are crawling and nothing is failing.",
          control: `<button class="btn btn-ghost btn-small" id="set-reset-pacing">Reset</button>`,
        })}
      </div>

      <div class="set-group">
        <div class="set-group-label">Diagnostics</div>
        ${settingRow({
          title: "Show build number",
          detail: "Puts the version in the top bar.",
          control: setSwitch('id="set-show-build"', showBuildTag()),
        })}
        ${settingRow({
          title: "Test endpoints",
          detail: "Checks each Spotify endpoint DeepDive uses and measures what a request costs.",
          control: `<button class="btn btn-ghost btn-small" id="set-test-endpoints">Run test</button>`,
        })}
        <div id="endpoint-test"></div>
      </div>

      <div class="set-group">
        <div class="set-group-label">Your data</div>
        <p class="set-note">Pins, history and settings live in this browser only. A backup is the only way to move them elsewhere or recover them after clearing site data.</p>
        ${settingRow({
          title: "Backup",
          detail: "Export everything to a file, or restore from one.",
          control: `<button class="btn btn-ghost btn-small" id="set-export">Export</button>
            <button class="btn btn-ghost btn-small" id="set-import">Import</button>
            <input type="file" id="set-import-file" accept="application/json,.json" style="display:none;">`,
        })}
      </div>

      <div class="set-group">
        <div class="set-group-label">Last.fm</div>
        <p class="set-note">Optional but recommended. Powers genre and subgenre mixes and an artist's best hour — things Spotify no longer exposes. Leave it empty and those features simply don't appear.</p>
        <div class="set-row set-row-block">
          <div class="set-row-text">
            <div class="set-row-title">API key</div>
            <div class="set-row-detail">Free and instant from last.fm/api/account/create. The key only — not the shared secret.</div>
          </div>
          <input type="text" id="set-lastfm-key" class="nav-input" placeholder="not set" autocomplete="off" spellcheck="false">
        </div>
        <div class="set-row-actions"><button class="btn btn-ghost btn-small" id="set-save-lastfm">Save key</button></div>
      </div>

      <div class="set-group">
        <div class="set-group-label">Credentials</div>
        <div class="set-row set-row-block">
          <div class="set-row-text">
            <div class="set-row-title">Client ID</div>
            <div class="set-row-detail">From your own Spotify app.</div>
          </div>
          <input type="text" id="set-client-id" class="nav-input" placeholder="paste your Client ID" autocomplete="off" spellcheck="false">
        </div>
        <div class="set-row-actions"><button class="btn btn-ghost btn-small" id="set-save-id">Save Client ID</button></div>
        <div class="set-row set-row-block">
          <div class="set-row-text">
            <div class="set-row-title">Redirect URI</div>
            <div class="set-row-detail">Must match your Spotify app exactly.</div>
          </div>
          <div class="nav-uri" id="set-redirect-uri"></div>
        </div>
      </div>
    </details>

    <div class="flash hidden" id="settings-msg" style="margin-top:14px;"></div>

    <footer class="set-footer">
      <p class="set-credit">Made by Joseph Luker</p>
      <div class="set-links">
        <a href="https://github.com/JPLuker" target="_blank" rel="noopener">GitHub</a>
        <a href="https://www.linkedin.com/in/josephluker" target="_blank" rel="noopener">LinkedIn</a>
      </div>
      <p class="settings-build">DeepDive · build ${esc(BUILD)}</p>
    </footer>`;

  const msg = document.getElementById("settings-msg");
  const say = (t, err) => { msg.textContent = t; msg.classList.remove("hidden"); msg.classList.toggle("error", !!err); };

  document.getElementById("go-scrub")?.addEventListener("click", () => renderScrubForm());

  const uriEl = document.getElementById("set-redirect-uri");
  if (uriEl) uriEl.textContent = auth.redirectUri();
  const idInput = document.getElementById("set-client-id");
  if (idInput) idInput.value = auth.getClientId();
  const lfmInput = document.getElementById("set-lastfm-key");
  if (lfmInput) lfmInput.value = lastfm.getKey();
  document.getElementById("set-save-lastfm")?.addEventListener("click", () => {
    const v = lfmInput.value.trim();
    lastfm.setKey(v);
    // Clearing it is a legitimate action, not a failed save.
    flash(v ? "Last.fm key saved." : "Last.fm key removed.");
  });

  document.getElementById("set-save-id")?.addEventListener("click", () => {
    const v = (idInput.value || "").trim();
    if (!v) { say("Enter your Client ID first.", true); return; }
    const changed = v !== auth.getClientId();
    auth.setClientId(v);
    say(changed ? "Saved. Reconnect Spotify for it to take effect." : "Saved.");
  });
  document.getElementById("go-pins")?.addEventListener("click", () => renderWatchlist());
  document.getElementById("go-history")?.addEventListener("click", () => renderHistory());
  document.getElementById("set-refresh")?.addEventListener("click", () => refreshLibrary());
  document.getElementById("set-disconnect")?.addEventListener("click", () => { auth.logout(); render(); });

  const bmc = document.getElementById("set-show-bmc");
  if (bmc) {
    bmc.checked = showBmc();
    bmc.addEventListener("change", () => setShowBmc(bmc.checked));
  }

  const buildSwitch = document.getElementById("set-show-build");
  if (buildSwitch) {
    buildSwitch.checked = showBuildTag();
    buildSwitch.addEventListener("change", () => {
      setShowBuildTag(buildSwitch.checked);
      applyBuildTagVisibility();
    });
  }

  document.getElementById("set-test-endpoints")?.addEventListener("click", async (ev) => {
    const btn = ev.currentTarget;
    btn.disabled = true;
    btn.textContent = "Testing…";
    try {
      await runEndpointTest(document.getElementById("endpoint-test"));
    } finally {
      btn.disabled = false;
      btn.textContent = "Test endpoints";
    }
  });

  document.getElementById("set-reset-pacing")?.addEventListener("click", () => {
    client.resetPacing();
    flash("Pacing cleared — the next dive starts at full speed.");
  });

  document.getElementById("set-export")?.addEventListener("click", () => {
    const stamp = new Date().toISOString().slice(0, 10);
    const ok = downloadFile(`deepdive-backup-${stamp}.json`,
      JSON.stringify(history.exportData(), null, 2), "application/json");
    say(ok ? "Backup saved." : "Couldn't save the file.", !ok);
  });
  const fileInput = document.getElementById("set-import-file");
  document.getElementById("set-import")?.addEventListener("click", () => fileInput.click());
  fileInput?.addEventListener("change", async () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    try {
      const sum = history.importData(JSON.parse(await file.text()), { mode: "merge" });
      say(`Imported: ${sum.pins} pins, ${sum.blocked} blocked, ${sum.dives} dives added.`);
    } catch (e) {
      say(e && e.message ? e.message : "Couldn't read that file.", true);
    } finally { fileInput.value = ""; }
  });

  // Cleanup searches by name, because playlists created before DeepDive
  // recorded them have no stored id to look up.
  const findBtn = document.getElementById("find-playlists");
  findBtn?.addEventListener("click", async () => {
    const slot = document.getElementById("playlist-cleanup");
    findBtn.disabled = true; findBtn.textContent = "Searching…";
    try {
      const found = await client.findOwnPlaylistsByPrefix("DeepDive");
      if (!found.length) { slot.innerHTML = `<p class="empty-note">No DeepDive playlists found.</p>`; return; }
      slot.innerHTML = found.map((p) => `
        <div class="watchlist-row">
          <span class="watchlist-name"><span>
            <span style="display:block;">${esc(p.name)}</span>
          </span></span>
          <div class="watchlist-actions">
            ${p.url ? `<a class="btn btn-ghost btn-small" href="${esc(p.url)}" data-spotify>Open</a>` : ""}
            <button class="btn btn-ghost btn-small" data-rm-pl="${esc(p.id)}" data-nm="${esc(p.name)}">Remove</button>
          </div>
        </div>`).join("");
      // A bulk action is where a confirmation genuinely earns its place —
      // removing thirty playlists by accident is a bad afternoon,
      // whereas removing one is a click to rebuild.
      const allSlot = document.getElementById("playlist-cleanup-all");
      if (allSlot) {
        allSlot.innerHTML = `<div class="actions"><button class="btn btn-ghost btn-small" id="rm-all-pl">Remove all ${found.length}</button></div>`;
        document.getElementById("rm-all-pl")?.addEventListener("click", async () => {
          const ok = await confirmDialog({
            title: `Remove all ${found.length} playlists?`,
            body: "They'll be removed from your Spotify library. This can't be undone from here.",
            confirmLabel: "Remove all", danger: true,
          });
          if (!ok) return;
          const btn = document.getElementById("rm-all-pl");
          btn.disabled = true;
          let done = 0;
          for (const p of found) {
            btn.textContent = `Removing ${++done}/${found.length}…`;
            try { await client.deletePlaylist(p.id); } catch (e) { /* keep going */ }
          }
          slot.innerHTML = "";
          allSlot.innerHTML = "";
          flash(`Removed ${done} playlist${done === 1 ? "" : "s"}.`);
        });
      }

      slot.querySelectorAll("[data-rm-pl]").forEach((b) => b.addEventListener("click", async () => {
                b.disabled = true; b.textContent = "Removing…";
        try {
          await client.deletePlaylist(b.dataset.rmPl);
          b.closest(".watchlist-row")?.remove();
          flash("Playlist removed.");
        } catch (e) {
          const info = explainError(e);
          say(`${info.headline}. ${info.detail}`, true);
          b.disabled = false; b.textContent = "Remove";
        }
      }));
    } catch (e) {
      const info = explainError(e);
      say(`${info.headline}. ${info.detail}`, true);
    } finally {
      findBtn.disabled = false; findBtn.textContent = "Find DeepDive playlists";
    }
  });
}

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
        <div class="crate-header"><span class="label">Undo</span></div>
        <div class="watchlist-row">
          <span class="watchlist-name">${esc(undoable.label)}</span>
          <div class="watchlist-actions">
            <button class="btn btn-ghost btn-small" id="undo-last">Undo</button>
          </div>
        </div>
        <p class="nav-hint">Removes those tracks from your Liked Songs. Playlists aren't undone — deleting one you may have edited or shared would be worse than leaving it.</p>
      ` : `<p class="empty-note">Nothing to undo.</p>`}

      ${created.length ? `
        <div class="crate-header"><span class="label">Playlists created</span></div>
        ${created.map((p) => `
          <div class="watchlist-row">
            <span class="watchlist-name">
              <span>
                <span style="display:block;">${esc(p.label.replace(/^Created "?|"$/g, ""))}</span>
                <span class="pill-reason">${esc(new Date(p.at).toLocaleDateString())}</span>
              </span>
            </span>
            <div class="watchlist-actions">
              ${p.playlistUrl ? `<a class="btn btn-ghost btn-small" href="${esc(p.playlistUrl)}" data-spotify>Open</a>` : ""}
              <button class="btn btn-ghost btn-small" data-delete-playlist="${esc(p.id)}" data-pid="${esc(p.playlistId)}" data-label="${esc(p.label)}">Remove</button>
            </div>
          </div>`).join("")}
        <p class="nav-hint">Removing takes the playlist out of your Spotify library. Only playlists DeepDive created are listed — one it merely added to is yours, not ours to remove.</p>
      ` : ""}

      <div class="crate-header"><span class="label">Dives</span></div>
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

      <div class="crate-header"><span class="label">Your data</span></div>
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
    if (!await confirmDialog({ title: "Undo this?", body: `${undoable.label}. Those tracks will be removed from your Liked Songs.`, confirmLabel: "Undo", danger: true })) return;
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
  if (clearBtn) clearBtn.addEventListener("click", async () => {
    if (!await confirmDialog({ title: "Clear dive history?", body: "This cannot be undone.", confirmLabel: "Clear", danger: true })) return;
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
  const pins = watchlist.pinned();
  const blocked = watchlist.listBlocked();
  root.innerHTML = `
    <div class="card">
      <h1>Pins &amp; blocked</h1>
      <p class="muted">Pins appear at the top of your suggestions on the home page. Blocked artists never appear at all. Both are stored in this browser only.</p>

      <div class="crate-header"><span class="label">Pinned</span></div>
      ${pins.length ? pins.map((e) => `
        <div class="watchlist-row">
          <span class="watchlist-name">${e.image_url ? `<img src="${esc(e.image_url)}" alt="" class="pill-avatar">` : ""}${esc(e.name)}</span>
          <div class="watchlist-actions">
            <button class="btn btn-ghost btn-small" data-wl-search="${esc(e.name)}">Dive now</button>
            <button class="btn btn-ghost btn-small" data-wl-remove="${esc(e.id)}" data-name="${esc(e.name)}">Unpin</button>
          </div>
        </div>`).join("") : `<p class="empty-note">Nothing pinned. Pin an artist from the search suggestions, or from the dropdown as you type.</p>`}
      ${pins.length ? `<div class="actions"><button class="btn btn-ghost btn-small" id="wipe-pins">Remove all pins</button></div>` : ""}

      <div class="crate-header"><span class="label">Blocked</span></div>
      <p class="nav-hint" style="margin-top:0;">Blocking is per feature. Not wanting to dive an artist isn't the same as not wanting them in a mix built from tracks you already liked.</p>
      ${blocked.length ? blocked.map((b) => {
        const sc = watchlist.blockScopes(b.name);
        return `
        <div class="watchlist-row">
          <span class="watchlist-name">${esc(b.name)}</span>
          <div class="watchlist-actions">
            <label class="block-scope"><input type="checkbox" data-scope="dives" data-nm="${esc(b.name)}"${sc.includes("dives") ? " checked" : ""}> Dives</label>
            <label class="block-scope"><input type="checkbox" data-scope="mixes" data-nm="${esc(b.name)}"${sc.includes("mixes") ? " checked" : ""}> Mixes</label>
            <button class="btn btn-ghost btn-small" data-unblock="${esc(b.name)}">Allow again</button>
          </div>
        </div>`; }).join("") : `<p class="empty-note">Nothing blocked. Use the &minus; button on any artist tile to stop suggesting them.</p>`}

      <div class="actions"><button class="btn btn-ghost" data-home>Back to search</button></div>
    </div>`;

  root.querySelector("[data-home]")?.addEventListener("click", () => renderHome());
  root.querySelectorAll("[data-wl-search]").forEach((b) => b.addEventListener("click", () => startSearch(b.dataset.wlSearch)));
  root.querySelectorAll("[data-wl-remove]").forEach((b) => b.addEventListener("click", () => {
        watchlist.unpin(b.dataset.wlRemove);
    renderWatchlist();
  }));
  // Each scope is independent: turning both off removes the entry
  // entirely, so there's no such thing as a block that blocks nothing.
  root.querySelectorAll("[data-scope]").forEach((c) => c.addEventListener("change", () => {
    watchlist.setBlockScope(c.dataset.nm, c.dataset.scope, c.checked);
    const left = watchlist.blockScopes(c.dataset.nm);
    if (!left.length) { flash(`${c.dataset.nm} is no longer blocked.`); renderWatchlist(); }
  }));

  root.querySelectorAll("[data-unblock]").forEach((b) => b.addEventListener("click", () => {
    watchlist.unblock(b.dataset.unblock);
    renderWatchlist();
  }));
  const wipe = document.getElementById("wipe-pins");
  if (wipe) wipe.addEventListener("click", async () => {
    if (!await confirmDialog({ title: "Remove all pins?", body: `All ${pins.length} pins will be cleared. This cannot be undone.`, confirmLabel: "Remove all", danger: true })) return;
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

// ---- demo screens ----
// Staged from fixed data in demo.js. No Spotify calls, no auth, no
// cache. Each renders the real screen through the real renderer, so a
// screenshot can't drift from what the app actually looks like — the
// previous demo mode drew its own markup and ended up advertising a UI
// that had been replaced.
async function renderDemo(screen) {
  switch (screen) {
    case "results":
      return renderResults(demo.DEMO_RESULTS);
    case "scan":
      return renderScrubResults(demo.DEMO_SCAN);
    case "sampler":
      _cards = _cards.filter((c) => c.id !== "sampler").concat(demo.DEMO_SAMPLER_CARD);
      await renderDemoHome();
      return openCardModal(demo.DEMO_SAMPLER_CARD);
    case "index":
      return renderDemoIndex();
    case "home":
    default:
      return renderDemoHome();
  }
}

async function renderDemoHome() {
  await renderHome();
  const el = document.getElementById("suggestions-row");
  // The real renderer, given fixed data — not a second copy of the
  // markup that can fall behind it.
  if (el) renderSuggestionRow(el, demo.DEMO_PINS, demo.DEMO_SUGGESTIONS);
}

function renderDemoIndex() {
  setTitle("DeepDive · Demo");
  root.innerHTML = `
    <div class="card">
      <h1>Demo screens</h1>
      <p class="muted">Staged from fixed data. Nothing here touches Spotify, so these work with the quota locked or with no account at all.</p>
      <div class="tile-grid" style="margin-top:18px;">
        ${demo.DEMO_SCREENS.map(([id, name, desc]) => `
          <button class="tile" data-demo="${esc(id)}">
            <span class="tile-art-fallback">${esc(name.charAt(0))}</span>
            <span class="tile-text">
              <span class="tile-title">${esc(name)}</span>
              <span class="tile-sub">${esc(desc)}</span>
            </span>
          </button>`).join("")}
      </div>
      <div class="actions">
        <button class="btn btn-ghost" id="demo-exit">Leave demo mode</button>
      </div>
    </div>`;
  root.querySelectorAll("[data-demo]").forEach((b) =>
    b.addEventListener("click", () => renderDemo(b.dataset.demo)));
  document.getElementById("demo-exit").addEventListener("click", () => {
    demo.exitDemo();
    render();
  });
}

async function render() {
  // Demo screens are staged from fixed data and make no Spotify calls,
  // so they run ahead of every auth check — the point is to be able to
  // photograph the app without an account, or with the quota locked.
  const screen = demo.demoScreen();
  if (screen) return renderDemo(screen);

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
// The build tag reads well and has settled several "is this deployed
// yet?" questions, but it is developer furniture. Off unless asked for.
const BUILD_TAG_KEY = "deepdive_show_build";
function showBuildTag() {
  try { return localStorage.getItem(BUILD_TAG_KEY) === "1"; } catch (e) { return false; }
}
function setShowBuildTag(on) {
  try { localStorage.setItem(BUILD_TAG_KEY, on ? "1" : "0"); } catch (e) {}
}
function applyBuildTagVisibility() {
  const el = document.getElementById("build-tag");
  if (el) el.textContent = showBuildTag() ? BUILD : "";
}

const BMC_KEY = "deepdive_show_bmc";
function showBmc() {
  try { return localStorage.getItem(BMC_KEY) !== "0"; } catch (e) { return true; }
}
function setShowBmc(on) {
  try { localStorage.setItem(BMC_KEY, on ? "1" : "0"); } catch (e) {}
  // Apply immediately rather than waiting for a re-render — the toggle
  // is in the drawer, with the button visible right behind it.
  document.querySelectorAll(".bmc-row").forEach((r) => r.classList.toggle("hidden", !on));
  document.getElementById("coffee-link")?.classList.toggle("hidden", !on);
}

// ---- inline settings in the nav drawer ----
// Configuration used to be a separate page, which meant leaving whatever
// you were doing to change one field. It lives in the drawer now,
// alongside the theme controls, so settings are all in one place.

// ---- bottom tab bar ----
// Mirrors the drawer's destinations for phones, where reaching a
// hamburger at the top of the screen is the worst place to put
// navigation. Marks the current section so the app says where you are.
let _currentTab = "home";

function setActiveTab(name) {
  _currentTab = name;
  // Two sets of navigation share one active state: the bottom tab bar
  // on mobile and the top-bar links on desktop. Only one is visible at
  // a time, but both are always in the DOM.
  document.querySelectorAll(".tab, .topnav-btn").forEach((t) =>
    t.classList.toggle("active", t.dataset.tab === name));
}

(function initTabs() {
  document.addEventListener("click", (e) => {
    const tab = e.target.closest("[data-tab]");
    if (!tab) return;
    const name = tab.dataset.tab;
    setActiveTab(name);
    if (name === "home") return renderHome();
    if (name === "dives") return renderDives();
    if (name === "mixes") return renderMixes();
    if (name === "settings") return renderSettings();
  });
})();

function applyBmcVisibility() {
  document.getElementById("coffee-link")?.classList.toggle("hidden", !showBmc());
}

(function initSpotifyLinks() {
  document.addEventListener("click", (e) => {
    const a = e.target.closest("a[data-spotify]");
    if (!a) return;
    e.preventDefault();
    openInSpotify(a.getAttribute("href"));
  });
})();


// Register the service worker. Android needs one registered before it
// will create a real installed app rather than a bookmark shortcut;
// offline resilience is the secondary benefit.
//
// Non-blocking and failure-tolerant: the app must behave identically if
// registration is unavailable, which it is on unsupported browsers and
// in some privacy configurations.
function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((e) => {
      console.warn("[DeepDive] service worker registration failed:", e && e.message);
    });
  });
}

async function boot() {
  // Put the build on screen before anything else can fail, so a stale
  // cached bundle is visible rather than inferred.
  applyBuildTagVisibility();

  // A remembered pause is an upper bound from a Retry-After, and it
  // blocks the requests that would disprove it. Check once on startup so
  // it can't outlive the real limit.
  try { await verifyRateLimit(); } catch (e) {}
  registerServiceWorker();
  applyBmcVisibility();
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
