/**
 * storage.js — a tiny async key/value store on IndexedDB.
 *
 * Matches the { get(key), set(key, value) } interface LibraryCache
 * expects. IndexedDB (not localStorage) because a liked library can be
 * tens of thousands of tracks — well past localStorage's ~5MB ceiling,
 * and its synchronous API would jank the UI on big writes.
 *
 * BROWSER-ONLY: uses indexedDB, so it can't run under Node. The
 * LibraryCache logic is tested with an in-memory store instead; this
 * adapter is verified live in the browser.
 */

const DB_NAME = "deepdive";
const STORE = "kv";
const VERSION = 1;

let _dbPromise = null;

// A blocked IndexedDB can fire neither onsuccess nor onerror — the
// request just sits there. Awaiting that hangs the caller forever with
// no error to catch, which is far worse than failing: the UI shows
// nothing and reports nothing. Brave and similar privacy-focused
// browsers do this. Everything below exists so that can't happen.
const OPEN_TIMEOUT_MS = 3000;
const OP_TIMEOUT_MS = 5000;

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`IndexedDB ${label} timed out`)), ms)),
  ]);
}

function openDb() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = withTimeout(new Promise((resolve, reject) => {
    let req;
    try {
      req = indexedDB.open(DB_NAME, VERSION);
    } catch (e) {
      reject(e);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("IndexedDB open failed"));
    // Fires when another tab holds an older version open. Without this
    // it's another silent hang.
    req.onblocked = () => reject(new Error("IndexedDB blocked by another tab"));
  }), OPEN_TIMEOUT_MS, "open");

  // Don't cache a rejected promise — otherwise one blocked attempt
  // poisons every later call for the life of the page.
  _dbPromise.catch(() => { _dbPromise = null; });
  return _dbPromise;
}

export const idbStore = {
  async get(key) {
    const db = await withTimeout(openDb(), OPEN_TIMEOUT_MS, "open");
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result === undefined ? null : req.result);
      req.onerror = () => reject(req.error);
    });
  },
  async set(key, value) {
    const db = await withTimeout(openDb(), OPEN_TIMEOUT_MS, "open");
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      // Storing null is our "clear" convention.
      if (value === null) tx.objectStore(STORE).delete(key);
      else tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },
};

/**
 * Fallback for environments without IndexedDB (private-mode quirks,
 * etc.) — an in-memory store so the app still works, just without
 * cross-session persistence. LibraryCache handles a fresh/empty store
 * fine (it just does a full read).
 */
export function makeMemoryStore() {
  const m = new Map();
  return {
    async get(k) { return m.has(k) ? m.get(k) : null; },
    async set(k, v) { if (v === null) m.delete(k); else m.set(k, v); },
  };
}

/** Pick the best available store. */
/**
 * A store that tries IndexedDB but silently falls back to memory on any
 * failure OR timeout. The presence of `indexedDB` is not evidence that
 * it works — privacy browsers expose the API and then block the
 * operations — so this degrades on behaviour rather than on feature
 * detection. Losing persistence is a minor cost; hanging the UI is not.
 */
export function bestStore() {
  let usable = null; // null = untested, true/false once known
  const mem = makeMemoryStore();

  const tryIdb = async (fn, fallback) => {
    if (usable === false) return fallback();
    try {
      const result = await withTimeout(fn(), OP_TIMEOUT_MS, "operation");
      usable = true;
      return result;
    } catch (e) {
      if (usable === null) {
        usable = false;
        console.warn("[DeepDive] IndexedDB unavailable, using in-memory storage:", e && e.message);
      }
      return fallback();
    }
  };

  try {
    if (typeof indexedDB === "undefined") return mem;
  } catch (e) {
    return mem;
  }

  return {
    async get(k) { return tryIdb(() => idbStore.get(k), () => mem.get(k)); },
    async set(k, v) { await mem.set(k, v); return tryIdb(() => idbStore.set(k, v), () => undefined); },
  };
}
