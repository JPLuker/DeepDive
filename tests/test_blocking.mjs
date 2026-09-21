// Blocking is per feature.
//
// It used to be one list applied to dive suggestions and the sampler
// pool — but not to any other mix. So a blocked artist was barred from
// one kind of mix and left in all the rest, which was an accident of
// where the filter happened to be written rather than a decision.
//
// "Don't suggest them for a dive" and "keep them out of my mixes" are
// different wishes: a mix is built from tracks already liked, so not
// wanting to explore an artist says nothing about not wanting to hear
// them.
import { readFileSync } from 'fs';
const wl = readFileSync(new URL('../docs/js/watchlist.js', import.meta.url), 'utf8');
const src = readFileSync(new URL('../docs/js/app.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../docs/app/index.html', import.meta.url), 'utf8');

let pass = 0, fail = 0;
function check(l, c) { if (c) pass++; else { fail++; console.log('FAIL:', l); } }

// Storage
check('scopes are defined', /export const BLOCK_SCOPES = \["dives", "mixes"\]/.test(wl));
check('block takes a scope', /export function block\(name, spotifyId = null, scopes = BLOCK_SCOPES\)/.test(wl));
check('scopes can be set individually', /export function setBlockScope\(name, scope, on\)/.test(wl));
check('scopes can be read', /export function blockScopes\(name\)/.test(wl));
// Entries written before scopes existed blocked suggestions and the
// sampler, so reading them as both is what they meant.
check('legacy entries mean both', /if \(!entry \|\| !Array\.isArray\(entry\.scopes\)\) return BLOCK_SCOPES\.slice\(\)/.test(wl));
check('blocking again widens rather than replaces', /found\.scopes = Array\.from\(new Set\(\[\.\.\.normalizeScopes\(found\), \.\.\.scopes\]\)\)/.test(wl));
check('an empty block is removed entirely', /entry\.scopes\.length \? list : list\.filter/.test(wl));
// Callers must say which feature they mean.
check('lookup requires a scope', /export function blockedNameSet\(scope = "dives"\)/.test(wl));
check('and filters by it', /normalizeScopes\(b\)\.includes\(scope\)/.test(wl));

// Each surface uses its own
check('dive suggestions use the dive scope', /watchlist\.blockedNameSet\("dives"\)/.test(src));
check('the sampler uses the mix scope', (src.match(/blockedNameSet\("mixes"\)/g) || []).length >= 2);
// The cards never had any filter at all.
check('mix cards honour the mix block', /const forMixes = withoutMixBlocked\(cached\)/.test(src) && /playlistCards\(forMixes,/.test(src));
check('by filtering the source, not each builder', /insights\.playlistCards\(forMixes, \{ seed \}\)/.test(src));

// UI
check('pins can be blocked too', /data-block="\$\{esc\(p\.name\)\}"/.test(src));
check('a tile block means dives', /watchlist\.block\(name, b\.dataset\.sid \|\| null, \["dives"\]\)/.test(src));
check('and says so', /won't be suggested for dives/.test(src));
check('blocked list offers both scopes', /data-scope="dives"/.test(src) && /data-scope="mixes"/.test(src));
check('toggling a scope is wired', /watchlist\.setBlockScope\(c\.dataset\.nm, c\.dataset\.scope, c\.checked\)/.test(src));
check('scope controls are styled', /\.block-scope \{/.test(css));

// Every mix source reads the library through the mix filter. It used to
// live in the Home/Mixes card loader alone, so Recommended, genres,
// "If you like…" and Build your own put blocked artists straight back.
check('one mix filter', /function withoutMixBlocked\(tracks\)/.test(src));
{
  const builders = /insights\.(recommendationCards|neglectedNeighboursCard|similarOwnedMix|genreCards|playlistCards)\(/g;
  let m, sites = 0;
  while ((m = builders.exec(src))) {
    sites++;
    const at = m.index;
    const start = Math.max(src.lastIndexOf('\nfunction ', at), src.lastIndexOf('\nasync function ', at));
    const head = src.slice(start, src.indexOf('\n', start + 1));
    const body = src.slice(start, at);
    // mixedRow is handed its tracks; its caller is checked below.
    const ok = /mixedRow\(/.test(head) || /withoutMixBlocked\(/.test(body);
    check(`${m[1]} reads a filtered library (${head.trim().slice(0, 40)})`, ok);
  }
  check('found the mix builders', sites >= 6);
  check('mixedRow is given the filtered library', /mixedRow\(_allCards, forMixes,/.test(src));
  // Build your own lists artists and years from the same read.
  const byo = src.indexOf('<h2>Build your own</h2>');
  check('build your own is filtered', byo > -1 && /withoutMixBlocked\(cached\)/.test(src.slice(byo, byo + 1500)));
}

// On a phone the actions take the full width. Without wrapping, the
// name was squeezed to nothing and drawn under the checkboxes.
{
  const i = css.indexOf('.watchlist-actions { width:100%; }');
  const mq = css.lastIndexOf('@media (max-width: 640px)', i);
  const block = css.slice(mq, i);
  check('mobile rows wrap', mq > -1 && /\.watchlist-row \{[^}]*flex-wrap:wrap/.test(block));
  check('mobile name takes its own line', /\.watchlist-name \{ flex:1 1 100%; \}/.test(block));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
