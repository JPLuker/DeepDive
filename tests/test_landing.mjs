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
// Three different screens, not the same dive photograph three times.
check('the screens are actually different', new Set([...html.matchAll(/device-[lcr]"><img src="([^"]+)"/g)].map((m) => m[1])).size === 3);
check('two of them are UI, not a photograph', /app-home\.jpg/.test(html) && /app-mixes\.jpg/.test(html));
// The page never said what it was.
check('the page identifies itself', /<div class="topline">[\s\S]{0,200}wordmark/.test(html));
check('feature list, not cards', /<ul class="listing-items">/.test(html));
check('alternating panels', /panel panel-flip/.test(html));
// Removed by mistake in 2.9.45: these two stay while permission is sought.
check('houseghost shows off results', /Nothing without asking<\/h2>[\s\S]{0,700}app-results\.jpg/.test(html));
check('vial shows off a dive in progress', /panel panel-flip[\s\S]{0,700}app-vial\.jpg/.test(html));
check('and both are credited', /Artists pictured: Leisure Hour, VIAL, Houseghost/.test(html));
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
check('pictured artists are acknowledged', /Artists pictured:/.test(html));
check('and endorsement is disclaimed', /imply\s+no endorsement/.test(html));

// Joseph's credit, with the three links he asked for.
check('github is linked', /github\.com\/JPLuker"/.test(html));
check('linkedin is linked', /linkedin\.com\/in\//.test(html));
check('and buy me a coffee', /buymeacoffee\.com/.test(html));

// Joseph's cuts, 2.9.48: the figures band, the hero's setup note, and
// four items from "Around it" (blocking, covers, library scan, history).
// These guard the decision, not the old layout.
check('figures band is gone, styles too', !/class="figures"|\.figures \{|figure-n|figure-l/.test(html));
check('hero setup note is gone, style too', !/lead-note/.test(html));
for (const h of ['Leave someone out', 'A cover for every playlist', 'Your whole library at once', 'Take it back'])
  check(`"${h}" stays cut`, !html.includes(`<h3>${h}</h3>`));
check('the hero line was rewritten', /<p class="lead-sub">DeepDive knows what's already in your Spotify library/.test(html));

// Every referenced screenshot must exist and be small enough to load.
const refs = [...html.matchAll(/img\/shots\/([a-z-]+\.jpg)/g)].map((m) => m[1]);
check('screenshots are referenced', refs.length >= 4);
for (const f of new Set(refs)) {
  const path = new URL('../docs/img/shots/' + f, import.meta.url);
  check(`${f} exists`, existsSync(path));
  check(`${f} is web-sized`, existsSync(path) && statSync(path).size < 120 * 1024);
}
check('images are sized to avoid reflow', (html.match(/width="640" height="\d+"/g) || []).length >= 4);
check('below-fold images load lazily', (html.match(/loading="lazy"/g) || []).length >= 3);

// Stylesheet integrity — a stray brace silently kills everything below.
const css = html.slice(html.indexOf('<style>') + 7, html.indexOf('</style>'));
let depth = 0, stray = 0;
for (const ch of css) {
  if (ch === '{') depth++;
  else if (ch === '}') { depth--; if (depth < 0) { stray++; depth = 0; } }
}
check('stylesheet balances', depth === 0 && stray === 0);


// Declared dimensions must match the files. A stale height reserves
// the wrong space and the page jumps as each image loads — and every
// screenshot swap is a chance to leave one behind.
const { execSync } = await import('child_process');
for (const m of html.matchAll(/img\/shots\/([a-z-]+\.jpg)" alt="[^"]*" width="(\d+)" height="(\d+)"/g)) {
  const [, file, w, h] = m;
  const path = new URL('../docs/img/shots/' + file, import.meta.url);
  // Read the JPEG's SOF marker rather than adding an image dependency.
  const buf = readFileSync(path);
  let i = 2, dims = null;
  while (i < buf.length - 9) {
    if (buf[i] !== 0xff) { i++; continue; }
    const marker = buf[i + 1];
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      dims = { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
      break;
    }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  check(`${file} dimensions are declared correctly`, dims && dims.w === +w && dims.h === +h);
}

// The page described DeepDive as it was two sessions ago. These are
// the features that were on screen in the device row and never in the
// copy.
check('recommendations are advertised', /<h3>If you like…<\/h3>/.test(html));
check('and done for you', /<h3>Recommended<\/h3>/.test(html));
// The PWA has no in-library duplicate check. The page claimed one until 2.9.45.
check('no claim of a duplicate check that no longer exists', !/liked twice/.test(html));

// The hero once claimed "no account, nothing installed". The note that
// corrected it was cut in 2.9.48; the false claim must not come back.
check('no claim that nothing is needed', !/no account, nothing installed/.test(html));

// Panels alternate; two flips in a row put the same side twice.
const panels = [...html.matchAll(/<section class="(panel[^"]*)"/g)].map((m) => m[1]);
check('panels alternate', panels.every((p, i) => (i % 2 === 1) === p.includes('flip')));

// The landing page kept its own copy of styles for markup deleted from
// the app in 2.8.25.
check('no dead sampler styles', !/sampler-row|btn-sampler/.test(html));

// The page predated Multi-Dip, Up next, covers, the sampler and Build
// your own, and still described a dip as reading a whole catalogue after
// dips moved onto search. Everything the app does should be on it.
for (const [label, re] of [
  ['dips', /<h3>[\s\S]{0,160}Dip<\/h3>/],
  ['multi-dips', /Multi-Dip<\/h3>/],
  ['dives', /Dive<\/h3>/],
  ['library mixes', /Forty ways to slice it/],
  ['build your own', /<h3>Build your own<\/h3>/],
  ['the sampler', /<h3>The sampler<\/h3>/],
  ['genres', /<h3>Genres, properly<\/h3>/],
  ['the crate', /<h2>Your crate<\/h2>/],
  ['suggestions', /<h3>Suggested for you<\/h3>/],
  ['confirm before writing, and reruns', /<h2>Nothing without asking<\/h2>[\s\S]{0,400}skipping what's already there/],
  ['dive filters and guest records', /live takes, radio edits, instrumentals and a cappellas[\s\S]{0,160}only guest on/],
]) check(`the page covers ${label}`, re.test(html));
// Mixes shuffle; the page said you choose the order.
check('no claim that mixes can be reordered', !/choose the order/.test(html));
// Each feature is described once. Headings are the proxy: no h2/h3 twice.
{
  const heads = [...html.matchAll(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/g)].map((m) => m[1].replace(/<[^>]+>/g, '').trim().toLowerCase());
  check('no feature heading appears twice', new Set(heads).size === heads.length);
}
// A dip no longer reads the catalogue; the page shouldn't say it does.
check('a dip is not described as a catalogue read', !/A dip takes one artist and gives you their best hour[\s\S]{0,120}reads everything/.test(html));
// The same gauge as the app's chooser, so both describe depth alike.
check('the depths carry the app\'s gauge', (html.match(/class="depth"/g) || []).length === 3);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
