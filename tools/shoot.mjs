// Render the app and the landing page with the Chromium that ships in
// this sandbox.
//
// CLAUDE.md says the desktop and design work was "built without being
// rendered: Chrome won't install in the sandbox, so this was written
// against the stylesheet". That is no longer true, and it matters: the
// project's own notes say a green suite is not a working app, and that
// every serious bug here was found by Joseph looking at a screen.
//
// Not a test. It produces images for a person to look at, plus a
// console-error report, which IS worth failing on.
// Playwright lives in this sandbox's shared tool install, not in the
// repo — the import is absolute so the script runs from anywhere and
// the project gains no dependency it would have to carry.
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import { mkdirSync } from 'fs';

const BASE = process.env.BASE || 'http://127.0.0.1:8231';
const OUT = process.env.OUT || 'shots';
const ONLY = process.argv[2];

const SCREENS = ['home', 'chooser', 'dive', 'mixes', 'results', 'sampler', 'scan', 'crate', 'multidip'];
// newContext takes a `viewport` object. Passing width/height at the
// top level is silently ignored, which rendered every "phone" shot at
// the default desktop size and made the first run useless.
const VIEWPORTS = [
  { name: 'phone', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 },
  { name: 'desktop', viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const problems = [];

async function shoot(ctxOpts, url, file, theme) {
  const ctx = await browser.newContext(ctxOpts);
  // The inline boot script reads this before first paint, so it has to
  // be set before the document runs rather than toggled afterwards.
  await ctx.addInitScript((t) => {
    try { localStorage.setItem('deepdive_theme', t); } catch (e) {}
  }, theme);
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 20000 });
    // Demo screens render from staged data, but the slideshow and the
    // fade-in both animate; give them a beat to settle. Then freeze
    // everything, so a set captured twice can be compared pixel for
    // pixel without catching timing instead of CSS.
    await page.waitForTimeout(1500);
    await page.evaluate(() => {
      const s = document.createElement('style');
      s.textContent = '*,*::before,*::after{animation:none!important;transition:none!important;}';
      document.head.appendChild(s);
    });
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${OUT}/${file}.png`, fullPage: false });
  } catch (e) {
    errs.push('navigation: ' + e.message);
  }
  const real = errs.filter((t) => !/favicon/i.test(t));
  if (real.length) problems.push({ file, errs: real.slice(0, 4) });
  await ctx.close();
}

for (const vp of VIEWPORTS) {
  const { name, ...opts } = vp;
  for (const theme of ['light', 'dark']) {
    if (!ONLY) await shoot(opts, `${BASE}/`, `landing-${name}-${theme}`, theme);
    for (const s of (ONLY ? [ONLY] : SCREENS)) {
      await shoot(opts, `${BASE}/app/?demo=${s}`, `${s}-${name}-${theme}`, theme);
    }
  }
}

await browser.close();
if (problems.length) {
  console.log('CONSOLE ERRORS:');
  for (const p of problems) console.log(` ${p.file}\n   ${p.errs.join('\n   ')}`);
} else {
  console.log('no console errors');
}
