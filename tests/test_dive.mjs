import { readFileSync } from 'fs';
const html=readFileSync(new URL('../docs/app/index.html', import.meta.url),'utf8');
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
check('images added as discovered', /function addDiveImage\(url\)/.test(src));

// The tile hand-off is gone. It existed so the dive screen was never
// blank, but a 56px thumbnail stretched full-screen was pixelated on
// every tile-started dive — the reason a search dive looked right and a
// suggestion dive did not. A loading field covers the same gap and is
// never wrong.
check('no artwork is handed to the dive', !/startSearch\(artistName, artworkUrl/.test(src));
check('loading field exists', /id="dive-loading"/.test(html));
check('loading field clears on first photo', /load\.classList\.add\("off"\)/.test(src));
check('loading field returns for a new dive', /load0\.classList\.remove\("off"\)/.test(src));
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
// A sampler spans 8-12 artists and cannot preload them all without a
// long spinner, so it waits for the first two — enough for the first
// rotation to have somewhere to go — and streams the rest in.
check('sampler waits for two photos', /const seeds = artists\.map\(photoFor\)\.filter\(Boolean\)\.slice\(0, 2\)/.test(src));
check('sampler shows the spinner while it waits', /showDiveSpinner\(\);\s*\n\s*await Promise\.all\(seeds\.map/.test(src));
check('screen opens only after the wait', src.indexOf('await Promise.all(seeds.map') < src.indexOf('showDiveScreen("Building your sampler'));
check('seeded photos go up first', /seeds\.forEach\(\(u\) => addDiveImage\(u\)\);/.test(src));
check('sampler still seeds every artist', /artists\.forEach\(\(a\) => addDiveImage\(photoFor\(a\)\)\);/.test(src));
check('sampler adds each as it goes', /if \(a\) addDiveImage\(photoFor\(a\)\);/.test(src));
check('photo accessor prefers the full-size copy', /a\.image_url_large \|\| a\.image_url/.test(src));
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
check('pins store a large url', /image_url_large: imageUrlLarge/.test(wl));


// The onArtist callback sat one line above `const artist`, inside a
// try/catch. `const` is in the temporal dead zone until its declaration
// runs, so this threw a ReferenceError on every single dive and the
// guard swallowed it — the callback never fired at all. A search dive
// showed a black screen; a tile dive kept the 160px thumbnail for the
// whole run. Order matters here, so it is pinned.
const sr = rf2(new URL('../docs/js/search.js', import.meta.url), 'utf8');
const declAt = sr.indexOf('const artist = resolvedArtist ||');
const callAt = sr.indexOf('onArtist(artist)');
check('artist is resolved before onArtist fires', declAt > -1 && callAt > declAt);
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


check('slide url kept on the element', /slide\.dataset\.url = url;/.test(src));




// The full screen waits for a photo. Opening it earlier means showing
// either an empty field or a stretched thumbnail, and both were tried.
check('spinner exists', /id="dive-spinner"/.test(html));
check('spinner shows before the dive', /showDiveSpinner\(\);/.test(src));
check('spinner label is static', /Starting…/.test(html));
check('artist resolved before the screen opens', src.indexOf('await client.findArtist(artistName)') < src.indexOf('showDiveScreen(`Diving into'));
check('photo preloaded before the screen opens', /await preloadPhoto\(largestImage\(artist\.images\)\)/.test(src));
check('preload cannot hang the dive', /setTimeout\(done, timeoutMs\)/.test(src));
check('preload survives a broken url', /img\.onerror = done;/.test(src));
check('resolved artist is reused, not refetched', /resolvedArtist: artist/.test(src));
check('search accepts a resolved artist', /resolvedArtist \|\| await client\.findArtist/.test(sr));


// The sampler intro is a page in `root`; the dive screen is a fixed
// overlay above it. Nothing cleared the intro, so it sat underneath for
// the whole run and came back the moment the overlay went away — on
// cancel, and behind the results dialog on success.
const samplerBlock = src.slice(src.indexOf('async function runSampler'), src.indexOf('openCardModal(card);'));
check('sampler clears its intro page', /root\.innerHTML = "";/.test(samplerBlock));
check('sampler restores home before results', /hideDiveScreen\(\);\s*\n\s*await renderHome\(\);/.test(samplerBlock));

// The sampler and a dive use different endpoints entirely — the sampler
// never reads a catalogue — which is why one kept working while the
// other was refused. Worth pinning, since it is the evidence that the
// two draw on separate quota buckets.
check('sampler does not read catalogues', !/artists\/\$\{a\.id\}\/albums/.test(src));
check('sampler uses top-tracks then search', /artists\/\$\{a\.id\}\/top-tracks/.test(src) && /q: `artist:/.test(src));
// A deprecated endpoint is refused for the whole app, so asking once per
// artist spent a guaranteed-failing request eight to twelve times a run.
check('a refusal is remembered', /_topTracksBlocked = true;/.test(src));
check('and short-circuits the rest of the run', /if \(_topTracksBlocked\) throw new Error/.test(src));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
