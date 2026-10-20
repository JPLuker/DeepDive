// Find CSS rules on the landing page whose selectors cannot match
// anything in it.
//
// Brace-matched, never line-based: CLAUDE.md records a line regex that
// removed a selector and left its declarations and closing brace
// behind, so everything after the stray brace stopped applying while
// the page still loaded and the suite still passed.
//
// Reports. Deleting is a separate step, and the pixel diff is what
// proves it.
import { readFileSync, writeFileSync } from 'fs';

const file = process.argv[2] || 'docs/index.html';
const src = readFileSync(file, 'utf8');
// The app shell's markup is built in app.js and friends, so its class
// names live outside the html. --also lets those files be scanned for
// names too; without it every app rule looks dead.
const alsoAt = process.argv.indexOf('--also');
const extra = alsoAt > -1 ? process.argv.slice(alsoAt + 1).filter((a) => !a.startsWith('--')).map((f) => readFileSync(f, 'utf8')).join('\n') : '';

const styleStart = src.indexOf('<style>');
const styleEnd = src.indexOf('</style>', styleStart);
const css = src.slice(styleStart + 7, styleEnd);
const body = src.slice(styleEnd) + '\n' + extra;

// Everything the markup can actually carry: class attributes, ids,
// tag names, plus anything an inline script adds by name.
const classes = new Set();
// Class names built at runtime — `pcard-art-${n}`, `"dive-" + colour`,
// classList.add(`is-${state}`) — cannot be matched literally. Their
// fixed prefix is registered instead, and any rule whose class starts
// with one is treated as live.
//
// This is not a nicety. `.pcard-art-1`, `-2` and `-3` are written as
// `pcard-art-${art.length}` and were all reported dead on the first
// run; deleting them would have broken the album mosaic shipped the
// day before.
const prefixes = new Set();
const addToken = (c) => {
  if (!c) return;
  const cut = c.search(/\$\{|\+/);
  if (cut > 0) prefixes.add(c.slice(0, cut));
  else if (cut === -1) classes.add(c);
};
for (const m of body.matchAll(/class="([^"]*)"/g)) {
  for (const c of m[1].split(/\s+/)) addToken(c);
  // A class attribute in a template often decides between names:
  //   class="btn ${danger ? "btn-danger" : "btn-primary"}"
  // Splitting on whitespace leaves those still wearing their quotes,
  // so they match no rule. .btn-danger was reported dead on the first
  // run of this tool against the app shell, and is used right there.
  for (const q of m[1].matchAll(/['"`]([\w-][\w-\s]*)['"`]/g)) {
    for (const c of q[1].split(/\s+/)) addToken(c);
  }
}
for (const m of body.matchAll(/classList\.(?:add|remove|toggle)\(\s*[`'"]([^`'"]*)/g)) addToken(m[1]);
for (const m of body.matchAll(/className\s*=\s*[`'"]([^`'"]*)/g)) for (const c of m[1].split(/\s+/)) addToken(c);
// `"pcard-art-" + n` and `'is-' + state`, where the quote closes
// before the concatenation.
for (const m of body.matchAll(/['"`]([\w-]+-)['"`]\s*\+/g)) prefixes.add(m[1]);

// In JS sources, harvest every class-shaped string literal rather than
// trying to parse class attributes exactly. `class="btn ${danger ?
// "btn-danger" : "btn-primary"}"` cannot be read by an attribute regex
// at all — the inner quote closes the capture — and .btn-danger is
// live, two lines from a confirm dialog.
//
// This deliberately over-approximates: a string like "home" counts as
// a class whether or not it is one. The error it can make is keeping a
// dead rule, never deleting a live one, which is the right direction
// for a tool that rewrites a stylesheet.
for (const m of extra.matchAll(/['"`]([a-z][\w-]*(?:\s+[a-z][\w-]*)*)['"`]/gi)) {
  for (const c of m[1].split(/\s+/)) addToken(c);
}
const known = (n) => classes.has(n) || [...prefixes].some((p) => p && n.startsWith(p));
const ids = new Set([...body.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
const tags = new Set([...body.matchAll(/<([a-z][\w-]*)/g)].map((m) => m[1]));

// Split the sheet into top-level rules and at-rules, counting braces.
function rules(text, offset = 0) {
  const out = [];
  let i = 0, depth = 0, selStart = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === '/' && text[i + 1] === '*') { i = text.indexOf('*/', i) + 2; continue; }
    if (c === '{') {
      if (depth === 0) {
        // The raw slice carries any comment sitting above the rule.
        // Keep it for the deletion range, but test the selector with
        // comments stripped: the first version judged
        // `:root[data-theme="dark"]` dead because its documentation
        // comment came first and the ^:root anchor never matched, and
        // deleting it took the whole dark theme with it.
        var raw = text.slice(selStart, i);
        var sel = raw.replace(/\/\*[\s\S]*?\*\//g, '').trim();
        var bodyStart = i + 1;
      }
      depth++;
      i++; continue;
    }
    if (c === '}') {
      depth--;
      if (depth === 0) {
        out.push({
          sel, raw, body: text.slice(bodyStart, i),
          start: offset + selStart, end: offset + i + 1,
          // Absolute offset of this rule's body, so nested rules can be
          // located in the original sheet rather than guessed at from
          // a trimmed selector's length.
          bodyAt: offset + bodyStart,
        });
        selStart = i + 1;
      }
      i++; continue;
    }
    i++;
  }
  return out;
}

// Can this one selector ever match?
function selectorLives(sel) {
  const s = sel.trim();
  if (!s || s.startsWith('@') || s.startsWith('%')) return true;
  if (/^(?:from|to|\d+%)$/.test(s)) return true;            // keyframe stops
  if (/^(\*|:root|html|body)\b/.test(s)) return true;
  // Every class, id and tag mentioned anywhere in the compound must be
  // present. A descendant selector is dead if any part of it is.
  const names = [...s.matchAll(/\.([\w-]+)/g)].map((m) => m[1]);
  if (names.length && !names.every(known)) return false;
  const idNames = [...s.matchAll(/#([\w-]+)/g)].map((m) => m[1]);
  if (idNames.length && !idNames.every((n) => ids.has(n))) return false;
  // A bare tag selector with no class or id: keep unless the tag is absent.
  if (!names.length && !idNames.length) {
    const t = [...s.matchAll(/(^|[\s>+~,(])([a-z][\w-]*)/g)].map((m) => m[2])
      .filter((x) => !['and','not','or','is','where','has','only','screen','print'].includes(x));
    if (t.length && !t.some((x) => tags.has(x))) return false;
  }
  return true;
}

const top = rules(css);
let dead = [], trims = [], live = 0, atRules = 0;
for (const r of top) {
  if (r.sel.startsWith('@')) {
    atRules++;
    // Look inside media/supports blocks for dead rules of their own.
    if (/^@(media|supports)/.test(r.sel)) {
      for (const inner of rules(r.body, r.bodyAt)) {
        const parts = inner.sel.split(',').map((x) => x.trim()).filter(Boolean);
        if (parts.length && parts.every((p) => !selectorLives(p))) dead.push({ ...inner, within: r.sel.trim() });
        else {
          live++;
          const keep = parts.filter(selectorLives);
          if (keep.length && keep.length < parts.length) {
            trims.push({ start: inner.start, end: inner.bodyAt - 1, raw: inner.raw, sel: inner.sel, keep });
          }
        }
      }
    }
    continue;
  }
  const parts = r.sel.split(',').map((x) => x.trim()).filter(Boolean);
  if (parts.length && parts.every((p) => !selectorLives(p))) dead.push(r);
  else {
    live++;
    // A rule kept because one of its selectors lives can still be
    // carrying dead ones: `body, .card, .nav-drawer, input, .pill {…}`
    // survives on body and input while listing four classes the page
    // has no markup for. Dropping those changes nothing and is the
    // difference between "mostly cleaned" and clean.
    const keep = parts.filter(selectorLives);
    if (keep.length && keep.length < parts.length) {
      trims.push({ start: r.start, end: r.bodyAt - 1, raw: r.raw, sel: r.sel, keep });
    }
  }
}

console.log(`${live} live rules, ${atRules} at-rules, ${dead.length} with no possible match, ${trims.length} carrying dead selectors`);
const bytes = dead.reduce((n, r) => n + (r.end - r.start), 0);
console.log(`${bytes} bytes of dead css (${(bytes / css.length * 100).toFixed(1)}% of the sheet)\n`);
for (const r of dead.slice(0, Number(process.argv[3] || 25))) {
  console.log(`  ${r.within ? '[' + r.within.slice(0, 28) + '] ' : ''}${r.sel.replace(/\s+/g, ' ').slice(0, 92)}`);
}
if (dead.length > 25) console.log(`  … and ${dead.length - 25} more`);

// --apply rewrites the file. The pixel diff is what proves it; this
// only has to be exact about where each rule starts and ends.
if (process.argv.includes('--apply')) {
  // A comment directly above a rule documents that rule, so it goes
  // with it. One separated by a blank line is a section header and
  // stays — it may introduce rules that are still alive.
  const withComment = dead.map((r) => {
    let s = r.start;
    const before = css.slice(0, s - (r.within ? 0 : 0));
    const trimmed = css.slice(0, s).replace(/\s*$/, '');
    if (trimmed.endsWith('*/')) {
      const open = trimmed.lastIndexOf('/*');
      const between = css.slice(open, s);
      if (open !== -1 && !/\n\s*\n/.test(between)) s = open;
    }
    return { ...r, start: s };
  });
  // Splice from the end so earlier offsets stay valid. Trims and
  // deletions share one ordering for the same reason.
  const edits = [
    ...withComment.map((r) => ({ start: r.start, end: r.end, text: '' })),
    ...trims.map((t) => {
      // Whatever preceded the selector — leading newline, indentation,
      // any documentation comment — is kept verbatim; only the
      // comma-separated list after it is rewritten.
      const lead = t.raw.lastIndexOf('*/') >= 0
        ? t.raw.slice(0, t.raw.lastIndexOf('*/') + 2) + '\n  '
        : (t.raw.match(/^\s*/) || [''])[0];
      return { start: t.start, end: t.end, text: lead + t.keep.join(', ') + ' ' };
    }),
  ];
  let out = css;
  for (const e of edits.sort((a, b) => b.start - a.start)) {
    out = out.slice(0, e.start) + e.text + out.slice(e.end);
  }
  // An @media that held only dead rules is now empty.
  out = out.replace(/@(?:media|supports)[^{]*\{\s*\}/g, '');
  out = out.replace(/\n{3,}/g, '\n\n');
  const next = src.slice(0, styleStart + 7) + out + src.slice(styleEnd);
  writeFileSync(file, next);
  console.log(`\nrewrote ${file}: ${css.length} -> ${out.length} bytes of css`);
}
