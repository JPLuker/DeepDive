Warning: truncated output (original token count: 72713)
Total output lines: 6476

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
import { SpotifyClient, limitedUntil, normaliseArtist } from "./spotify.js";
import * as search from "./search.js";
import * as watchlist from "./watchlist.js";
import { LibraryCache } from "./library-cache.js";
import * as insights from "./insights.js";
import * as matching from "./matching.js";
import { bestStore } from "./storage.js";
import * as history from "./history.js";
// Version the demo module independently. Mobile browsers were reloading
// app.js while continuing to execute an older cached demo.js.
import * as demo from "./demo.js?v=2.9.100";
import * as lastfm from "./lastfm.js";
import * as cover from "./cover.js";

// Build marker. Twice now, diagnosing a problem has meant reasoning
// about which version was actually loaded from indirect evidence — slow
// and easy to get wrong. Showing it removes the guesswork.
export const BUILD = "2.9.100";

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
    flash(`Library refreshed. ${tracks.length} liked songs synced.`);
  } catch (e) {
    flash(`Couldn't refresh library: ${e.message || e}`, true);
  }
}

function navigate(view) {
  if (!auth.getClientId()) return renderSetup();
  if (!auth.isLoggedIn()) return renderConnect();
  if (view === "home") return renderHome();
  if (view === "scrub") return renderScrubForm();
  if (view === "watchlist") return renderCrate();
  if (view === "blocked") return renderBlocked();
  if (view === "history") return renderHistory();
  if (view === "settings") return renderSettings();
  if (view === "about") return renderLanding();
  if (view === "setup") return renderSetup();
  return renderHome();
}

// ============================================================
// Setup (credentials)
// ============================================================
// ============================================================
// Onboarding
// ============================================================
//
// One step per screen, one main button each, in the order the work
// happens: create the Spotify app, paste its Client ID, optionally add
// Last.fm, connect. The old version was one long page of numbered
// instructions and two fields, with the reasoning for each written out.
//
// No artist photographs here: there is no Spotify connection yet to
// fetch them with, and the ones shipped with the site may only appear
// inside device frames on the landing page. The header already carries
// the wordmark, so the steps don't repeat it.

const ONBOARD_STEPS = ["spotify", "client", "lastfm", "connect"];
const CLIENT_ID_RE = /^[0-9a-f]{32}$/i;

/**
 * Onboarding hides the app's navigation: every tab leads somewhere that
 * needs a connection that doesn't exist yet. Any screen that sets a tab
 * (every screen of the app proper does) takes the class off again.
 */
function setOnboarding(on) {
  document.body.classList.toggle("onboarding", !!on);
}

function onboardShell(step, body) {
  setOnboarding(true);
  const n = ONBOARD_STEPS.indexOf(step) + 1;
  return `
    <div class="onboard">
      <div class="onboard-top">
        <span class="onboard-step">Step ${n} of ${ONBOARD_STEPS.length}</span>
      </div>
      <div class="onboard-dots" aria-hidden="true">${ONBOARD_STEPS.map((s, i) =>
        `<i class="${i < n ? "on" : ""}"></i>`).join("")}</div>
      ${body}
    </div>`;
}

/** Step 1: create the Spotify app. */
function renderSetup() {
  setTitle("DeepDive · Set up");
  const rUri = auth.redirectUri();
  root.innerHTML = onboardShell("spotify", `
    <h1 class="onboard-title">Make a Spotify app</h1>
    <p class="onboard-lede">DeepDive runs on an app of your own, so your listening is never pooled with anyone else's. It's a short form, and you only fill it in once.</p>
    <ol class="onboard-list">
      <li>Open the dashboard and choose <strong>Create app</strong>. Any name will do.</li>
      <li>Under <strong>Redirect URIs</strong>, paste this address, then save.</li>
    </ol>
    <div class="onboard-copy">
      <code id="onboard-uri">${esc(rUri)}</code>
      <button class="btn btn-ghost btn-small" id="onboard-copy-btn">Copy</button>
    </div>
    <p class="onboard-hint">It has to match exactly, down to the slash at the end.</p>
    <div class="onboard-actions">
      <a class="btn btn-ghost" href="https://developer.spotify.com/dashboard" target="_blank" rel="noopener">Open the dashboard</a>
      <button class="btn btn-primary" id="onboard-next">I've done this</button>
    </div>`);
  document.getElementById("onboard-copy-btn").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    try { await navigator.clipboard.writeText(rUri); btn.textContent = "Copied"; }
    catch (err) {
      // No clipboard access: select it so a long-press copies it.
      const r = document.createRange(); r.selectNodeContents(document.getElementById("onboard-uri"));
      const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
      btn.textContent = "Selected";
    }
    setTimeout(() => { btn.textContent = "Copy"; }, 1800);
  });
  document.getElementById("onboard-next").addEventListener("click", () => renderClientStep());
}

/** Step 2: the Client ID, checked as it's typed. */
function renderClientStep() {
  setTitle("DeepDive · Set up");
  root.innerHTML = onboardShell("client", `
    <h1 class="onboard-title">Paste your Client ID</h1>
    <p class="onboard-lede">It's on your app's page in the dashboard, under Basic Information. You don't need the client secret.</p>
    <label class="onboard-field">
      <span>Client ID</span>
      <input type="text" id="client-id-input" value="${esc(auth.getClientId() || "")}" placeholder="32 letters and numbers" autocomplete="off" spellcheck="false" autocapitalize="off">
    </label>
    <p class="onboard-check" id="client-id-check" aria-live="polite"></p>
    <div class="onboard-actions">
      <button class="btn btn-ghost" id="onboard-back">Back</button>
      <button class="btn btn-primary" id="save-creds-btn" disabled>Continue</button>
    </div>`);
  const input = document.getElementById("client-id-input");
  const note = document.getElementById("client-id-check");
  const go = document.getElementById("save-creds-btn");
  const check = () => {
    const v = input.value.trim();
    const ok = CLIENT_ID_RE.test(v);
    go.disabled = !ok;
    note.className = "onboard-check" + (v && !ok ? " bad" : ok ? " good" : "");
    note.textContent = !v ? "" : ok ? "That looks right."
      : `A Client ID is 32 letters and numbers. This one is ${v.length}.`;
  };
  input.addEventListener("input", check);
  check();
  document.getElementById("onboard-back").addEventListener("click", () => renderSetup());
  go.addEventListener("click", () => {
    const v = input.value.trim();
    if (!CLIENT_ID_RE.test(v)) return;
    auth.setClientId(v);
    renderLastfmStep();
  });
}

