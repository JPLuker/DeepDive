// Session 3, stopping point A — navigation.
//
// Home had become the entire app on one page, which is why nothing else
// was findable: there was nowhere else to look. It is a summary now,
// with Dives and Mixes as destinations of their own.
import { readFileSync } from 'fs';
const src = readFileSync(new URL('../docs/js/app.js', import.meta.url), 'utf8');
const h = readFileSync(new URL('../docs/app/index.html', import.meta.url), 'utf8');

let pass = 0, fail = 0;
function check(l, c) { if (c) pass++; else { fail++; console.log('FAIL:', l); } }

// Four destinations, in both navigations. Only one shows at a time but
// both are always in the DOM, so both must carry the same set.
for (const tab of ['home', 'dives', 'mixes', 'settings']) {
  check(`bottom bar has ${tab}`, new RegExp(`class="tab" data-tab="${tab}"`).test(h));
  check(`top bar has ${tab}`, new RegExp(`class="topnav-btn" data-tab="${tab}"`).test(h));
  check(`router handles ${tab}`, new RegExp(`name === "${tab}"`).test(src));
}

check('renderDives exists', /async function renderDives\(\)/.test(src));
check('renderMixes exists', /async function renderMixes\(\)/.test(src));

// Home: a search field and a taste of each destination.
const home = src.slice(src.indexOf('async function renderHome()'), src.indexOf('async function renderDives()'));
check('home keeps the search field', /searchShellHtml\(\)/.test(home));
check('home suggestions are compact', /loadSuggestions\(\{ compact: true \}\)/.test(home));
check('home mixes are a preview', /limit: perRow/.test(home));
// Counts are per row rather than absolute, so Home looks deliberately
// short at any width instead of unfinished on a wide screen.
// Counts come from columnsAtWidth() now, which mirrors the CSS
// auto-fill rule rather than guessing at breakpoints.
check('preview fills a row at any width', home.includes('columnsAtWidth()'));
check('home does not own the full card row', !/id="playlist-cards"/.test(home));

// Dives: the full surface.
const dives = src.slice(src.indexOf('async function renderDives()'), src.indexOf('async function renderMixes()'));
check('dives shows every pin', /loadSuggestions\(\{ showAllPins: true \}\)/.test(dives));
check('dives owns the library scan', /id="go-scrub"/.test(dives));
check('dives owns history and pins', /id="go-history"/.test(dives) && /id="go-pins"/.test(dives));

// Mixes: the renamed Playlists, with the sampler.
const mixes = src.slice(src.indexOf('async function renderMixes()'), src.indexOf('async function loadPlaylistCards'));
check('mixes owns the card row', /id="playlist-cards"/.test(mixes));
// The sampler is a card in the grid now, always first — it is a mix
// like the others, and a full-width strip below the suggestion row made
// it look like a different kind of thing.
check('sampler is a card', /class="pcard is-sampler" data-sampler/.test(src));
check('and leads the row', src.indexOf('${samplerCard}') < src.indexOf('${shown.map('));
check('its pool is built wherever cards are drawn', /if \(!_samplerPool\.length\) \{/.test(src));
check('no leftover sampler strip', !/sampler-btn/.test(src));

// The handlers must call functions that exist — renderPins didn't.
for (const fn of ['renderWatchlist', 'renderHistory', 'renderScrubForm', 'openSampler']) {
  check(`${fn} is defined`, src.includes(`function ${fn}(`));
}
// The sampler pool is built by the suggestion row, which Mixes doesn't
// render — so it has to handle being empty rather than opening nothing.
check('empty sampler pool is handled', /_samplerPool\.length >= 2/.test(src));
check('one sampler pool, not two', (src.match(/let _samplerPool/g) || []).length === 1);

// "Playlists" is the old name for this.
// Mixes is the page. Genres and recommendations are mixes too, so the
// library-derived row had to say what it actually is.
// No page title — recommendations lead, matching Dives.
const mixesFn = src.slice(src.indexOf('async function renderMixes'), src.indexOf('async function loadPlaylistCards'));
check('mixes has no title of its own', !/<h2>Mixes<\/h2>/.test(mixesFn));
check('recommendations come first', mixesFn.indexOf('rec-section') < mixesFn.indexOf('playlist-cards'));
check('library row is named for its contents', /<h2>From your library<\/h2>/.test(src));

// "More ways to dive" was three identical pills with one warning
// floating above all of them, so the most expensive action in the app
// looked exactly like opening a list of pins. Each row carries its own
// description now, which is where the cost belongs.
check('dive destinations are rows', /function navRow\(idAttr, title, detail\)/.test(src));
check('the scan explains its cost', /one request per release/.test(dives));
check('history explains itself', /how to undo it/.test(dives));
check('pins explain themselves', /stop suggesting/.test(dives));
check('no loose pill row left', !/<div class="actions">\s*\n\s*<button class="btn btn-ghost btn-small" id="go-scrub"/.test(src));
// Ids stay literal, or the orphan audit stops seeing them — the same
// mistake the settings helpers made an hour earlier.
check('nav row ids are literal', src.includes('id="go-scrub"') && src.includes('id="go-history"'));
check('rows share the settings shape', /class="set-row set-row-nav"/.test(src));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
