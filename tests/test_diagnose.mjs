// Self-diagnosis.
//
// Built from the failures this project actually had, all of which
// presented identically as "it's slow" or "it's rate limited":
//   - a remembered pause that blocked the requests that would clear it
//   - learned pacing that outlived the limit that taught it, turning a
//     ten-second dive into a minute with nothing failing
//   - a genuinely spent quota, which retrying cannot fix
//   - a burst limit, which waiting does fix
// Two of the four are self-repairable, so it repairs them rather than
// reporting them.
import { readFileSync } from 'fs';
const src = readFileSync(new URL('../docs/js/app.js', import.meta.url), 'utf8');
const sp = readFileSync(new URL('../docs/js/spotify.js', import.meta.url), 'utf8');
const se = readFileSync(new URL('../docs/js/search.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../docs/app/index.html', import.meta.url), 'utf8');

let pass = 0, fail = 0;
function check(l, c) { if (c) pass++; else { fail++; console.log('FAIL:', l); } }

check('diagnosis exists', /async function diagnose\(/.test(src));

// Repairs, in the order they were mistaken for each other.
check('clears a stale pause', /if \(limitedUntil\(\)\)[\s\S]{0,220}verifyRateLimit\(\)/.test(src));
check('clears stale pacing', /pacing >= 400 && learnedAgo > STALE_LEARNING_MS/.test(src));
check('only clears pacing if requests actually work', /const check = await client\.probe\("me"\);[\s\S]{0,120}resetPacing\(\)/.test(src));
check('stale means recent, not forever', /STALE_LEARNING_MS = 15 \* 60 \* 1000/.test(src));

// Codes, stable enough to quote in a report.
for (const code of ['DD-OK','DD-FIXED','DD-QUOTA','DD-RATE','DD-AUTH','DD-FORBID','DD-NET','DD-UNKNOWN']) {
  check(`code ${code}`, src.includes(code));
}
// Scoped to diagnose(): comparing first occurrences across the whole
// file breaks the moment any unrelated code mentions 429 earlier,
// which the API banner now does.
const diagBody = src.slice(src.indexOf('async function diagnose('), src.indexOf('function diagnosisAdvice'));
check('quota outranks a bare 429', diagBody.indexOf('QUOTA_EXCEEDED"') < diagBody.indexOf('r.status === 429'));
check('every code has advice', /function diagnosisAdvice/.test(src));

// Runs itself on failure — nobody should have to know to look in
// Advanced for a problem the app can fix on its own.
check('runs automatically on error', /diagnose\(\)\.then\(\(d\) =>/.test(src));
check('offers a retry when it looks recoverable', /d\.code === "DD-OK" \|\| d\.code === "DD-FIXED"/.test(src));
check('remembers what to retry', /_lastDiveArtist = artistName;/.test(src));
check('shallow by default, deep on request', /diagnose\(\{ deep = false \}/.test(src));

// Green when it's green.
check('good and bad states differ', /\.diag-verdict\.is-good/.test(css) && /\.diag-verdict\.is-bad/.test(css));
check('code is selectable for quoting', /\.diag-code \{[\s\S]{0,160}user-select:all/.test(css));

// The speed-test half: measure, then set expectations.
check('latency is measured', /noteLatency\(ms\)/.test(sp));
check('probes feed the estimate', /client\.noteLatency\(r\.ms\)/.test(src));
check('estimate accounts for pacing too', /const per = \(this\.latency\(\) \|\| 400\) \+ this\._pacingMs\(\);/.test(sp));
check('dive shows remaining time', /estimateSeconds\(left\)/.test(se));
check('eta is rounded, not false-precise', /function fmtEta/.test(se));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