/** Step 3: Last.fm, optional, with skipping as good an answer as saving. */
function renderLastfmStep() {
  setTitle("DeepDive · Set up");
  root.innerHTML = onboardShell("lastfm", `
    <h1 class="onboard-title">Add Last.fm <span class="onboard-optional">optional</span></h1>
    <p class="onboard-lede">Spotify no longer says what's popular or who sounds like whom. Last.fm does, and with a key you get Dips, Multi-Dips, recommendations and genre mixes.</p>
    <p class="onboard-hint">Create an API account at <a href="https://www.last.fm/api/account/create" target="_blank" rel="noopener">last.fm/api</a> and copy the API key. It's approved straight away. You can add it later in Settings.</p>
    <label class="onboard-field">
      <span>Last.fm API key</span>
      <input type="text" id="lastfm-key-input" value="${esc(lastfm.getKey() || "")}" placeholder="32 letters and numbers" autocomplete="off" spellcheck="false" autocapitalize="off">
    </label>
    <p class="onboard-check" id="lastfm-key-check" aria-live="polite"></p>
    <div class="onboard-actions">
      <button class="btn btn-ghost" id="onboard-skip">Skip for now</button>
      <button class="btn btn-primary" id="onboard-save-lastfm" disabled>Save key</button>
    </div>`);
  const input = document.getElementById("lastfm-key-input");
  const note = document.getElementById("lastfm-key-check");
  const save = document.getElementById("onboard-save-lastfm");
  const check = () => {
    const v = input.value.trim();
    const ok = CLIENT_ID_RE.test(v);
    save.disabled = !ok;
    note.className = "onboard-check" + (v && !ok ? " bad" : ok ? " good" : "");
    note.textContent = !v ? "" : ok ? "That looks right."
      : `A Last.fm key is 32 letters and numbers. This one is ${v.length}.`;
  };
  input.addEventListener("input", check);
  check();
  // Wrapped: handed straight to addEventListener, renderConnect would
  // take the click event as an error message.
  document.getElementById("onboard-skip").addEventListener("click", () => renderConnect());
  save.addEventListener("click", () => {
    const v = input.value.trim();
    if (!CLIENT_ID_RE.test(v)) return;
    lastfm.setKey(v);
    renderConnect();
  });
}

/**
 * Step 4: connect.
 *
 * A wrong redirect address never comes back here: Spotify stops on its
 * own page with "Invalid redirect URI". So the likely problem is named
 * before the button, not after it.
 */
