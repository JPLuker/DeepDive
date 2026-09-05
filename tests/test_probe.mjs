// Endpoint diagnostics.
//
// Built because a whole session of theorising — stale throttle, quota
// buckets, rolling rate limit — could have been settled by ten requests.
// The app hides 429s behind retries everywhere else, which is right in
// normal use and useless when the question is *which* endpoints are
// refused.
import { readFileSync } from 'fs';
const sp = readFileSync(new URL('../docs/js/spotify.js', import.meta.url), 'utf8');
const src = readFileSync(new URL('../docs/js/app.js', import.meta.url), 'utf8');

let pass = 0, fail = 0;
function check(l, c) { if (c) pass++; else { fail++; console.log('FAIL:', l); } }

// The probe must report what actually came back.
check('probe exists', /async probe\(path, params = null\)/.test(sp));
check('probe reports the status', /status: \(e && e\.status\) \|\| 0/.test(sp));
check('probe reports the quota reason', /reason: \(e && e\.reason\) \|\| null/.test(sp));
check('probe reports retry-after', /retryAfter: \(e && e\.retryAfter\)/.test(sp));
// Retrying would hide the answer and spend more of a budget already
// short. Scoped to the method body — _call is *declared* immediately
// after probe, so a loose window catches the next function's name and
// reports a failure that isn't one.
const probeBody = sp.slice(sp.indexOf('async probe(path'), sp.indexOf('async _call(method'));
check('probe does not retry', !/this\._call\(/.test(probeBody));
check('probe leaves the remembered pause alone', !/deepdive_limited_until/.test(probeBody));
check('probe uses the raw request', /await this\._request\("GET", path, \{ params \}\)/.test(sp));

// Coverage: the two endpoints a dive depends on must both be probed,
// since telling them apart is the entire point.
check('probes the release listing', /artists\/\$\{PROBE_ARTIST\}\/albums/.test(src));
check('probes the album read', /albums\/\$\{PROBE_ALBUM\}/.test(src));
check('probes the user endpoints too', /"me\/tracks"/.test(src) && /"me\/top\/artists"/.test(src));
check('probes search', /"search"/.test(src));

// Fixed public ids: a failure should mean the endpoint, not the data.
check('uses fixed ids', /const PROBE_ARTIST = "/.test(src) && /const PROBE_ALBUM = "/.test(src));

// The test must not become the thing that trips the limit it reports.
check('probes are paced', /setTimeout\(res, 350\)/.test(src));

// It should interpret the pattern, not leave ten status codes lying about.
check('gives a verdict', /function probeVerdict/.test(src));
check('distinguishes all-refused from some-refused', /failed\.length === rows\.length/.test(src));
check('names the quota case', /QUOTA_EXCEEDED/.test(src));
check('covers everything-passing', /Every endpoint answered/.test(src));

// Lives under Advanced, not in front of casual users.
// Search for the closing tag *from* the opening one: there is an
// earlier </details> in the card preview, which made this slice run
// backwards and silently come back empty.
const advStart = src.indexOf('<details class="advanced"');
const adv = src.slice(advStart, src.indexOf('</details>', advStart));
check('button is in advanced', /id="set-test-endpoints"/.test(adv));
check('output area is in advanced', /id="endpoint-test"/.test(adv));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
