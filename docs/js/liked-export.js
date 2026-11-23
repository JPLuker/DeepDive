// Liked Songs as a CSV, the way Exportify lays one out.
//
// Joseph, 23 Nov: Exportify didn't work for him, and he wants the whole
// list to sort into radio stations. Spotify's own genres would cost a
// request per artist (batch ?ids= is 403 in Dev Mode), so Genres comes
// from Last.fm tags DeepDive already has. Pure, so it's testable.

export const LIKED_CSV_HEADERS = [
  "Track URI", "Track Name", "Artist Name(s)", "Album Name", "Album Release Date",
  "Duration (ms)", "Added At", "ISRC", "Genres", "Spotify URL",
];

const GENRES_PER_SONG = 5;

function quote(v) {
  return `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
}

/** The strongest few tags for the song's first-credited artist. */
export function genresFor(track, tagsByArtist) {
  const first = (track.artists && track.artists[0] && track.artists[0].name) || "";
  const tags = tagsByArtist && tagsByArtist.get(first.trim().toLowerCase());
  if (!Array.isArray(tags)) return [];
  const seen = new Set();
  const out = [];
  for (const t of [...tags].sort((a, b) => (b.weight || 0) - (a.weight || 0))) {
    const name = t && t.name;
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
    if (out.length === GENRES_PER_SONG) break;
  }
  return out;
}

/**
 * @param tracks        cached liked tracks, newest first, with added_at
 * @param tagsByArtist  Map of lowercased artist name -> [{ name, weight }]
 */
export function likedSongsCsv(tracks, tagsByArtist = new Map()) {
  const rows = [LIKED_CSV_HEADERS.map(quote).join(",")];
  for (const t of tracks || []) {
    if (!t || !t.id) continue;
    rows.push([
      `spotify:track:${t.id}`,
      t.name,
      (t.artists || []).map((a) => a && a.name).filter(Boolean).join(", "),
      (t.album && t.album.name) || "",
      (t.album && t.album.release_date) || "",
      t.duration_ms || "",
      t.added_at || "",
      (t.external_ids && t.external_ids.isrc) || "",
      genresFor(t, tagsByArtist).join(", "),
      `https://open.spotify.com/track/${t.id}`,
    ].map(quote).join(","));
  }
  // BOM so Excel reads the accents in artist names correctly.
  return "﻿" + rows.join("\r\n") + "\r\n";
}

/** Primary artists with no tags yet, in library order, one each. */
export function untaggedArtists(tracks, tagsByArtist = new Map()) {
  const seen = new Set();
  const out = [];
  for (const t of tracks || []) {
    const a = t && t.artists && t.artists[0];
    const key = a && a.name && a.name.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    if (!tagsByArtist.has(key)) out.push({ name: a.name, id: a.id });
  }
  return out;
}

export function likedFileName(now = new Date()) {
  return `deepdive-liked-songs-${now.toISOString().slice(0, 10)}.csv`;
}
