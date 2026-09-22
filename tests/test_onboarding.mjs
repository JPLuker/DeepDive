// Onboarding, rebuilt in 2.9.56: one step per screen, in the order the
// work happens, in the same style as the rest of the app.
import { readFileSync } from 'fs';
const src = readFileSync(new URL('../docs/js/app.js', import.meta.url), 'utf8');
const shell = readFileSync(new URL('../docs/app/index.html', import.meta.url), 'utf8');
let pass = 0, fail = 0;
function check(l, c) { if (c) pass++; else { fail++; console.log('FAIL:', l); } }

// The steps, in order, each its own screen.
check('four steps, in the order the work happens', /const ONBOARD_STEPS = \["spotify", "client", "lastfm", "connect"\];/.test(src));
for (const f of ['renderLanding', 'renderSetup', 'renderClientStep', 'renderLastfmStep', 'renderConnect'])
  check(`${f} exists`, new RegExp(`function ${f}\\(`).test(src));
check('each step says where you are', /Step \$\{n\} of \$\{ONBOARD_STEPS\.length\}/.test(src));

// Premium was never mentioned. It's the first thing someone needs to know.
check('the welcome says Premium is needed', /<strong>Spotify Premium<\/strong>/.test(src));
check('and uses the landing page\'s words', /class="onboard-hero">Hear it all\.<\/h1>/.test(src));
check('the old welcome and its feature cards are gone', !/const FEATURES = \[/.test(src) && !/landing-grid|landing-card/.test(src + shell));

// The redirect address: copyable, with a fallback when the clipboard isn't.
check('the redirect address has a copy button', /id="onboard-copy-btn">Copy</.test(src) && /navigator\.clipboard\.writeText\(rUri\)/.test(src));
check('and falls back to selecting it', /sel\.addRange\(r\)/.test(src));

// The Client ID is checked before Spotify has to reject it.
{
  const m = src.match(/const CLIENT_ID_RE = \/(.+?)\/i;/);
  check('the client id pattern exists', !!m);
  const re = m ? new RegExp(m[1], 'i') : /(?!)/;
  check('a real client id passes', re.test('0287b6335f0b4a4bae283bb94bfc2f05'));
  check('a short one fails', !re.test('0287b6335f0b4a4bae283bb94bfc2f0'));
  check('a pasted one with a space inside fails', !re.test('0287b6335f0b4a4b ae283bb94bfc2f05'));
  check('surrounding spaces are trimmed first', /const v = input\.value\.trim\(\);\s*\n\s*const ok = CLIENT_ID_RE\.test\(v\);/.test(src));
}
check('continue waits for a valid id', /id="save-creds-btn" disabled>Continue</.test(src) && /go\.disabled = !ok;/.test(src));
check('and the check says what is wrong', /This one is \$\{v\.length\}\./.test(src));

// Handlers that take arguments must not be handed a click event.
check('no render function is passed straight to a click listener', !/addEventListener\("click", render[A-Z]\w*\)/.test(src));

// A failed login returns to the step where the retry is, with the reason.
check('a refused login lands on connect with the reason', /return renderConnect\(cb\.error === "access_denied"/.test(src));
check('and the invalid redirect case is named before the button', /Invalid redirect URI<\/em>, the address from step 1/.test(src));

// Style: no second wordmark (the header has one), no em dashes in the copy.
{
  const flow = src.slice(src.indexOf('// Onboarding'), src.indexOf('// Home (search + autofill'))
    + src.slice(src.indexOf('function renderLanding()'), src.indexOf('// ---- demo screens ----'));
  check('no second wordmark', !/onboard-mark|wordmark-hero/.test(flow));
  const copy = flow.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '');
  check('no em dashes in the copy', !/—/.test(copy));
  check('no pre-2.7.1 address note', !/before the address changed/.test(src));
}
{
  let phone = '';
  for (let at = shell.indexOf('@media (max-width: 640px)'); at > -1; at = shell.indexOf('@media (max-width: 640px)', at + 1)) {
    let i = shell.indexOf('{', at), depth = 0, j = i;
    for (; j < shell.length; j++) { if (shell[j] === '{') depth++; else if (shell[j] === '}' && --depth === 0) break; }
    phone += shell.slice(i, j + 1);
  }
  check('no phone rule reshapes onboarding', phone.length > 500 && !/\.onboard/.test(phone));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
