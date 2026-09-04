/**
 * Demo mode — staged screens with no Spotify calls.
 *
 * Screenshots of the real app expose whoever's library happens to be
 * loaded, and can't be taken at all while the quota is locked. This
 * substitutes fixed data so any screen can be photographed on demand.
 *
 * The previous version only swapped artist names into the suggestion
 * row, and did it with the pre-2.2 `pill` markup — so it rendered a UI
 * the app no longer has. Anything shot from it would have advertised
 * the wrong product.
 *
 * No artwork URLs anywhere. Tiles and rows fall back to the app's own
 * gradient-initial treatment, which keeps the screens self-contained,
 * avoids putting other people's album covers on a marketing page, and
 * means nothing here breaks when a CDN URL rots.
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

// Names are real artists; everything attached to them is invented. A
// reason line on every suggestion, because that's how the row actually
// behaves and a screenshot without them oversells the feature.
export const DEMO_PINS = [
  { id: "p1", name: "Fiona Apple", image_url: null },
  { id: "p2", name: "Talking Heads", image_url: null },
  { id: "p3", name: "Big Thief", image_url: null },
];

export const DEMO_SUGGESTIONS = [
  { id: "s1", name: "Wednesday", image_url: null, reason: "1 song liked" },
  { id: "s2", name: "MJ Lenderman", image_url: null, reason: "last added 2023" },
  { id: "s3", name: "Alvvays", image_url: null, reason: "you've been playing them" },
  { id: "s4", name: "The Beths", image_url: null, reason: "2 songs liked" },
  { id: "s5", name: "Sharon Van Etten", image_url: null, reason: "last added 2019" },
  { id: "s6", name: "Japanese Breakfast", image_url: null, reason: "1 song liked" },
];

const track = (id, name, album, ms, year) => ({
  id,
  name,
  duration_ms: ms,
  album: { id: `al-${id}`, name: album, release_date: `${year}-01-01`, image_url: null },
  artists: [{ id: "a1", name: "Fiona Apple" }],
});

export const DEMO_RESULTS = {
  artist: { id: "a1", name: "Fiona Apple", images: [] },
  already_liked_count: 24,
  excluded_count: 12,
  collapsed_count: 6,
  duplicate_candidates: [
    {
      track: track("d1", "Shameika", "Fetch the Bolt Cutters", 260000, 2020),
      matched_liked_track: { id: "x1", name: "Shameika" },
      match_basis: "ISRC",
    },
    {
      track: track("d2", "Paper Bag", "When the Pawn… (Reissue)", 219000, 2000),
      matched_liked_track: { id: "x2", name: "Paper Bag" },
      match_basis: "96% title match",
    },
    {
      track: track("d3", "Criminal", "Tidal — 25th Anniversary", 343000, 2021),
      matched_liked_track: { id: "x3", name: "Criminal" },
      match_basis: "ISRC",
    },
  ],
  new_tracks: [
    track("n1", "Fast As You Can", "When the Pawn…", 278000, 1999),
    track("n2", "I Know", "When the Pawn…", 295000, 1999),
    track("n3", "Werewolf", "The Idler Wheel…", 227000, 2012),
    track("n4", "Hot Knife", "The Idler Wheel…", 180000, 2012),
    track("n5", "Under the Table", "Fetch the Bolt Cutters", 221000, 2020),
    track("n6", "Ladies", "Fetch the Bolt Cutters", 202000, 2020),
  ],
};

const mixTrack = (id, name, artist, album, ms) => ({
  id, name, duration_ms: ms,
  artists: [{ id: `ar-${id}`, name: artist }],
  album: { id: `al-${id}`, name: album, image_url: null },
});

export const DEMO_SAMPLER_CARD = {
  id: "sampler",
  title: "Sampler",
  subtitle: "a few tracks each from 6 artists you've barely heard",
  simple: true,
  name: "DeepDive · Sampler 2026-09-04",
  count: 9,
  tracks: [
    mixTrack("m1", "Chosen to Deserve", "Wednesday", "Rat Saw God", 262000),
    mixTrack("m2", "Bull Believer", "Wednesday", "Rat Saw God", 508000),
    mixTrack("m3", "Formula One", "MJ Lenderman", "Manning Fireworks", 214000),
    mixTrack("m4", "She's Leaving You", "MJ Lenderman", "Manning Fireworks", 254000),
    mixTrack("m5", "Archie, Marry Me", "Alvvays", "Alvvays", 199000),
    mixTrack("m6", "Belinda Says", "Alvvays", "Blue Rev", 262000),
    mixTrack("m7", "Expert in a Dying Field", "The Beths", "Expert in a Dying Field", 216000),
    mixTrack("m8", "Seventeen", "Sharon Van Etten", "Remind Me Tomorrow", 285000),
    mixTrack("m9", "Be Sweet", "Japanese Breakfast", "Jubilee", 205000),
  ],
};

export const DEMO_SCAN = {
  artists_scanned: 214,
  artists_total: 214,
  duplicate_candidates: DEMO_RESULTS.duplicate_candidates,
  new_tracks: DEMO_RESULTS.new_tracks,
  per_artist_summary: [
    { name: "Fiona Apple", matches: 3, new: 6 },
    { name: "Talking Heads", matches: 1, new: 4 },
    { name: "Big Thief", matches: 2, new: 11 },
  ],
};

/** The screens worth photographing, for the ?demo=index menu. */
export const DEMO_SCREENS = [
  ["home", "Home", "Pins, suggestions and the search field"],
  ["results", "Dive results", "A finished dive, with matches and new tracks"],
  ["sampler", "Sampler", "The mix dialog, with preview and naming"],
  ["scan", "Library scan", "Results across the whole library"],
];
