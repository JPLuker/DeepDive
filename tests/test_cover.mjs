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
check('and says what to do about it', /Reconnect in Settings/.test(src));
check('but only once a session', /if \(_reconnectNagged\) return;/.test(src));
check('failure never surfaces as an error', /console\.warn\("\[DeepDive\] cover art failed:"/.test(src));
// Replacing a cover someone already set would be worse than not having one.
check('an existing playlist keeps its cover', /if \(!res \|\| !res\.id \|\| res\.reused\) return;/.test(src));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
