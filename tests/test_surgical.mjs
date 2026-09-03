import { readFileSync } from 'fs';
const src = readFileSync(new URL('../docs/js/app.js', import.meta.url),'utf8');
let pass=0,fail=0; function check(l,c){if(c)pass++;else{fail++;console.log('FAIL:',l);}}

const start = src.indexOf('const redraw = () =>');
const end = src.indexOf('const moreBtn', start);
const region = src.slice(start, end);

check('dropPill helper exists', /const dropPill = \(btn\) =>/.test(region));
check('unpin uses dropPill, not redraw', /data-unpin[\s\S]*?dropPill\(b\)/.test(region) && !/data-unpin[\s\S]*?redraw\(\)/.test(region.slice(region.indexOf('data-unpin'), region.indexOf('data-block'))));
check('block uses dropPill', /data-block[\s\S]*?dropPill\(b\)/.test(region));
check('empty section removes its header', /head\.classList\.contains\("row-head"\)/.test(region));
check('falls back to redraw if the wrap is missing', /if \(!wrap\) \{ redraw\(\); return; \}/.test(region));

// Simulate the DOM removal behaviour.
function makeEl(cls, parent){ return { classList:{ contains:(c)=>cls.includes(c) }, parentElement:parent,
  _removed:false, remove(){ this._removed=true; }, closest:function(sel){ return sel==='.pill-wrap'?this:null; },
  querySelector:()=>null, previousElementSibling:null }; }
const head = { classList:{contains:(c)=>c==='row-head'}, _removed:false, remove(){this._removed=true;} };
const row = { querySelector:()=>null, previousElementSibling:head, _removed:false, remove(){this._removed=true;} };
const wrap = makeEl(['pill-wrap'], row);
const btn = { closest:(sel)=> sel==='.pill-wrap' ? wrap : null };
// inline dropPill logic
(function(){ const w=btn.closest('.pill-wrap'); const r=w.parentElement; w.remove();
  if (r && !r.querySelector('.pill-wrap')) { const h=r.previousElementSibling; if(h && h.classList.contains('row-head')) h.remove(); r.remove(); } })();
check('pill removed', wrap._removed===true);
check('empty row removed', row._removed===true);
check('stranded header removed', head._removed===true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
