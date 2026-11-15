// Every button modifier used in markup has a rule in the app stylesheet.
//
// 2.9.143 gave Export and Import backup `btn-secondary`, a class with no
// CSS. `.btn` sets no colour, so they took the browser's default text
// colour: near-black on the dark theme's tiles, 1.18:1 (tools/review.mjs,
// 15 Nov). Both buttons were close to invisible in dark mode.
import { readFileSync, readdirSync } from 'node:fs';
const shell = readFileSync(new URL('../docs/app/index.html', import.meta.url), 'utf8');
const jsDir = new URL('../docs/js/', import.meta.url);
const sources = readdirSync(jsDir).filter((f) => f.endsWith('.js')).map((f) => readFileSync(new URL(f, jsDir), 'utf8'));
let pass = 0, fail = 0;
const check = (l, c) => { if (c) pass++; else { fail++; console.log('FAIL:', l); } };

const used = new Set();
for (const s of [shell, ...sources]) {
  for (const m of s.matchAll(/class="([^"$]*\bbtn\b[^"$]*)"/g)) {
    for (const c of m[1].split(/\s+/)) if (/^btn-[a-z-]+$/.test(c)) used.add(c);
  }
}
check('found the button modifiers in use', used.size >= 5);
for (const c of used) check(`.${c} has a rule in the app stylesheet`, new RegExp(`\\.${c}\\b[^{]*\\{`).test(shell));
check('the base button sets no colour, so a modifier must', !/\.btn \{[^}]*\bcolor:/.test(shell));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
