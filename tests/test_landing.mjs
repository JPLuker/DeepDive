// The landing page.
//
// The hero is the screenshots rather than a headline over a gradient:
// a dive fills the screen with the artist, which is the least
// utility-like thing about this utility and the reason anyone
// remembers it. The photographs make the argument faster than copy.
import { readFileSync, existsSync, statSync } from 'fs';
const html = readFileSync(new URL('../docs/index.html', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('../docs/app/manifest.json', import.meta.url), 'utf8'));

let pass = 0, fail = 0;
function check(l, c) { if (c) pass++; else { fail++; console.log('FAIL:', l); } }

check('tagline is the headline', /<h1 class="hero-tagline">Hear it all\.<\/h1>/.test(html));
// It said three different things depending on where you met it.
check('the title carries it', /<title>DeepDive — Hear it all\.<\/title>/.test(html));
check('so does the manifest', /^Hear it all\./.test(manifest.description));
check('and the link preview', /og:description/.test(html) && /og:image/.test(html));

// Every referenced screenshot must exist and be small enough to load.
const refs = [...html.matchAll(/img\/shots\/([a-z-]+\.jpg)/g)].map((m) => m[1]);
check('screenshots are referenced', refs.length >= 4);
for (const f of new Set(refs)) {
  const path = new URL('../docs/img/shots/' + f, import.meta.url);
  check(`${f} exists`, existsSync(path));
  // The originals were 5.6MB together, which is a page nobody waits for.
  check(`${f} is web-sized`, existsSync(path) && statSync(path).size < 200 * 1024);
}

check('hero shows the dive screen', /class="hero-shots"/.test(html));
check('and the fan is decorative, not content', /class="hero-shots" aria-hidden="true"/.test(html));
// A fanned stack would run off a phone screen.
check('the fan collapses on narrow screens', /@media \(max-width: 560px\)[\s\S]{0,300}\.shot-mid, \.shot-back \{ display:none; \}/.test(html));
check('images are sized to avoid reflow', (html.match(/width="760" height="\d+"/g) || []).length >= 4);
check('below-fold images load lazily', /class="showcase-shot" loading="lazy"/.test(html));
// The result screen carries a real number, which is the argument.
check('the results screenshot is used', /results-modern-baseball\.jpg/.test(html));
check('with meaningful alt text', /alt="A finished dive on Modern Baseball/.test(html));

// Stylesheet integrity — a stray brace silently kills everything below.
const css = html.slice(html.indexOf('<style>') + 7, html.indexOf('</style>'));
let depth = 0, stray = 0;
for (const ch of css) {
  if (ch === '{') depth++;
  else if (ch === '}') { depth--; if (depth < 0) { stray++; depth = 0; } }
}
check('stylesheet balances', depth === 0 && stray === 0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
