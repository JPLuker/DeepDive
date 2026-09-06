// Structural check on the stylesheet.
//
// A line-based regex deleting a rule's selector left its declarations
// and closing brace behind. From that brace onward the browser parsed
// garbage, so every later rule — including the mixes grid — silently
// stopped applying. Nothing caught it: the app booted, the suites are
// source-text assertions, and the CSS is not parsed by anything in CI.
//
// The failure is only visible on screen, which makes it exactly the
// kind worth checking mechanically.
import { readFileSync } from 'fs';
const html = readFileSync(new URL('../docs/app/index.html', import.meta.url), 'utf8');
const landing = readFileSync(new URL('../docs/index.html', import.meta.url), 'utf8');

let pass = 0, fail = 0;
function check(l, c) { if (c) pass++; else { fail++; console.log('FAIL:', l); } }

function styleBlocks(doc) {
  const out = [];
  let i = 0;
  for (;;) {
    const a = doc.indexOf('<style>', i);
    if (a < 0) break;
    const b = doc.indexOf('</style>', a);
    out.push(doc.slice(a + 7, b));
    i = b + 8;
  }
  return out;
}

function balance(css) {
  let depth = 0, stray = 0;
  for (const ch of css) {
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth < 0) { stray++; depth = 0; } }
  }
  return { depth, stray };
}

for (const [name, doc] of [['app shell', html], ['landing page', landing]]) {
  const blocks = styleBlocks(doc);
  check(`${name} has a stylesheet`, blocks.length > 0);
  for (const css of blocks) {
    const { depth, stray } = balance(css);
    check(`${name} braces balance`, depth === 0);
    check(`${name} has no stray closing brace`, stray === 0);
    // Declarations sitting outside any rule — the exact debris a
    // deleted selector leaves behind.
    let d = 0, orphan = 0;
    for (const line of css.split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('/*') || t.startsWith('*')) continue;
      if (d === 0 && /^[a-z-]+\s*:\s*[^;]+;/.test(t) && !t.includes('{')) orphan++;
      d += (line.match(/\{/g) || []).length;
      d -= (line.match(/\}/g) || []).length;
      if (d < 0) d = 0;
    }
    check(`${name} has no declarations outside a rule`, orphan === 0);
  }
}

// The rule that actually broke, worth naming.
check('mixes grid rule survives', /\.card-row \{ display:grid;/.test(html));

// Renaming a wrapper silently drops any styling scoped to the old
// class. The support-link switch kept toggling its checkbox while the
// visual never moved, because the checked-state rules were bound to
// .nav-switch and the settings rebuild used .set-switch.
check('both switch wrappers get checked styling', /\.nav-switch input:checked \+ \.switch-track,\s*\n\s*\.set-switch input:checked \+ \.switch-track/.test(html));
check('and both move the thumb', /\.set-switch input:checked \+ \.switch-track \.switch-thumb/.test(html));
check('and both show focus', /\.set-switch input:focus-visible \+ \.switch-track/.test(html));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