function renderConnect(error = "") {
  setTitle("DeepDive");
  const hasId = !!auth.getClientId();
  root.innerHTML = onboardShell("connect", `
    <div class="onboard-connect">
      <h1 class="onboard-title">Connect Spotify</h1>
      <p class="onboard-lede">Spotify will ask you to allow DeepDive into your library and playlists. Nothing is changed without you choosing it.</p>
      ${error ? `<p class="onboard-check bad">Spotify said: ${esc(error)}. Try again, or check the steps before this one.</p>` : ""}
      <div class="onboard-actions onboard-actions-center">
        <button class="btn btn-primary" id="connect-btn">Connect Spotify</button>
      </div>
      <p class="onboard-hint">If Spotify says <em>Invalid redirect URI</em>, the address from step 1 wasn't saved exactly. ${hasId ? `<button class="btn-link" id="onboard-restart">Go back to step 1</button>` : ""}</p>
    </div>`);
  document.getElementById("connect-btn").addEventListener("click", async () => {
    try { await auth.beginLogin(); }
    catch (e) { flash(`Couldn't start login: ${e.message}`, true); }
  });
  document.getElementById("onboard-restart")?.addEventListener("click", () => renderSetup());
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
/**
 * @param options  Show the dive-options gear. Multi-Dip has its own
 *                 settings on the page, so the gear there would open a
 *                 dialog about a dive that isn't about to happen —
 *                 which is why it appeared to do nothing.
 */
function searchShellHtml({ options = true } = {}) {
  return `
    <div class="search-shell">
      <div class="search-pill-form">
        <input type="text" id="artist-input" placeholder="Search for an artist" autocomplete="off" autofocus>
        ${options ? `<button type="button" class="settings-icon-btn" id="settings-toggle-btn" aria-label="Search options" title="Search options">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>
        </button>` : ""}
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
function navRow(idAttr, title, detail, { disabled = false, tone = "" } = {}) {
  return `
    <button class="set-row set-row-nav${tone ? ` dive-option dive-${tone}` : ""}" ${idAttr}${disabled ? " disabled" : ""}>
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
    ${scopeBanner()}
    <div id="api-banner">${apiBannerHtml()}</div>
    ${searchShellHtml({ options: false })}
    <div id="suggestions-row"></div>
    <div id="home-mixes"></div>`;

  wireSearchBar();
  wireApiBanner();
  wireScopeBanner();
  if (demo.demoActive()) return;
  loadSuggestions({ compact: true });
  // One row of cards, whatever a row holds at this width — the sampler
  // card takes the first slot.
  const perRow = columnsAtWidth();
  loadPlaylistCards({ into: "home-mixes", limit: perRow, headHtml: sectionHead("Mixes", "made from what you've saved", "mixes", "All mixes") });
}

/**
 * Everything about diving in one place. The things that start listening
 * come first: one artist through search, then a whole bill through
 * Multi-Dip, then the artists waiting in the suggestion list. Crate and
 * history are places to resume or look back; the hours-long library scan
 * is deliberately last rather than presented as the first alternative.
 */
async function renderDives() {
  setTitle("DeepDive · Dives");
  setActiveTab("dives");
  root.innerHTML = `
    ${rateLimitBanner()}
    ${scopeBanner()}
    <div id="api-banner">${apiBannerHtml()}</div>
    ${searchShellHtml({ options: false })}
    <div class="set-group dive-feature-group">
      <div class="set-group-label">For the whole bill</div>
      ${lastfm.hasKey() || demo.demoActive()
        ? navRow('id="go-show"', "Multi-Dip", "Build one playlist in show order, with more time for the acts you care about.", { tone: "blue" })
        : navRow('id="go-show"', "Multi-Dip", NEEDS_LASTFM_FULL, { disabled: true, tone: "blue" })}
    </div>
    <div id="suggestions-row"></div>
    <div class="set-group set-group-spaced">
      <div class="set-group-label">Your dives</div>
      ${navRow('id="go-pins"', "Crate", "Everyone you've put aside to get to, with Up next at the top.", { tone: "teal" })}
      ${navRow('id="go-history"', "Dive history", "What you've dived, what DeepDive built, and how to undo it.", { tone: "purple" })}
    </div>
    <div class="set-group">
      <div class="set-group-label">Go further</div>
      ${navRow('id="go-scrub"', "Duplicate scan", "Find alternate releases of songs you already like, then mark those copies as liked too.", { tone: "gold" })}
    </div>`;

  wireSearchBar();
  wireApiBanner();
  wireScopeBanner();
  document.getElementById("go-scrub")?.addEventListener("click", () => demo.demoActive() ? renderDemo("scan") : renderScrubForm());
  document.getElementById("go-show")?.addEventListener("click", () => demo.demoActive() ? renderDemo("multidip") : renderShow());
  document.getElementById("go-history")?.addEventListener("click", () => renderHistory());
  document.getElementById("go-pins")?.addEventListener("click", () => demo.demoActive() ? renderDemo("crate") : renderCrate());
  if (demo.demoActive()) return;
  loadSuggestions({ showAllPins: true });
}

/** Mixes — what Playlists were called — with the sampler alongside. */
async function renderMixes() {
  setTitle("DeepDive · Mixes");
  setActiveTab("mixes");
  root.innerHTML = `
    ${rateLimitBanner()}
    ${scopeBanner()}
    <div id="featured-mixes"></div>
    <div id="rec-section"></div>
    <div id="playlist-cards"></div>
    <div id="genre-section"></div>`;

  wireScopeBanner();
  renderFeaturedMixes();
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
const _featuredMixSeed = (Date.now() >>> 0) ^ Math.floor(Math.random() * 0xffffffff);

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
/**
 * One card of each kind, for the short row on Home.
 *
 * Drawing four from the one pool meant four variations on the same
 * idea — usually "everything you added in autumn" next to "their
 * tracks you own, oldest first". A sampler, something similar to what
 * you play, something from your library and a genre covers the whole
 * app in the same four tiles.
 *
 * Every kind is optional: no Last.fm key means no recommendation and no
 * genre, and the row fills from the library instead rather than showing
 * a gap.
 */
/**
 * The library as mixes should see it: without anything blocked from mixes.
 *
 * The filter used to live inside the Home/Mixes card loader only, so the
 * recommendations, genres, "If you like…" and Build your own all read the
 * raw library and put blocked artists straight back. Every mix source
 * goes through here instead. A track is dropped if any of its artists is
 * blocked, features included.
 */
function withoutMixBlocked(tracks) {
  const blocked = watchlist.blockedNameSet("mixes");
  if (!blocked.size || !tracks) return tracks || [];
  return tracks.filter((t) => !(t.artists || []).some(
    (a) => blocked.has((a.name || "").trim().toLowerCase())));
}

async function mixedRow(allCards, tracks, seed, limit) {
  const picked = [];
  const taken = new Set();
  const take = (card) => {
    if (!card || taken.has(card.id)) return false;
    taken.add(card.id);
    picked.push(card);
    return true;
  };
  const oneOf = (list) => (list && list.length
    ? list[Math.abs(seed + list.length) % list.length] : null);

  // Recommendations and genres are only there once Last.fm has been
  // asked, and asking here would turn opening Home into a fetch.
  try {
    if (_similarBySeed.size) {
      take(oneOf(insights.recommendationCards(tracks, _similarBySeed)));
    }
  } catch (e) { /* the row is still worth drawing */ }

  take(oneOf(allCards.filter((c) => !taken.has(c.id) && !c.isRecommendation
    && c.id !== "custom" && !String(c.id).startsWith("genre-"))));

  try {
    if (_genreTags.size) {
      take(oneOf(insights.genreCards(tracks, _genreTags, { limit: 40 })));
    }
  } catch (e) { /* as above */ }

  // Whatever is missing — no key, no cache — is filled from the pool, so
  // the row is always the width it should be.
  for (const c of insights.seededPick(allCards, allCards.length, seed)) {
    if (picked.length >= limit) break;
    take(c);
  }
  return picked.slice(0, limit);
}

/**
 * The first shelf on Mixes is the page's actual recommendation surface:
 * one place to sample the different ways DeepDive can build something.
 * The sections below remain complete catalogues of their own kind.
 *
 * It uses cached Last.fm data only. Opening Mixes must never quietly
 * launch the hundreds of requests needed to create that data.
 */
async function renderFeaturedMixes() {
  const el = document.getElementById("featured-mixes");
  if (!el) return;
  // Without Last.fm there is only one category to draw from, so a
  // cross-section shelf would merely repeat the Mix ideas directly below.
  if (!lastfm.hasKey()) { el.innerHTML = ""; return; }

  let cached = [];
  try { cached = await libraryCache.peek(); } catch (e) { cached = []; }
  if (!cached || !cached.length) { el.innerHTML = ""; return; }
  cached = withoutMixBlocked(cached);

  try {
    await hydrateFromCache("similar", _similarBySeed);
    await hydrateFromCache("tags", _genreTags);
  } catch (e) { /* available categories can still make the shelf */ }

  if (!_samplerPool.length) {
    try {
      const mixBlocked = watchlist.blockedNameSet("mixes");
      _samplerPool = insights.artistsBarelyExplored(cached, { maxTracks: 3, limit: 500 })
        .filter((a) => !mixBlocked.has((a.name || "").trim().toLowerCase()));
    } catch (e) { /* sampler is optional */ }
  }

  const libraryCards = insights.playlistCards(cached, { seed: _featuredMixSeed });
  const cards = await mixedRow(libraryCards, cached, _featuredMixSeed, 3);
  const sampler = _samplerPool.length >= 2 ? `
    <button class="pcard is-sampler" data-featured-sampler>
      <span class="pcard-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="6 4 20 12 6 20 6 4"/></svg></span>
      <span class="pcard-title">Sampler</span>
      <span class="pcard-sub">a few tracks each from artists you've barely heard</span>
    </button>` : "";

  if (!sampler && !cards.length) { el.innerHTML = ""; return; }
  el.innerHTML = `
    <div class="row-head"><h2>Recommended</h2><span class="qual">from across your mixes</span></div>
    <div class="card-row featured-mix-row">
      ${sampler}
      ${cards.map((c, i) => `
        <button class="pcard" data-featured-card="${esc(c.id)}" style="--h:${(225 + i * 61) % 360};">
          <span class="pcard-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${c.isGenre
            ? '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>'
            : c.isRecommendation
              ? '<path d="M12 3v3"/><path d="M12 18v3"/><path d="M5 12H2"/><path d="M22 12h-3"/><circle cx="12" cy="12" r="5"/>'
              : '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="16" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>'}</svg></span>
          <span class="pcard-title">${esc(c.title)}</span>
          <span class="pcard-sub">${esc(c.subtitle)}</span>
        </button>`).join("")}
    </div>`;

  el.querySelector("[data-featured-sampler]")?.addEventListener("click", () => openSampler(samplerSourceArtists()));
  el.querySelectorAll("[data-featured-card]").forEach((btn) =>
    btn.addEventListener("click", () =>
      openCardModal(cards.find((c) => c.id === btn.dataset.featuredCard))));
}

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
    const forMixes = withoutMixBlocked(cached);
    _allCards = insights.playlistCards(forMixes, { seed });
    if (!_allCards.length) {
      el.innerHTML = `<p class="empty-note">Nothing to build a mix from yet. Your cached library is probably too small.</p>`;
      return;
    }
    _cards = insights.seededPick(_allCards, CARDS_PER_LOAD, seed);

    // Only the short row on Home is curated this way. The full Mixes
    // page wants everything, in no particular arrangement.
    if (limit > 0) {
      // Recommendations and genres live in session maps that only the
      // Mixes page filled, so on Home they were always empty and the row
      // fell back to library mixes every time. Reading the cache costs
      // no requests.
      try {
        await hydrateFromCache("similar", _similarBySeed);
        await hydrateFromCache("tags", _genreTags);
      } catch (e) { /* the row still draws */ }
      // One fewer than the row holds: the sampler is its own tile.
      _cards = await mixedRow(_allCards, forMixes, seed, Math.max(1, limit - 1));
    }

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
  const shown = limit ? _cards.slice(0, Math.max(0, limit - (_samplerPool.length >= 2 ? 1 : 0))) : _cards;
  // With no Last.fm key this grid is the whole page, so a heading only
  // repeats what the Mixes tab already says. Once Recommended and Genres
  // are present, name the grid by the kinds of patterns it uses rather
  // than "From your library" — every section on this page comes from the
  // user's library in one way or another.
  const defaultHead = lastfm.hasKey()
    ? `<div class="row-head"><h2>Mix ideas</h2><span class="qual">dates, artists and albums</span></div>`
    : "";
  const head = el._cardHead || defaultHead;
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
      <span class="pcard-sub">pick an era, a length, an artist, any combination</span>
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
      ${limit ? "" : customCard}
      ${samplerCard}
      ${shown.map((c, i) => `
        <bu…52713 tokens truncated…atchlist-row">
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
        <p class="nav-hint">Removes those tracks from your Liked Songs. Playlists stay: DeepDive won't delete one you may have edited or shared.</p>
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
        <p class="nav-hint">Removing takes the playlist out of your Spotify library. Only playlists DeepDive created are listed. One it added to is yours to delete.</p>
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
      <p class="nav-hint" style="margin-top:0;">Pins, blocked artists, dive history and settings. The library cache isn't included: it rebuilds itself from Spotify in one read.</p>
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

// ============================================================
// Crate
// ============================================================
//
// Everyone you've put aside to get to. Built to hold a hundred and stay
// usable, the way a streaming queue does: you read it from the top,
// Up next leads, and search and sort are how you reach the rest.
//
// Stored under the old "watchlist" key — renaming the storage would
// strand everyone's existing crate for the sake of a word.

let _crateQuery = "";
let _crateSort = "order";

const CRATE_SORTS = [
  ["order", "Your order"],
  ["added", "Recently added"],
  ["az", "A–Z"],
  ["undived", "Not dived yet"],
];

/** When each crated artist was last dived, by lower-cased name. */
function divedDates() {
  const out = new Map();
  try {
    for (const d of history.listDives()) {
      const k = (d.artistName || "").trim().toLowerCase();
      if (k && !out.has(k)) out.set(k, d.at || d.date || null);
    }
  } catch (e) { /* history is a nicety here */ }
  return out;
}

function crateSorted(entries, dived) {
  const list = entries.slice();
  const name = (e) => (e.name || "").toLowerCase();
  if (_crateSort === "az") list.sort((a, b) => name(a).localeCompare(name(b)));
  else if (_crateSort === "added") list.sort((a, b) => (b.added_at || "").localeCompare(a.added_at || ""));
  else if (_crateSort === "undived") {
    // Not yet dived first, then the rest in your own order.
    list.sort((a, b) => Number(dived.has(name(a))) - Number(dived.has(name(b))));
  }
  return list;
}

function crateTile(e, dived) {
  const k = (e.name || "").trim().toLowerCase();
  const when = dived.get(k);
  const sub = dived.has(k)
    ? (when ? `dived ${new Date(when).toLocaleDateString(undefined, { month: "short", year: "numeric" })}` : "dived")
    : "not dived yet";
  const star = watchlist.isUpNext(e.name);
  const photo = e.image_url || e.image_url_large;
  return `
    <div class="crate-tile" data-crate="${esc(e.name)}">
      <button class="crate-open" data-search="${esc(e.name)}">
        ${photo
          ? `<img src="${esc(photo)}" alt="" loading="lazy" class="crate-art">`
          : `<span class="crate-art crate-art-blank">${esc((e.name || "?").charAt(0).toUpperCase())}</span>`}
        <span class="crate-text">
          <span class="crate-name">${esc(e.name)}</span>
          <span class="crate-sub">${esc(sub)}</span>
        </span>
      </button>
      <span class="crate-actions">
        <button class="star-btn${star ? " on" : ""}" data-star="${esc(e.name)}"
          aria-pressed="${star}" aria-label="${star ? "Remove from" : "Add to"} Up next" title="Up next">${STAR_SVG}</button>
        <button class="crate-btn" data-top="${esc(e.name)}" aria-label="Move ${esc(e.name)} to the top" title="Move to the top">&uarr;</button>
        <button class="crate-btn" data-crate-rm="${esc(e.id)}" data-name="${esc(e.name)}" aria-label="Take ${esc(e.name)} out of the crate" title="Take out">&times;</button>
      </span>
    </div>`;
}

let _demoCrateEntries = null;
let _demoCrateUpNext = null;

function renderCrate() {
  setTitle("DeepDive · Crate");
  setActiveTab("dives");
  const all = (demo.demoActive() && _demoCrateEntries) || watchlist.crateInOrder();
  const upNext = (demo.demoActive() && _demoCrateUpNext) || watchlist.listUpNext();

  root.innerHTML = `
    <div class="row-head"><h2>Crate</h2><span class="qual">${all.length} artist${all.length === 1 ? "" : "s"}</span></div>
    ${all.length ? `
      <p class="nav-hint" style="margin-top:0;">Everyone you've put aside to get to. Star someone to put them on Up next, which is what Home shows.</p>
      <div class="crate-tools">
        <input type="search" id="crate-search" placeholder="Search your crate" autocomplete="off" spellcheck="false" value="${esc(_crateQuery)}">
        <select id="crate-sort" class="sort-select" aria-label="Sort the crate">
          ${CRATE_SORTS.map(([v, l]) => `<option value="${v}"${v === _crateSort ? " selected" : ""}>${l}</option>`).join("")}
        </select>
      </div>
      <div class="actions crate-sampler-actions">
        <button class="btn btn-ghost btn-small" id="crate-sampler">Sampler from your crate</button>
      </div>
      <div id="crate-body"></div>`
      : `<p class="empty-note">Your crate is empty. Add an artist from any tile's menu, or from the search box, and they'll wait here.</p>`}
    <div class="actions"><button class="btn btn-ghost" data-tab="dives">Back</button></div>`;

  if (!all.length) return;

  const body = document.getElementById("crate-body");
  const paint = () => {
    const dived = divedDates();
    const q = _crateQuery.trim().toLowerCase();
    const match = (e) => !q || (e.name || "").toLowerCase().includes(q);
    const queued = new Set(upNext.map((e) => e.name));
    // While searching, one flat list is easier to scan than two.
    const head = q ? [] : upNext.filter(match);
    const rest = crateSorted(all.filter((e) => match(e) && (q || !queued.has(e.name))), dived);
    body.innerHTML = `
      ${head.length ? `
        <div class="crate-section"><span class="label">Up next</span></div>
        <div class="crate-grid">${head.map((e) => crateTile(e, dived)).join("")}</div>` : ""}
      ${rest.length ? `
        ${head.length ? `<div class="crate-section"><span class="label">Everyone else</span></div>` : ""}
        <div class="crate-grid">${rest.map((e) => crateTile(e, dived)).join("")}</div>`
        : (q ? `<p class="empty-note">No one in your crate matches that.</p>` : "")}`;
  };
  paint();

  // Repaint only the list: re-rendering the page rebuilt the search box
  // and lost focus, which on a phone closes the keyboard every letter.
  const search = document.getElementById("crate-search");
  search.addEventListener("input", () => { _crateQuery = search.value; paint(); });
  document.getElementById("crate-sort").addEventListener("change", (e) => { _crateSort = e.target.value; paint(); });

  // One listener on the list rather than one per tile, since the list
  // repaints on every keystroke.
  body.addEventListener("click", (ev) => {
    const star = ev.target.closest("[data-star]");
    const top = ev.target.closest("[data-top]");
    const rm = ev.target.closest("[data-crate-rm]");
    const open = ev.target.closest("[data-search]");
    if (star) {
      const n = star.dataset.star;
      const on = !watchlist.isUpNext(n);
      watchlist.setUpNext(n, on);
      flash(on ? `${n} is up next.` : `${n} is off Up next.`);
      renderCrate();
    } else if (top) {
      watchlist.moveToTop(top.dataset.top);
      flash(`${top.dataset.top} moved to the top.`);
      renderCrate();
    } else if (rm) {
      watchlist.remove(rm.dataset.crateRm);
      flash(`${rm.dataset.name} is out of your crate.`);
      renderCrate();
    } else if (open) {
      startSearch(open.dataset.search);
    }
  });

  document.getElementById("crate-sampler")?.addEventListener("click", () => crateSampler(all));
}

/**
 * A sampler drawn from the crate rather than from artists you've barely
 * played: a few songs each from people you've put aside, which is a
 * quick way to decide who to get to first.
 */
async function crateSampler(entries) {
  // A random handful, not always the top of the crate — otherwise the
  // same dozen would come back every time and the rest never would.
  const pool = insights.seededPick(entries, SAMPLER_MAX_ARTISTS, Date.now() >>> 0);
  const artists = [];
  for (const e of pool) {
    let id = e.spotify_id;
    // Artists added by name alone have no id yet; one lookup each finds it.
    if (!id) {
      try {
        const found = await client.findArtist(e.name);
        if (found) {
          id = found.id;
          watchlist.setDetails(e.id, found.id, found.image_url);
        }
      } catch (err) { /* skip them rather than stop */ }
    }
    if (id) artists.push({ id, name: e.name, image_url: e.image_url, image_url_large: e.image_url_large });
  }
  if (artists.length < 2) {
    flash("Not enough of your crate could be found on Spotify for a sampler.", true);
    return;
  }
  runSampler(artists);
}


const STAR_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><polygon points="12 2.5 15.1 8.8 22 9.8 17 14.7 18.2 21.6 12 18.3 5.8 21.6 7 14.7 2 9.8 8.9 8.8 12 2.5"/></svg>`;

/**
 * Artists you've told DeepDive to leave alone.
 *
 * Lived beside the pins until the crate got its own screen. Blocking is
 * a setting — it changes what the app does, not what you're listening
 * to — so it moved to Settings.
 */
function renderBlocked() {
  setTitle("DeepDive · Blocked artists");
  setActiveTab("settings");
  const blocked = watchlist.listBlocked();
  root.innerHTML = `
    <div class="card">
      <h1>Blocked artists</h1>
      <p class="muted">Blocked artists never appear in suggestions or mixes, depending on what you tick.</p>
            <p class="nav-hint" style="margin-top:0;">Blocking is per feature. You might not want to dive an artist and still want their songs in a mix.</p>
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

      <div class="actions"><button class="btn btn-ghost" data-tab="settings">Back to settings</button></div>
    </div>`;

  root.querySelectorAll("[data-scope]").forEach((c) => c.addEventListener("change", () => {
    watchlist.setBlockScope(c.dataset.nm, c.dataset.scope, c.checked);
    const left = watchlist.blockScopes(c.dataset.nm);
    if (!left.length) { flash(`${c.dataset.nm} is no longer blocked.`); renderBlocked(); }
  }));

  root.querySelectorAll("[data-unblock]").forEach((b) => b.addEventListener("click", () => {
    watchlist.unblock(b.dataset.unblock);
    renderBlocked();
  }));
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

/**
 * The first screen anyone sees. It says what DeepDive is in the landing
 * page's words, and what setting it up takes, including Premium:
 * Spotify only lets an app in development mode run for an owner who
 * pays, which was the one thing the old setup never mentioned.
 */
function renderLanding() {
  setTitle("DeepDive");
  setOnboarding(true);
  root.innerHTML = `
    <div class="onboard onboard-welcome">
      <h1 class="onboard-hero">Hear it all.</h1>
      <p class="onboard-lede">DeepDive learns what is in your library, finds missing tracks and puts them in a playlist for you to enjoy.</p>
      <div class="onboard-process">
        <p>Setting up takes about two minutes. You make a free app on Spotify's developer site, paste its Client ID here, and sign in with your Spotify account, which has to be <strong>Premium</strong>: Spotify only runs apps like this for Premium accounts.</p>
        <p>A free Last.fm key is optional. It turns on Dips, Multi-Dips, recommendations and genre mixes, and you can add it later.</p>
      </div>
      <div class="onboard-actions onboard-actions-center">
        <button class="btn btn-primary" id="landing-start">Get started</button>
      </div>
      <p class="onboard-hint"><a href="../" target="_blank" rel="noopener">See what DeepDive does</a></p>
    </div>`;
  document.getElementById("landing-start").addEventListener("click", () => { markLandingSeen(); renderSetup(); });
}

// ---- demo screens ----
// The artist list is the safety boundary: every name shown in demo mode
// comes from it. Names are resolved live through the connected Spotify
// account so marketing shots get real photography, albums and tracks;
// the resolved data stays in memory for this session only.
const _demoArtistData = new Map();
const _demoTrackData = new Map();

function clearDemoSpotifyCache() {
  _demoArtistData.clear();
  _demoTrackData.clear();
}

async function demoResolveArtist(name) {
  const key = String(name || "").trim().toLowerCase();
  if (!key) return null;
  if (!_demoArtistData.has(key)) {
    const approved = demo.approvedArtist(name);
    // Fetch the chosen Spotify identity rather than trusting the thumbnail
    // saved with the whitelist. Besides preventing same-name mismatches,
    // this gives full-size current artwork to the results hero.
    const p = (approved && approved.id
      ? client.get(`artists/${approved.id}`).then(normaliseArtist)
      : client.findArtist(name)).then((a) => {
      if (!a) throw new Error(`Spotify couldn't find ${name}.`);
      _artistLookups.set(key, Promise.resolve(a));
      return a;
    });
    p.catch(() => _demoArtistData.delete(key));
    _demoArtistData.set(key, p);
  }
  return _demoArtistData.get(key);
}

