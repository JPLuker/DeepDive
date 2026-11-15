// Refresh dive playlists (Joseph, 15 Nov): run over all dive playlists,
// or the ones picked, taking out songs liked since the dive and, when
// asked, adding new-to-you songs from a fresh dive. Nothing changes on
// Spotify until the plan is accepted.
import { readFileSync } from 'node:fs';
import { pickDivePlaylists, planPlaylist, planRefresh, applyRefresh } from '../docs/js/refresh.js';
const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
const { SpotifyClient } = await import('../docs/js/spotify.js');
const src = readFileSync(new URL('../docs/js/app.js', import.meta.url), 'utf8');

let pass = 0, fail = 0;
const check = (l, c) => { if (c) pass++; else { fail++; console.log('FAIL:', l); } };

// --- which playlists are dive playlists --------------------------------
const pl = (id, name, description = '', total = 3) => ({ id, name, description, tracks: { total }, external_urls: { spotify: `https://open.spotify.com/playlist/${id}` } });
const found = pickDivePlaylists([
  pl('a', 'DeepDive · Houseghost', 'New-to-you tracks by Houseghost, found by DeepDive.'),
  pl('b', 'DeepDive · Houseghost dip', 'Houseghost, about 60 minutes, built by DeepDive.'),
  pl('c', 'DeepDive · Released in 2023', 'Released in 2023, built by DeepDive.'),
  pl('d', 'DeepDive · VIAL', 'my edits'),
  pl('e', 'DeepDive · Leisure Hour', ''),
  pl('f', 'Road trip', 'New-to-you tracks by Someone, found by DeepDive.'),
  pl('g', 'DeepDive · Guns N&#x27; Roses', 'New-to-you tracks by Guns N&#x27; Roses, found by DeepDive.'),
], ['VIAL']);
const ids = found.map((p) => p.id).sort().join('');
check(`only dive playlists are picked (${ids})`, ids === 'adg');
check('a dive playlist is found by its description', found.some((p) => p.id === 'a' && p.artistName === 'Houseghost'));
check('dips, mixes and other playlists are left alone', !found.some((p) => ['b', 'c', 'e', 'f'].includes(p.id)));
check('an edited description still matches by dive history', found.some((p) => p.id === 'd' && p.artistName === 'VIAL'));
check('HTML entities in descriptions are decoded', found.some((p) => p.artistName === "Guns N' Roses"));

// --- one playlist's plan ------------------------------------------------
{
  const plan = planPlaylist({ playlistIds: new Set(['1', '2', '3']), likedIds: new Set(['2', '9']), newTrackIds: ['3', '4', '9', '4', '5'] });
  check('songs liked since are taken out', plan.remove.join() === '2');
  check('new songs are added once, skipping ones already there or liked', plan.add.join() === '4,5');
  const none = planPlaylist({ playlistIds: ['1'], likedIds: [] });
  check('nothing liked and nothing new is no change', !none.remove.length && !none.add.length);
}

