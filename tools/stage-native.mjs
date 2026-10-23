// Build the web root the native shells actually ship, and prove every
// reference in it resolves.
//
// Why this exists
// ---------------
// tauri.conf.json pointed frontendDist at docs/app, which holds three
// files: index.html, manifest.json and sw.js. The page loads
// ../js/app.js and ../assets/*, which live one level up and were
// therefore outside the bundle entirely.
//
// On the web that is correct — GitHub Pages serves the whole docs/
// tree, so ../js resolves. In a native shell nothing above
// frontendDist exists, so every module and font 404'd, no JavaScript
// ran at all, and the app installed, opened, painted its static
// header and tab bar, and stopped. Windows, Linux and Android were
// all affected identically; all three builds were green.
//
// The obvious repair is frontendDist: "../docs", and it is wrong.
// docs/ also contains the landing page, two diagnostic pages
// (cors-check.html, art-check.html) and 1.5MB of img/ — including
// artist photography cleared only for use on the landing page while
// permission is pending. Shipping that inside an installed binary is
// not that, and a bundle should not quietly widen the scope of
// someone else's photographs.
//
// So the native root is assembled deliberately from the three
// directories the app actually needs, and then checked. The check is
// the point: a build that silently ships a page whose scripts are
// missing is worse than one that fails, because it produces an
// artifact that looks finished.
//
// Usage: node tools/stage-native.mjs <outDir>
import { cpSync, rmSync, mkdirSync, existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join, dirname, resolve, relative } from 'path';
import { fileURLToPath } from 'url';

// fileURLToPath, not .pathname. On Windows a file URL's pathname is
// "/D:/a/DeepDive/tools/" — with a leading slash before the drive
// letter — which resolve() turns into a path that does not exist.
// This failed the Windows job with "docs/app does not exist" while
// Linux and Android were fine.
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const out = resolve(process.argv[2] || join(root, 'dist-native'));

// Exactly what the app references, and nothing else. Deliberately a
// list rather than "copy docs/ minus some things": an exclusion list
// silently ships whatever is added to docs/ later, which is how the
// photography would end up in a binary.
const INCLUDE = ['app', 'js', 'assets'];

// Relative hrefs that are not files in the bundle.
//   ../          the landing page link, which points at the public
//                site and is dead in a native shell — a real but
//                separate problem, and not a missing asset.
const IGNORE = new Set(['../']);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

// ---- assemble -------------------------------------------------------
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

for (const dir of INCLUDE) {
  const from = join(root, 'docs', dir);
  if (!existsSync(from)) {
    console.error(`stage-native: docs/${dir} does not exist`);
    process.exit(1);
  }
  cpSync(from, join(out, dir), { recursive: true });
}

// ---- verify ---------------------------------------------------------
//
// Every relative reference, from every staged file, has to resolve to
// something inside the staged tree. This is what was missing: the
// paths were correct for the web and nobody checked them against the
// bundle.
// src=/href= for markup, import()/from for modules, and url() for CSS.
// url() matters as much as the rest: the fonts are referenced only
// that way, and PRIVACY.md Part 3 requires them bundled rather than
// fetched from a CDN. A missing font does not blank the app, it
// silently falls back — which is the kind of failure that ships.
const refPattern = /(?:src|href)\s*=\s*["']([^"'>]+)["']|import\s*\(?\s*["'](\.[^"']+)["']|from\s*["'](\.[^"']+)["']|url\(\s*["']?([^"')]+)["']?\s*\)/g;

const missing = [];
let checked = 0;

for (const file of walk(out)) {
  if (!/\.(html|js|json|css)$/.test(file)) continue;
  const text = readFileSync(file, 'utf8');

  for (const m of text.matchAll(refPattern)) {
    const raw = (m[1] || m[2] || m[3] || m[4] || '').trim();
    if (!raw) continue;
    if (IGNORE.has(raw)) continue;
    // Absolute URLs, protocol-relative, data/blob, anchors and bare
    // specifiers are not files in this tree.
    if (/^(https?:|data:|blob:|mailto:|tel:|#|\/\/)/.test(raw)) continue;
    // A leading slash is an absolute path, which in a native shell
    // means the bundle root — legal, so resolve it from there.
    const isAbs = raw.startsWith('/');
    // Strip the cache-busting query and any fragment.
    const clean = raw.split('#')[0].split('?')[0];
    if (!clean) continue;
    // Bare specifiers (no ./ ../ /) are npm-style and cannot resolve
    // in a bundler-less app. Reported, because that exact mistake
    // shipped once already.
    if (!isAbs && !clean.startsWith('.')) continue;

    const target = isAbs ? join(out, clean) : resolve(dirname(file), clean);
    checked++;

    if (!existsSync(target)) {
      missing.push(`${relative(out, file)} → ${raw}`);
      continue;
    }
    // Resolving to something outside the bundle is the original bug
    // in its general form, and would otherwise pass on a dev machine
    // where the file happens to exist one level up.
    if (relative(out, target).startsWith('..')) {
      missing.push(`${relative(out, file)} → ${raw} (escapes the bundle)`);
    }
  }
}

const entry = join(out, 'app', 'index.html');
if (!existsSync(entry)) {
  console.error('stage-native: app/index.html is not in the staged root');
  process.exit(1);
}

if (missing.length) {
  console.error(`stage-native: ${missing.length} reference(s) do not resolve inside the bundle:`);
  for (const m of missing) console.error('  ' + m);
  console.error('\nA native build would install, open and render nothing.');
  process.exit(1);
}

console.log(`stage-native: staged ${INCLUDE.join(', ')} into ${relative(root, out) || out}`);
console.log(`stage-native: ${checked} reference(s) checked, all resolve`);
