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
// Three now, not four: the hero uses a cropped photograph rather than
// a stack of phone mockups, so fewer images do more.
check('screenshots are referenced', refs.length >= 3);
for (const f of new Set(refs)) {
  const path = new URL('../docs/img/shots/' + f, import.meta.url);
  check(`${f} exists`, existsSync(path));
  // The originals were 5.6MB together, which is a page nobody waits for.
  check(`${f} is web-sized`, existsSync(path) && statSync(path).size < 200 * 1024);
}

// The page opens the way a dive does: the artist fills the frame and
// the words sit over the bottom of the photograph. Three phones fanned
// out — the first attempt — is app-marketing wallpaper, and the app's
// own most distinctive screen is a better source than the template.
check('hero is a photograph, not a phone mockup', /class="hero-photo"/.test(html));
check('and the fanned stack is gone', !/shot-front|hero-shots/.test(html));
check('words sit over the image', /class="hero-scrim"/.test(html) && /class="hero-copy"/.test(html));
check('the photo has no app UI on it', /hero-maciann\.jpg/.test(html));
check('hero image loads first', /fetchpriority="high"/.test(html));

// Four statements rather than four bordered cards with matching icons,
// which is the SaaS default and adds a border for every idea.
check('what it does is stated plainly', /<section class="does">/.test(html));
check('no card kit', !/landing-card|landing-icon/.test(html));
check('each says the situation it resolves', /The single you never saved/.test(html) && /An hour of anyone/.test(html));
check('and covers what the app now is', /Genres Spotify won't tell you/.test(html));

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

// Attribution. The Developer Terms require crediting Spotify, and the
// page had none at all — nor any acknowledgement that the photographs
// belong to someone. Artist photos are provisional here, used as
// examples while Joseph asks permission, so the page must say that
// rather than imply endorsement.
check('spotify is credited', /not\s+affiliated with Spotify AB/.test(html));
check('last.fm is credited', /Last\.fm/.test(html));
check('photography ownership is stated', /remains the property of its respective owners/.test(html));
check('artists are named', /Artists pictured:/.test(html));
check('and endorsement is disclaimed', /imply no endorsement/.test(html));

// A figures band, after stats.fm — but theirs counts a platform and
// DeepDive has none, so counting anything global would be a borrowed
// gesture with nothing behind it.
check('figures are shown', /<section class="figures">/.test(html));
check('they describe a real dive', /tracks read for Modern Baseball/.test(html));
check('and the privacy figure is a zero', /of it leaves your browser/.test(html));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
