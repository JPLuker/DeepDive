// Desktop layout.
//
// Every breakpoint used to be max-width, so the base styles were a 760px
// column that a wide screen centred — and with .tabbar hidden above
// 640px, desktop had no navigation at all.
//
// The first attempt made the tab bar a left rail. It was wrong twice
// over: two buttons at the top of a full-height column left most of it
// empty, and the tabs carry text labels that don't fit a 48px square.
// Navigation lives in the top bar the app already has, driven by the
// same delegated [data-tab] handler.
import { readFileSync } from 'fs';
const h = readFileSync(new URL('../docs/app/index.html', import.meta.url), 'utf8');
const js = readFileSync(new URL('../docs/js/app.js', import.meta.url), 'utf8');

let pass = 0, fail = 0;
function check(l, c) { if (c) pass++; else { fail++; console.log('FAIL:', l); } }

const desk = h.slice(h.indexOf('@media (min-width: 900px)'), h.indexOf('/* ---- mobile'));
const wide = h.slice(h.indexOf('@media (min-width: 1280px)'), h.indexOf('/* ---- mobile'));

check('there is a desktop breakpoint', desk.length > 0);
check('and a wider one above it', wide.length > 0);

// Navigation
check('top-bar nav exists', /<button class="topnav-btn" data-tab="home">/.test(h));
check('and settings', /<button class="topnav-btn" data-tab="settings">/.test(h));
check('hidden until desktop', /\.topnav \{ display:none; \}/.test(h));
check('shown at desktop', /\.topnav \{ display:flex/.test(desk));
check('reuses the delegated handler', /e\.target\.closest\("\[data-tab\]"\)/.test(js));
check('active state covers both navs', /querySelectorAll\("\.tab, \.topnav-btn"\)/.test(js));

// The rail is gone, and so is everything that had to work around it.
check('no left rail', !/--rail/.test(h));
check('body is not offset', !/body \{ padding-left/.test(desk));
check('docked actions are not offset', !/\.results-actions \{ left:/.test(desk));

// Density, not width.
check('tiles go to three', /\.tile-grid \{ grid-template-columns:repeat\(3,1fr\)/.test(desk));
check('then four', /\.tile-grid \{ grid-template-columns:repeat\(4,1fr\); \}/.test(wide));
check('cards follow', /\.card-row \{ grid-template-columns:repeat\(4,1fr\); \}/.test(wide));
check('measure is bounded, not full width', /--measure:1080px;/.test(wide));
check('everything shares the measure', /\.wrap, \.flash, \.row-head, \.topbar \{ max-width:var\(--measure\); \}/.test(desk));

// Build tag sits with the support link rather than alone in a corner.
check('build tag is in the top bar right', /topbar-right">\s*\n\s*<span class="build-tag"/.test(h));

// Mobile untouched.
check('mobile breakpoint intact', /@media \(max-width: 640px\)/.test(h));

// A centred layout sits left of true centre once a scrollbar appears,
// because centring happens inside the space the scrollbar leaves. That
// reads as an uneven right margin.
check('scrollbar gutter is reserved', /scrollbar-gutter:stable both-edges/.test(h));
check('one gutter variable', /--gutter:28px;/.test(h));
check('wrap uses it', /\.wrap \{ padding:0 var\(--gutter\) 96px; \}/.test(desk));
check('topbar uses it', /\.topbar \{ margin:0 auto; padding-left:var\(--gutter\)/.test(desk));
check('flash uses it', /\.flash \{ padding-left:var\(--gutter\)/.test(desk));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
