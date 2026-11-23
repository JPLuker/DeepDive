// 2.9.157 (Joseph, 23 Nov): DeepDive playlists on their own screen with
// a refresh for dives and "older than 30 days", an Exportify-style
// Liked Songs export, and saving files inside the Android app.
import { readFileSync } from 'node:fs';
const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
const pl = await import('../docs/js/playlists.js');
const lx = await import('../docs/js/liked-export.js');
const files = await import('../docs/js/files.js');
const { SpotifyClient } = await import('../docs/js/spotify.js');
const src = readFileSync(new URL('../docs/js/app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../docs/app/index.html', import.meta.url), 'utf8');
const kt = readFileSync(new URL('../src-tauri/android/MainActivity.kt', import.meta.url), 'utf8');

let pass = 0, fail = 0;
const check = (l, c) => { if (c) pass++; else { fail++; console.log('FAIL:', l); } };
const fnBody = (name) => {
  const i = src.indexOf(`function ${name}(`);
  if (i < 0) return '';
  const open = src.indexOf(') {', i) + 2;
  let d = 0;
  for (let j = open; j < src.length; j++) {
    if (src[j] === '{') d++;
    else if (src[j] === '}' && --d === 0) return src.slice(i, j + 1);
  }
  return '';
};

// --- which playlists ----------------------------------------------------
const me = { id: 'me' };
const p = (id, name, description = '', total = 3) => ({ id, name, description, owner: me, tracks: { total }, images: [], external_urls: { spotify: `u/${id}` } });
const list = pl.deepdivePlaylists([
  p('a', 'DeepDive · Houseghost', 'New-to-you tracks by Houseghost, found by DeepDive.'),
  p('b', 'DeepDive · Houseghost dip', 'Houseghost, about 60 minutes, built by DeepDive.'),
  p('c', 'DeepDive · Released in 2023', 'Released in 2023, built by DeepDive.'),
  p('d', 'Road trip'),
  p('a', 'DeepDive · Houseghost', 'dupe'),
], []);
check('only DeepDive playlists, once each', list.map((x) => x.id).join('') === 'abc');
check('a dive playlist is marked with its artist', list[0].dive && list[0].dive.artistName === 'Houseghost');
check('dips and mixes are not dives', !list[1].dive && !list[2].dive);

// --- dates --------------------------------------------------------------
const now = Date.parse('2026-11-23T12:00:00Z');
const known = pl.knownDates(list, { b: '' }, [{ playlistId: 'a', at: '2026-11-20T00:00:00Z' }]);
check('history supplies a creation date', known.a === '2026-11-20T00:00:00Z');
check('a stored empty answer counts as known', Object.prototype.hasOwnProperty.call(known, 'b'));
check('the rest still need a lookup', pl.needsDate(list, known).map((x) => x.id).join('') === 'c');
const dates = { a: '2026-11-20T00:00:00Z', b: '', c: '2026-09-01T00:00:00Z' };
check('older than 30 days is the old one only', pl.oldPlaylists(list, dates, now).map((x) => x.id).join('') === 'c');
check('an empty playlist is never old', !pl.isOld('', now));
check('exactly 30 days is not older than 30', !pl.isOld(new Date(now - 30 * 864e5).toISOString(), now));
check('newest first, undated last', pl.sortByDate(list, dates).map((x) => x.id).join('') === 'acb');
check('ages read as a person would say them', pl.ageLabel('2026-11-20T00:00:00Z', now) === '3 days ago' && pl.ageLabel('', now) === '');
pl.saveDates({ c: 'x' });
check('dates survive a reload', pl.loadDates().c === 'x');
store.set('deepdive_playlist_dates', '[1,2]');
check('a corrupt store reads as empty', Object.keys(pl.loadDates()).length === 0);

