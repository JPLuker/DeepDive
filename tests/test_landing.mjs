// Landing page regression checks for the screenshot-led 2.9.76 rebuild.
import { readFileSync, existsSync, statSync } from 'fs';
import { createHash } from 'crypto';

const html = readFileSync(new URL('../docs/index.html', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('../docs/app/manifest.json', import.meta.url), 'utf8'));
const css = html.slice(html.indexOf('<style>') + 7, html.indexOf('</style>'));

let pass = 0, fail = 0;
function check(label, condition) {
  if (condition) pass++;
  else { fail++; console.log('FAIL:', label); }
}

check('tagline is the headline', /<h1 class="lead-title">Hear it all\.<\/h1>/.test(html));
check('landing identifies DeepDive', /class="topline"[\s\S]{0,220}wordmark/.test(html));
check('primary CTA opens the app', /class="btn btn-primary" href="app\/"/.test(html));
check('title carries the tagline', /<title>DeepDive - Hear it all\.<\/title>/.test(html));
check('manifest carries the tagline', /^Hear it all\./.test(manifest.description));
check('link preview is not an artist screenshot', !/og:image[^>]*img\/shots/.test(html));

const hero = html.slice(html.indexOf('<div class="hero-screens"'), html.indexOf('</header>'));
check('hero shows Home', /app-home-crop\.jpg/.test(hero));
check('hero shows a dive', /app-dive-crop\.jpg/.test(hero));
check('hero shows Mixes', /app-mixes\.svg/.test(hero));
check('hero has three distinct screenshots', new Set([...hero.matchAll(/img\/shots\/([^"]+\.(?:svg|jpg))/g)].map(m => m[1])).size === 3);

check('chooser screenshot is present', /app-chooser-crop\.png/.test(html));
check('chooser screenshot now features VIAL', /artist chooser showing Dip, Dive and Multi-Dip for VIAL/.test(html));
// The rewrite (2.9.95) says the same three things in Joseph's words.
check('chooser copy explains Dip', /Dip gives you the most popular tracks first/.test(html));
check('chooser copy explains Dive', /Dive scans the entire discography/.test(html));
check('chooser copy explains Multi-Dip', /Multi-Dip lets you pick multiple artists/.test(html));

check('Mixes has its own recipe screenshot', /Mixes that keep it personal[\s\S]{0,1400}app-mixes-crop\.jpg/.test(html));
check('Mixes says what the mixes are cut from', /when you found songs, release dates, even track length/.test(html));
// It must not promise play counts: the mixes come from the library,
// not from listening history. That claim was corrected during the
// rewrite and the alt text with it.
check('Mixes does not claim listening history', !/listening.history/i.test(html));
check('Mixes covers similarity and genres', /similar artist discovery and genre mixes/.test(html));
check('results explain recording-level matching', /compares recordings rather than releases/.test(html));
check('results say what you get out of it', /add to your library while creating your playlist/.test(html));
check('Multi-Dip has a dedicated section', /Prepare for your show[\s\S]{0,1200}app-multidip-crop\.jpg/.test(html));
check('Multi-Dip says what it builds', /multi-hour playlist of their most popular songs/.test(html));
check('privacy leads with the no-collection message', /<h2>DeepDive CAN'T collect your data<\/h2>/.test(html));
check('privacy explains the technical reason', /no server, database or account system/.test(html));
check('privacy says the library stays local', /stored on your device within the browser/.test(html));
check('Crate covers Up next', /"Up next" feature that keeps your priorities in order/.test(html));
check('Crate screenshot is present', /app-crate-crop\.jpg/.test(html));

const expected = [
  ['app-home-crop.jpg', 490, 724],
  ['app-dive-crop.jpg', 490, 724],
  ['app-mixes.svg', 640, 905],
  // The VIAL chooser is cut from the demo capture's chroma-green backdrop.
  ['app-chooser-crop.png', 600, 667],
  ['app-mixes-crop.jpg', 490, 724],
  ['app-results-crop.jpg', 490, 724],
  ['app-multidip-crop.jpg', 490, 724],
  ['app-crate-crop.jpg', 490, 724],
];
const refs = [...html.matchAll(/img\/shots\/([a-z-]+\.(?:svg|jpg|png))/g)].map(m => m[1]);

// The VIAL shot came off the page in 2.9.95 with the dive-progress
// card, but Joseph wants VIAL back on it, so the file stays put and
// the footer still credits them. If VIAL is dropped for good, the
// credit has to lose them at the same time.
check('the VIAL shot is kept for its next home', existsSync(new URL('../docs/img/shots/app-vial-crop.jpg', import.meta.url)));
check('and the footer still credits VIAL', /Artists pictured include[^<]*VIAL/.test(html));

// A PNG's real size, from its header, so a declared size can't drift
// from the file. The chooser capture carried 334px of transparent
// padding that the page drew as empty space above and below it.
function pngSize(path) {
  const b = readFileSync(path);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}
check('the final screenshots are referenced', refs.length === 8);
check('screenshots are not duplicated', new Set(refs).size === 8);
for (const [file, width, height] of expected) {
  check(file + ' appears once', refs.filter(x => x === file).length === 1);
  check(file + ' declares dimensions',
    new RegExp('img/shots/' + file.replace('.', '\\.') + '"[^>]*width="' + width + '" height="' + height + '"').test(html));
  const path = new URL('../docs/img/shots/' + file, import.meta.url);
  check(file + ' exists', existsSync(path));
  if (file.endsWith('.png') && existsSync(path)) {
    const real = pngSize(path);
    check(file + ' is declared at its real size', real.w === width && real.h === height);
  }
  check(file + ' is web-sized', existsSync(path) && statSync(path).size < 140 * 1024);
  const payload = existsSync(path) ? readFileSync(path) : Buffer.alloc(0);
  check(file + ' contains the approved image payload',
    file.endsWith('.svg')
      ? new RegExp('<svg[^>]*width="' + width + '" height="' + height + '"[\\s\\S]*data:image/jpeg;base64,').test(payload.toString('utf8'))
      : file.endsWith('.png')
        ? payload.subarray(1, 4).toString('ascii') === 'PNG'
        : payload.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])));
}
const vialBytes = readFileSync(new URL('../docs/img/shots/app-vial-crop.jpg', import.meta.url));
check('VIAL crop is the approved replacement', createHash('sha256').update(vialBytes).digest('hex') === '3b5232e3a117031f532dbb7901adf5b8ce4d3b1c80efe29419e3ad6aa47b0d5e');
const chooserBytes = readFileSync(new URL('../docs/img/shots/app-chooser-crop.png', import.meta.url));
check('VIAL chooser is the approved transparent cutout', createHash('sha256').update(chooserBytes).digest('hex') === 'c5b28cc3ad7c50f2f45779146b9892aed07cca950c88d5c16e967eebbd188a1c');
check('below-fold images lazy-load', (html.match(/loading="lazy"/g) || []).length >= 5);

check('no artist photo is used as page background', !/hero-photo|background-image:\s*url\([^)]*img\/shots/.test(html));
check('screenshots stay inside screen frames',
  [...html.matchAll(/img\/shots\/[a-z-]+\.(?:svg|jpg|png)/g)].every(m =>
    html.slice(Math.max(0, m.index - 190), m.index).includes('class="screen')));
check('transparent chooser does not inherit an outer screenshot frame',
  /\.choice-shot img\s*\{[^}]*background:transparent[^}]*border:0[^}]*box-shadow:none/.test(css));
check('sections follow the listening journey',
  ['How far in?', 'Know what you missed', 'Mixes that keep it personal', 'A crate to dig through', 'Prepare for your show', "DeepDive CAN'T collect your data"]
    .map(label => html.indexOf(label))
    .every((position, i, positions) => position >= 0 && (i === 0 || position > positions[i - 1])));

check('feature screenshots keep their complete approved framing',
  !/class="screen shot-crop/.test(html));
check('screenshots are not forced through destructive cover crops',
  !/\.shot-crop img\s*\{[^}]*object-fit:cover/.test(css));
for (const shot of ['ideas', 'results', 'multidip', 'vial', 'crate']) {
  check(shot + ' has no forced crop ratio', !new RegExp('\\.shot-' + shot + '\\s*\\{[^}]*aspect-ratio:').test(css));
}

check('Spotify is credited', /not affiliated with Spotify AB/.test(html));
check('Last.fm is credited', /provided by Last\.fm/.test(html));
check('copyright ownership is stated', /remains the property of its respective owners/.test(html));
check('featured artists are acknowledged', /Leisure Hour, VIAL, Houseghost and Maciann/.test(html));
check('endorsement is disclaimed', /imply no endorsement/.test(html));
check('GitHub is linked', /github\.com\/JPLuker"/.test(html));
check('LinkedIn is linked', /linkedin\.com\/in\/josephluker/.test(html));
check('Buy Me a Coffee is linked', /buymeacoffee\.com\/OSJoseph/.test(html));

check('old generic listing is gone', !/class="listing"/.test(html));
check('old alternating panel template is gone', !/class="panel panel-flip"/.test(html));
check('no false no-account claim', !/no account, nothing installed/.test(html));
check('no duplicate-liked claim', !/liked twice/.test(html));

let depth = 0, stray = 0;
for (const ch of css) {
  if (ch === '{') depth++;
  else if (ch === '}') { depth--; if (depth < 0) { stray++; depth = 0; } }
}
check('stylesheet balances', depth === 0 && stray === 0);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
