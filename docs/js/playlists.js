// The DeepDive playlists screen: every playlist DeepDive has made, with
// a date on each so old ones can go in one pass.
//
// Joseph, 23 Nov: the list used to open inside Settings, under the
// button. He wants it on its own screen, with a refresh for dive
// playlists and a way to drop ones older than 30 days.
//
// Spotify keeps no creation date on a playlist. History records when
// DeepDive made one, but only the last twenty actions, and nothing from
// before it kept a record. The fallback is when the first song went in:
// DeepDive fills a playlist the moment it creates it, and later
// additions go on the end. Dates are kept here once known, so each
// playlist costs one request, once.

import { pickDivePlaylists } from "./refresh.js";

export const PREFIX = "deepdive";
export const OLD_DAYS = 30;
const DATES_KEY = "deepdive_playlist_dates";
const DAY = 24 * 60 * 60 * 1000;

/**
 * Own playlists named "DeepDive…", newest first once dated. Dive
 * playlists are marked with their artist so the screen can offer a
 * refresh on them.
 */
export function deepdivePlaylists(own, divedNames = []) {
  const dives = new Map(pickDivePlaylists(own, divedNames).map((p) => [p.id, p]));
  const out = [];
  const seen = new Set();
  for (const p of own || []) {
    if (!p || !p.id || !p.name || seen.has(p.id)) continue;
    if (!p.name.trim().toLowerCase().startsWith(PREFIX)) continue;
    seen.add(p.id);
    const dive = dives.get(p.id);
    out.push({
      id: p.id,
      name: p.name.trim(),
      url: (p.external_urls || {}).spotify || null,
      tracks: (p.tracks || p.items || {}).total || 0,
      image: (p.images && p.images.length) ? p.images[p.images.length - 1].url : null,
      dive: dive ? { artistName: dive.artistName } : null,
    });
  }
  return out;
}

export function loadDates(storage = globalThis.localStorage) {
  try {
    const raw = JSON.parse(storage.getItem(DATES_KEY) || "{}");
    return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  } catch (e) { return {}; }
}

export function saveDates(dates, storage = globalThis.localStorage) {
  try { storage.setItem(DATES_KEY, JSON.stringify(dates)); } catch (e) { /* dates are a convenience */ }
}

/**
 * Dates known without asking Spotify: earlier lookups, then history's
 * record of what DeepDive created. An empty playlist is stored as ""
 * so it isn't asked about again; it has no date and is never "old".
 */
export function knownDates(list, stored = {}, created = []) {
  const made = new Map();
  for (const c of created || []) if (c && c.playlistId && c.at && !made.has(c.playlistId)) made.set(c.playlistId, c.at);
  const out = {};
  for (const p of list || []) {
    if (Object.prototype.hasOwnProperty.call(stored, p.id)) out[p.id] = stored[p.id];
    else if (made.has(p.id)) out[p.id] = made.get(p.id);
  }
  return out;
}

export function needsDate(list, dates) {
  return (list || []).filter((p) => !Object.prototype.hasOwnProperty.call(dates, p.id));
}

export function isOld(date, now = Date.now(), days = OLD_DAYS) {
  if (!date) return false;
  const t = Date.parse(date);
  return Number.isFinite(t) && now - t > days * DAY;
}

export function oldPlaylists(list, dates, now = Date.now(), days = OLD_DAYS) {
  return (list || []).filter((p) => isOld(dates[p.id], now, days));
}

/** Newest first; undated at the end, by name. */
export function sortByDate(list, dates) {
  const t = (p) => { const v = Date.parse(dates[p.id] || ""); return Number.isFinite(v) ? v : -Infinity; };
  return [...(list || [])].sort((a, b) => (t(b) - t(a)) || a.name.localeCompare(b.name));
}

export function ageLabel(date, now = Date.now()) {
  const t = Date.parse(date || "");
  if (!Number.isFinite(t)) return "";
  const days = Math.floor((now - t) / DAY);
  if (days < 1) return "today";
  if (days === 1) return "yesterday";
  if (days < 60) return `${days} days ago`;
  return new Date(t).toLocaleDateString(undefined, { month: "short", year: "numeric" });
}
