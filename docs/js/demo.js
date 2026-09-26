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
 * Demo mode exists only while the URL contains `?demo`. Removing the
 * parameter must always return to the live app.
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
    // Demo is deliberately URL-scoped. An older build persisted this in
    // sessionStorage, which meant visiting ?demo once silently converted
    // the normal /app/ URL into demo mode for the rest of the tab.
    if (p === null) {
      try { sessionStorage.removeItem(KEY); } catch (e) {}
      return null;
    }
    return (p === "" || p === "1") ? "home" : p.trim().toLowerCase();
  } catch (e) {
    return null;
  }
}

export function demoActive() {
  return !!demoScreen();
}

export function exitDemo() {
  try { sessionStorage.removeItem(KEY); } catch (e) {}
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete("demo");
    window.history.replaceState({}, "", url.pathname + url.search + url.hash);
  } catch (e) {}
}

/** The approved Spotify identities are kept long-term. Older builds stored
 * bare names; accept those so an existing demo list migrates in place. */
export function approvedArtists() {
  try {
    const saved = JSON.parse(localStorage.getItem(ARTISTS_KEY) || "null");
    if (Array.isArray(saved) && saved.length) return saved.map((a) =>
      typeof a === "string" ? { id: null, name: a } : a
    ).filter((a) => a && a.name);
  } catch (e) {}
  return DEFAULT_ARTISTS.map((name) => ({ id: null, name }));
}

export function artistNames() {
  return approvedArtists().map((a) => a.name);
}

export function setApprovedArtists(value) {
  const raw = Array.isArray(value) ? value : [];
  const seen = new Set();
  const artists = raw.map((a) => typeof a === "string" ? { id: null, name: a } : a)
    .map((a) => ({
      id: a && a.id ? String(a.id) : null,
      name: String(a && a.name || "").trim(),
      image_url: a && a.image_url ? String(a.image_url) : null,
      image_url_large: a && a.image_url_large ? String(a.image_url_large) : null,
    })).filter((a) => {
      const key = a.id || a.name.toLowerCase();
      if (!a.name || seen.has(key)) return false;
      seen.add(key); return true;
    });
  if (artists.length < 4) throw new Error("Add at least four artists so each screen has some variety.");
  try { localStorage.setItem(ARTISTS_KEY, JSON.stringify(artists)); } catch (e) {}
  return artists;
}

export function setArtistNames(value) {
  const raw = Array.isArray(value) ? value : String(value || "").split(/[\n,]+/);
  const seen = new Set();
  const names = raw.map((n) => String(n || "").trim()).filter((n) => {
    const key = n.toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key); return true;
  });
  setApprovedArtists(names);
  return names;
}

export function approvedArtist(name) {
  const key = String(name || "").trim().toLowerCase();
  return approvedArtists().find((a) => a.name.toLowerCase() === key) || null;
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
  const usable = (tracks || []).slice(0, 10);
  const dups = usable.slice(0, 3).map((t, i) => ({
    track: t,
    matched_liked_track: {
      id: `demo-liked-${i}`,
      name: i === 0 ? `${t.name} (Album Version)` : (i === 1 ? `${t.name} — Remastered` : t.name),
    },
    match_basis: i === 1 ? "96% title match" : "ISRC",
  }));
  const photo = artist.image_url_large || artist.image_url || (artist.images && artist.images[0] && artist.images[0].url) || null;
  return {
    artist: { ...artist, image_url_large: photo, images: photo ? [{ url: photo }] : [] },
    already_liked_count: 11,
    excluded_count: 4,
    collapsed_count: 2,
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
    tracks_scanned: 6842,
    duplicate_candidates: results.duplicate_candidates,
    new_tracks: [],
  };
}

/** The screens worth photographing, for the ?demo=index menu. */
export const DEMO_SCREENS = [
  ["home", "Home", "Pins, suggestions and the search field"],
  ["chooser", "Dive chooser", "Dip, Dive and Multi-Dip for an approved artist"],
  ["dive", "Dive in progress", "Full-screen progress with an approved artist"],
  ["mixes", "Mixes", "Recommended and Mix ideas with approved artists"],
  ["results", "Dive results", "A finished dive, with matches and new tracks"],
  ["sampler", "Sampler", "The mix dialog, with preview and naming"],
  ["scan", "Library scan", "Results across the whole library"],
  ["crate", "Crate", "Approved artists with an Up next section"],
  ["multidip", "Multi-Dip", "A staged bill with four approved artists"],
  ["settings", "Demo settings", "Edit the whitelist and shuffle assignments"],
];
