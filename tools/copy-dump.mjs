// Every visible string, per screen, in reading order.
//
// The 2.9.9x copy rewrite was attempted as a fillable PDF of 488
// strings pulled out of the source. It failed: out of context, on a
// phone, nobody can tell whether a string earns its place. Part 10.1
// is "if I delete this, does the user lose the ability to understand,
// decide, or act?" — which can only be answered where the string
// actually sits.
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';

const SCREENS = ['home', 'mixes', 'crate', 'multidip', 'sampler', 'scan', 'settings', 'results', 'dive', 'chooser'];
const b = await chromium.launch();
for (const s of SCREENS) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  await p.goto(`http://127.0.0.1:8231/app/?demo=${s}`, { waitUntil: 'load' });
  await p.waitForTimeout(1600);
  const lines = await p.evaluate(() => {
    const out = [];
    const walk = (el) => {
      for (const n of el.childNodes) {
        if (n.nodeType === 3) {
          const t = n.textContent.replace(/\s+/g, ' ').trim();
          if (t) out.push({ tag: n.parentElement?.tagName.toLowerCase(), cls: n.parentElement?.className || '', t });
        } else if (n.nodeType === 1 && getComputedStyle(n).display !== 'none') {
          if (n.tagName === 'INPUT' && n.placeholder) out.push({ tag: 'input', cls: n.className, t: '[placeholder] ' + n.placeholder });
          walk(n);
        }
      }
    };
    walk(document.body);
    return out;
  });
  console.log(`\n═══ ${s} ═══`);
  for (const l of lines) {
    const where = String(l.cls).split(' ')[0] || l.tag;
    console.log(`  [${where}] ${l.t}`);
  }
  await ctx.close();
}
await b.close();
