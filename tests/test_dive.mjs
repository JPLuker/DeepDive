import { readFileSync } from 'fs';
const html=readFileSync(new URL('../docs/index.html', import.meta.url),'utf8');
const app=readFileSync(new URL('../docs/app/index.html', import.meta.url),'utf8');
const src=readFileSync(new URL('../docs/js/app.js', import.meta.url),'utf8');
let pass=0,fail=0; function check(l,c){if(c)pass++;else{fail++;console.log('FAIL:',l);}}

check('full-screen dive exists', /id="dive-screen"/.test(app));
check('covers the screen', /\.dive-screen \{ position:fixed; inset:0; z-index:60/.test(html));
check('status sits at the bottom', /\.dive-foot \{ position:absolute; left:0; right:0; bottom:0/.test(html));
check('no card in the middle', !/renderProgress\(/.test(src));
check('old card progress removed', !/function updateProgress\(/.test(src));

// slideshow
check('slides crossfade', /\.dive-slide \{[\s\S]{0,140}transition:opacity 1\.1s/.test(html));
check('images added as discovered', /function addDiveImage\(url, \{ placeholder = false \} = \{\}\)/.test(src));
check('broken urls never become blank slides', /probe\.onload = \(\) => \{[\s\S]{0,200}_diveImages\.push/.test(src));
check('no duplicates', /_diveImages\.includes\(url\)/.test(src));
check('rotation runs on a timer', /_diveSlideTimer = setInterval/.test(src));
check('rotation stops when hidden', /clearInterval\(_diveSlideTimer\)/.test(src));

// sources
// Spotify's `images` is one photo at three sizes, so only the largest is
// ever wanted — taking all three showed the same picture repeatedly and
// upscaled the 160px copy across the whole screen.
check('only the largest artist photo used', /function largestImage\(images\)/.test(src));
check('no longer adds every image size', !/\(\(a && a\.images\) \|\| \[\]\)\.forEach\(\(im\) => addDiveImage\(im\.url\)\)/.test(src));
check('album art gated behind having no photo', /if \(!_haveArtistPhoto\) addDiveImage\(url\)/.test(src));
check('photo flag is actually set', /_haveArtistPhoto = true/.test(src));
check('fetches photos when search has none', /function fetchArtistImages\(artistId\)/.test(src));

// multi-artist
// The sampler slideshow used `image_url`, which searchArtists sets to the
// SMALLEST of Spotify's three sizes because it also feeds 44px tiles.
// Full screen needs the 640px original, so both paths now prefer it.
check('sampler seeds every artist', /artists\.forEach\(\(a\) => addDiveImage\(a\.image_url_large \|\| a\.image_url\)\)/.test(src));
check('sampler adds each as it goes', /if \(a\) addDiveImage\(a\.image_url_large \|\| a\.image_url\)/.test(src));
check('sampler no longer uses the tile-sized copy alone', !/addDiveImage\(a\.image_url\);/.test(src));
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


// Full-size photo plumbing: every route into the dive screen must carry
// the 640px original, not the tile thumbnail. Each of these was a
// separate place the small copy leaked through to full screen.
import { readFileSync as rf2 } from 'fs';
const sp = rf2(new URL('../docs/js/spotify.js', import.meta.url), 'utf8');
const wl = rf2(new URL('../docs/js/watchlist.js', import.meta.url), 'utf8');
check('searchArtists returns both sizes', /image_url_large: images\.length \? images\[0\]\.url : null/.test(sp));
check('suggestions carry a large url', /image_url_large: biggest\(a\.images\)/.test(sp + src));
check('bigArt prefers the large url', /const bigArt = \(name, fallback, large\) => \{\s*if \(large\) return large;/.test(src));
check('pins store a large url', /image_url_large: imageUrlLarge/.test(wl));


// The onArtist callback sat one line above `const artist`, inside a
// try/catch. `const` is in the temporal dead zone until its declaration
// runs, so this threw a ReferenceError on every single dive and the
// guard swallowed it — the callback never fired at all. A search dive
// showed a black screen; a tile dive kept the 160px thumbnail for the
// whole run. Order matters here, so it is pinned.
const sr = rf2(new URL('../docs/js/search.js', import.meta.url), 'utf8');
const declAt = sr.indexOf('const artist = await client.findArtist');
const callAt = sr.indexOf('onArtist(artist)');
check('artist is resolved before onArtist fires', declAt > -1 && callAt > declAt);
check('placeholder is marked as such', /addDiveImage\(_pendingArtwork, \{ placeholder: true \}\)/.test(src));
check('placeholder is dropped for a real photo', /function dropPlaceholderSlide\(\)/.test(src));
check('real photos drop the placeholder', /setTimeout\(dropPlaceholderSlide, SLIDE_FADE_MS\)/.test(src));
check('placeholder is held for the crossfade', /const SLIDE_FADE_MS = 1100;/.test(src));
// Two nested rAFs, not one: a single frame lets the browser coalesce the
// append and the class change into one style pass, and the transition
// never runs. That was the hard cut.
check('fade waits two frames', /requestAnimationFrame\(\(\) => requestAnimationFrame\(/.test(src));
check('suggestions borrow the large variant', /cachedArt\.largeById && cachedArt\.largeById\.get\(x\.id\)/.test(src));


// Tiles are 56px CSS = ~168 device px at 3x. Spotify's smallest album
// variant is 64px, so tiles fed the smallest image pixelate badly. The
// middle variant is the minimum that holds up.
const ins = rf2(new URL('../docs/js/insights.js', import.meta.url), 'utf8');
check('tile art uses the middle variant', /function tileImage\(images\)/.test(ins));
check('library art no longer uses the smallest', !/entry\.image_url = smallestImage\(t\.album\.images\)/.test(ins));
check('searchArtists tiles use the middle variant', /images\.length >= 2 \? images\[1\]\.url : images\[0\]\.url/.test(sp));
check('full-size still reserved for the dive', /image_url_large: images\.length \? images\[0\]\.url : null/.test(sp));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