async function demoTracksFor(artist, limit = 10) {
  if (!artist) return [];
  const key = artist.id || artist.name.toLowerCase();
  if (!_demoTrackData.has(key)) {
    const p = client.get("search", {
      q: `artist:"${artist.name.replace(/"/g, "")}"`, type: "track", limit: Math.min(10, limit),
    }).then((r) => ((r.tracks && r.tracks.items) || [])
      .filter((t) =>
        (t.artists || []).some((a) => a.id === artist.id || a.name.toLowerCase() === artist.name.toLowerCase()))
      .map((t) => {
        // Spotify's search endpoint returns album.images[], while the real
        // catalogue path normalises that to album.image_url for trackRow().
        // Demo results use the same renderer, so give search tracks the same
        // album shape instead of falling through to the music-note placeholder.
        const album = t.album || {};
        const images = album.images || [];
        const imageUrl = album.image_url || (images.length
          ? (images.length >= 2 ? images[1].url : images[0].url)
          : null);
        return { ...t, album: { ...album, image_url: imageUrl } };
      }));
    p.catch(() => _demoTrackData.delete(key));
    _demoTrackData.set(key, p);
  }
  return (await _demoTrackData.get(key)).slice(0, limit);
}

async function demoArtistsFor(section, count) {
  const names = demo.namesFor(section, count);
  const settled = await Promise.allSettled(names.map(demoResolveArtist));
  return settled.filter((r) => r.status === "fulfilled" && r.value).map((r) => r.value);
}

