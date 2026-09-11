// Dips built from search instead of a catalogue read.
//
// Joseph's point, and he was right: the whole reason for the Last.fm
// key was to fight the quota, and dips were still reading an artist's
// entire catalogue to keep an hour of it. Last.fm already knows which
// tracks matter, so Spotify only has to make each one playable — about
// eighteen requests for an hour, against the forty to eighty releases a
// catalogue read costs.
//
// It also lands on a different quota group. Joseph's endpoint test had
// Search answering in 680ms while album tracklists and track details
// were both refusing with QUOTA_EXCEEDED — which is exactly when
// someone wants a dip.
import { readFileSync } from 'fs';
const src = readFileSync(new URL('../docs/js/app.js', import.meta.url), 'utf8');
const sp = readFileSync(new URL('../docs/js/spotify.js', import.meta.url), 'utf8');

let pass = 0, fail = 0;
function check(l, c) { if (c) pass++; else { fail++; console.log('FAIL:', l); } }

check('there is a track search', /async searchTrack\(artistName, title\)/.test(sp));
// A bare title returns whoever is most popular, not the artist asked for.
check('it scopes the query to both fields', /track:"\$\{title[\s\S]{0,80}artist:"\$\{artistName/.test(sp));
// Spotify will return a cover or another artist's song of the same name.
check('the credit is verified, not trusted', /\(t\.artists \|\| \[\]\)\.some\(\(a\) => normalizeForMatch\(a\.name\) === wantArtist\)/.test(sp));
check('and the exact title is preferred', /pool\.find\(\(t\) => normalizeForMatch\(t\.name\) === want\) \|\| pool\[0\]/.test(sp));
check('names are compared loosely across services', /function normalizeForMatch/.test(sp));
// One unfindable track must not end a dip; a quota error must.
check('a miss is survivable', /return null;   \/\/ one unfindable track/.test(sp));
check('but quota is not', /if \(e && \(e\.quotaExhausted \|\| e\.status === 429\)\) throw e;/.test(sp));

check('dips build from it', /async function dipViaSearch/.test(src));
// Only as many requests as the hour needs, not the whole list.
check('it stops when the target is met', /if \(totalMs >= targetMs\) break;/.test(src));
check('and gives up past the useful end of the list', /if \(searched >= 30\) break;/.test(src));
check('a remaster and its original count once', /if \(seen\.has\(key\)\) continue;/.test(src));
// The duplicate check was always part of a dip, and search results
// carry ISRC, so it survives the change.
check('what you own is still known', /const isLiked = liked\.has\(found\.id\)/.test(src));
check('and the familiarity setting still applies', /familiar === "new-only" && isLiked/.test(src));
check('known-first still reorders', /familiar === "known-first" && liked\.size/.test(src));

// An artist Last.fm has never heard of still has to work.
check('it reports having nothing rather than an empty mix', /if \(!picked\.length\) return null;/.test(src));
check('and the dive path is the fallback', /Reading their catalogue instead/.test(src));

check('multi-dip uses it too', /await dipViaSearch\(a\.name, \{/.test(src));
check('the saving is stated for whoever reads this next', /instead of the forty to eighty/.test(src));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
