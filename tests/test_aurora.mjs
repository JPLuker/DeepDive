// Aurora Glass conformance — issue #14, Phase 1.
//
// Joseph adopted JPLuker/InternalDesignGuidelines as the governing
// standard on 18 Oct: where it and DeepDive's own recorded decisions
// disagree, the standard wins. These are the parts of DESIGN.md that
// can be checked from source text. The ones that can't — contrast on
// glass, whether a screen has exactly one focal point, whether the
// copy earns its place — are in TESTING.md for a real device.
//
// The app had the pill buttons and the fills-over-outlines intent long
// before the standard existed, which is why the gap was easy to miss:
// it looked close enough. It wasn't. Thirteen controls carried 1.5px
// outlines and seven elements used a gradient as a fill.
import { readFileSync } from 'fs';
const shell = readFileSync(new URL('../docs/app/index.html', import.meta.url), 'utf8');
const src = readFileSync(new URL('../docs/js/app.js', import.meta.url), 'utf8');

let pass = 0, fail = 0;
function check(l, c) { if (c) pass++; else { fail++; console.log('FAIL:', l); } }

// --- Part 19: gradient fills on controls ----------------------------
// P3 is "light behind, not on": a gradient may be ambient, or on one
// short display string per screen. Not on every button, toggle and
// chip. 14.3 says primary is a solid accent fill.
{
  const uses = [...shell.matchAll(/background:var\(--accent-gradient\)/g)].length;
  // The two that remain are progress fills, which are neither controls
  // nor in Part 19's list (buttons, whole cards, page backgrounds).
  check('gradient is not a control fill any more', uses === 2);
  const progressOnly = ['.progress-fill', '.dive-track-fill'].every((sel) => {
    const i = shell.indexOf(sel + ' {');
    return i > -1 && shell.slice(i, shell.indexOf('}', i)).includes('--accent-gradient');
  });
  check('the two left are the progress fills', progressOnly);
  check('the primary button is a solid accent', /\.btn-primary \{ background:var\(--accent\);/.test(shell));
  check('and the toggle, when on', /input:checked \+ \.switch-track \{ background:var\(--accent\);/.test(shell));
}

// --- P7: content is the color (2.9.116) ------------------------------
// The mix cards were gradient fills with a hue rotating per card,
// standing in for artwork they didn't have. They do have artwork: the
// mixes are built from the user's liked songs, so the covers are
// already fetched and cost nothing extra. Joseph's call — he found the
// cards ugly and asked to revisit them.
{
  check('no gradient fill on a whole card', !/\.pcard::before \{[\s\S]{0,160}linear-gradient/.test(shell));
  check('no per-card hue left in markup', !/--h:\$\{/.test(src));
  check('cards carry their own covers', /function cardArtBlock\(/.test(src) && /\.pcard-art \{/.test(shell));
  check('the art is square', /\.pcard-art \{[\s\S]{0,160}aspect-ratio:1/.test(shell));

  // Concentric rule, 7.3: inner radius = outer minus the padding
  // between them. The card is --r-lg (20px) with 10px of padding, so
  // the art is 10px, which is --r-sm exactly.
  const card = (shell.match(/\n  \.pcard \{[^}]*\}/) || [''])[0];
  const art = (shell.match(/\n  \.pcard-art \{[^}]*\}/) || [''])[0];
  check('card is --r-lg with 10px padding', /border-radius:var\(--r-lg\)/.test(card) && /padding:10px/.test(card));
  check('and its art is --r-sm, which is the concentric answer', /border-radius:var\(--r-sm\)/.test(art));
  // A phone override used to set padding:8px 14px, which breaks that
  // relationship and pinches the corners.
  check('no override re-pads the card', !/\.pcard \{ [^}]*padding:(?!10px)/.test(shell));

  // Every count has to fill the square or a cell is left empty.
  for (const n of [1, 2, 3]) check(`${n} cover(s) lay out`, shell.includes(`.pcard-art-${n}`));
  check('a card with no art degrades rather than breaking', /\.pcard-art\.is-blank/.test(shell) && /is-blank/.test(src));

  // Two album shapes exist in this codebase and a field on one but not
  // the other fails silently — that is how Multi-Dip lost its photos.
  check('both album shapes are read', /tileImage\(album\.images\) \|\| album\.image_url/.test(src));
  check('covers are deduped by album', /seen\.has\(key\)/.test(src));
  // Text sits on a surface now, so white-on-gradient would vanish in
  // the light theme.
  check('card text is themed, not hard-coded white', !/\.pcard \{[^}]*color:#fff/.test(shell));
}

// A two-word action link wrapped to two lines at phone width, beside a
// heading whose subtitle had already taken the room.
// Matched inside the rule rather than within a fixed character span:
// a comment added to the rule pushed the declaration past the window
// and the check failed on a rule that was correct.
check('the row action does not wrap', /white-space:nowrap/.test((shell.match(/\n  \.row-more \{[^}]*\}/) || [''])[0]));

// --- Part 19: outlined-everything -----------------------------------
// 1.5px is heavier than the hairline the standard permits anywhere.
check('no 1.5px outlines remain', !/1\.5px solid var\(--line\)/.test(shell));
// Controls are filled surfaces; fields keep a border, as a hairline
// (14.6: "surface fill, hairline border").
check('secondary buttons are filled, not outlined', /\.btn-ghost \{ background:var\(--tile\); border:none;/.test(shell));
check('chips are filled', /\.pill \{[^}]*border:none; background:var\(--tile\)/.test(shell));
check('text fields keep a hairline border', /input\[type=text\], input\[type=password\] \{[^}]*border:1px solid var\(--hairline\)/.test(shell));

// --- P2 / 21.2: groups separated by space before lines --------------
// A hard full-width divider between every section is a Part 19
// anti-pattern. What's left is --hairline inside genuinely dense
// lists, which 14.8 allows.
{
  const hard = [...shell.matchAll(/border-(?:top|bottom):1px solid var\(--line\)/g)].length;
  check('no hard section dividers', hard === 0);
  check('dense lists may still use a hairline', /\.autofill-item \{[^}]*border-bottom:1px solid var\(--hairline\)/.test(shell));
  check('and dense tables', /\.diag-table td \{[^}]*border-bottom:1px solid var\(--hairline\)/.test(shell));
}

// --- Part 9.3: no ALL-CAPS eyebrow labels ---------------------------
// The copy was already sentence case in the markup; the stylesheet was
// doing the shouting, in mono at 0.08em tracking.
{
  const caps = [...shell.matchAll(/text-transform:uppercase/g)].length;
  // 9.3 reserves all-caps for 2-4 letter badges and, by extension, a
  // brand mark. Both survivors are the Martius wordmark, which Joseph
  // kept deliberately.
  check('only the wordmark shouts', caps === 2);
  const wordmarkOnly = [...shell.matchAll(/[^\n]*text-transform:uppercase[^\n]*/g)]
    .every((m) => /Martius|\.wordmark/.test(m[0]));
  check('and it is the wordmark, not a label', wordmarkOnly);
  for (const sel of ['.crate-section .label', '.settings-panel-title', '.diag-label']) {
    const i = shell.indexOf(sel + ' {');
    const rule = i > -1 ? shell.slice(i, shell.indexOf('}', i)) : '';
    check(`${sel} is sentence case`, i > -1 && !/text-transform:uppercase/.test(rule));
    check(`${sel} is not mono`, !/Geist Mono/.test(rule));
  }
}

// --- Part 9.2: the type floor ---------------------------------------
// "Nothing below 12px, ever." Sixteen declarations were under it,
// including the tab labels at 10px and the build tag at 10.5px.
{
  const sizes = [...shell.matchAll(/font-size:([\d.]+)px/g)].map((m) => parseFloat(m[1]));
  const under = sizes.filter((n) => n < 12);
  check('nothing is set below 12px', under.length === 0);
  check('the floor is actually being measured', sizes.length > 60);
}

// --- Part 4 / 6.1: overlays are glass -------------------------------
// Layer 4 is "thick glass + shadow". A modal on an opaque panel with a
// 1.5px border was the heaviest edge in the app.
// Anchored on "\n  " so these read the top-level rule rather than a
// narrower one declared earlier: ".modal {" also matches the
// chroma-key demo override "#intent-modal .modal {", which is where
// this check first landed and passed on nothing.
for (const sel of ['.modal', '#flash-slot .flash']) {
  const i = shell.indexOf('\n  ' + sel + ' {');
  const rule = i > -1 ? shell.slice(i, shell.indexOf('}', i)) : '';
  check(`${sel} is thick glass`, /background:var\(--glass-thick-bg\)/.test(rule));
  check(`${sel} blurs what is behind it`, /backdrop-filter:blur\(var\(--glass-thick-blur\)\)/.test(rule));
  check(`${sel} has a hairline, not a hard border`, /border:1px solid var\(--hairline\)/.test(rule));
}

// --- Part 6.1: the tiers exist as tokens, in both themes ------------
{
  const light = shell.slice(shell.indexOf(':root {'), shell.indexOf(':root[data-theme="dark"]'));
  const dark = shell.slice(shell.indexOf(':root[data-theme="dark"]'));
  for (const t of ['--glass-bg:', '--glass-thick-bg:', '--hairline:', '--glass-highlight:', '--glass-shadow:', '--accent-soft-fill:']) {
    check(`${t} is defined for light`, light.includes(t));
    check(`${t} is redefined for dark`, dark.includes(t));
  }
}

// --- Part 20: the radius scale --------------------------------------
// Renamed from --radius-* in 2.9.114 so the scale matches the standard
// and every other project. Both stylesheets, because they are separate
// files and a token that exists in one and not the other fails silently
// as an invalid custom property.
{
  const landing = readFileSync(new URL('../docs/index.html', import.meta.url), 'utf8');
  for (const [name, value] of [['--r-xs', '6px'], ['--r-sm', '10px'], ['--r-md', '14px'],
                               ['--r-lg', '20px'], ['--r-xl', '28px'], ['--r-2xl', '36px'],
                               ['--r-pill', '9999px']]) {
    check(`${name} is ${value} in the app`, shell.includes(`${name}:${value}`));
    check(`${name} is ${value} on the landing page`, landing.includes(`${name}:${value}`));
  }
  check('no --radius-* references left in the app', !/var\(--radius/.test(shell));
  check('nor on the landing page', !/var\(--radius/.test(landing));
  // --r-lg was 22px, which is not a value on the scale at all.
  check('--r-lg is on the scale, not 22px', !/--r-lg:22px/.test(shell) && !/--r-lg:22px/.test(landing));
  // Every radius in use should name a token or be a deliberate shape
  // (50% for a circle, 999px inside a shorthand, 0 to square a corner).
  const literals = [...shell.matchAll(/border-radius:([^;}]+)/g)]
    .map((m) => m[1].trim())
    .filter((v) => !v.includes('var(--r-') && !/^(?:50%|0|999px)$/.test(v));
  // Nine were hard-coded: thin bars at 2-4px (pills, said plainly
  // now), two album thumbnails at 8px sitting beside a 10px tile
  // token, a 112px cover at 12px, two icon buttons at 8px (7.2 is
  // pill-first for controls) and an inline code chip at 4px.
  check('every radius names a token', literals.length === 0);
}

// --- 14.3: touch targets --------------------------------------------
// Icon buttons were 34px; 14.3 puts the floor at 36.
for (const sel of ['.crate-btn', '.star-btn', '.bill-btn']) {
  const i = shell.indexOf('\n  ' + sel + ' {');
  const rule = i > -1 ? shell.slice(i, shell.indexOf('}', i)) : '';
  check(`${sel} meets the 36px floor`, /width:36px; height:36px/.test(rule));
  check(`${sel} is filled, not outlined`, /border:none; background:var\(--tile\)/.test(rule));
}
// Every size an icon button is given anywhere, including overrides. A
// 30px descendant rule put .bill-btn back under the floor and the
// check above could not see it.
{
  // "-btn \{" and not "-btn[^{]*\{": the loose form also matched
  // ".star-btn svg { width:16px }", which is the icon inside the
  // button, not the button. A descendant override like
  // ".bill-actions .bill-btn {" still matches, which is the point.
  const sized = [...shell.matchAll(/\.(?:crate|star|bill)-btn \{[^}]*width:(\d+)px/g)].map((m) => +m[1]);
  check('no icon button override drops under 36px', sized.length > 0 && sized.every((n) => n >= 36));
}

// --- dead rules removed ---------------------------------------------
// Each was confirmed unreferenced from app.js before deletion.
for (const sel of ['.nav-sub', '.nav-field-label', '.intent-opt', '.intent-radio', '.intent-text']) {
  check(`${sel} is gone`, !shell.includes(sel));
}
check('and nothing in js referenced them', !/nav-sub|nav-field-label|intent-opt|intent-radio|intent-text/.test(src));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
