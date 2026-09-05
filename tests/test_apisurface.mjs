// Guards the endpoint surface against drift back onto deprecated calls.
//
// Established by testing on 4 Sept 2026: an endpoint marked
// `deprecated: true` in Spotify's OpenAPI schema returns 403 for a
// Development Mode app. Two for two — /albums?ids= and
// /artists/{id}/top-tracks both 403 with a valid token while their
// non-deprecated neighbours returned 200.
//
// Deprecated calls therefore fail silently rather than loudly: several
// call sites swallow errors to keep bulk operations running, which is
// how playlist deletion was broken without anyone noticing.
import { readFileSync } from 'fs';
const sp = readFileSync(new URL('../docs/js/spotify.js', import.meta.url), 'utf8');
const doc = readFileSync(new URL('../API_SURFACE.md', import.meta.url), 'utf8');

let pass = 0, fail = 0;
function check(l, c) { if (c) pass++; else { fail++; console.log('FAIL:', l); } }

// Batch forms — all deprecated, all 403.
check('no batch albums', !/albums\?ids=|`albums`, \{ params: \{ ids/.test(sp));
check('no batch artists', !/artists\?ids=/.test(sp));
check('no batch tracks', !/tracks\?ids=/.test(sp));

// Superseded by /me/library.
check('no playlist followers call', !/playlists\/\$\{[^}]+\}\/followers/.test(sp));
check('playlist removal uses the library endpoint', /spotify:playlist:\$\{playlistId\}/.test(sp));
check('no type-specific library writes', !/"(PUT|DELETE)", "me\/(tracks|albums|episodes|shows)"/.test(sp));

// Superseded by /playlists/{id}/items.
check('no legacy playlist tracks endpoint', !/playlists\/\$\{[^}]+\}\/tracks/.test(sp));

// Blocked, and load-bearing for a planned feature.
check('no top-tracks call', !/top-tracks/.test(sp));
check('no related-artists call', !/related-artists/.test(sp));
check('no recommendations or audio-features', !/recommendations|audio-features|audio-analysis/.test(sp));

// Limits that dropped in February. Being above the ceiling is a 400.
check('search limit within ceiling', /SEARCH_LIMIT_MAX = 10;/.test(sp));
check('artist albums limit within ceiling', /ARTIST_ALBUMS_LIMIT_MAX = 10;/.test(sp));
check('library uris batched at 40', /LIBRARY_SAVE_URIS_MAX = 40;/.test(sp));
check('playlist adds batched at 100', /PLAYLIST_ADD_URIS_MAX = 100;/.test(sp));

// The audit itself should stay attached to a date, since its whole
// value is being a point-in-time check against a moving schema.
check('audit is dated', /4 September 2026/.test(doc));
check('audit records the deprecated-means-403 rule', /403/.test(doc));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
