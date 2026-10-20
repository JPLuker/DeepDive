// Compare two screenshot sets pixel for pixel.
//
// Chromium's PNG output is deterministic for a static page with
// animations disabled, so identical bytes mean identical pixels. When
// they differ, decode and count: a handful of pixels is antialiasing,
// a region is a regression.
import { readFileSync, readdirSync } from 'fs';
import { createHash } from 'crypto';
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';

const [a, b] = process.argv.slice(2);
const files = readdirSync(a).filter((f) => f.endsWith('.png'));
let worst = 0;
const browser = await chromium.launch();
const page = await browser.newPage();

for (const f of files) {
  const A = readFileSync(`${a}/${f}`), B = readFileSync(`${b}/${f}`);
  if (createHash('sha1').update(A).digest('hex') === createHash('sha1').update(B).digest('hex')) {
    console.log(`  ${f.padEnd(16)} identical`);
    continue;
  }
  // Decode both in the browser and count differing pixels.
  const res = await page.evaluate(async ([da, db]) => {
    const load = (d) => new Promise((ok, no) => {
      const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = 'data:image/png;base64,' + d;
    });
    const [ia, ib] = await Promise.all([load(da), load(db)]);
    if (ia.width !== ib.width || ia.height !== ib.height) {
      return { size: `${ia.width}x${ia.height} vs ${ib.width}x${ib.height}` };
    }
    const cv = (im) => {
      const c = new OffscreenCanvas(im.width, im.height);
      const x = c.getContext('2d'); x.drawImage(im, 0, 0);
      return x.getImageData(0, 0, im.width, im.height).data;
    };
    const pa = cv(ia), pb = cv(ib);
    let diff = 0, firstY = -1;
    for (let i = 0; i < pa.length; i += 4) {
      if (pa[i] !== pb[i] || pa[i+1] !== pb[i+1] || pa[i+2] !== pb[i+2]) {
        diff++;
        if (firstY < 0) firstY = Math.floor((i / 4) / ia.width);
      }
    }
    return { diff, total: pa.length / 4, firstY, h: ia.height };
  }, [A.toString('base64'), B.toString('base64')]);

  if (res.size) { console.log(`  ${f.padEnd(16)} SIZE CHANGED ${res.size}`); worst = Infinity; continue; }
  const pct = (res.diff / res.total * 100);
  worst = Math.max(worst, pct);
  console.log(`  ${f.padEnd(16)} ${res.diff} px differ (${pct.toFixed(4)}%), first at y=${res.firstY} of ${res.h}`);
}
await browser.close();
console.log(worst === 0 ? '\nIDENTICAL — the deletion changed nothing' : `\nworst difference: ${worst === Infinity ? 'size change' : worst.toFixed(4) + '%'}`);
