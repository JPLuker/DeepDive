// Last.fm — the optional second source.
//
// It exists because Spotify removed or deprecated the data underneath
// three features: track popularity, similar artists, and anything
// finer-grained than a broad artist genre. Everything here is
// read-only public data needing only an API key.
import { readFileSync } from 'fs';
import { normalizeTag, tagLabel, _internals } from '../docs/js/lastfm.js';
const lfm = readFileSync(new URL('../docs/js/lastfm.js', import.meta.url), 'utf8');
const src = readFileSync(new URL('../docs/js/app.js', import.meta.url), 'utf8');

let pass = 0, fail = 0;
function check(l, c) { if (c) pass++; else { fail++; console.log('FAIL:', l); } }

// Per-user keys. A shipped key would be readable in a browser-only app,
// pooled across every user, and revocable because of one person.
check('key is stored per user', /const KEY_STORAGE = "deepdive_lastfm_key"/.test(lfm));
check('no key is embedded', !/api_key\s*[:=]\s*["'][0-9a-f]{20,}/.test(lfm));
check('setup offers the key', /id="lastfm-key-input"/.test(src));
check('settings offers it too', /id="set-lastfm-key"/.test(src));
check('setup marks it optional', /<span class="qual">optional<\/span>/.test(src));
check('an empty key is a valid answer', /Last\.fm key removed/.test(src));

// Optional means optional: a missing key must never break a screen.
check('no key returns nothing rather than throwing', /if \(!key\) return null;/.test(lfm));
check('hasKey is exposed for callers to branch on', /export function hasKey/.test(lfm));

// Their terms allow 5 requests per second per IP, averaged over five
// minutes. Unlike Spotify there is no quota to exhaust, only a rate.
check('requests are paced', _internals.PACING_MS >= 200);
check('pacing is applied before each call', /await pace\(\);/.test(lfm));

// Last.fm answers with HTTP 200 and an error code in the body as often
// as it uses a status code, so both have to be checked.
check('body errors are caught', /if \(body && body\.error\) throw new LastfmError/.test(lfm));
check('status errors are caught too', /if \(!resp\.ok\) throw new LastfmError/.test(lfm));
check('rate limit is identifiable', _internals.ERR_RATE_LIMIT === 29);
check('a suspended key is distinguished', /this\.suspended = code === ERR_KEY_SUSPENDED/.test(lfm));

// The three endpoints, and their single-result shape — Last.fm returns
// a bare object rather than an array when there is exactly one.
for (const m of ['artist.getTopTracks', 'artist.getSimilar', 'artist.getTopTags']) {
  check(`${m} is wired`, lfm.includes(`"${m}"`));
}
check('single results are still arrays', (lfm.match(/Array\.isArray\(raw\) \? raw : \[raw\]/g) || []).length === 3);

// Tags are user-applied, so the same genre arrives spelled several
// ways and would otherwise become several mixes of the same music.
check('hyphens collapse', normalizeTag('Hip-Hop') === 'hip hop');
check('spacing collapses', normalizeTag('hip hop') === 'hip hop');
check('concatenation collapses', normalizeTag('HipHop') === 'hip hop');
check('abbreviations collapse', normalizeTag('DnB') === 'drum and bass');
check('real genres survive', normalizeTag('  Shoegaze ') === 'shoegaze');
check('subgenres survive', normalizeTag('Midwest Emo') === 'midwest emo');
// Tags describing the listener rather than the music rank highly on
// well-known artists and would produce a "Your seen live" mix.
check('shelving tags are dropped', normalizeTag('Seen live') === '');
check('so are decades', normalizeTag('90s') === '' && normalizeTag('1980s') === '');
check('weights are kept for filtering', /weight: parseInt\(t\.count, 10\)/.test(lfm));
check('labels are presentable', tagLabel('midwest emo') === 'Midwest Emo');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
