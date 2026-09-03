import { readFileSync } from 'fs';
const html=readFileSync('/home/claude/dd/index.html','utf8');
const app=readFileSync('/home/claude/dd/app/index.html','utf8');
const src=readFileSync('/home/claude/dd/js/app.js','utf8');
let pass=0,fail=0; function check(l,c){if(c)pass++;else{fail++;console.log('FAIL:',l);}}

check('full-screen dive exists', /id="dive-screen"/.test(app));
check('covers the screen', /\.dive-screen \{ position:fixed; inset:0; z-index:60/.test(html));
check('status sits at the bottom', /\.dive-foot \{ position:absolute; left:0; right:0; bottom:0/.test(html));
check('no card in the middle', !/renderProgress\(/.test(src));
check('old card progress removed', !/function updateProgress\(/.test(src));

// slideshow
check('slides crossfade', /\.dive-slide \{[\s\S]{0,140}transition:opacity 1\.1s/.test(html));
check('images added as discovered', /function addDiveImage\(url\)/.test(src));
check('broken urls never become blank slides', /probe\.onload = \(\) => \{[\s\S]{0,200}_diveImages\.push/.test(src));
check('no duplicates', /_diveImages\.includes\(url\)/.test(src));
check('rotation runs on a timer', /_diveSlideTimer = setInterval/.test(src));
check('rotation stops when hidden', /clearInterval\(_diveSlideTimer\)/.test(src));

// sources
check('all artist photos used', /\(\(a && a\.images\) \|\| \[\]\)\.forEach\(\(im\) => addDiveImage\(im\.url\)\)/.test(src));
check('album covers join as read', /onArtwork: \(url\) => addDiveImage\(url\)/.test(src));
check('fetches photos when search has none', /function fetchArtistImages\(artistId\)/.test(src));

// multi-artist
check('sampler seeds every artist', /artists\.forEach\(\(a\) => \{ if \(a\.image_url\) addDiveImage/.test(src));
check('sampler adds each as it goes', /if \(a && a\.image_url\) addDiveImage\(a\.image_url\)/.test(src));
check('library scan feeds it too', /onArtwork: \(url\) => addDiveImage\(url\),\s*\}\);/.test(src));

// lifecycle
check('hidden on results', /hideDiveScreen\(\);\s*if \(_diveCancelled\) return;/.test(src) || /hideDiveScreen\(\);\s*lastResult/.test(src));
check('hidden on error', /hideDiveScreen\(\);\s*if \(!_diveCancelled\) renderProgressError/.test(src));
check('cancellable', /id="dive-cancel"/.test(app) && /_diveCancelled = true;/.test(src));

// Percentage returned in 2.6.4 — the full-screen rewrite dropped it.
check('percentage element exists', /id="dive-pct"/.test(app));
check('right-aligned under the bar', /\.dive-pct \{ align-self:flex-end/.test(html));
check('updated with progress', /pc\.textContent = `\$\{pct\}%`/.test(src));
check('reset when a dive starts', /pc0\.textContent = "0%"/.test(src));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
