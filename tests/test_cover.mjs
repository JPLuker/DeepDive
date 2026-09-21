// Playlist cover art.
//
// Two unknowns sat in front of this. The technical one was tested
// before any of it was written: Spotify's image CDN sends permissive
// CORS headers, so an album image can be drawn cross-origin and the
// canvas read back. Without that the cover would appear on screen and
// the export would throw.
//
// The other was a product problem — uploading needs `ugc-image-upload`,
// and asking for it up front would make every existing user reconnect
// for something most will never use. Solved by asking at the point
// someone turns it on, which is the only moment anyone has a reason to
// grant it.
import { readFileSync } from 'fs';
import { albumImages, _internals } from '../docs/js/cover.js';
const cov = readFileSync(new URL('../docs/js/cover.js', import.meta.url), 'utf8');
const src = readFileSync(new URL('../docs/js/app.js', import.meta.url), 'utf8');
const sp = readFileSync(new URL('../docs/js/spotify.js', import.meta.url), 'utf8');
const au = readFileSync(new URL('../docs/js/auth.js', import.meta.url), 'utf8');

let pass = 0, fail = 0;
function check(l, c) { if (c) pass++; else { fail++; console.log('FAIL:', l); } }

const t = (url) => ({ album: { images: url ? [{ url }] : [] } });
check('distinct images only', albumImages([t('a'), t('a'), t('b')]).join() === 'a,b');
check('tracks with no art are skipped', albumImages([t(null), t('x')]).join() === 'x');
check('capped at four', albumImages([t('1'), t('2'), t('3'), t('4'), t('5')]).length === 4);
check('no images means no cover', albumImages([]).length === 0);

