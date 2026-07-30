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

const client = new SpotifyClient(auth.getToken);

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
      else navigate(dest);
    });
  });
})();

// ---- theme toggle (light / dark / system) ----
(function initTheme() {
  const KEY = "deepdive_theme";
  const btns = Array.from(document.querySelectorAll("[data-theme-choice]"));
  const mql = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

  function resolve(pref) {
    if (pref === "dark") return true;
    if (pref === "light") return false;
    return !!(mql && mql.matches); // system
  }
  function apply(pref) {
    const dark = resolve(pref);
    if (dark) document.documentElement.setAttribute("data-theme", "dark");
    else document.documentElement.removeAttribute("data-theme");
    btns.forEach((b) => b.classList.toggle("active", b.dataset.themeChoice === pref));
  }
  function current() { try { return localStorage.getItem(KEY) || "system"; } catch (e) { return "system"; } }

  btns.forEach((b) => b.addEventListener("click", () => {
    const pref = b.dataset.themeChoice;
    try { localStorage.setItem(KEY, pref); } catch (e) {}
    apply(pref);
  }));
  // When in system mode, follow live OS changes.
  if (mql) mql.addEventListener("change", () => { if (current() === "system") apply("system"); });

  apply(current());
})();

function navigate(view) {
  if (!auth.getClientId()) return renderSetup();
  if (!auth.isLoggedIn()) return renderConnect();
  if (view === "home") return renderHome();
  if (view === "scrub") return renderScrubForm();
  if (view === "watchlist") return renderWatchlist();
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
  root.innerHTML = `
    <div class="card">
      <h1>Spotify setup</h1>
      <p class="muted">DeepDive uses your own Spotify app so it stays entirely yours — no shared server, no data leaving your browser. This is a one-time setup.</p>
      <ol class="muted" style="line-height:1.9;">
        <li>Go to the <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noopener" style="color:var(--accent);text-decoration:underline;">Spotify Developer Dashboard</a> and create an app (any name).</li>
        <li>In the app's settings, add this exact <strong>Redirect URI</strong>:<br><code class="env">${esc(rUri)}</code></li>
        <li>Copy your <strong>Client ID</strong> and paste it below. (No client secret needed — this app uses PKCE.)</li>
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
      <span class="wordmark-hero"><img src="assets/dd-logo.png" alt="" class="wordmark-hero-icon">DeepDive</span>
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
  root.innerHTML = `
    <div style="margin-top:40px; text-align:center;">
      <span class="wordmark-hero"><img src="assets/dd-logo.png" alt="" class="wordmark-hero-icon">DeepDive</span>
    </div>
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
      <div class="settings-panel" id="settings-panel">
        <div class="settings-panel-title">Search options</div>
        <div class="filter-options">
          <label class="checkbox-option"><input type="checkbox" id="opt-live"> Exclude live recordings</label>
          <label class="checkbox-option"><input type="checkbox" id="opt-censored"> Exclude radio edits &amp; censored versions</label>
          <label class="checkbox-option"><input type="checkbox" id="opt-instrumental"> Exclude instrumentals</label>
          <label class="checkbox-option"><input type="checkbox" id="opt-acappella"> Exclude a cappella versions</label>
          <label class="checkbox-option"><input type="checkbox" id="opt-remaster"> Count remasters as duplicates</label>
        </div>
      </div>
    </div>
    <div id="todive-row"></div>
    <div id="suggestions-row"></div>`;

  wireSearchBar();
  renderToDiveRow();
  loadSuggestions();
}

function readOptions() {
  return {
    excludeLive: !!document.getElementById("opt-live")?.checked,
    excludeCensored: !!document.getElementById("opt-censored")?.checked,
    excludeInstrumental: !!document.getElementById("opt-instrumental")?.checked,
    excludeAcappella: !!document.getElementById("opt-acappella")?.checked,
    matchRemasters: !!document.getElementById("opt-remaster")?.checked,
  };
}

function wireSearchBar() {
  const input = document.getElementById("artist-input");
  const goBtn = document.getElementById("search-go-btn");
  const list = document.getElementById("autofill-list");
  const settingsBtn = document.getElementById("settings-toggle-btn");
  const panel = document.getElementById("settings-panel");

  // settings panel toggle
  settingsBtn.addEventListener("click", (e) => { e.stopPropagation(); panel.classList.toggle("open"); });
  document.addEventListener("click", (e) => { if (!panel.contains(e.target) && e.target !== settingsBtn) panel.classList.remove("open"); });

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
        list.innerHTML = items.map((it, i) => `<div class="autofill-item" data-i="${i}">${it.image_url ? `<img src="${esc(it.image_url)}" alt="">` : ""}<span>${esc(it.name)}</span></div>`).join("");
        list.classList.add("open");
        active = -1;
        list.querySelectorAll(".autofill-item").forEach((el) => {
          el.addEventListener("mousedown", (ev) => { ev.preventDefault(); choose(items[+el.dataset.i]); });
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

function renderToDiveRow() {
  const pending = watchlist.listPending();
  const el = document.getElementById("todive-row");
  if (!pending.length) { el.innerHTML = ""; return; }
  el.innerHTML = `
    <p class="crate-note" style="margin-top:32px; text-align:center;">From your To-Dive list:</p>
    <div class="pill-row" style="justify-content:center;">
      ${pending.map((e) => `
        <div class="pill-wrap">
          <button class="pill" data-search="${esc(e.name)}">${e.image_url ? `<img src="${esc(e.image_url)}" alt="" class="pill-avatar">` : ""}${esc(e.name)}</button>
          <button class="pill-icon-btn done-btn" data-done="${esc(e.id)}" title="Mark as dove into">&#10003;</button>
        </div>`).join("")}
    </div>`;
  el.querySelectorAll("[data-search]").forEach((b) => b.addEventListener("click", () => startSearch(b.dataset.search)));
  el.querySelectorAll("[data-done]").forEach((b) => b.addEventListener("click", () => { watchlist.toggleStatus(b.dataset.done); renderToDiveRow(); loadSuggestions(); }));
}

async function loadSuggestions() {
  const el = document.getElementById("suggestions-row");
  if (!el) return;
  const pendingNames = new Set(watchlist.listPending().map((e) => e.name.trim().toLowerCase()));
  const doneNames = new Set(watchlist.listDone().map((e) => e.name.trim().toLowerCase()));
  try {
    const [top, recent] = await Promise.all([
      client.getTopArtists("medium_term", 10),
      client.getRecentlyPlayedArtists(50),
    ]);
    const seen = new Map();
    const smallest = (imgs) => (imgs && imgs.length ? imgs[imgs.length - 1].url : null);
    for (const a of top) if (!seen.has(a.id)) seen.set(a.id, { id: a.id, name: a.name, image_url: smallest(a.images) });
    for (const a of recent) if (!seen.has(a.id)) seen.set(a.id, { id: a.id, name: a.name, image_url: null });

    let suggestions = Array.from(seen.values()).filter(
      (s) => !pendingNames.has(s.name.trim().toLowerCase()) && !doneNames.has(s.name.trim().toLowerCase())
    ).slice(0, 12);

    // fill missing images
    const missing = suggestions.filter((s) => !s.image_url).map((s) => s.id);
    if (missing.length) {
      try {
        const details = await client.getArtistsByIds(missing);
        const byId = new Map(details.map((a) => [a.id, smallest(a.images)]));
        for (const s of suggestions) if (!s.image_url) s.image_url = byId.get(s.id) || null;
      } catch (e) { /* photos optional */ }
    }

    if (!suggestions.length) { el.innerHTML = ""; return; }
    el.innerHTML = `
      <p class="crate-note" style="margin-top:28px; text-align:center;">Based on what you've been listening to:</p>
      <div class="pill-row" style="justify-content:center;">
        ${suggestions.map((s) => `
          <div class="pill-wrap">
            <button class="pill" data-search="${esc(s.name)}">${s.image_url ? `<img src="${esc(s.image_url)}" alt="" class="pill-avatar">` : ""}${esc(s.name)}</button>
            <button class="pill-icon-btn" data-add="${esc(s.name)}" data-sid="${esc(s.id)}" data-img="${esc(s.image_url || "")}" title="Add to To-Dive list">+</button>
          </div>`).join("")}
      </div>`;
    el.querySelectorAll("[data-search]").forEach((b) => b.addEventListener("click", () => startSearch(b.dataset.search)));
    el.querySelectorAll("[data-add]").forEach((b) => b.addEventListener("click", () => {
      watchlist.add(b.dataset.add, { spotifyId: b.dataset.sid || null, imageUrl: b.dataset.img || null });
      flash(`Added ${b.dataset.add} to your To-Dive list.`);
      renderToDiveRow(); loadSuggestions();
    }));
  } catch (e) {
    el.innerHTML = `<p class="crate-note" style="margin-top:28px; text-align:center;">Couldn't load suggestions right now.</p>`;
  }
}