async function demoGroupsFor(section, count, trackCount = 3) {
  const artists = await demoArtistsFor(section, count);
  return Promise.all(artists.map(async (artist) => ({ artist, tracks: await demoTracksFor(artist, trackCount) })));
}

async function renderDemoChooser(artistName = null) {
  renderDemoLoading("Opening the staged artist chooser…");
  try {
    const artist = artistName
      ? await demoResolveArtist(artistName)
      : (await demoArtistsFor("chooser", 1))[0];
    if (!artist) throw new Error("Spotify couldn't resolve that approved artist.");

    // Seed the normal chooser's lookup cache, then render the staged Home
    // behind it so the screenshot is entirely whitelist-safe.
    _artistLookups.set(artist.name.toLowerCase(), Promise.resolve(artist));
    await renderDemoHome();
    const input = document.getElementById("artist-input");
    if (input) input.value = artist.name;
    openIntentModal(artist.name);
  } catch (e) { return renderDemoError(e); }
}

async function renderDemoDiveProgress(artistName = null) {
  renderDemoLoading("Opening a staged dive…");
  try {
    const artist = artistName
      ? await demoResolveArtist(artistName)
      : (await demoArtistsFor("dive-progress", 1))[0];
    if (!artist) throw new Error("Spotify couldn't resolve that approved artist.");
    await renderDemoHome();
    showDiveScreen(`Diving into ${artist.name}…`, null);
    const photo = artist.image_url_large || artist.image_url;
    if (photo) addDiveImage(photo);
    updateDiveScreen(48, `Reading ${artist.name}'s releases…`);
  } catch (e) { return renderDemoError(e); }
}