// --- the run ------------------------------------------------------------
const fakeClient = (lists, { failOn = null, quotaOn = null } = {}) => ({
  async getPlaylistTrackIds(id) {
    if (id === failOn) throw new Error('Not found');
    if (id === quotaOn) { const e = new Error('quota'); e.quotaExhausted = true; throw e; }
    return new Set(lists[id] || []);
  },
  removed: [], added: [], order: [],
  async removeTracksFromPlaylist(id, t) { this.removed.push([id, t]); this.order.push('rm:' + id); },
  async addTracksToPlaylist(id, t) { this.added.push([id, t]); this.order.push('add:' + id); },
});
{
  let libraryReads = 0;
  const client = fakeClient({ a: ['1', '2'], d: ['3', '4'] }, { failOn: 'g' });
  const dived = [];
  const r = await planRefresh(client, found, {
    getLiked: async () => { libraryReads++; return [{ id: '2' }, { id: '4' }]; },
    checkNew: false,
    dive: async (p) => { dived.push(p.id); return { new_tracks: [] }; },
  });
  check('Liked Songs are synced once for the whole run', libraryReads === 1);
  check('without new releases no artist is dived again', dived.length === 0);
  check('each playlist gets its own plan', r.plans.length === 3);
  check('liked songs come out of each playlist', r.plans.find((p) => p.playlist.id === 'a').remove.join() === '2'
    && r.plans.find((p) => p.playlist.id === 'd').remove.join() === '4');
  check('one playlist failing does not stop the rest', !!r.plans.find((p) => p.playlist.id === 'g').error && !r.cancelled);
  check('planning changes nothing on Spotify', !client.removed.length && !client.added.length);

  const byId = (id) => found.find((p) => p.id === id);
  const withNew = await planRefresh(client, [byId('a')], {
    getLiked: async () => [{ id: '2' }],
    checkNew: true,
    dive: async () => ({ new_tracks: [{ id: '7' }, { id: '1' }] }),
  });
  check('with new releases, a fresh dive adds what is new to the playlist', withNew.plans[0].add.join() === '7');

  let stops = 0;
  const cancelled = await planRefresh(client, found, { getLiked: async () => [], isCancelled: () => stops++ >= 1 });
  check('cancel stops between playlists and keeps what was planned', cancelled.cancelled && cancelled.plans.length === 1);

  let threw = false;
  try { await planRefresh(fakeClient({}, { quotaOn: 'a' }), found, { getLiked: async () => [] }); } catch (e) { threw = !!e.quotaExhausted; }
  check('a spent quota ends the run instead of failing every playlist', threw);

  const results = await applyRefresh(client, [
    { playlist: byId('a'), remove: ['2'], add: ['7'], error: null },
    { playlist: byId('d'), remove: [], add: [], error: null },
    { playlist: byId('g'), remove: ['9'], add: [], error: 'Not found' },
  ]);
  check('only playlists with changes and no error are touched', results.length === 1 && client.order.join() === 'rm:a,add:a');
  check('removals happen before additions', client.order[0] === 'rm:a');
}

// --- Spotify call shape -------------------------------------------------
{
  const c = new SpotifyClient(async () => 't');
  const sent = [];
  globalThis.fetch = async (url, init) => { sent.push({ url: String(url), init }); return { status: 200, ok: true, headers: { get: () => null }, json: async () => ({ snapshot_id: 'x' }), text: async () => '{}' }; };
  await c.removeTracksFromPlaylist('P1', Array.from({ length: 150 }, (_, i) => 't' + i));
  check('removal uses the current items endpoint with DELETE', sent.length === 2 && sent.every((s) => s.init.method === 'DELETE' && /\/playlists\/P1\/items$/.test(s.url)));
  const body = JSON.parse(sent[0].init.body);
  check('in batches of 100, as { items: [{ uri }] }', body.items.length === 100 && body.items[0].uri === 'spotify:track:t0' && JSON.parse(sent[1].init.body).items.length === 50);
}

// --- the screen ---------------------------------------------------------
check('Dives links to the refresh screen', /id="go-refresh"/.test(src) && /getElementById\("go-refresh"\)\?\.addEventListener\("click", \(\) => renderRefresh\(\)\)/.test(src));
check('every dive playlist starts selected, and there is select all', /: new Set\(ids\);/.test(src) && /id="refresh-all"/.test(src));
check('new releases are opt-in', /let _refreshCheckNew = false;/.test(src));
check('the run uses the job screen', /showDiveScreen\("Refreshing dive playlists…"/.test(src));
const review = src.slice(src.indexOf('function renderRefreshReview'), src.indexOf('/** Mixes — what Playlists'));
check('changes are applied only from the review screen', /refresh\.applyRefresh\(/.test(review) && (src.match(/refresh\.applyRefresh\(/g) || []).length === 1);
check('a refresh is recorded in history', /type: "refresh"/.test(review));
check('re-dives keep the artist from dive history', /rememberArtistChoice\(p\.artistName, \{ id: known\.artistId \}\)/.test(src));
check('a re-dive never refreshes someone else', /if \(artist\.closestMatch\) throw/.test(src));
check('new dive playlists are recorded so History can find them', /label: `Created "\$\{playlistName\}"`/.test(src));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
