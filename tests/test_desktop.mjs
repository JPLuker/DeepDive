// Desktop layout.
//
// Every breakpoint in this stylesheet used to be max-width, so the base
// styles were a 760px column that a 1920px screen simply centred — with
// .tabbar hidden above 640px, desktop had no navigation at all.
//
// The fix is structural rather than a scale-up: the tab bar becomes a
// fixed left rail using the same markup, and the grids grow their
// column count with the viewport. The content measure stays bounded,
// because the tile vocabulary reads as sparse stretched across 1920px.
import { readFileSync } from 'fs';
const h = readFileSync(new URL('../docs/app/index.html', import.meta.url), 'utf8');
const js = readFileSync(new URL('../docs/js/app.js', import.meta.url), 'utf8');

let pass = 0, fail = 0;
function check(l, c) { if (c) pass++; else { fail++; console.log('FAIL:', l); } }

const desk = h.slice(h.indexOf('@media (min-width: 900px)'), h.indexOf('/* ---- mobile'));
const wide = h.slice(h.indexOf('@media (min-width: 1280px)'), h.indexOf('/* ---- mobile'));

check('there is a desktop breakpoint at all', desk.length > 0);
check('and a wider one above it', wide.length > 0);

// Navigation. The rail reuses the mobile markup, so nothing in the JS
// needs to know which layout is showing.
check('rail is the tab bar, not new markup', /\.tabbar \{[\s\S]*?position:fixed/.test(desk));
check('rail is vertical', /flex-direction:column/.test(desk));
check('page clears the rail', /body \{ padding-left:var\(--rail\); \}/.test(desk));
check('rail uses the real active class', /\.tabbar \.tab\.active/.test(desk));
check('active class matches the JS', /classList\.toggle\("active"/.test(js));

// Grids grow rather than staying at two.
check('tiles widen to three', /\.tile-grid \{ grid-template-columns:repeat\(3,1fr\)/.test(desk));
check('and four when there is room', /\.tile-grid \{ grid-template-columns:repeat\(4,1fr\); \}/.test(wide));
check('cards widen too', /\.card-row \{ grid-template-columns:repeat\(4,1fr\); \}/.test(wide));

// Everything bound to the old 760px measure has to move together, or
// the page becomes columns of different widths stacked on each other.
check('measure is a variable', /--measure:/.test(h));
check('wrap, flash and row heads share it', /\.wrap, \.flash, \.row-head \{ max-width:var\(--measure\); \}/.test(desk));
check('topbar shares it', /\.topbar \{ max-width:var\(--measure\)/.test(desk));

// Fixed elements must clear the rail rather than sit beneath it.
check('docked results actions clear the rail', /\.results-actions \{ left:var\(--rail\); \}/.test(desk));

// Mobile is untouched: these are min-width rules and the phone
// breakpoint stays max-width.
check('mobile breakpoint still exists', /@media \(max-width: 640px\)/.test(h));
check('desktop rules do not use max-width', !/@media \(min-width: 900px\)[\s\S]{0,40}max-width:\s*640/.test(h));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
