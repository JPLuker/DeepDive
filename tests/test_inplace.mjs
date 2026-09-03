import { readFileSync } from 'fs';
const src = readFileSync(new URL('../docs/js/app.js', import.meta.url),'utf8');
let pass=0,fail=0; function check(l,c){if(c)pass++;else{fail++;console.log('FAIL:',l);}}

// Extract just the handler region to assert no rebuild is triggered.
const start = src.indexOf('const redraw = () =>');
const end = src.indexOf('const moreBtn', start);
const handlers = src.slice(start, end);

check('unpin does not call loadSuggestions', !/data-unpin[\s\S]*?loadSuggestions\(\)/.test(handlers));
check('pin does not call loadSuggestions', !/data-pin"\][\s\S]*?loadSuggestions\(\)/.test(handlers));
check('block does not call loadSuggestions', !/data-block[\s\S]*?loadSuggestions\(\)/.test(handlers));
// Superseded by 2.2.9: unpin and block now remove their own pill via
// dropPill rather than redrawing, which is what removed the flash.
check('handlers avoid full rebuilds', /dropPill\(b\)/.test(handlers) && !/loadSuggestions\(\)/.test(handlers));
check('unpin removes from the local pins list', /_row\.pins = _row\.pins\.filter/.test(handlers));
check('pin removes the artist from suggestions', /_row\.suggestions = _row\.suggestions\.filter/.test(handlers));
check('row state is stored on render', /_row = \{ el, pins, suggestions/.test(src));
check('show-more uses stored state', /_row\.showAllPins = true/.test(src));

// The autofill pin still rebuilds, which is correct — a new artist may
// need to be excluded from suggestions and the data genuinely changes.
check('autofill pin still refreshes fully', /loadSuggestions\(\);/.test(src));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