// --- the first-added lookup is one small request -------------------------
{
  const c = new SpotifyClient('t', { pace: false });
  const seen = [];
  c.get = async (path, params) => { seen.push([path, params]); return { items: [{ added_at: '2026-01-02T00:00:00Z' }] }; };
  const at = await c.playlistFirstAddedAt('p1');
  check('first-added date comes back', at === '2026-01-02T00:00:00Z');
  check('it asks for one item and only its date', seen[0][0] === 'playlists/p1/items' && seen[0][1].limit === 1 && seen[0][1].fields === 'items.added_at');
  c.get = async () => ({ items: [] });
  check('an empty playlist has no date', (await c.playlistFirstAddedAt('p2')) === null);
}

// --- the screen ---------------------------------------------------------
const settings = fnBody('renderSettings');
check('Settings opens a screen rather than listing inline', /navRow\('id="find-playlists"'/.test(settings) && !/playlist-cleanup/.test(src));
check('the button opens the playlists screen', /getElementById\("find-playlists"\)\?\.addEventListener\("click", \(\) => renderPlaylists\(\)\)/.test(src));
const screen = fnBody('renderPlaylists');
check('screen has a way back to Settings', /data-tab="settings"/.test(screen));
check('older-than-30 removal is offered', /id="pl-rm-old"/.test(screen) && /oldPlaylists\(shown, dates\)/.test(screen));
check('bulk removals confirm', (screen.match(/confirmDialog\(/g) || []).length === 2);
// Found rendering it: ev.currentTarget is null after the confirm's await.
check('bulk buttons are taken before the confirm', !/removeMany\(targets, ev\.currentTarget/.test(screen) && (screen.match(/const btn = ev\.currentTarget;/g) || []).length === 2);
check('single removal does not confirm', /data-pl-remove/.test(screen) && !/data-pl-remove[\s\S]{0,200}confirmDialog/.test(screen.slice(screen.indexOf('const rm = '))));
check('dive rows offer a refresh of just that playlist', /data-pl-refresh/.test(src) && /renderRefresh\(\{ from: "playlists", only: ref\.dataset\.plRefresh \}\)/.test(screen));
check('date lookups stop on a rate limit', /status === 429\) break/.test(screen));
check('date lookups are kept', /saveDates\(stored\)/.test(screen));
const rr = fnBody('renderRefresh');
check('refresh can preselect one playlist', /only && ids\.has\(only\) \? new Set\(\[only\]\)/.test(rr));
check('refresh Back returns where it came from', /_refreshFrom === "playlists"\) renderPlaylists\(\)/.test(rr) && !/data-tab="dives">Back/.test(rr));
check('row styles exist', /\.ddpl-row \{/.test(html) && /\.ddpl-actions \{/.test(html));

// --- export -------------------------------------------------------------
const tags = new Map([['houseghost', [{ name: 'shoegaze', weight: 40 }, { name: 'dream pop', weight: 100 }, { name: 'shoegaze', weight: 10 }]]]);
const tracks = [
  { id: 't1', name: 'Song, "one"', artists: [{ id: 'a', name: 'Houseghost' }, { id: 'b', name: 'Guest' }], album: { name: 'LP', release_date: '2021-05-01' }, duration_ms: 201000, external_ids: { isrc: 'US123' }, added_at: '2026-11-01T00:00:00Z' },
  { id: 't2', name: 'Two', artists: [{ id: 'c', name: 'VIAL' }], album: { name: 'EP' }, duration_ms: 1000, added_at: '' },
  null,
];
const csv = lx.likedSongsCsv(tracks, tags);
const lines = csv.replace(/^﻿/, '').trim().split('\r\n');
check('header matches Exportify-style columns', lines[0].startsWith('"Track URI","Track Name","Artist Name(s)"') && lines[0].includes('"Genres"'));
check('one row per song', lines.length === 3);
check('quotes inside titles are escaped', lines[1].includes('"Song, ""one"""'));
check('every credited artist is listed', lines[1].includes('"Houseghost, Guest"'));
check('genres strongest first, no repeats', lines[1].includes('"dream pop, shoegaze"'));
check('ISRC and added date carried', lines[1].includes('"US123"') && lines[1].includes('"2026-11-01T00:00:00Z"'));
check('an untagged artist gets an empty Genres cell', lx.genresFor(tracks[1], tags).length === 0);
check('BOM for spreadsheets', csv.charCodeAt(0) === 0xFEFF);
check('untagged artists, once each', lx.untaggedArtists([...tracks, tracks[1]], tags).map((a) => a.name).join() === 'VIAL');
check('file name is dated', lx.likedFileName(new Date('2026-11-23T00:00:00Z')) === 'deepdive-liked-songs-2026-11-23.csv');
check('Settings has the export', /id="set-export-liked"/.test(settings));
const ex = fnBody('exportLikedSongs');
check('export syncs the library first', /readLibraryFullScreen\(\)/.test(ex));
check('a big genre lookup asks first', /missing\.length > GENRE_AUTO_TOPUP/.test(ex) && /confirmDialog/.test(ex));
check('a genre lookup gets the full screen', /showDiveScreen\("Finding your genres/.test(ex) && /hideDiveScreen\(\)/.test(ex));

// --- saving files -------------------------------------------------------
check('names are cleaned', files.safeFileName('Mix: "best"/2023.csv') === 'Mix best2023.csv');
{
  const sent = [];
  const listeners = new Map();
  const w = {
    DeepDiveFiles: { postMessage: (m) => { const a = JSON.parse(m); sent.push(a); setTimeout(() => listeners.get('deepdive-file-saved')?.({ detail: { id: a.id, result: true } }), 0); } },
    addEventListener: (n, f) => listeners.set(n, f), removeEventListener: (n) => listeners.delete(n),
  };
  const r = await files.saveFile('deepdive-backup-2026-11-23.json', '{}', 'application/json', { w });
  check('the app saves through the native bridge', r.ok && r.place === 'downloads' && sent[0].mime === 'application/json');
  check('the message says Downloads', files.savedLine(r, 'Backup') === 'Backup saved to Downloads.');
  check('a CSV goes as text/csv without parameters', (await files.saveFile('a.csv', 'x', 'text/csv;charset=utf-8', { w })).ok && sent[1].mime === 'text/csv');
  const fail = { DeepDiveFiles: { postMessage: (m) => { const a = JSON.parse(m); setTimeout(() => listeners.get('deepdive-file-saved')?.({ detail: { id: a.id, result: false, error: 'Disk full.' } }), 0); } },
    addEventListener: w.addEventListener, removeEventListener: w.removeEventListener };
  const bad = await files.saveFile('a.csv', 'x', 'text/csv', { w: fail });
  check('a native failure is reported, not swallowed', !bad.ok && files.savedLine(bad, 'x').includes('Disk full.'));
}
check('the web path still makes a download', files.savedLine({ ok: true, place: 'browser' }, 'Backup') === 'Backup saved.');
check('no export still treats the result as a boolean', !/const ok = downloadFile\(/.test(src) && !/done \? "Saved" : "Failed"/.test(src));

// --- Android side -------------------------------------------------------
check('MainActivity exposes DeepDiveFiles', /addJavascriptInterface\([\s\S]*?\}, "DeepDiveFiles"\)/.test(kt));
const bridge = kt.slice(kt.indexOf('// Exports. A WebView'), kt.indexOf('"DeepDiveFiles")'));
check('the file bridge checks the bundled page first', /if \(!bundledPage\(\)\) return@post/.test(bridge));
check('only csv/json names and types', /SAVE_NAME\.matches\(name\)/.test(bridge) && /mime in SAVE_TYPES/.test(bridge) && /setOf\("text\/csv", "application\/json"\)/.test(kt));
check('writes go through MediaStore Downloads', /MediaStore\.Downloads\.EXTERNAL_CONTENT_URI/.test(kt) && /IS_PENDING, 0/.test(kt));
check('the write is off the main thread', /Thread \{[\s\S]{0,120}saveDownload/.test(bridge));
check('no storage permission requested', !/WRITE_EXTERNAL_STORAGE"/.test(kt));

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