async function renderDemoResults(artistName = null) {
  renderDemoLoading("Building a staged dive…");
  try {
    const artist = artistName
      ? await demoResolveArtist(artistName)
      : (await demoArtistsFor("results", 1))[0];
    if (!artist) throw new Error("Spotify couldn't resolve that approved artist.");
    const tracks = await demoTracksFor(artist, 10);
    const photo = artist.image_url_large || artist.image_url;
    if (photo) await preloadPhoto(photo);
    return renderResults(demo.resultsFrom(artist, tracks));
  } catch (e) { return renderDemoError(e); }
}

async function demoSearchArtists(query, limit = 6) {
  const names = demo.searchNames(query, limit);
  const settled = await Promise.allSettled(names.map(demoResolveArtist));
  return settled.filter((r) => r.status === "fulfilled" && r.value).map((r) => r.value);
}

function renderDemoLoading(label = "Loading approved artists…") {
  root.innerHTML = `<div class="card"><h1>Demo mode</h1><p class="muted">${esc(label)}</p></div>`;
}

function renderDemoError(e) {
  root.innerHTML = `<div class="card"><h1>Demo mode couldn't load</h1><p class="muted">${esc(e && e.message ? e.message : String(e))}</p><div class="actions"><button class="btn btn-ghost" data-tab="settings">Demo settings</button></div></div>`;
}

