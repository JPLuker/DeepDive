// Guards against the class of bug that cost five rounds of debugging: a
// function deleted by an edit while its call site remained. `node --check`
// only validates syntax, so a ReferenceError like that ships silently.
//
// Rather than parse JavaScript with regex (which produced a stream of
// false positives from prose inside strings and comments), this checks a
// specific, high-value list: every top-level helper the app calls at
// startup must exist.
import { readFileSync } from 'fs';
const src = readFileSync(new URL('../docs/js/app.js', import.meta.url),'utf8');
let pass=0,fail=0; function check(l,c){if(c)pass++;else{fail++;console.log('FAIL:',l);}}

const mustExist = [
  'loadSuggestions','buildSuggestionRow','renderSuggestionRow',
  'renderDemo','renderDemoHome','renderDemoIndex',
  'renderHome','renderSetup','renderConnect','renderResults',
  'renderProgressError','renderCrate','renderBlocked','renderHistory','renderSettings','showDiveScreen','updateDiveScreen','hideDiveScreen','addDiveImage','startSlideshow','fetchArtistImages','setDiveHeading','openInSpotify','renderSamplerIntro','runSampler','confirmDialog','applyBmcVisibility','renderLanding','landingSeen','markLandingSeen','renderScrubForm','renderScrubResults',
  'startSearch','runSearchWithOptions','startScrub','applyResults','preflight',
  'explainError','diagnosticsHtml','maybeOfferUnpin','openIntentModal',
  'optionsForIntent','readCustomOptions','sortTracks','trackRow','esc','fmtDur',
  'flash','setTitle','navigate','refreshLibrary','boot','render',
  'loadPlaylistCards','openCardModal','renderCardRow','openSampler','runSampler','buildSampler','samplerSourceArtists','applyPlaylistOptions','renderPlaylistOptions','tracksToText','tracksToCsv','downloadFile','addPinToRow','showBmc','setShowBmc',
];
const missing = mustExist.filter(n =>
  !new RegExp(`(?:function|const|let)\\s+${n}\\b`).test(src));
if (missing.length) console.log('  MISSING definitions:', missing.join(', '));
check('every startup helper is defined', missing.length === 0);

// Constants referenced by those helpers.
for (const c of ['INTENTS','INTENT_KEY','BUILD','CARD_LENGTHS','BMC_KEY','LANDING_SEEN_KEY','CARDS_PER_LOAD','PLAYLIST_LENGTHS','PLAYLIST_ORDERS','SAMPLER_MAX_ARTISTS']) {
  check(`${c} is defined`, new RegExp(`const ${c}\\b`).test(src));
}

// The original regression this suite exists for: demoArtists was
// deleted while still being called, throwing before any guard could
// catch it. Demo mode moved to demo.js in 2.8.3, so the guarded call is
// gone — what matters now is that the module it moved to is imported
// and that the screens it routes to all exist.
check('demo module is imported', /import \* as demo from "\.\/demo\.js(?:\?v=[^"]+)?";/.test(src));
// Scoped to render(): getClientId is called from several other places,
// so comparing first occurrences across the whole file proves nothing.
const renderFn = src.slice(src.indexOf('async function render() {'), src.indexOf('// ---- support link visibility ----'));
check('demo routes ahead of auth', renderFn.indexOf('demo.demoScreen()') < renderFn.indexOf('auth.getClientId()'));
check('no orphaned demoArtists call', !/demoArtists\(\)/.test(src));

// The specific regression: demoArtists was deleted while still being
// called, and the call sat outside the try block so nothing caught it.


// Every getElementById target must exist in the shell or be rendered by
// app.js. Elements removed in a redesign leave callers behind that
// either do nothing silently or throw — both have happened here.
{
  const app = readFileSync(new URL('../docs/app/index.html', import.meta.url),'utf8');
  const ids = new Set([
    ...app.matchAll(/id="([A-Za-z0-9_-]+)"/g),
    ...src.matchAll(/id="([A-Za-z0-9_-]+)"/g),
  ].map(m => m[1]));
  const refs = new Set([...src.matchAll(/getElementById\("([A-Za-z0-9_-]+)"\)/g)].map(m => m[1]));
  const orphans = [...refs].filter(r => !ids.has(r));
  if (orphans.length) console.log('  orphaned element references:', orphans.join(', '));
  check('no references to elements that do not exist', orphans.length === 0);
}

