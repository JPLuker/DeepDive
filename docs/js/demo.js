/**
 * Demo mode — staged screens from an approved Spotify artist list.
 *
 * Screenshots of the real app expose whoever's library happens to be
 * loaded. This resolves only explicitly approved names so any screen can
 * be photographed with real Spotify artwork and metadata on demand.
 *
 * The previous version only swapped artist names into the suggestion
 * row, and did it with the pre-2.2 `pill` markup — so it rendered a UI
 * the app no longer has. Anything shot from it would have advertised
 * the wrong product.
 *
 * Artist names are controlled locally; app.js resolves only that
 * whitelist through the user's connected Spotify account. This keeps
 * screenshots approved while retaining real photography and metadata.
 *
 * Undocumented on purpose. Enable with `?demo=<screen>`:
 *   1 | home     the home screen
 *   results      a finished dive
 *   sampler      the sampler results dialog
 *   scan         full library scan results
 *   index        a menu of all of the above
 * Persists for the session.
 */

const KEY = "deepdive_demo_screen";
const ARTISTS_KEY = "deepdive_demo_artists";
const SEED_KEY = "deepdive_demo_seed";

const DEFAULT_ARTISTS = [
  "Fiona Apple", "Talking Heads", "Big Thief", "Wednesday",
  "MJ Lenderman", "Alvvays", "The Beths", "Sharon Van Etten",
  "Japanese Breakfast", "St. Vincent", "Mitski", "Soccer Mommy",
];

export function demoScreen() {
  try {
    const p = new URLSearchParams(window.location.search).get("demo");
    if (p !== null) {
      const screen = (p === "" || p === "1") ? "home" : p.trim().toLowerCase();
      sessionStorage.setItem(KEY, screen);
      return screen;
    }
    return sessionStorage.getItem(KEY);
  } catch (e) {
    return null;
  }
}

export function demoActive() {
  return !!demoScreen();
}

export function exitDemo() {
  try { sessionStorage.removeItem(KEY); } catch (e) {}
}

/** Names are the only demo setting kept long-term. Spotify data remains
 * session-only and is resolved by app.js when a staged screen needs it. */
export function artistNames() {
  try {
    const saved = JSON.parse(localStorage.getItem(ARTISTS_KEY) || "null");
    if (Array.isArray(saved) && saved.length) return saved;
  } catch (e) {}
  return DEFAULT_ARTISTS.slice();
}

export function setArtistNames(value) {
  const raw = Array.isArray(value) ? value : String(value || "").split(/[\n,]+/);
  const seen = new Set();
  const names = raw.map((n) => String(n || "").trim()).filter((n) => {
    const key = n.toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key); return true;
  });
  if (names.length < 4) throw new Error("Add at least four artists so each screen has some variety.");
  try { localStorage.setItem(ARTISTS_KEY, JSON.stringify(names)); } catch (e) {}
  return names;
}

function demoSeed() {
  try {
    let seed = parseInt(sessionStorage.getItem(SEED_KEY) || "0", 10);
    if (!seed) { seed = Date.now() >>> 0; sessionStorage.setItem(SEED_KEY, String(seed)); }
    return seed;
  } catch (e) { return 24681357; }
}

export function reshuffle() {
  try { sessionStorage.setItem(SEED_KEY, String((Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0)); } catch (e) {}
}

function hash(s) {
  let h = 2166136261;
  for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Stable within a session, different for each screen/section. */
export function namesFor(section, count = 6) {
  const names = artistNames();
  let state = (demoSeed() ^ hash(section)) >>> 0;
  const ranked = names.map((name) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return { name, rank: state };
  }).sort((a, b) => a.rank - b.rank).map((x) => x.name);
  return ranked.slice(0, Math.min(count, ranked.length));
}

export function searchNames(query, limit = 6) {
  const q = String(query || "").trim().toLowerCase();
  const names = artistNames();
  const matching = q ? names.filter((n) => n.toLowerCase().includes(q)) : [];
  const rest = namesFor(`search:${q}`, names.length).filter((n) => !matching.includes(n));
  return matching.concat(rest).slice(0, limit);
}

export function pinsFrom(artists) {
  return artists.slice(0, 3).map((a, i) => ({ ...a, id: a.id || `demo-pin-${i}` }));
}

const REASONS = ["1 song liked", "last added 2023", "played recently", "2 songs liked", "last added 2019"];
export function suggestionsFrom(artists) {
  return artists.map((a, i) => ({ ...a, id: a.id || `demo-suggestion-${i}`, reason: REASONS[i % REASONS.length] }));
}

export function resultsFrom(artist, tracks) {
  const usable = (tracks || []).slice(0, 9);
  const dups = usable.slice(0, 3).map((t, i) => ({
    track: t,
    matched_liked_track: { id: `demo-liked-${i}`, name: t.name },
    match_basis: i === 1 ? "96% title match" : "ISRC",
  }));
  return {
    artist: { ...artist, images: artist.image_url_large || artist.image_url ? [{ url: artist.image_url_large || artist.image_url }] : [] },
    already_liked_count: 24,
    excluded_count: 12,
    collapsed_count: 6,
    duplicate_candidates: dups,
    new_tracks: usable.slice(3),
  };
}

export function samplerFrom(groups) {
  const tracks = groups.flatMap((g) => (g.tracks || []).slice(0, 2));
  return {
    id: "sampler", title: "Sampler",
    subtitle: `a few tracks each from ${groups.length} artists you've barely heard`,
    simple: true, name: "DeepDive · Sampler", count: tracks.length, tracks,
  };
}

export function scanFrom(groups) {
  const results = resultsFrom(groups[0]?.artist || { name: "Demo artist" }, groups.flatMap((g) => g.tracks || []));
  return {
    artists_scanned: 214, artists_total: 214,
    duplicate_candidates: results.duplicate_candidates,
    new_tracks: results.new_tracks,
    per_artist_summary: groups.slice(0, 3).map((g, i) => ({ name: g.artist.name, matches: i + 1, new: (g.tracks || []).length })),
  };
}

/** The screens worth photographing, for the ?demo=index menu. */
export const DEMO_SCREENS = [
  ["home", "Home", "Pins, suggestions and the search field"],
  ["dive", "Dive in progress", "Full-screen progress with an approved artist"],
  ["mixes", "Mixes", "Recommended and Mix ideas with approved artists"],
  ["results", "Dive results", "A finished dive, with matches and new tracks"],
  ["sampler", "Sampler", "The mix dialog, with preview and naming"],
  ["scan", "Library scan", "Results across the whole library"],
  ["crate", "Crate", "Approved artists with an Up next section"],
  ["multidip", "Multi-Dip", "A staged bill with four approved artists"],
  ["settings", "Demo settings", "Edit the whitelist and shuffle assignments"],
];
