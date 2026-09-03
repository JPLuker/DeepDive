// Mirror demoArtists() logic and verify parsing
const store = new Map();
function demoArtists(search) {
  const DEMO_SAMPLE = ["Fleetwood Mac","Big Thief","Talking Heads"];
  try {
    const p = new URLSearchParams(search).get("demo");
    if (p !== null) {
      const list = p === "1" || p === "" ? DEMO_SAMPLE : p.split(",").map(s=>s.trim()).filter(Boolean);
      store.set('deepdive_demo', JSON.stringify(list));
      return list;
    }
    const stored = store.get('deepdive_demo');
    if (stored) return JSON.parse(stored);
  } catch(e) {}
  return null;
}
let pass=0,fail=0; function check(l,c){if(c)pass++;else{fail++;console.log('FAIL:',l);}}
check('no param -> null (normal behaviour)', demoArtists('') === null);
check('?demo=1 -> sample set', (demoArtists('?demo=1')||[]).length===3);
store.clear();
const custom = demoArtists('?demo=Big%20Thief,Wednesday,Alvvays');
check('custom list parsed', custom.join('|')==='Big Thief|Wednesday|Alvvays');
check('persists in session after param removed', (demoArtists('')||[]).join('|')==='Big Thief|Wednesday|Alvvays');
store.clear();
check('whitespace trimmed / blanks dropped', demoArtists('?demo=A, B ,,C').join('|')==='A|B|C');
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail?1:0);
