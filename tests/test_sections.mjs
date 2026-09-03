import { readFileSync } from 'fs';
const src = readFileSync(new URL('../docs/js/app.js', import.meta.url),'utf8');
let pass=0,fail=0; function check(l,c){if(c)pass++;else{fail++;console.log('FAIL:',l);}}

check('row uses two independent containers', /id="pins-section"[\s\S]*id="sugg-section"/.test(src));
check('pinsOnly repaints just the pins section',
  /if \(state\.pinsOnly\) \{\s*pinsSection\.innerHTML = pinsHtml;\s*\} else \{/.test(src));
check('redrawPins helper exists', /const redrawPins = \(\) =>/.test(src));
check('suggestion pin repaints pins only, not the row', /dropPill\(b\);\s*\/\/ remove it from suggestions in place\s*redrawPins\(\);/.test(src));
check('addPinToRow exists for the autofill path', /function addPinToRow\(name\)/.test(src));
check('autofill pin no longer calls loadSuggestions', /addPinToRow\(it\.name\);/.test(src));
check('addPinToRow drops a duplicate suggestion', /_row\.suggestions = _row\.suggestions\.filter/.test(src.slice(src.indexOf('function addPinToRow'), src.indexOf('// The last rendered row'))));
check('addPinToRow falls back if the row is not rendered', /if \(!_row \|\| !_row\.el/.test(src));

// containers are only created once, so repainting one leaves the other alone
const idx = src.indexOf('if (!el.querySelector("#pins-section")');
check('containers created only when missing', idx !== -1 && /\|\| !el\.querySelector\("#sugg-section"\)\) \{/.test(src));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