// ============================================================
// Search run (progress -> results)
// ============================================================
async function startSearch(artistName) {
  renderProgress(`Digging through ${artistName}…`);
  const opts = readOptions();
  try {
    const result = await search.runSearch(client, artistName, {
      ...opts,
      onProgress: (pct, stage) => updateProgress(pct, stage),
    });
    lastResult = result;
    renderResults(result);
  } catch (e) {
    renderProgressError(e.message || String(e));
  }
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
function renderProgressError(msg) {
  setTitle("DeepDive · Error");
  const box = document.getElementById("prog-error");
  const back = document.getElementById("prog-back");
  if (box) { box.classList.remove("hidden"); box.textContent = `Something went wrong: ${msg}`; }
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
            <option value="found">As found</option>
            <option value="date-desc">Release date (newest)</option>
            <option value="date-asc">Release date (oldest)</option>
            <option value="title">Title (A–Z)</option>
          </select>
        </div>
        <label class="checkbox-option" style="margin-bottom:8px;"><input type="checkbox" id="build-playlist" checked> Build a playlist from the checked new tracks</label>
        <div id="new-list">${news.map((t) => trackRow(t, { cls: "newt" })).join("")}</div>
      ` : `<p class="empty-note">Nothing new — your library already covers this artist.</p>`}

      <div class="playlist-name-field" id="playlist-name-wrap">
        <label>Playlist name</label>
        <input type="text" id="playlist-name" value="DeepDive · ${esc(artistName)}">
      </div>

      <div class="actions">
        <button class="btn btn-primary" id="confirm-btn">Apply</button>
        <button class="btn btn-ghost" data-home>Back to search</button>
      </div>
      <div class="flash hidden" id="result-msg" style="margin-top:18px;"></div>
    </div>`;

  root.querySelector("[data-home]").addEventListener("click", () => renderHome());

  // sort
  const sortSel = document.getElementById("new-sort");
  if (sortSel) {
    const listEl = document.getElementById("new-list");
    sortSel.addEventListener("change", () => {
      const rows = Array.from(listEl.children);
      const mode = sortSel.value;
      const orig = rows.map((r, i) => [r, i]);
      orig.sort((a, b) => {
        if (mode === "date-desc") return (b[0].dataset.rd || "").localeCompare(a[0].dataset.rd || "");
        if (mode === "date-asc") return (a[0].dataset.rd || "").localeCompare(b[0].dataset.rd || "");
        if (mode === "title") return (a[0].dataset.title || "").localeCompare(b[0].dataset.title || "");
        return a[1] - b[1];
      });
      orig.forEach(([row]) => listEl.appendChild(row));
    });
  }

  document.getElementById("confirm-btn").addEventListener("click", () => applyResults(r));
}

async function applyResults(r) {
  const btn = document.getElementById("confirm-btn");
  const msg = document.getElementById("result-msg");
  btn.disabled = true;

  // Gather checked duplicates (to like) + checked new tracks (playlist, and liked too).
  const dupIds = Array.from(document.querySelectorAll("[data-dup]:checked")).map((c) => c.dataset.dup);
  const newIds = Array.from(document.querySelectorAll("[data-tid]:checked")).map((c) => c.dataset.tid);
  const buildPlaylist = !!document.getElementById("build-playlist")?.checked;
  const playlistName = (document.getElementById("playlist-name")?.value || "").trim() || `DeepDive · ${r.artist ? r.artist.name : ""}`;

  const toLike = dupIds.slice(); // duplicates get liked
  const parts = [];
  try {
    if (toLike.length) { await client.likeTracks(toLike); parts.push(`Liked ${toLike.length} track${toLike.length === 1 ? "" : "s"}.`); }

    if (buildPlaylist && newIds.length) {
      const res = await client.addTracksToPlaylistDeduped(playlistName, `New-to-you tracks by ${r.artist ? r.artist.name : ""}, found by DeepDive.`, newIds);
      parts.push(`Playlist ${res.reused ? "updated" : "created"}: added ${res.added_count}${res.already_present_count ? `, ${res.already_present_count} already present` : ""}.`);
      msg.innerHTML = `${esc(parts.join(" "))} <a href="${esc(res.url)}" target="_blank" rel="noopener" style="color:var(--accent);text-decoration:underline;">Open playlist</a>`;
    } else {
      msg.textContent = parts.length ? parts.join(" ") : "Nothing selected.";
    }
    msg.classList.remove("hidden", "error");
  } catch (e) {
    msg.textContent = `Something went wrong: ${e.message || e}`;
    msg.classList.remove("hidden");
    msg.classList.add("error");
  } finally {
    btn.disabled = false;
  }
}

// ============================================================
// Full library scrub
// ============================================================
function renderScrubForm() {
  setTitle("DeepDive · Full library scan");
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
  };
  scrubCancel = { cancelled: false };
  renderProgress("Scanning your whole library…");
  // add a cancel button to the progress card
  const backSlot = document.getElementById("prog-back");
  backSlot.classList.remove("hidden");
  backSlot.innerHTML = `<button class="btn btn-ghost" id="scrub-cancel">Cancel &amp; show what's found</button>`;
  document.getElementById("scrub-cancel").addEventListener("click", () => { scrubCancel.cancelled = true; });

  try {
    const result = await search.runFullScrub(client, {
      ...opts,
      onProgress: (pct, stage) => updateProgress(pct, stage),
      isCancelled: () => scrubCancel.cancelled,
    });
    lastResult = result;
    renderScrubResults(result);
  } catch (e) {
    renderProgressError(e.message || String(e));
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
      <div class="crate-header"><span class="label gold">New to you</span><span class="rule"></span></div>
      ${news.length ? `
        <div class="sort-row">
          <label for="new-sort">Sort by</label>
          <select id="new-sort" class="sort-select">
            <option value="found">As found</option>
            <option value="date-desc">Release date (newest)</option>
            <option value="date-asc">Release date (oldest)</option>
            <option value="title">Title (A–Z)</option>
          </select>
        </div>
        <label class="checkbox-option" style="margin-bottom:8px;"><input type="checkbox" id="build-playlist" checked> Build a playlist from these</label>
        <div id="new-list">${news.map((t) => trackRow(t, { cls: "newt", sub: `${(t.artists && t.artists[0] && t.artists[0].name) || ""} · ${(t.album && t.album.name) || ""}` })).join("")}</div>
        <div class="playlist-name-field"><label>Playlist name</label><input type="text" id="playlist-name" value="DeepDive · Library scrub"></div>
        <div class="actions"><button class="btn btn-primary" id="scrub-build">Build playlist</button><button class="btn btn-ghost" data-home>Back to search</button></div>
        <div class="flash hidden" id="result-msg" style="margin-top:18px;"></div>
      ` : `<p class="empty-note">Nothing new found.</p><div class="actions"><button class="btn btn-ghost" data-home>Back to search</button></div>`}
    </div>`;
  root.querySelector("[data-home]")?.addEventListener("click", () => renderHome());

  const sortSel = document.getElementById("new-sort");
  if (sortSel) {
    const listEl = document.getElementById("new-list");
    sortSel.addEventListener("change", () => {
      const rows = Array.from(listEl.children).map((r, i) => [r, i]);
      const mode = sortSel.value;
      rows.sort((a, b) => {
        if (mode === "date-desc") return (b[0].dataset.rd || "").localeCompare(a[0].dataset.rd || "");
        if (mode === "date-asc") return (a[0].dataset.rd || "").localeCompare(b[0].dataset.rd || "");
        if (mode === "title") return (a[0].dataset.title || "").localeCompare(b[0].dataset.title || "");
        return a[1] - b[1];
      });
      rows.forEach(([row]) => listEl.appendChild(row));
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
function renderWatchlist() {
  setTitle("DeepDive · To-Do List");
  const pending = watchlist.listPending();
  const done = watchlist.listDone();
  root.innerHTML = `
    <div class="card">
      <h1>To-Dive-Into List</h1>
      <p class="muted">Bands on your radar. Marking one as dove into stops it showing up in home-page recommendations. Stored in this browser only.</p>
      <div class="search-row" style="margin-top:16px;">
        <input type="text" id="wl-add-input" placeholder="e.g. Big Thief">
        <button class="btn btn-primary" id="wl-add-btn">Add</button>
      </div>
      ${pending.length ? `<div class="crate-header"><span class="label gold">To dive into</span><span class="rule"></span></div>
        ${pending.map((e) => watchlistRow(e, false)).join("")}` : `<p class="empty-note" style="margin-top:16px;">Nothing on your list yet.</p>`}
      ${done.length ? `<details style="margin-top:32px;"><summary class="crate-note mono" style="cursor:pointer;">Completed (${done.length})</summary>
        ${done.map((e) => watchlistRow(e, true)).join("")}</details>` : ""}
    </div>`;

  const addInput = document.getElementById("wl-add-input");
  const doAdd = () => { const n = addInput.value.trim(); if (!n) return flash("Type an artist name first.", true); watchlist.add(n); renderWatchlist(); };
  document.getElementById("wl-add-btn").addEventListener("click", doAdd);
  addInput.addEventListener("keydown", (e) => { if (e.key === "Enter") doAdd(); });

  root.querySelectorAll("[data-wl-search]").forEach((b) => b.addEventListener("click", () => startSearch(b.dataset.wlSearch)));
  root.querySelectorAll("[data-wl-toggle]").forEach((b) => b.addEventListener("click", () => { watchlist.toggleStatus(b.dataset.wlToggle); renderWatchlist(); }));
  root.querySelectorAll("[data-wl-remove]").forEach((b) => b.addEventListener("click", () => { watchlist.remove(b.dataset.wlRemove); renderWatchlist(); }));
}
function watchlistRow(e, isDone) {
  return `
    <div class="watchlist-row ${isDone ? "watchlist-done" : ""}">
      <span class="watchlist-name">${e.image_url ? `<img src="${esc(e.image_url)}" alt="" class="pill-avatar">` : ""}${esc(e.name)}</span>
      <div class="watchlist-actions">
        ${isDone ? "" : `<button class="btn btn-ghost btn-small" data-wl-search="${esc(e.name)}">Search now</button>`}
        <button class="btn btn-ghost btn-small" data-wl-toggle="${esc(e.id)}">${isDone ? "Undo" : "Mark as dove into"}</button>
        <button class="btn btn-ghost btn-small" data-wl-remove="${esc(e.id)}">Remove</button>
      </div>
    </div>`;
}

// ============================================================
// Boot
// ============================================================
async function render() {
  if (!auth.getClientId()) return renderSetup();
  if (!auth.isLoggedIn()) return renderConnect();
  return renderHome();
}

async function boot() {
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
