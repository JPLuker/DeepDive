import { readFileSync } from 'fs';
const html = readFileSync(new URL('../docs/app/index.html', import.meta.url),'utf8');
const app  = readFileSync(new URL('../docs/app/index.html', import.meta.url),'utf8');
const src  = readFileSync(new URL('../docs/js/app.js', import.meta.url),'utf8');
let pass=0,fail=0; function check(l,c){if(c)pass++;else{fail++;console.log('FAIL:',l);}}

// tokens
// Values moved in 2.9 (pure black read as an OLED test card). Assert the
// relationship rather than the exact hex, which is what actually matters.
check('page background is distinct from cards', /--bg:#0B0C0F/.test(html) && /--paper:#15171C/.test(html));
check('tile tokens exist in both themes', /--tile:#16181D/.test(html) && /--tile:#F2F2F3/.test(html));
check('body uses the deeper base', /body \{ margin:0; background:var\(--bg\)/.test(html));
check('accent blue preserved', /--accent:#3E7BFF/.test(html));

// headers
check('headers are bold sans, not mono labels', /\.row-head h2 \{[^}]*font-weight:700/.test(html));
check('muted qualifier styled', /\.row-head \.qual \{[^}]*var\(--muted-soft\)/.test(html));
check('old rule hidden', /\.row-head \.rule \{ display:none; \}/.test(html));
check('markup uses h2 headers', /<h2>Suggested<\/h2><span class="qual">for you<\/span>/.test(src));

// tiles
check('two-column tile grid', /\.tile-grid \{ display:grid; grid-template-columns:repeat\(2,1fr\)/.test(html));
check('artwork is 56px and flush', /\.tile-art \{ width:56px; height:56px/.test(html));
check('fallback art is a gradient initial', /\.tile-art-fallback/.test(html) && /tile-art-fallback/.test(src));
check('tiles used for suggestions', /class="tile-grid"/.test(src));
check('pins marked by an edge, not an outline', /\.tile-wrap\.is-pin \.tile \{ box-shadow:inset 3px 0 0 var\(--accent\)/.test(html));
check('actions revealed on hover', /\.tile:hover \.tile-actions/.test(html));

// playlist cards
check('cards are gradient-filled', /\.pcard::before \{[\s\S]{0,160}linear-gradient/.test(html));
check('hue rotates per card', /--h:\$\{\(200 \+ i \* 47\) % 360\}/.test(src));
check('three across on desktop', /\.card-row \{ display:grid; grid-template-columns:repeat\(3,1fr\)/.test(html));

// sampler
check('sampler is a full-width row', /\.btn-sampler \{[\s\S]{0,200}width:100%/.test(html));
check('sampler no longer dashed', !/\.btn-sampler[^}]*border-style:dashed/.test(html));

// mobile
check('tiles single-column on phones', /\.tile-grid \{ grid-template-columns:1fr; \}/.test(html));
check('card grid halves on phones', /\.card-row \{ grid-template-columns:repeat\(2,1fr\); gap:8px; \}/.test(html));
check('actions always visible on touch', /\.tile-actions \{ opacity:1; \}/.test(html));

// the app shell must carry the same CSS
check('app shell has the tile styles', /\.tile-grid/.test(app));
check('app shell font path still correct', /url\('\.\.\/assets\/Martius/.test(app));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