// Without crossOrigin the image loads and taints the canvas, and the
// failure only surfaces at export.
check('images are requested cross-origin', /img\.crossOrigin = "anonymous"/.test(cov));
// Spotify rejects oversized covers after the upload, not before.
check('output is kept under the limit', _internals.MAX_BYTES === 256 * 1024);
check('quality steps down to fit', /for \(const q of \[0\.9, 0\.8/.test(cov));
check('and gives up rather than uploading something too big', /return null;\s*\n\}/.test(cov));
// Three images in a four-cell grid would leave a hole.
check('three images fill the square', /images\.length === 3/.test(cov));

// The upload is the one call that isn't JSON.
check('cover upload exists', /async setPlaylistCover\(playlistId, base64Jpeg\)/.test(sp));
check('it sends a raw body', /rawBody: body/.test(sp));
check('the request builder handles that', /headers\["Content-Type"\] = contentType/.test(sp));
check('and it is checked before sending', /over Spotify's 256KB limit/.test(sp));

// The permission is part of the standard set now, so new connections
// get it and covers just work. Anyone connected before it was added
// doesn't have it — and that is fixable, but only if they're told.
check('extra scopes can still be requested', /beginLogin\(\{ extraScopes = "" \} = \{\}\)/.test(au));
check('the granted scope is recorded', /rememberGranted\(data\.scope\)/.test(au));
check('and can be checked', /export function hasScope/.test(au));
check('upload is in the default scope', /ugc-image-upload/.test(au.slice(au.indexOf('const SCOPE ='), au.indexOf('const AUTH_URL'))));
check('covers are not an opt-in setting', !/set-cover-art/.test(src));

// Covers are decoration; nothing here may break a successful build.
// Quietly missing covers would leave someone with no idea why, and no
// way to fix something that is fixable.
check('a missing permission is reported with a code', /DD-SCOPE/.test(src));
check('and says what to do about it', /Reconnect to get playlist covers/.test(src));
check('the check happens at load, not at upload', /function scopeBanner\(\)/.test(src));
check('shown on every main screen', (src.match(/\$\{scopeBanner\(\)\}/g) || []).length === 3);
check('with a reconnect that acts', /id="scope-reconnect"/.test(src) && /await auth\.beginLogin\(\)/.test(src));
// No record of granted scopes means the connection predates the
// recording, which is exactly the case that lacks the permission.
check('an unrecorded scope set still warns', !/if \(!auth\.grantedScopes\(\)\) return "";/.test(src));
check('nothing is said to someone not connected', /if \(!auth\.isLoggedIn\(\)\) return "";/.test(src));
check('and it can be put off for the session', /id="scope-dismiss"/.test(src));
// Silence is why a missing cover went unexplained for three builds —
// the only account of it was a console nobody has open. It still must
// not turn a built playlist into a failure, so it reports without
// throwing.
check('a failure is reported, not thrown', /DD-COVER/.test(src));
check('and the playlist still counts as made', /Playlist made, but the cover didn't upload/.test(src));

// Catalogue tracks are trimmed during the release read and carry a
// single album.image_url; library tracks carry album.images[]. Reading
// only the second meant a Multi-Dip found no art at all.
check('both album shapes are read', /al\.image_url/.test(cov) && /al\.images\[0\]/.test(cov));
// Replacing a cover someone already set would be worse than not having one.
// Skipping every reuse meant a cover could never be corrected: a
// re-run updated the tracks and left artwork from an older, wronger
// version of this code in place, with no way back short of deleting
// the playlist.
check('a re-run refreshes our own cover', /if \(res\.reused && !ourPlaylist\(res\.id\)\) return;/.test(src));
// But artwork somebody chose themselves stays theirs.
check('and leaves anyone elses alone', /history\.listCreatedPlaylists\(\)\.some\(\(p\) => p\.playlistId === id\)/.test(src));

// The cover is the artist, not a grid of album art. A grid is what
// every playlist tool produces and says nothing about which playlist
// this is; a face does, at a glance, in a list of forty.
check('one artist fills the square', /if \(!split \|\| images\.length === 1\)/.test(cov));
check('only a bill splits', /split: billed\.length > 1/.test(src));
check('a dip does not', !/kind: "Dip",[\s\S]{0,120}split: true/.test(src));
// drawImage stretches to the box it is given, which distorts a
// portrait photograph in a square.
check('photos are cropped, not squashed', /const scale = Math\.max\(w \/ img\.width, h \/ img\.height\)/.test(cov));

check('the kind is set top right', /function drawKind/.test(cov));
check('and each caller names its own', /kind: "Dip"/.test(src) && /kind: "Multi-Dip"/.test(src) && /kind: "Dive"/.test(src));
check('the logo goes top left', /function drawLogo/.test(cov) && /ctx\.drawImage\(img, 26, 26, w, h\)/.test(cov));
// Same origin as the page, unlike the album art this replaced.
// The app lives at /DeepDive/app/, so "assets/…" resolved to a file
// that isn't there and the first covers shipped with no logo at all —
// silently, because a missing logo is deliberately not fatal.
check('the logo path is relative to the app', /img\.src = "\.\.\/assets\/dd-logo\.png"/.test(cov));
// A disc solved the same problem — a solid mark vanishes against a
// photograph of its own tone — but read as a grey blob stuck on the
// corner of a pale sleeve. A shadow only shows where the art is light.
check('the mark survives a pale photo', /ctx\.shadowColor = "rgba\(0,0,0,0\.65\)"/.test(cov));
check('without a disc on the artwork', !/ctx\.arc\(26 \+ w \/ 2/.test(cov));
check('and a missing logo does not lose the cover', /img\.onerror = \(\) => resolve\(\)/.test(cov));
check('the title has the bottom edge to itself', /const room = SIZE - 56;/.test(cov));

// Mixes and genres have no artist, so album art is still the fallback.
// One album rather than four: the grid only ever meant "this is a
// bill", and a mosaic of four unrelated covers says nothing.
check('album art remains the fallback', /: cover\.albumImages\(tracks, 1\)/.test(src));
// "If you like Oliver Tree" showed blackbear, because the cover fell
// through to the first album in the mix — one of the similar artists,
// not the one the card is named after.
check('a recommendation uses its seed', /if \(!card\.art && card\.seedName\)/.test(src));
check('and the card carries it', /seedImage: seedEntry\.image_url \|\| null/.test(readFileSync(new URL('../docs/js/insights.js', import.meta.url), 'utf8')));

// A recommendation card only knows its seed through the library, which
// holds album art — so "If you like…" got a sleeve rather than a face.
check('similar covers fetch the photograph', /if \(art && art\.lookupPhoto && art\.title\)/.test(src));
check('and keep the sleeve if that fails', /catch \(e\) \{ \/\* the album art it already has will do \*\/ \}/.test(src));

// Similar-artist mixes have no order worth choosing.
check('similar mixes shuffle', /if \(isSimilar\) opts\.order = "shuffle";/.test(src));
check('and offer no order control', /\{ order: !isSimilar \}/.test(src));

// Three ways of saying "done": a popup for a dive, a line of text above
// the button for a mix, another for the scrub.
check('mixes report through the popup', !/msg\.innerHTML = `Playlist/.test(src));
check('which closes the sheet first', /close\(\);\s*\n\s*showActionResult\(\{/.test(src));

// A preview of a shuffled mix lists tracks in an order that won't
// survive being made, and it was the tallest thing in the sheet.
check('mix sheets have no preview', !/card-preview/.test(src) && !/card-preview/.test(readFileSync(new URL('../docs/app/index.html', import.meta.url), 'utf8')));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
