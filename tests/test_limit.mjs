// Remembering a sustained rate limit. Spotify sends no remaining-quota
// header, only Retry-After on a 429, so the app can't predict a limit —
// but it can remember one it's been told about instead of starting work
// that will fail on its first request.
import { readFileSync } from 'fs';
const sp = readFileSync(new URL('../docs/js/spotify.js', import.meta.url),'utf8');
const src = readFileSync(new URL('../docs/js/app.js', import.meta.url),'utf8');
let pass=0,fail=0; function check(l,c){if(c)pass++;else{fail++;console.log('FAIL:',l);}}

check('expiry stored on a sustained 429', /deepdive_limited_until/.test(sp));
check('stored from Retry-After', /Date\.now\(\) \+ raSecs \* 1000/.test(sp));
check('storage failure cannot break the request', /catch \(storeErr\) \{\}/.test(sp));
check('cleared on any success', /if \(resp\.status < 400\) \{[\s\S]{0,120}removeItem\("deepdive_limited_until"\)/.test(sp));
check('reader exported', /export function limitedUntil\(\)/.test(sp));
check('expired entries clear themselves', /if \(v <= Date\.now\(\)\) \{ localStorage\.removeItem/.test(sp));

check('dives are blocked', /function startSearch\(artistName\) \{\s*if \(blockedByRateLimit\(\)\) return;/.test(src));
// The guard used to sit directly above showDiveScreen. The sampler now
// preloads photos behind a spinner first, so the two are no longer
// adjacent — the guard must still be the first thing runSampler does.
const samplerFn = src.slice(src.indexOf('async function runSampler'));
check('sampler is blocked', /async function runSampler\(artists\) \{[\s\S]{0,600}?if \(blockedByRateLimit\(\)\) return;/.test(samplerFn));
check('guard runs before any screen is shown',
  samplerFn.indexOf('blockedByRateLimit()') < samplerFn.indexOf('showDiveSpinner()'));
check('library scan is blocked', /if \(blockedByRateLimit\(\)\) return;\s*showDiveScreen\("Scanning your whole library/.test(src));
check('home shows a standing notice', /\$\{rateLimitBanner\(\)\}/.test(src));
// The sentence wraps in source, so match across whitespace.
check('notice says it is not our fault', /not a\s+fault in DeepDive/.test(src));
check('message gives a duration and a time', /until roughly \$\{clock\}/.test(src));

// the reader's logic
function limitedUntil(stored, now){
  if (!stored) return null;
  if (stored <= now) return null;
  return stored;
}
const now = 1_000_000;
check('active limit reported', limitedUntil(now + 5000, now) === now + 5000);
check('expired limit ignored', limitedUntil(now - 5000, now) === null);
check('no limit reported when unset', limitedUntil(0, now) === null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
