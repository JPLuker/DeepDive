import { readFileSync } from 'fs';
const html=readFileSync(new URL('../docs/index.html', import.meta.url),'utf8');
const src=readFileSync(new URL('../docs/js/app.js', import.meta.url),'utf8');
const sr=readFileSync(new URL('../docs/js/search.js', import.meta.url),'utf8');
let pass=0,fail=0; function check(l,c){if(c)pass++;else{fail++;console.log('FAIL:',l);}}

// The splash and per-view backdrop were superseded by the full-screen
// dive in 2.6.2; that behaviour is covered by test_dive.mjs.
// Moved into the shell in 2.5.9 — a per-view copy at z-index:-1 painted
// behind the page background.

// artist photo preferred, album art as fallback
check('search reports album art', /onArtwork\(withArt\.album\.images\[0\]\.url\)/.test(sr));

// tap highlight
check('tap highlight suppressed', /-webkit-tap-highlight-color:transparent/.test(html));
check('replaced with our own pressed state', /\.tab:active, \.tile:active/.test(html));
check('keyboard focus preserved', /:focus-visible \{ outline:2px solid var\(--accent\)/.test(html));

// skeletons
check('skeleton styles', /\.tile-skeleton/.test(html));
check('skeletons shown while loading', /sk-lines/.test(src));
check('skeletons pulse', /@keyframes sk-pulse/.test(html));

// settings
check('Manage section', /<span class="label teal">Manage<\/span>/.test(src));
check('History is its own section', /<span class="label gold">History<\/span>/.test(src));

// spotify client
check('opens the client via URI', /const uri = `spotify:\$\{m\[1\]\}:\$\{m\[2\]\}`/.test(src));
check('falls back to web', /window\.open\(webUrl, "_blank", "noopener"\)/.test(src));
check('cancels fallback if handled', /visibilitychange/.test(src));
check('links routed through it', /a\[data-spotify\]/.test(src));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
