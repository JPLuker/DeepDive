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

function openDb() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbPromise;
}

export const idbStore = {
  async get(key) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result === undefined ? null : req.result);
      req.onerror = () => reject(req.error);
    });
  },
  async set(key, value) {
    const db = await openDb();
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
export function bestStore() {
  try {
    if (typeof indexedDB !== "undefined") return idbStore;
  } catch (e) {}
  return makeMemoryStore();
}