async function renderDemo(screen) {
  if (screen === "index") return renderDemoIndex();
  if (screen === "settings") return renderSettings();
  renderDemoLoading();
  try {
    if (screen === "results") {
      return renderDemoResults();
    }
    if (screen === "scan") {
      const groups = await demoGroupsFor("scan", 4, 5);
      return renderScrubResults(demo.scanFrom(groups));
    }
    if (screen === "sampler") {
      const groups = await demoGroupsFor("sampler", 6, 2);
      const card = demo.samplerFrom(groups);
      _cards = _cards.filter((c) => c.id !== "sampler").concat(card);
      await renderDemoHome();
      return openCardModal(card);
    }
    if (screen === "chooser") return renderDemoChooser();
    if (screen === "dive") return renderDemoDiveProgress();
    if (screen === "crate") {
      const artists = await demoArtistsFor("crate", 9);
      const entries = artists.map((a, i) => ({
        id: a.id, name: a.name, image_url: a.image_url, image_url_large: a.image_url_large,
        added_at: new Date(Date.now() - i * 86400000).toISOString(),
      }));
      _demoCrateEntries = entries;
      _demoCrateUpNext = entries.slice(0, 3);
      return renderCrate();
    }
    if (screen === "multidip") {
      const artists = await demoArtistsFor("multidip", 4);
      _showBill = artists.map((a, i) => ({ ...a, emphasis: i === artists.length - 1 ? "more" : (i === 0 ? "less" : ""), songs: i === 1 ? 5 : 0 }));
      return renderShow();
    }
    if (screen === "mixes") return renderDemoMixes();
    return renderDemoHome();
  } catch (e) { return renderDemoError(e); }
}

