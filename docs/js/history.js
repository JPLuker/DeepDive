/**
 * history.js — what DeepDive has done, and how to undo it.
 *
 * Two separate logs with different purposes:
 *
 *   Dives    — a record of what was searched and what it found. Read-only
 *              history; useful for "have I done this one?" and re-diving.
 *   Actions  — things that changed the user's Spotify account, kept so
 *              they can be reversed. Spotify offers no bulk unlike, so
 *              undoing forty likes by hand is genuinely painful, and
 *              DeepDive is the only thing that knows exactly which forty.
 *
 * Both live in localStorage: per-browser, no backend, and small enough
 * that size isn't a concern at the caps below.
 */

const DIVES_KEY = "deepdive_dives";
const ACTIONS_KEY = "deepdive_actions";

// Caps so a long-lived install can't grow the store without limit.
// History is a convenience, not an archive.
const MAX_DIVES = 100;
const MAX_ACTIONS = 20;

function load(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch (e) {
    // A corrupted log shouldn't take down the app; treat it as empty.
    return [];
  }
}

function save(key, list) {
  try { localStorage.setItem(key, JSON.stringify(list)); } catch (e) {}
}

function uid() {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const b = crypto.getRandomValues(new Uint8Array(8));
    return Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join("");
  }
  return String(Date.now()) + Math.random().toString(16).slice(2);
}

// ---------------------------------------------------------------------
// Dives
// ---------------------------------------------------------------------

/** Record a completed dive. Newest first. */
export function recordDive({ artistId, artistName, imageUrl, duplicates, newTracks, alreadyLiked }) {
  if (!artistName) return;
  const list = load(DIVES_KEY);
  // Collapse repeats of the same artist rather than accumulating an
  // entry per dive — the useful question is "when did I last do this
  // and what did it find", not every attempt.
  const filtered = list.filter((d) => (d.artistName || "").toLowerCase() !== artistName.toLowerCase());
  filtered.unshift({
    id: uid(),
    artistId: artistId || null,
    artistName,
    imageUrl: imageUrl || null,
    at: new Date().toISOString(),
    duplicates: duplicates || 0,
    newTracks: newTracks || 0,
    alreadyLiked: alreadyLiked || 0,
  });
  save(DIVES_KEY, filtered.slice(0, MAX_DIVES));
}

export function listDives() {
  return load(DIVES_KEY);
}

export function clearDives() {
  save(DIVES_KEY, []);
}

// ---------------------------------------------------------------------
// Undoable actions
// ---------------------------------------------------------------------

/**
 * Record something that changed the account.
 *
 * Only likes are reversible. A created playlist is deliberately recorded
 * as non-undoable: deleting a playlist someone may have since edited,
 * shared, or added to is destructive in a way that removing a like
 * isn't, and "undo" should never be the riskier option.
 */
export function recordAction({ type, label, trackIds, undoable = true }) {
  const list = load(ACTIONS_KEY);
  list.unshift({
    id: uid(),
    type,
    label,
    trackIds: trackIds || [],
    at: new Date().toISOString(),
    undoable: !!undoable,
    undone: false,
  });
  save(ACTIONS_KEY, list.slice(0, MAX_ACTIONS));
}

export function listActions() {
  return load(ACTIONS_KEY);
}

/** The most recent action that can still be undone, if any. */
export function lastUndoable() {
  return load(ACTIONS_KEY).find((a) => a.undoable && !a.undone) || null;
}

export function markUndone(id) {
  const list = load(ACTIONS_KEY);
  for (const a of list) if (a.id === id) a.undone = true;
  save(ACTIONS_KEY, list);
}

export function clearActions() {
  save(ACTIONS_KEY, []);
}

// ---------------------------------------------------------------------
// Export / import
// ---------------------------------------------------------------------

/**
 * Everything worth carrying between browsers. Deliberately excludes the
 * library cache — it's large, it's rebuildable from Spotify in one read,
 * and shipping thousands of tracks through a text file to save one sync
 * is a poor trade. Auth tokens are excluded too: they're credentials,
 * and they'd be invalid on another device anyway.
 */
const PORTABLE_KEYS = [
  "deepdive_watchlist",     // pins
  "deepdive_blocklist",
  "deepdive_dives",
  "deepdive_actions",
  "deepdive_theme",
  "deepdive_show_bmc",
  "deepdive_intent",
  "deepdive_intent_skip",
  "deepdive_intent_custom",
];

export function exportData() {
  const data = {};
  for (const k of PORTABLE_KEYS) {
    try {
      const v = localStorage.getItem(k);
      if (v !== null) data[k] = v;
    } catch (e) {}
  }
  return {
    format: "deepdive-backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    data,
  };
}

/**
 * @param mode "merge" keeps existing pins and adds any that are missing;
 *   "replace" overwrites. Merge is the default because importing on a
 *   device that already has pins shouldn't silently discard them.
 * @returns a summary of what changed, so the UI can report it rather
 *   than claiming success blindly.
 */
export function importData(payload, { mode = "merge" } = {}) {
  if (!payload || payload.format !== "deepdive-backup" || !payload.data) {
    throw new Error("That doesn't look like a DeepDive backup file.");
  }
  const incoming = payload.data;
  const summary = { pins: 0, blocked: 0, dives: 0, settings: 0 };

  const mergeList = (key, matchOn) => {
    let theirs = [];
    try { theirs = JSON.parse(incoming[key] || "[]"); } catch (e) { return 0; }
    if (!Array.isArray(theirs)) return 0;
    if (mode === "replace") {
      save(key, theirs);
      return theirs.length;
    }
    let mine = load(key);
    const seen = new Set(mine.map((x) => String(x[matchOn] || "").trim().toLowerCase()));
    let added = 0;
    for (const item of theirs) {
      const k = String(item[matchOn] || "").trim().toLowerCase();
      if (!k || seen.has(k)) continue;
      seen.add(k);
      mine.push(item);
      added += 1;
    }
    save(key, mine);
    return added;
  };

  summary.pins = mergeList("deepdive_watchlist", "name");
  summary.blocked = mergeList("deepdive_blocklist", "name");
  summary.dives = mergeList("deepdive_dives", "artistName");

  for (const k of ["deepdive_theme", "deepdive_show_bmc", "deepdive_intent",
                   "deepdive_intent_skip", "deepdive_intent_custom"]) {
    if (incoming[k] === undefined) continue;
    // Settings are single values, so merging is meaningless — only take
    // them when explicitly replacing.
    if (mode === "replace") {
      try { localStorage.setItem(k, incoming[k]); summary.settings += 1; } catch (e) {}
    }
  }
  return summary;
}
