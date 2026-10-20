// DESIGN.md Part 21.2, the parts a machine can check.
//
// The checklist is written to be run by eye, and by eye it gets
// ticked. Contrast against whatever actually sits behind a glass
// panel, a 36px tap target, a second primary button below the fold —
// these are measurable in a rendered page, so measure them.
//
// What stays human: whether a screen has the right focal point, and
// whether a string earns its place. Those are in TESTING.md.
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';

const SCREENS = ['home', 'mixes', 'crate', 'multidip', 'sampler', 'scan', 'settings'];
const b = await chromium.launch();
const findings = [];

for (const screen of SCREENS) {
  for (const theme of ['light', 'dark']) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    await ctx.addInitScript((t) => { try { localStorage.setItem('deepdive_theme', t); } catch (e) {} }, theme);
    const p = await ctx.newPage();
    await p.goto(`http://127.0.0.1:8231/app/?demo=${screen}`, { waitUntil: 'load' });
    await p.waitForTimeout(1400);

    const out = await p.evaluate(() => {
      const res = { primaries: 0, small: [], tiny: [], contrast: [], noFocus: 0 };

      // Luminance and ratio, per WCAG.
      const lum = (c) => {
        const [r, g, bl] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
        return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
      };
      const parse = (s) => (s.match(/[\d.]+/g) || []).slice(0, 4).map(Number);
      const ratio = (fg, bg) => {
        const a = lum(fg), b2 = lum(bg);
        return (Math.max(a, b2) + 0.05) / (Math.min(a, b2) + 0.05);
      };
      // Walk up for the first opaque background, compositing any
      // translucent layers on the way — which is the only honest way
      // to score text sitting on glass.
      const effectiveBg = (el) => {
        let acc = null;
        for (let n = el; n; n = n.parentElement) {
          const c = parse(getComputedStyle(n).backgroundColor);
          if (!c.length) continue;
          const a = c.length === 4 ? c[3] : 1;
          if (a === 0) continue;
          const layer = c.slice(0, 3);
          acc = acc === null ? (a === 1 ? layer : { layer, a }) : acc;
          if (a === 1) {
            if (acc && acc.layer) {
              return acc.layer.map((v, i) => Math.round(v * acc.a + layer[i] * (1 - acc.a)));
            }
            return layer;
          }
        }
        return [255, 255, 255];
      };

      document.querySelectorAll('*').forEach((el) => {
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') return;
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) return;

        if (el.classList.contains('btn-primary')) res.primaries++;

        // Touch targets. 14.3 puts icon buttons at 36px minimum; the
        // platform guidance in 21.2 is stricter for anything tappable.
        // A link inside a sentence is not a standalone tap target,
        // and padding it to 36px would break the line it sits in.
        // 21.2 is about controls; the credit line's GitHub and
        // LinkedIn links are prose. Everything else is fair game.
        const inProse = el.tagName === 'A'
          && el.parentElement
          && /^(P|LI|SPAN)$/.test(el.parentElement.tagName)
          && [...el.parentElement.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 3);
        const tappable = el.matches('button, a, [role="button"], input[type="checkbox"], select');
        if (tappable && !inProse && (r.width < 36 || r.height < 36) && r.width > 2) {
          res.small.push(`${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ')[0]} ${Math.round(r.width)}x${Math.round(r.height)}`);
        }

        const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
        if (!own) return;
        const size = parseFloat(cs.fontSize);
        if (size < 12) res.tiny.push(`${(el.className || '').toString().split(' ')[0] || el.tagName} ${size}px`);

        const fg = parse(cs.color).slice(0, 3);
        const bg = effectiveBg(el);
        const rr = ratio(fg, bg);
        const large = size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700);
        const need = large ? 3 : 4.5;
        if (rr < need) {
          const txt = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' ').trim().slice(0, 28);
          res.contrast.push(`${(el.className || '').toString().split(' ')[0] || el.tagName} ${rr.toFixed(2)}:1 (needs ${need}) ${size}px "${txt}"`);
        }
      });
      return res;
    });

    const tag = `${screen}/${theme}`;
    if (out.primaries > 1) findings.push(`${tag}: ${out.primaries} primary buttons (P1 wants one focal action)`);
    for (const s of new Set(out.tiny)) findings.push(`${tag}: text under 12px — ${s}`);
    for (const s of new Set(out.small)) findings.push(`${tag}: tap target under 36px — ${s}`);
    for (const s of new Set(out.contrast)) findings.push(`${tag}: contrast — ${s}`);
    await ctx.close();
  }
}
await b.close();

if (!findings.length) console.log('Part 21.2: nothing measurable to report');
else { console.log(`${findings.length} finding(s):`); for (const f of findings) console.log('  ' + f); }
