// Drive Settings → Tidy up playlists and Export Liked Songs against a
// mocked Spotify, the same way e2e-refresh.mjs does. Serve docs/ on
// 8231 first (see CLAUDE.md), then:
//
//   node tools/e2e-playlists.mjs [outdir]
//
// Prints the Spotify calls that change something, the exported CSV's
// first lines, and any console errors.
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import { readFileSync, mkdirSync } from 'fs';
const BASE = 'http://127.0.0.1:8231';
const OUT = process.argv[2] || 'shots';
const icon = readFileSync(new URL('../docs/assets/icon-192.png', import.meta.url));
const me = { id: 'joe', display_name: 'Joe' };
const day = 864e5;
const ago = (d) => new Date(Date.now() - d * day).toISOString();
const mk = (id, name, description, total, made) => ({ id, name, description, owner: me, tracks: { total }, images: id === 'p1' ? [{ url: 'https://i.scdn.co/image/a' }] : id === 'p2' ? [{ url: 'https://image-cdn-ak.spotifycdn.com/image/broken' }] : [], external_urls: { spotify: `https://open.spotify.com/playlist/${id}` }, made });
const playlists = [
  mk('p1', 'DeepDive · Pop Smoke', 'New-to-you tracks by Pop Smoke, found by DeepDive.', 41, 2),
  mk('p2', 'DeepDive · IDK', 'New-to-you tracks by IDK, found by DeepDive.', 18, 12),
  mk('p3', 'DeepDive · Kendrick Lamar', 'New-to-you tracks by Kendrick Lamar, found by DeepDive.', 63, 45),
  mk('p4', 'DeepDive · J. Cole', 'New-to-you tracks by J. Cole, found by DeepDive.', 27, 90),
  mk('p5', 'DeepDive · Vocal Jazz', 'Vocal jazz, built by DeepDive.', 50, 33),
  mk('p6', 'DeepDive · If you like Seth MacFarlane', 'Built by DeepDive.', 30, 5),
  mk('p7', 'DeepDive · Houseghost dip', 'Houseghost, about 60 minutes, built by DeepDive.', 14, 0),
  mk('p8', 'Road trip', '', 20, 400),
];
const liked0 = ['t1', 't2', 't3'].map((id, i) => ({ added_at: ago(i), track: { id, name: 'Song ' + id + (i === 1 ? ', "quoted"' : ''), artists: [{ id: 'a', name: 'Houseghost' }], album: { id: 'al', name: 'A', images: [], release_date: '2020-01-01' }, duration_ms: 200000, external_ids: { isrc: 'ISRC' + i } } }));
// 20 more artists so the export asks before a long genre lookup.
const liked = [...liked0, ...Array.from({ length: 20 }, (_, i) => ({ added_at: ago(10 + i), track: { id: 'g' + i, name: 'Tune ' + i, artists: [{ id: 'ga' + i, name: 'Artist ' + i }], album: { id: 'x', name: 'B', images: [], release_date: '2019' }, duration_ms: 180000 } }))];
mkdirSync(OUT, { recursive: true });
const calls = [];
const errs = [];
const browser = await chromium.launch();
for (const theme of ['dark', 'light']) {
for (const vp of [{ name: 'phone', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, { name: 'desktop', viewport: { width: 1280, height: 800 } }]) {
  const { name, ...opts } = vp;
  const ctx = await browser.newContext({ ...opts, acceptDownloads: true });
  await ctx.addInitScript((t) => {
    localStorage.setItem('deepdive_theme', t);
    localStorage.setItem('deepdive_client_id', 'cid');
    localStorage.setItem('deepdive_access_token', 'tok');
    localStorage.setItem('deepdive_refresh_token', 'ref');
    localStorage.setItem('deepdive_token_expires_at', String(Date.now() + 3600e3));
    localStorage.setItem('deepdive_granted_scope', 'user-library-read user-library-modify playlist-read-private playlist-modify-private playlist-modify-public user-top-read user-read-recently-played ugc-image-upload');
    localStorage.setItem('deepdive_onboarded', '1');
    if (t === 'light') localStorage.setItem('deepdive_lastfm_key', '0123456789abcdef0123456789abcdef');
  }, theme);
  await ctx.route('https://ws.audioscrobbler.com/**', (r) => {
    const a = new URL(r.request().url()).searchParams.get('artist') || '';
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ toptags: { tag: [{ name: a === 'Houseghost' ? 'shoegaze' : 'punk', count: 100 }, { name: 'hardcore', count: 60 }] } }) });
  });
  await ctx.route('https://image-cdn-ak.spotifycdn.com/**', (r) => r.fulfill({ status: 404, body: '' }));
  await ctx.route('https://i.scdn.co/**', (r) => r.fulfill({ status: 200, contentType: 'image/png', body: icon }));
  await ctx.route('https://api.spotify.com/**', async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    const path = u.pathname.replace('/v1/', '');
    calls.push(`${req.method()} ${path}${u.search}`);
    const json = (b, s = 200) => route.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(b) });
    if (path === 'me') return json(me);
    if (path === 'me/playlists') return json({ items: playlists, next: null, total: playlists.length });
    if (path === 'me/tracks') return json({ items: liked, next: null, total: liked.length });
    if (path === 'me/library') return json({});
    const m = path.match(/^playlists\/(\w+)\/items$/);
    if (m) { const p = playlists.find((x) => x.id === m[1]); return json({ items: p && p.tracks.total ? [{ added_at: ago(p.made) }] : [] }); }
    return json({ items: [], next: null, total: 0 });
  });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errs.push(`${name}-${theme}: ${m.text()}`); });
  page.on('pageerror', (e) => errs.push(`${name}-${theme}: pageerror ${e.message}`));
  await page.goto(`${BASE}/app/`, { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  await page.locator('[data-tab="settings"]:visible').first().click();
  await page.waitForTimeout(500);
  await page.locator('#find-playlists').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${OUT}/settings-${name}-${theme}.png` });
  await page.locator('#find-playlists').click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/playlists-loading-${name}-${theme}.png` });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/playlists-${name}-${theme}.png`, fullPage: true });
  if (name === 'phone' && theme === 'dark') {
    console.log('old button:', await page.locator('#pl-rm-old').textContent());
    await page.locator('#pl-rm-old').click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/playlists-confirm-${name}-${theme}.png` });
    await page.locator('.modal [data-c="yes"]').click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/playlists-after-${name}-${theme}.png`, fullPage: true });
    console.log('rows left:', await page.locator('.ddpl-row').count());
    await page.locator('[data-pl-refresh]').first().click();
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${OUT}/playlists-refresh-${name}-${theme}.png` });
    console.log('single refresh skips the picker:', await page.locator('[data-refresh-pl]').count() === 0, '| review:', await page.locator('#refresh-back').count() === 1);
    await page.locator('#refresh-back').click();
    await page.waitForTimeout(800);
    console.log('back lands on playlists:', await page.locator('#pl-list').count() === 1);
  }
  if (name === 'desktop') {
    await page.locator('[data-tab="settings"]:visible').first().click();
    await page.waitForTimeout(400);
    const dl = page.waitForEvent('download', { timeout: 60000 });
    await page.locator('#set-export-liked').click();
    if (theme === 'light') {
      await page.waitForSelector('.modal [data-c="yes"]', { timeout: 10000 });
      await page.screenshot({ path: `${OUT}/export-ask-${name}-${theme}.png` });
      console.log('genre prompt:', await page.locator('.modal:has([data-c]) h2').textContent());
      await page.locator('.modal [data-c="yes"]').click();
      await page.waitForTimeout(800);
      await page.screenshot({ path: `${OUT}/export-genres-${name}-${theme}.png` });
    }
    const d = await dl;
    const file = `${OUT}/${d.suggestedFilename()}`;
    await d.saveAs(file);
    console.log('export file:', d.suggestedFilename());
    console.log(readFileSync(file, 'utf8').split('\r\n').slice(0, 3).join('\n'));
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/export-done-${name}-${theme}.png` });
  }
  await ctx.close();
}
}
await browser.close();
console.log(calls.filter((c) => !c.startsWith('GET me')).filter((c, i, a) => a.indexOf(c) === i).join('\n'));
console.log('ERRORS', errs.length ? errs.join('\n') : 'none');