// Confirming which build is loaded meant scrolling to the bottom of
// Settings, so a stale cached bundle was easy to test by accident and
// draw the wrong conclusion from. It goes on screen now, set before
// anything else in boot can fail.
//
// Removed in 2.9.110 and restored in 2.9.112: the removal argued that
// its toggle was gone, but the same change had just removed the
// toggle. It is opt-in and off by default, so it is not "shown to
// users" in the sense VERSIONING.md 4 limits to About, and the top bar
// is visible on phones, which is where it earns its place.
const shell = readFileSync(new URL('../docs/app/index.html', import.meta.url),'utf8');
check('build tag exists in the shell', /id="build-tag"/.test(shell));
check('build tag has styles', /\.build-tag \{/.test(shell));
check('build tag is filled at boot', /applyBuildTagVisibility\(\);/.test(src));
check('build tag is off by default', /localStorage\.getItem\(BUILD_TAG_KEY\) === "1"/.test(src));
check('and toggleable from settings', /id="set-show-build"/.test(src));
// Its toggle sits in About beside the version it controls, not back in
// Diagnostics where it was before About existed.
check('the toggle lives in About', (() => {
  const i = src.indexOf('<div class="set-group-label">About</div>');
  return i > -1 && src.slice(i, src.indexOf('`;', i)).includes('id="set-show-build"');
})());
check('the version is also in About', /title: "Version"/.test(src));

// Identifiers used inside a function that are declared in a different
// one. `maybeSetCover(res, news, …)` was added to applyResults, but
// `news` belongs to renderResults — so creating a playlist from a dive
// threw "news is not defined" while every suite stayed green, because
// source-text assertions cannot see scope.
{
  const fnAt = (name) => {
    const i = src.indexOf(name);
    if (i < 0) return "";
    // Skip the argument list first: a destructured parameter such as
    // `({ force = false } = {})` opens braces of its own, and counting
    // from the first one closes the "body" before it begins.
    let p = 0, start = -1;
    for (let k = src.indexOf("(", i); k < src.length; k++) {
      if (src[k] === "(") p++;
      else if (src[k] === ")") { p--; if (!p) { start = src.indexOf("{", k); break; } }
    }
    if (start < 0) return "";
    let d = 0;
    for (let k = start; k < src.length; k++) {
      if (src[k] === "{") d++;
      else if (src[k] === "}") { d--; if (!d) return src.slice(i, k); }
    }
    return "";
  };
  // The two result handlers, which have similar shapes and similar
  // variable names — exactly where a stray reference hides.
  for (const fn of ["async function applyResults(r, action)", "function renderResults(r)",
                    "function openIntentModal("]) {
    const body = fnAt(fn);
    check(`${fn.slice(0, 28)}… has no stray locals`, !!body && ["news", "dups", "cards", "entries", "gear", "forArtist"]
      .every((n) => !new RegExp(`\\b${n}\\b`).test(body)
        || new RegExp(`(const|let|var)\\s+${n}\\b`).test(body)));
  }
}

// --- calls to things that don't exist (2.9.117) ---------------------
//
// 2.9.116 shipped `tileImage(album.images)` in app.js. tileImage lives
// in insights.js and was never exported, so it was a ReferenceError the
// first time a real library reached that line. Nothing caught it:
// `node --check` parses an undefined identifier happily, every
// assertion in this suite reads source text, and the sandbox render
// never reached the call because the staged cards had no tracks.
//
// This is the cheapest check that would have. It collects every bare
// `name(` call in app.js and asks whether that name is declared in the
// file, imported into it, or a known global. It is not a type checker
// and does not need to be — it catches exactly the thing that bit.
{
  const KNOWN = new Set([
    // language and browser surface used in this file
    'if','for','while','switch','catch','return','typeof','function','await','super',
    'Promise','Array','Object','String','Number','Boolean','Date','Map','Set','JSON','Math',
    'RegExp','Error','TypeError','URL','URLSearchParams','Intl','AbortController','Blob','File',
    'FileReader','FormData','Image','Audio','CustomEvent','Event','IntersectionObserver','ResizeObserver',
    'setTimeout','clearTimeout','setInterval','clearInterval','requestAnimationFrame',
    'cancelAnimationFrame','fetch','alert','confirm','prompt','structuredClone','queueMicrotask',
    'encodeURIComponent','decodeURIComponent','parseInt','parseFloat','isNaN','isFinite',
    'btoa','atob','escape','unescape','matchMedia','getComputedStyle','require','import',
    'async',
  ]);
  // Names declared in app.js itself.
  const declared = new Set();
  for (const re of [/\bfunction\s+([A-Za-z_$][\w$]*)/g,
                    /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g,
                    /\bclass\s+([A-Za-z_$][\w$]*)/g]) {
    for (const m of src.matchAll(re)) declared.add(m[1]);
  }
  // Parameters, including destructured ones. Callbacks arrive this way
  // — onProgress, onChoose — and are called by name inside the function
  // that received them, which looks identical to a bare global call.
  for (const m of src.matchAll(/\(([^()]*)\)\s*(?:=>|\{)/g)) {
    for (const part of m[1].split(',')) {
      for (const id of part.matchAll(/([A-Za-z_$][\w$]*)\s*(?=[,:}\]=]|$)/g)) declared.add(id[1]);
      const bare = part.trim().replace(/^\.\.\./, '').split(/[=:]/)[0].trim();
      if (/^[A-Za-z_$][\w$]*$/.test(bare)) declared.add(bare);
    }
  }
  // Destructured locals: const { a, b } = something.
  for (const m of src.matchAll(/(?:const|let|var)\s*\{([^}]*)\}\s*=/g)) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s*:\s*/).pop().split('=')[0].trim();
      if (/^[A-Za-z_$][\w$]*$/.test(name)) declared.add(name);
    }
  }

  // Names imported into it, default, named and namespace alike.
  for (const m of src.matchAll(/import\s+(?:\*\s+as\s+([\w$]+)|\{([^}]+)\}|([\w$]+))\s+from/g)) {
    if (m[1]) declared.add(m[1]);
    if (m[3]) declared.add(m[3]);
    if (m[2]) for (const part of m[2].split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop().trim();
      if (name) declared.add(name);
    }
  }
  // Comments and string literals have to go first, or English prose
  // reads as calls — the first run flagged "modules(", "correctness("
  // and "toggle(" out of comments. Template literals are stripped down
  // to their ${...} expressions, which do hold real calls, rather than
  // dropped whole.
  const strip = (text) => {
    let out = '', i = 0, n = text.length;
    const src = text;
    while (i < n) {
      const c = src[i], d = src[i + 1];
      if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') i++; continue; }
      if (c === '/' && d === '*') { i += 2; while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue; }
      // Regex literals, before strings: `name.replace(/"/g, "")` has a
      // quote inside a regex, and without this the scanner opened a
      // string there and ran on until the next quote in the file,
      // emitting whatever lay between. That is how a string constant
      // several lines away ("deepdive_theme") came out looking like a
      // call. The usual heuristic — a slash in a position where a
      // value is expected starts a regex, otherwise it is division.
      if (c === '/') {
        let k = out.length - 1;
        while (k >= 0 && /\s/.test(out[k])) k--;
        const prev = k >= 0 ? out[k] : '';
        if (prev === '' || '(,=:[!&|?{};+-*%<>~^'.includes(prev)) {
          i++;
          while (i < n && src[i] !== '/') {
            if (src[i] === '\\') i++;
            else if (src[i] === '[') { while (i < n && src[i] !== ']') { if (src[i] === '\\') i++; i++; } }
            else if (src[i] === '\n') break;
            i++;
          }
          i++;
          while (i < n && /[gimsuyd]/.test(src[i])) i++;
          out += ' '; continue;
        }
      }
      if (c === "'" || c === '"') {
        const q = c; i++;
        while (i < n && src[i] !== q) { if (src[i] === '\\') i++; i++; }
        i++; out += ' '; continue;
      }
      if (c === '`') {
        i++;
        while (i < n) {
          if (src[i] === '\\') { i += 2; continue; }
          if (src[i] === '`') { i++; break; }
          if (src[i] === '$' && src[i + 1] === '{') {
            i += 2; let depth = 1, start = i;
            while (i < n && depth) {
              if (src[i] === '{') depth++;
              else if (src[i] === '}') depth--;
              if (depth) i++;
            }
            // Recursive: a ${...} can hold another template, and its
            // prose would otherwise come through verbatim. "Release
            // date (newest first)" inside a nested one read as a call
            // to date().
            out += ' ' + strip(src.slice(start, i)) + ' ';
            i++; continue;
          }
          i++;
        }
        out += ' '; continue;
      }
      out += c; i++;
    }
    return out;
  };
  const code = strip(src);
  check('the call scanner actually stripped something', code.length < src.length * 0.8);

  // Every bare call: `name(` not preceded by a dot, and not a keyword.
  const unknown = new Set();
  for (const m of code.matchAll(/(^|[^.\w$])([A-Za-z_$][\w$]*)\s*\(/g)) {
    const name = m[2];
    if (KNOWN.has(name) || declared.has(name)) continue;
    // Skip property shorthand and labels that aren't really calls.
    unknown.add(name);
  }
  check(`every call in app.js resolves (${[...unknown].slice(0, 6).join(', ') || 'none unresolved'})`, unknown.size === 0);
}

// --- the app shell's sheet carries only what it uses (2.9.120) ------
// Families superseded long ago and never removed: the slide-out drawer
// the tab bar replaced, the progress card the full-screen dive
// replaced, an older buy-me-a-coffee treatment, and the markup the
// current artist chooser replaced.
{
  for (const cls of ['nav-drawer', 'nav-pane', 'nav-link', 'nav-switch', 'menu-btn',
                     'bmc-link', 'bmc-row', 'progress-track', 'progress-fill',
                     'intent-name', 'intent-desc', 'modal-remember', 'pill-wrap']) {
    check(`.${cls} is gone from the shell`, !new RegExp(`\\.${cls}[\\s,{:.]`).test(shell));
  }
  // The live counterparts each family was superseded by.
  for (const cls of ['tabbar', 'coffee-btn', 'dive-track-fill', 'set-switch', 'intent-choice'])
    check(`.${cls} survives`, new RegExp(`\\.${cls}[\\s,{:.]`).test(shell));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
