// Rate-limit warnings must reach the screen the dive is actually using.
// They previously wrote to the old progress card's stage element, which
// the full-screen rewrite removed, so the dive just appeared to freeze
// for up to ninety seconds with no explanation.
import { readFileSync } from 'fs';
const src = readFileSync('/home/claude/dd/js/app.js','utf8');
const app = readFileSync('/home/claude/dd/app/index.html','utf8');
const sp  = readFileSync('/home/claude/dd/js/spotify.js','utf8');
let pass=0,fail=0; function check(l,c){if(c)pass++;else{fail++;console.log('FAIL:',l);}}

check('client exposes the hook', /this\.onRateLimit = null;/.test(sp));
check('client calls it on a 429', /this\.onRateLimit\(wait, rateLimitAttempts\)/.test(sp));
check('a throwing handler cannot break the retry', /try \{ this\.onRateLimit\(wait, rateLimitAttempts\); \} catch \(cbErr\) \{\}/.test(sp));

check('app writes to the dive screen', /getElementById\("dive-stage"\)/.test(src.slice(src.indexOf('client.onRateLimit'))));
check('that element exists', /id="dive-stage"/.test(app));
check('says how long the wait is', /waiting \$\{secs\}s/.test(src));
check('shows repeated attempts', /attempt \$\{attempt\}/.test(src));
check('falls back to a toast outside a dive', /else flash\(msg\)/.test(src));

// A sustained limit must fail fast rather than retry into a wall.
check('gives up on an unsatisfiable Retry-After', /e\.sustained = true;/.test(sp));
check('and reports the real duration', /retryAfterSeconds/.test(sp));

// The error view must render something.
check('error view renders itself', /function renderProgressError\(msgOrErr, err\) \{[\s\S]{0,200}root\.innerHTML/.test(src));
check('error view hides the dive screen', /hideDiveScreen\(\);\s*const info = explainError/.test(src));
check('error view offers a way back', /id="err-home"/.test(src));
check('technical details still available', /diagnosticsHtml\(\)/.test(src));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
