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
  'renderProgressError','renderWatchlist','renderHistory','renderSettings','showDiveScreen','updateDiveScreen','hideDiveScreen','addDiveImage','startSlideshow','fetchArtistImages','setDiveHeading','openInSpotify','renderSamplerIntro','runSampler','confirmDialog','applyBmcVisibility','renderLanding','landingSeen','markLandingSeen','renderScrubForm','renderScrubResults',
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
for (const c of ['INTENTS','INTENT_KEY','BUILD','CARD_LENGTHS','BMC_KEY','FEATURES','LANDING_SEEN_KEY','CARDS_PER_LOAD','PLAYLIST_LENGTHS','PLAYLIST_ORDERS','SAMPLER_MAX_ARTISTS']) {
  check(`${c} is defined`, new RegExp(`const ${c}\\b`).test(src));
}

// The original regression this suite exists for: demoArtists was
// deleted while still being called, throwing before any guard could
// catch it. Demo mode moved to demo.js in 2.8.3, so the guarded call is
// gone — what matters now is that the module it moved to is imported
// and that the screens it routes to all exist.
check('demo module is imported', /import \* as demo from "\.\/demo\.js";/.test(src));
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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
