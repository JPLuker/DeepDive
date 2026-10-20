// Full-page baselines of the landing page, for proving a CSS deletion
// changed nothing. Full-page rather than viewport: a rule that only
// affects something below the fold is exactly the kind this is meant
// to catch.
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import { mkdirSync } from 'fs';

const OUT = process.argv[2] || 'shots/landing-before';
mkdirSync(OUT, { recursive: true });
const b = await chromium.launch();
for (const [name, width, height] of [['phone', 390, 844], ['tablet', 820, 1180], ['desktop', 1440, 900]]) {
  for (const theme of ['light', 'dark']) {
    const ctx = await b.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
    await ctx.addInitScript((t) => { try { localStorage.setItem('deepdive_theme', t); } catch (e) {} }, theme);
    const p = await ctx.newPage();
    await p.goto('http://127.0.0.1:8231/', { waitUntil: 'load' });
    // Fonts and any entrance animation have to settle, or the diff
    // catches timing rather than CSS.
    await p.evaluate(() => document.fonts && document.fonts.ready);
    await p.evaluate(() => {
      const s = document.createElement('style');
      s.textContent = '*,*::before,*::after{animation:none!important;transition:none!important;}';
      document.head.appendChild(s);
    });
    await p.waitForTimeout(900);
    await p.screenshot({ path: `${OUT}/${name}-${theme}.png`, fullPage: true });
    await ctx.close();
  }
}
await b.close();
console.log('baseline written to', OUT);
