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

export function add(name, { spotifyId = null, imageUrl = null } = {}) {
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
