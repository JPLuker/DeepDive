// Landing page regression checks for the screenshot-led 2.9.76 rebuild.
import { readFileSync, existsSync, statSync } from 'fs';

const html = readFileSync(new URL('../docs/index.html', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('../docs/app/manifest.json', import.meta.url), 'utf8'));

let pass = 0, fail = 0;
function check(label, condition) {
  if (condition) pass++;
  else { fail++; console.log('FAIL:', label); }
}

check('tagline is the headline', /<h1 class="lead-title">Hear it all\.<\/h1>/.test(html));
check('landing identifies DeepDive', /class="topline"[\s\S]{0,220}wordmark/.test(html));
check('primary CTA opens the app', /class="btn btn-primary" href="app\/"/.test(html));
check('title carries the tagline', /<title>DeepDive — Hear it all\.<\/title>/.test(html));
check('manifest carries the tagline', /^Hear it all\./.test(manifest.description));
check('link preview is not an artist screenshot', !/og:image[^>]*img\/shots/.test(html));

const hero = html.slice(html.indexOf('<div class="hero-screens"'), html.indexOf('</header>'));
check('hero shows Home', /app-home\.svg/.test(hero));
check('hero shows a dive', /app-dive\.svg/.test(hero));
check('hero shows Mixes', /app-mixes\.svg/.test(hero));
check('hero has three distinct screenshots', new Set([...hero.matchAll(/img\/shots\/([^"]+\.svg)/g)].map(m => m[1])).size === 3);

check('chooser screenshot is present', /app-chooser\.svg/.test(html));
check('chooser copy explains Dip', /Dip gives you their best hour/.test(html));
check('chooser copy explains Dive', /Dive checks the whole catalogue/.test(html));
check('chooser copy explains Multi-Dip', /Multi-Dip takes a whole bill/.test(html));

check('Mixes has its own recipe screenshot', /Mixes with a reason[\s\S]{0,1400}app-mixes-ideas\.svg/.test(html));
check('Mixes covers Build your own', /Build your own from an era, a length and an artist/.test(html));
check('Mixes covers Sampler', /Sampler to revisit artists you barely touched/.test(html));
check('Mixes covers similarity and genres', /similar-artist and genre mixes/.test(html));
check('results explain recording-level matching', /same recording under another release/.test(html));
check('results show like, playlist or both', /like songs, make a playlist, or both/.test(html));
check('Multi-Dip has a dedicated section', /One playlist for the whole bill[\s\S]{0,1200}app-multidip\.svg/.test(html));
check('Multi-Dip covers More and Less', /mark someone More or Less/.test(html));
check('privacy states there is no server', /DeepDive has no server/.test(html));
check('privacy says data is stored on device', /stored on your device/.test(html));
check('privacy names outbound services', /Spotify and Last\.fm/.test(html));
check('Crate covers Up next', /Star a few for Up next/.test(html));
check('Crate screenshot is present', /app-crate\.svg/.test(html));

const expected = [
  ['app-home.svg', 640, 1007],
  ['app-dive.svg', 640, 1240],
  ['app-mixes.svg', 640, 905],
  ['app-chooser.svg', 640, 687],
  ['app-mixes-ideas.svg', 640, 1009],
  ['app-results.svg', 640, 953],
  ['app-multidip.svg', 640, 1006],
  ['app-vial.svg', 640, 1211],
  ['app-crate.svg', 640, 1020],
];
const refs = [...html.matchAll(/img\/shots\/([a-z-]+\.svg)/g)].map(m => m[1]);
check('all nine final screenshots are referenced', refs.length === 9);
check('screenshots are not duplicated', new Set(refs).size === 9);
for (const [file, width, height] of expected) {
  check(file + ' appears once', refs.filter(x => x === file).length === 1);
  check(file + ' declares dimensions',
    new RegExp('img/shots/' + file.replace('.', '\\.') + '"[^>]*width="' + width + '" height="' + height + '"').test(html));
  const path = new URL('../docs/img/shots/' + file, import.meta.url);
  check(file + ' exists', existsSync(path));
  check(file + ' is web-sized', existsSync(path) && statSync(path).size < 120 * 1024);
  if (existsSync(path)) {
    const svg = readFileSync(path, 'utf8');
    check(file + ' embeds the approved JPEG',
      new RegExp('<svg[^>]*width="' + width + '" height="' + height + '"[\\s\\S]*data:image/jpeg;base64,').test(svg));
  }
}
check('below-fold images lazy-load', (html.match(/loading="lazy"/g) || []).length >= 6);

check('no artist photo is used as page background', !/hero-photo|background-image:\s*url\([^)]*img\/shots/.test(html));
check('screenshots stay inside screen frames',
  [...html.matchAll(/img\/shots\/[a-z-]+\.svg/g)].every(m =>
    html.slice(Math.max(0, m.index - 190), m.index).includes('class="screen')));

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

const css = html.slice(html.indexOf('<style>') + 7, html.indexOf('</style>'));
let depth = 0, stray = 0;
for (const ch of css) {
  if (ch === '{') depth++;
  else if (ch === '}') { depth--; if (depth < 0) { stray++; depth = 0; } }
}
check('stylesheet balances', depth === 0 && stray === 0);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
