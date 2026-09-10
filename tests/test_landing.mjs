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

// Structure follows stats.fm: text-led hero, devices beneath it, a
// figures band, a feature list, alternating panels, a closing panel,
// then a real footer. Their green becomes DeepDive's blue — the
// structure is borrowed, the identity is not.
check('tagline is the headline', /<h1 class="lead-title">Hear it all\.<\/h1>/.test(html));
check('hero is text-led', /<header class="lead">/.test(html));
check('devices sit beneath it', html.indexOf('lead-title') < html.indexOf('class="devices"'));
check('three screens, middle forward', /device-l/.test(html) && /device-c/.test(html) && /device-r/.test(html));
check('feature list, not cards', /<ul class="listing-items">/.test(html));
check('alternating panels', /panel panel-flip/.test(html));
check('closing panel', /<section class="closing">/.test(html));
check('a real footer', /<footer class="foot">/.test(html) && /foot-cols/.test(html));

// The one deliberate departure from the reference: no artist
// photograph is used as page imagery. They belong to the artists, not
// to Spotify and not to us, so they appear only inside device frames
// as examples of the app running — which is how stats.fm shows album
// artwork too.
check('no photo used as page background', !/hero-photo|hero-scrim|hero-maciann/.test(html));
check('photos only appear in device frames', [...html.matchAll(/img\/shots\/[a-z-]+\.jpg/g)]
  .every((m) => html.slice(Math.max(0, m.index - 260), m.index).includes('device')));

// It said three different things depending on where you met it.
check('the title carries it', /<title>DeepDive — Hear it all\.<\/title>/.test(html));
check('so does the manifest', /^Hear it all\./.test(manifest.description));
check('and the link preview', /og:description/.test(html) && /og:image/.test(html));
// A link preview is the page's headline image, so an artist photograph
// must not be one — that is the use Joseph ruled out.
check('the preview image is not an artist photo', !/og:image[^>]*img\/shots/.test(html));

// Attribution — required by the Developer Terms, and absent entirely
// before 2.8.55.
check('spotify is credited', /affiliated with Spotify AB/.test(html));
check('last.fm is credited', /Last\.fm/.test(html));
check('photography ownership is stated', /remains the property of its respective owners/.test(html));
check('every pictured artist is named', ['Maciann', 'VIAL', 'Leisure Hour', 'Modern Baseball']
  .every((a) => html.includes(a)));
check('and endorsement is disclaimed', /imply\s+no endorsement/.test(html));

// Figures: stats.fm counts a platform, DeepDive has none, so these are
// what one real dive produced and what it costs you in privacy.
check('figures are shown', /<section class="figures">/.test(html));
check('they describe a real dive', /tracks read in one dive/.test(html));
check('and the privacy figure is a zero', /of it leaves your browser/.test(html));

// Every referenced screenshot must exist and be small enough to load.
const refs = [...html.matchAll(/img\/shots\/([a-z-]+\.jpg)/g)].map((m) => m[1]);
check('screenshots are referenced', refs.length >= 4);
for (const f of new Set(refs)) {
  const path = new URL('../docs/img/shots/' + f, import.meta.url);
  check(`${f} exists`, existsSync(path));
  check(`${f} is web-sized`, existsSync(path) && statSync(path).size < 120 * 1024);
}
check('images are sized to avoid reflow', (html.match(/width="640" height="\d+"/g) || []).length >= 4);
check('below-fold images load lazily', (html.match(/loading="lazy"/g) || []).length >= 2);

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
