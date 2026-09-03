/**
 * watchlist.js — client-side port of watchlist.py.
 *
 * The "To-Dive-Into" list. Server version persisted to watchlist.json on
 * disk; this persists to localStorage instead. That's a real behavioral
 * difference worth stating plainly (and the UI should): the list is now
 * per-browser, not per-machine — clearing browser data wipes it, and it
 * doesn't sync across browsers/devices. (See CLIENT_MIGRATION_PLAN.md;
 * export/import is a possible later addition.)
 *
 * Same shape as the Python entries: {id, name, status, added_at,
 * spotify_id, image_url}. Same rules: dedup by case-insensitive name,
 * newest-first ordering, pending/done status.
 */

const KEY = "deepdive_watchlist";

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch (e) {
    // Corrupted value shouldn't take down the page — treat as empty,
    // mirroring the Python's tolerance of an unreadable watchlist.json.
    return [];
  }
}

function save(entries) {
  localStorage.setItem(KEY, JSON.stringify(entries));
}

function uuidHex() {
  // 32 hex chars, like Python's uuid4().hex. Uses crypto if available.
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const b = crypto.getRandomValues(new Uint8Array(16));
    return Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join("");
  }
  let s = "";
  for (let i = 0; i < 32; i++) s += Math.floor(Math.random() * 16).toString(16);
  return s;
}

export function listEntries() {
  const entries = load();
  // Newest-added first (Python sorts by added_at desc).
  return entries.slice().sort((a, b) => (b.added_at || "").localeCompare(a.added_at || ""));
}

export function listPending() {
  return listEntries().filter((e) => e.status !== "done");
}

export function listDone() {
  return listEntries().filter((e) => e.status === "done");
}

export function add(name, { spotifyId = null, imageUrl = null, imageUrlLarge = null } = {}) {
  name = (name || "").trim();
  if (!name) return;
  const entries = load();
  if (entries.some((e) => (e.name || "").trim().toLowerCase() === name.toLowerCase())) {
    return; // already on the list
  }
  entries.push({
    id: uuidHex(),
    name,
    status: "pending",
    added_at: new Date().toISOString(),
    spotify_id: spotifyId,
    image_url: imageUrl,
    // The tile copy is 160px. Kept separately so a dive launched from a
    // pin gets the full-size photo instead of upscaling the thumbnail.
    image_url_large: imageUrlLarge,
  });
  save(entries);
}

export function setDetails(entryId, spotifyId, imageUrl) {
  const entries = load();
  for (const e of entries) {
    if (e.id === entryId) {
      e.spotify_id = spotifyId;
      e.image_url = imageUrl;
      break;
    }
  }
  save(entries);
}

export function toggleStatus(entryId) {
  const entries = load();
  for (const e of entries) {
    if (e.id === entryId) {
      e.status = e.status === "pending" ? "done" : "pending";
      break;
    }
  }
  save(entries);
}

export function remove(entryId) {
  save(load().filter((e) => e.id !== entryId));
}

// ---------------------------------------------------------------------
// Blocklist
// ---------------------------------------------------------------------
// "Never suggest this artist again." Not a developer tool — people have
// artists they'd rather not be shown, for all sorts of reasons, and a
// recommendation system without a permanent dismiss will keep serving
// the same unwanted name forever.

const BLOCK_KEY = "deepdive_blocklist";

function loadBlocked() {
  try {
    const raw = localStorage.getItem(BLOCK_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch (e) {
    return [];
  }
}

export function listBlocked() {
  return loadBlocked();
}

export function block(name, spotifyId = null) {
  name = (name || "").trim();
  if (!name) return;
  const list = loadBlocked();
  if (list.some((b) => (b.name || "").trim().toLowerCase() === name.toLowerCase())) return;
  list.push({ name, spotify_id: spotifyId, at: new Date().toISOString() });
  localStorage.setItem(BLOCK_KEY, JSON.stringify(list));
}

export function unblock(name) {
  const target = (name || "").trim().toLowerCase();
  localStorage.setItem(
    BLOCK_KEY,
    JSON.stringify(loadBlocked().filter((b) => (b.name || "").trim().toLowerCase() !== target))
  );
}

/** Fast lookup set of blocked names, lowercased. */
export function blockedNameSet() {
  return new Set(loadBlocked().map((b) => (b.name || "").trim().toLowerCase()));
}

// ---------------------------------------------------------------------
// Pins
// ---------------------------------------------------------------------
// Pins are the To-Dive list, surfaced properly. The storage and shape are
// unchanged, so existing entries carry over untouched — only the
// presentation moves: from a page buried in the nav drawer to the top of
// the recommendation row, where they're actually visible.

export const pinned = listPending;
export const pin = add;
export const unpin = remove;

/** Is this artist already pinned? Name match, case-insensitive. */
export function isPinned(name) {
  const target = (name || "").trim().toLowerCase();
  return listEntries().some((e) => (e.name || "").trim().toLowerCase() === target);
}

/** Find a pin entry by artist name, for unpinning after a dive. */
export function findPinByName(name) {
  const target = (name || "").trim().toLowerCase();
  return listEntries().find((e) => (e.name || "").trim().toLowerCase() === target) || null;
}

/** Clear every pin — the "wipe all" affordance in settings. */
export function clearAllPins() {
  save([]);
}
