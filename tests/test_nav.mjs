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
// The options gear is gone from every search bar: it duplicated the
// one in the artist popup, which is where choosing what to do with an
// artist actually happens.
check('home keeps the search field', /searchShellHtml\(/.test(home));
check('but not the options gear', !/searchShellHtml\(\)/.test(home));
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
check('multi-dip comes before the suggestions', dives.indexOf('id="go-show"') < dives.indexOf('id="suggestions-row"'));
check('crate comes before history', dives.indexOf('id="go-pins"') < dives.indexOf('id="go-history"'));
check('the duplicate scan comes after history', dives.indexOf('id="go-history"') < dives.indexOf('id="go-scrub"'));

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
for (const fn of ['renderCrate', 'renderBlocked', 'renderHistory', 'renderScrubForm', 'openSampler']) {
  check(`${fn} is defined`, src.includes(`function ${fn}(`));
}
// The sampler pool is built by the suggestion row, which Mixes doesn't
// render — so it has to handle being empty rather than opening nothing.
check('empty sampler pool is handled', /_samplerPool\.length >= 2/.test(src));
check('one sampler pool, not two', (src.match(/let _samplerPool/g) || []).length === 1);

// "Playlists" is the old name for this.
// Mixes is the page. When Last.fm adds Recommended and Genres, the
// generated grid needs a name that distinguishes its recipe rather than
// claiming it alone comes from the user's library.
// No page title — recommendations lead, matching Dives.
const mixesFn = src.slice(src.indexOf('async function renderMixes'), src.indexOf('async function loadPlaylistCards'));
check('mixes has no title of its own', !/<h2>Mixes<\/h2>/.test(mixesFn));
check('featured recommendations come first', mixesFn.indexOf('featured-mixes') < mixesFn.indexOf('rec-section'));
check('similar artists come before mix ideas', mixesFn.indexOf('rec-section') < mixesFn.indexOf('playlist-cards'));
check('generated row is named for its contents', /<h2>Mix ideas<\/h2>/.test(src));
check('old library heading is gone', !/<h2>From your library<\/h2>/.test(src));

// "More ways to dive" was three identical pills with one warning
// floating above all of them, so the most expensive action in the app
// looked exactly like opening a list of pins. Each row carries its own
// description now, which is where the cost belongs.
check('dive destinations are rows', /function navRow\(idAttr, title, detail, \{ disabled = false, tone = "" \} = \{\}\)/.test(src));
check('the scan explains its duplicate-only scope', /alternate releases of songs you already like/.test(dives));
check('history explains itself', /how to undo it/.test(dives));
// Pins became the Crate, and Blocked moved to Settings: blocking
// changes what the app does, not what you're listening to.
check('the crate explains itself', /Everyone you've put aside to get to/.test(dives));
check('no loose pill row left', !/<div class="actions">\s*\n\s*<button class="btn btn-ghost btn-small" id="go-scrub"/.test(src));
// Ids stay literal, or the orphan audit stops seeing them — the same
// mistake the settings helpers made an hour earlier.
check('nav row ids are literal', src.includes('id="go-scrub"') && src.includes('id="go-history"'));
check('rows share the settings shape', /class="set-row set-row-nav/.test(src));
check('every dive destination has a tone', ['blue', 'teal', 'purple', 'gold'].every((tone) => dives.includes(`tone: "${tone}"`)));
check('dive destinations share the gradient treatment', /\.set-row-nav\.dive-option/.test(h));

// The chooser floated mid-screen while the search bar that produced it
// sits near the top, so picking an artist threw your eye somewhere
// else entirely.
const shellSrc = readFileSync(new URL('../docs/app/index.html', import.meta.url), 'utf8');
// The desktop rule alone did nothing: a mobile media query pins every
// modal to flex-end, so the chooser stayed a bottom sheet and the
// change was invisible on the only device it was reported from.
check('the chooser sits near the search bar', /align-items:flex-start/.test(shellSrc));
check('on mobile too', /#intent-modal, #card-modal \{ align-items:flex-start/.test(shellSrc));
// The mix sheet arrived from the bottom while the chooser arrived from
// the top — two dialogs in one app from opposite edges.
check('and the mix sheet matches it', /#intent-modal \.modal, #card-modal \.modal \{/.test(shellSrc));
// The card modal is long and scrolled — a sheet is right for that one.
check('other modals stay sheets', /\.modal-backdrop \{ padding:0; align-items:flex-end; \}/.test(shellSrc));
check('and drops rather than appearing', /animation:modal-drop/.test(shellSrc));
check('with motion honoured', /prefers-reduced-motion: reduce\) \{\s*\n\s*\.modal \{ animation:none; \}/.test(shellSrc));
// Removing the icon must not throw on a screen that never had one.
check('the missing gear is handled', /settingsBtn\?\.addEventListener/.test(src));

// Five stacked option cards, each with a paragraph, pushed the Dive
// button off the screen the moment the options were opened — you could
// read about the modes and not act on one.
check('the modes are a select', /id="intent-mode"/.test(src));
check('with one description, for the chosen mode', /id="intent-mode-desc"/.test(src));
check('and no stacked option cards', !/data-intent="\$\{i\.id/.test(src));
// Repainting on change would rebuild the select mid-interaction.
check('the description updates in place', /modeDesc\.textContent = current \? current\.desc : ""/.test(src));
// max-height:none in 2.9.28 let the panel run past the bottom of the
// screen with nothing to scroll.
check('the chooser stays on screen', /max-height:calc\(100vh - clamp/.test(shellSrc));
check('and scrolls when it has to', /#card-modal \.modal \{[\s\S]{0,240}overflow-y:auto/.test(shellSrc));

// 2.9.58: mix cards read from the top. With the text pushed to the
// foot, a card beside a taller one opened a gap under its icon.
check('mix cards start at the top', /\.pcard \{[\s\S]{0,120}justify-content:flex-start/.test(h) && /\.pcard-icon \{ opacity:0\.85; margin-bottom:10px; \}/.test(h));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
