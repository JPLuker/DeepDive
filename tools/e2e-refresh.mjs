// Drive Refresh dive playlists end to end against a mocked Spotify.
//
// The demo routes can't reach Spotify from the sandbox, so this logs in
// with fake tokens and answers api.spotify.com itself. It is the only
// way to see the real screens, with real data flow, from here. Serve
// docs/ on 8231 first (see CLAUDE.md), then:
//
//   node tools/e2e-refresh.mjs [outdir]
//
// Prints every non-trivial Spotify call it saw, so the DELETE bodies can
// be checked, and any console errors. Desktop dark narrows to one playlist and turns on
// "Add new releases" to exercise the re-dive path.
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import { readFileSync, mkdirSync } from 'fs';
const BASE = 'http://127.0.0.1:8231';
const OUT = process.argv[2] || 'shots';
const icon = readFileSync(new URL('../docs/assets/icon-192.png', import.meta.url));
const me = { id: 'joe', display_name: 'Joe' };
const lists = {
  p1: ['t1', 't2', 't3', 't4'],
  p2: ['t5', 't6'],
  p3: ['t7'],
};
const playlists = [
  { id: 'p1', name: 'DeepDive · Houseghost', description: 'New-to-you tracks by Houseghost, found by DeepDive.', owner: me, tracks: { total: 4 }, images: [{ url: 'https://i.scdn.co/image/a' }], external_urls: { spotify: 'https://open.spotify.com/playlist/p1' } },
  { id: 'p2', name: 'DeepDive · VIAL', description: 'New-to-you tracks by VIAL, found by DeepDive.', owner: me, tracks: { total: 2 }, images: [], external_urls: { spotify: 'x' } },
  { id: 'p3', name: 'DeepDive · Leisure Hour', description: 'New-to-you tracks by Leisure Hour, found by DeepDive.', owner: me, tracks: { total: 1 }, images: [], external_urls: { spotify: 'x' } },
  { id: 'p4', name: 'DeepDive · Released in 2023', description: 'Released in 2023, built by DeepDive.', owner: me, tracks: { total: 9 }, images: [], external_urls: { spotify: 'x' } },
];
const liked = ['t2', 't3', 't6', 'x9'].map((id, i) => ({ added_at: new Date(Date.now() - i * 1e6).toISOString(), track: { id, name: 'Song ' + id, artists: [{ id: 'a', name: 'Houseghost' }], album: { id: 'al', name: 'A', images: [], release_date: '2020' }, duration_ms: 200000 } }));
mkdirSync(OUT, { recursive: true });
const calls = [];
const browser = await chromium.launch();
const errs = [];
for (const theme of ['dark', 'light']) {
for (const vp of [{ name: 'phone', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, { name: 'desktop', viewport: { width: 1280, height: 800 } }]) {
  const { name, ...opts } = vp;
  const ctx = await browser.newContext(opts);
  await ctx.addInitScript((t) => {
    localStorage.setItem('deepdive_theme', t);
    localStorage.setItem('deepdive_client_id', 'cid');
    localStorage.setItem('deepdive_access_token', 'tok');
    localStorage.setItem('deepdive_refresh_token', 'ref');
    localStorage.setItem('deepdive_token_expires_at', String(Date.now() + 3600e3));
    localStorage.setItem('deepdive_granted_scope', 'user-library-read user-library-modify playlist-read-private playlist-modify-private playlist-modify-public user-top-read user-read-recently-played ugc-image-upload');
    localStorage.setItem('deepdive_onboarded', '1');
    localStorage.setItem('deepdive_dives', JSON.stringify([{ artistId: 'a1', artistName: 'Houseghost', at: new Date().toISOString(), duplicates: 0, newTracks: 4, alreadyLiked: 0 }]));
  }, theme);
  await ctx.route('https://i.scdn.co/**', (r) => r.fulfill({ status: 200, contentType: 'image/png', body: icon }));
  await ctx.route('https://api.spotify.com/**', async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    const path = u.pathname.replace('/v1/', '');
    calls.push(`${req.method()} ${path}${req.postData() ? ' ' + req.postData() : ''}`);
    const json = (b, s = 200) => route.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(b) });
    if (path === 'me') return json(me);
    const art = { a1: 'Houseghost', a2: 'VIAL', a3: 'Leisure Hour' };
    if (/^artists\/a\d$/.test(path)) { const id = path.split('/')[1]; return json({ id, name: art[id], images: [{ url: 'https://i.scdn.co/image/' + id }] }); }
    if (path === 'search') { const q = (u.searchParams.get('q') || '').replace(/artist:|"/g, '').toLowerCase(); const hit = Object.entries(art).find(([, n]) => n.toLowerCase() === q); return json({ artists: { items: hit ? [{ id: hit[0], name: hit[1], images: [] }] : [] } }); }
    if (/^artists\/a\d\/albums$/.test(path)) { const id = path.split('/')[1]; return json({ items: [{ id: 'al' + id, album_group: 'album', album_type: 'album', name: 'New record' }], next: null, total: 1 }); }
    if (/^albums\/ala\d$/.test(path)) { const id = path.split('/')[1].slice(2); const ai = { id, name: art[id] };
      return json({ id: 'al' + id, name: 'New record', album_type: 'album', release_date: '2026-11-01', images: [], artists: [ai],
        tracks: { items: ['n1', 'n2', 't2'].map((t, i) => ({ id: t + id, name: 'New ' + t, artists: [ai], track_number: i + 1, disc_number: 1, duration_ms: 180000, external_ids: { isrc: 'X' + t + id } })), next: null } }); }
    if (path === 'tracks' || /^tracks\//.test(path)) return json({ tracks: [] });
    if (path === 'me/playlists') return json({ items: playlists, next: null, total: playlists.length });
    if (path === 'me/tracks') return json({ items: liked, next: null, total: liked.length });
    const m = path.match(/^playlists\/(\w+)\/items$/);
    if (m && req.method() === 'GET') return json({ items: (lists[m[1]] || []).map((id) => ({ item: { id } })), next: null });
    if (m && req.method() === 'DELETE') return json({ snapshot_id: 's' });
    if (m && req.method() === 'POST') return json({ snapshot_id: 's' });
    return json({ items: [], next: null, total: 0 });
  });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errs.push(`${name}-${theme}: ${m.text()}`); });
  page.on('pageerror', (e) => errs.push(`${name}-${theme}: pageerror ${e.message}`));
  await page.goto(`${BASE}/app/`, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/boot-${name}-${theme}.png` });
  await page.locator('[data-tab="dives"]:visible').first().click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/dives-${name}-${theme}.png` });
  await page.locator('#go-refresh').click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/refresh-${name}-${theme}.png`, fullPage: true });
  await page.screenshot({ path: `${OUT}/refresh-locked-${name}-${theme}.png` });
  console.log('toggle disabled with all ticked:', await page.locator('#refresh-new').isDisabled());
  if (name === 'desktop' && theme === 'dark') {
    // New releases only on a single refresh: narrow to one, then turn it on.
    await page.locator('#refresh-all').click();
    await page.locator('label.track-row:has([data-refresh-pl="p1"])').click();
    console.log('toggle enabled with one ticked:', await page.locator('#refresh-new').isEnabled());
    await page.locator('label.set-switch:has(#refresh-new)').click();
    await page.screenshot({ path: `${OUT}/refresh-single-${name}-${theme}.png` });
  }
  await page.locator('#refresh-go').click();
  await page.waitForTimeout(name === 'desktop' && theme === 'dark' ? 9000 : 2500);
  await page.screenshot({ path: `${OUT}/review-${name}-${theme}.png`, fullPage: true });
  if (name === 'phone' && theme === 'dark') {
    await page.locator('#refresh-apply').click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/applied-${name}-${theme}.png` });
  }
  await ctx.close();
}
}
await browser.close();
console.log(calls.filter((c) => !/^GET (me|me\/playlists|me\/tracks)$/.test(c.split(' ').slice(0,2).join(' '))).join('\n'));
console.log('ERRORS', errs.length ? errs.join('\n') : 'none');
