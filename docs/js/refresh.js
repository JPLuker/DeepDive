// Refresh dive playlists.
//
// Joseph, 15 Nov: "a playlist refresh feature for full dives that I can
// run and it hits all playlists/whatever is selected with my new like
// pulls."
//
// A dive playlist holds what was new to you when you dived. Once you
// like songs from it, they aren't new any more, and the artist may have
// released more since. A refresh re-reads Liked Songs once, then for
// each chosen playlist works out what to take out (songs you've liked
// since) and, if asked, what to add (new-to-you songs from a fresh
// dive). Nothing is changed until the plan is confirmed.

/** The description every dive playlist is created with. */
export const DIVE_DESCRIPTION = /^\s*New-to-you tracks by (.+?), found by DeepDive\.?\s*$/i;
const PREFIX = "deepdive · ";

function decodeEntities(s) {
  return String(s || "")
    .replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

/**
 * Which of a user's own playlists came from a full dive, and whose.
 *
 * Dives name their playlist "DeepDive · <artist>" and describe it as
 * "New-to-you tracks by <artist>, found by DeepDive." Mixes, dips and
 * Multi-Dips share the prefix, so the prefix alone would sweep them in;
 * the description is what marks a dive. A dive playlist whose
 * description was edited is still found when its name matches an
 * artist in dive history.
 *
 * @param playlists  raw Spotify playlist objects, already owner-filtered
 * @param divedNames artist names from dive history
 */
export function pickDivePlaylists(playlists, divedNames = []) {
  const dived = new Map(divedNames.filter(Boolean).map((n) => [n.trim().toLowerCase(), n.trim()]));
  const out = [];
  const seen = new Set();
  for (const p of playlists || []) {
    if (!p || !p.id || !p.name || seen.has(p.id)) continue;
    const name = p.name.trim();
    const lower = name.toLowerCase();
    if (!lower.startsWith(PREFIX)) continue;
    if (/ dip$/i.test(name)) continue;
    const described = decodeEntities(p.description).match(DIVE_DESCRIPTION);
    const fromName = name.slice(PREFIX.length).trim();
    const artistName = described ? described[1].trim()
      : (dived.has(fromName.toLowerCase()) ? dived.get(fromName.toLowerCase()) : null);
    if (!artistName) continue;
    seen.add(p.id);
    out.push({
      id: p.id,
      name,
      artistName,
      url: (p.external_urls || {}).spotify || null,
      tracks: (p.tracks || p.items || {}).total || 0,
      image: (p.images && p.images.length) ? p.images[p.images.length - 1].url : null,
    });
  }
  return out.sort((a, b) => a.artistName.localeCompare(b.artistName));
}

/**
 * Whether "Add new releases" can run. Joseph, 15 Nov: "just have a
 * toggle for scanning for new releases and only let it on single
 * refreshes." A re-dive is a whole catalogue read, so it's one playlist
 * at a time.
 */
export function canAddNewReleases(selectedCount) {
  return selectedCount === 1;
}

/**
 * What to change in one playlist. Pure, so the rules are testable
 * without Spotify.
 *
 * - remove: tracks in the playlist that are now in Liked Songs
 * - add: new-to-you tracks from a fresh dive, not already there and not
 *   liked (a fresh dive already excludes liked songs; checked again so
 *   a stale result can't add something you just liked)
 */
export function planPlaylist({ playlistIds, likedIds, newTrackIds = [] }) {
  const inList = playlistIds instanceof Set ? playlistIds : new Set(playlistIds || []);
  const liked = likedIds instanceof Set ? likedIds : new Set(likedIds || []);
  const remove = [...inList].filter((id) => liked.has(id));
  const add = [];
  const seen = new Set();
  for (const id of newTrackIds) {
    if (!id || seen.has(id) || inList.has(id) || liked.has(id)) continue;
    seen.add(id);
    add.push(id);
  }
  return { remove, add };
}

/**
 * Work out every chosen playlist's plan.
 *
 * One Liked Songs sync for the whole run, then one playlist read each.
 * With `checkNew`, each artist is also dived again, which costs a
 * catalogue read per playlist; without it the run is cheap.
 *
 * Cancellation stops between playlists and returns what was planned so
 * far, marked `cancelled`.
 */
export async function planRefresh(client, playlists, {
  getLiked, checkNew = false, dive = null, onProgress = () => {}, isCancelled = () => false,
} = {}) {
  const total = playlists.length;
  // The screen already holds this rule; checked here too so no caller
  // can start a re-dive of every playlist.
  if (checkNew && !canAddNewReleases(total)) checkNew = false;
  // Library first, so every plan is made against the same snapshot.
  onProgress({ step: "library", done: 0, total });
  const likedTracks = await getLiked();
  const likedIds = new Set((likedTracks || []).map((t) => t && t.id).filter(Boolean));

  const plans = [];
  for (let i = 0; i < total; i++) {
    if (isCancelled()) return { plans, cancelled: true, likedCount: likedIds.size };
    const p = playlists[i];
    onProgress({ step: "playlist", done: i, total, playlist: p });
    const plan = { playlist: p, remove: [], add: [], error: null, newTotal: 0 };
    try {
      const playlistIds = await client.getPlaylistTrackIds(p.id);
      let newTrackIds = [];
      if (checkNew && dive) {
        onProgress({ step: "dive", done: i, total, playlist: p });
        const result = await dive(p);
        newTrackIds = ((result && result.new_tracks) || []).map((t) => t && t.id).filter(Boolean);
        plan.newTotal = newTrackIds.length;
      }
      Object.assign(plan, planPlaylist({ playlistIds, likedIds, newTrackIds }));
      plan.size = playlistIds.size;
    } catch (e) {
      // A quota or rate stop ends the run; anything else is this
      // playlist's problem and the rest still get planned.
      if (e && (e.quotaExhausted || e.sustained || e.status === 429)) throw e;
      plan.error = (e && e.message) || String(e);
    }
    plans.push(plan);
  }
  onProgress({ step: "done", done: total, total });
  return { plans, cancelled: false, likedCount: likedIds.size };
}

/**
 * Carry out confirmed plans. Removals first, so a playlist that hits an
 * error part-way has lost songs you've already got rather than gained
 * duplicates. Each playlist's outcome is reported on its own; one
 * failing doesn't stop the rest.
 */
export async function applyRefresh(client, plans, { onProgress = () => {} } = {}) {
  const results = [];
  const todo = plans.filter((p) => !p.error && (p.remove.length || p.add.length));
  for (let i = 0; i < todo.length; i++) {
    const plan = todo[i];
    onProgress({ done: i, total: todo.length, playlist: plan.playlist });
    const r = { playlist: plan.playlist, removed: 0, added: 0, error: null };
    try {
      if (plan.remove.length) {
        await client.removeTracksFromPlaylist(plan.playlist.id, plan.remove);
        r.removed = plan.remove.length;
      }
      if (plan.add.length) {
        await client.addTracksToPlaylist(plan.playlist.id, plan.add);
        r.added = plan.add.length;
      }
    } catch (e) {
      r.error = (e && e.message) || String(e);
    }
    results.push(r);
  }
  onProgress({ done: todo.length, total: todo.length });
  return results;
}