async function renderDemoMixes() {
  const groups = await demoGroupsFor("mixes", 9, 4);
  _samplerPool = groups.map((g) => g.artist);
  root.innerHTML = `<div id="demo-featured"></div><div id="demo-mix-ideas"></div>`;
  const tracks = (i) => groups[i] ? groups[i].tracks : [];
  _cards = [
    { id: "demo-feature-similar", title: `If you like ${groups[0].artist.name}`, subtitle: "similar artists already in your library", tracks: tracks(0).concat(tracks(1)) },
    { id: "demo-feature-year", title: "Your 2024", subtitle: "what you added that year", tracks: tracks(2) },
    { id: "demo-feature-albums", title: "Albums that landed", subtitle: "records you liked three or more from", tracks: tracks(3).concat(tracks(4)) },
  ].map((c) => ({ ...c, count: c.tracks.length }));
  const featured = document.getElementById("demo-featured");
  featured._cardLimit = 4;
  featured._cardHead = `<div class="row-head"><h2>Recommended</h2><span class="qual">from across your mixes</span></div>`;
  renderCardRow(featured);
  _cards = [
    { id: "demo-idea-2023", title: "Released in 2023", subtitle: "whenever you got to it", tracks: tracks(3) },
    { id: "demo-idea-late", title: "Took your time", subtitle: "found more than a decade after release", tracks: tracks(4) },
    { id: "demo-idea-random", title: "Surprise me", subtitle: "50 at random from your library", tracks: tracks(5).concat(tracks(6)) },
    { id: "demo-idea-2024", title: "Your 2024", subtitle: "what you added that year", tracks: tracks(6) },
    { id: "demo-idea-first", title: "Your first 50", subtitle: "the earliest things you liked", tracks: tracks(7) },
    { id: "demo-idea-albums", title: "Albums that landed", subtitle: "records you liked three or more from", tracks: tracks(7).concat(tracks(8)) },
    { id: "demo-idea-2021", title: "Your 2021", subtitle: "what you added that year", tracks: tracks(8) },
    { id: "demo-idea-regulars", title: "Your regulars", subtitle: "a few each from the artists you like most", tracks: tracks(0).concat(tracks(2)) },
  ].map((c) => ({ ...c, count: c.tracks.length }));
  const ideas = document.getElementById("demo-mix-ideas");
  ideas._cardLimit = 0;
  ideas._cardHead = `<div class="row-head"><h2>Mix ideas</h2><span class="qual">dates, artists and albums</span></div>`;
  renderCardRow(ideas);
  setActiveTab("mixes");
}

async function renderDemoHome() {
  await renderHome();
  const pins = await demoArtistsFor("home-pins", 3);
  const suggestions = await demoArtistsFor("home-suggestions", 6);
  const el = document.getElementById("suggestions-row");
  if (el) renderSuggestionRow(el, demo.pinsFrom(pins), demo.suggestionsFrom(suggestions));

  const groups = await demoGroupsFor("home-mixes", 4, 2);
  _samplerPool = groups.map((g) => g.artist);
  _cards = [
    { id: "demo-home-random", title: "Surprise me", subtitle: "50 at random from your library", tracks: groups.flatMap((g) => g.tracks) },
    { id: "demo-home-year", title: "Your 2024", subtitle: "what you added that year", tracks: groups[1]?.tracks || [] },
    { id: "demo-home-albums", title: "Albums that landed", subtitle: "records you liked three or more from", tracks: (groups[2]?.tracks || []).concat(groups[3]?.tracks || []) },
  ].map((c) => ({ ...c, count: c.tracks.length }));
  const mixes = document.getElementById("home-mixes");
  if (mixes) {
    mixes._cardLimit = columnsAtWidth();
    mixes._cardHead = sectionHead("Mixes", "made from what you've saved", "mixes", "All mixes");
    renderCardRow(mixes);
  }
}

async function renderDemoDives() {
  await renderDives();
  const pins = await demoArtistsFor("dives-pins", 3);
  const suggestions = await demoArtistsFor("dives-suggestions", 9);
  const el = document.getElementById("suggestions-row");
  if (el) renderSuggestionRow(el, demo.pinsFrom(pins), demo.suggestionsFrom(suggestions));
}

function renderDemoIndex() {
  setTitle("DeepDive · Demo");
  root.innerHTML = `
    <div class="card">
      <h1>Demo screens</h1>
      <p class="muted">Only artists in your demo whitelist can appear. Their photography, albums and tracks are resolved live through your connected Spotify account.</p>
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
  // Demo mode owns its routing before onboarding. It still uses the
  // connected Spotify token to resolve the approved artist whitelist;
  // keeping the route here prevents the normal library from painting
  // first and leaking into a screenshot.
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
  setOnboarding(false);
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
    if (demo.demoActive()) {
      if (name === "home") return renderDemo("home");
      if (name === "dives") return renderDemoDives();
      if (name === "mixes") return renderDemo("mixes");
      if (name === "settings") return renderDemo("settings");
    }
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
    // Said on the connect step itself, where the retry is, rather than
    // in a flash that disappears.
    return renderConnect(cb.error === "access_denied" ? "access was not allowed" : cb.error);
  }
  if (cb.ok === true) { flash("Connected to Spotify."); return renderHome(); }
  render();
}

boot();
