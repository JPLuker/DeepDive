// Guards against the class of bug that cost five rounds of debugging: a
// function deleted by an edit while its call site remained. `node --check`
// only validates syntax, so a ReferenceError like that ships silently.
//
// Rather than parse JavaScript with regex (which produced a stream of
// false positives from prose inside strings and comments), this checks a
// specific, high-value list: every top-level helper the app calls at
// startup must exist.
import { readFileSync } from 'fs';
const src = readFileSync('/home/claude/dd/js/app.js','utf8');
let pass=0,fail=0; function check(l,c){if(c)pass++;else{fail++;console.log('FAIL:',l);}}

const mustExist = [
  'demoArtists','loadSuggestions','buildSuggestionRow','renderSuggestionRow',
  'renderHome','renderSetup','renderConnect','renderResults',
  'renderProgressError','renderWatchlist','renderHistory','renderSettings','showDiveScreen','updateDiveScreen','hideDiveScreen','addDiveImage','startSlideshow','fetchArtistImages','setDiveHeading','openInSpotify','renderSamplerIntro','runSampler','confirmDialog','applyBmcVisibility','renderLanding','landingSeen','markLandingSeen','renderScrubForm','renderScrubResults',
  'startSearch','runSearchWithOptions','startScrub','applyResults','preflight',
  'explainError','diagnosticsHtml','maybeOfferUnpin','openIntentModal',
  'optionsForIntent','readCustomOptions','sortTracks','trackRow','esc','fmtDur',
  'flash','setTitle','navigate','refreshLibrary','stampBuild','boot','render',
  'loadPlaylistCards','openCardModal','renderCardRow','openSampler','runSampler','buildSampler','samplerSourceArtists','applyPlaylistOptions','renderPlaylistOptions','tracksToText','tracksToCsv','downloadFile','addPinToRow','showBmc','setShowBmc',
];
const missing = mustExist.filter(n =>
  !new RegExp(`(?:function|const|let)\\s+${n}\\b`).test(src));
if (missing.length) console.log('  MISSING definitions:', missing.join(', '));
check('every startup helper is defined', missing.length === 0);

// Constants referenced by those helpers.
for (const c of ['DEMO_SAMPLE','INTENTS','INTENT_KEY','BUILD','CARD_LENGTHS','BMC_KEY','FEATURES','LANDING_SEEN_KEY','CARDS_PER_LOAD','PLAYLIST_LENGTHS','PLAYLIST_ORDERS','SAMPLER_MAX_ARTISTS']) {
  check(`${c} is defined`, new RegExp(`const ${c}\\b`).test(src));
}

// The specific regression: demoArtists was deleted while still being
// called, and the call sat outside the try block so nothing caught it.
check('the demo call is inside a guard', /try \{ demo = demoArtists\(\); \}/.test(src));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
