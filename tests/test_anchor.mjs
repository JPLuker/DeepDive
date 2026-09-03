import { artistsBarelyExplored } from '../docs/js/insights.js';
import { readFileSync } from 'fs';
const src = readFileSync(new URL('../docs/js/app.js', import.meta.url),'utf8');
let pass=0,fail=0; function check(l,c){if(c)pass++;else{fail++;console.log('FAIL:',l);}}

// liked ids carried
const t=(id,aid,added)=>({id,artists:[{id:aid,name:'A'+aid}],added_at:added,album:{images:[]}});
const lib=[t('t1','a1','2026-01-01'),t('t2','a1','2026-02-01'),t('t3','a2','2026-03-01')];
const arts=artistsBarelyExplored(lib);
check('liked track ids carried per artist', arts.find(a=>a.id==='a1').likedTrackIds.length===2);
check('ids are the actual track ids', arts.find(a=>a.id==='a2').likedTrackIds[0]==='t3');

// build logic mirrored
function build(tracks, likedIds, perArtist){
  const liked=new Set(likedIds);
  const known=tracks.filter(t=>liked.has(t.id));
  const unknown=tracks.filter(t=>!liked.has(t.id));
  const out=[];
  if(known.length) out.push(known[0]);
  for(const t of unknown){ if(out.length>=perArtist) break; out.push(t); }
  return out;
}
const returned=[{id:'n1'},{id:'t1'},{id:'n2'},{id:'n3'}];
const got=build(returned,['t1','t2'],3);
check('exactly three tracks', got.length===3);
check('the liked one leads', got[0].id==='t1');
check('only one liked track included', got.filter(x=>['t1','t2'].includes(x.id)).length===1);
check('the rest are unliked', got.slice(1).every(x=>!['t1','t2'].includes(x.id)));

// no liked track in the results — artist still included
const none=build([{id:'n1'},{id:'n2'},{id:'n3'}],['t9'],3);
check('artist kept when nothing familiar returns', none.length===3);

// fewer results than asked for
check('short result sets are safe', build([{id:'t1'}],['t1'],3).length===1);

// wiring
check('order preserved, not shuffled', /\{ length: 20, order: "found" \}/.test(src));
check('no longer interleaved', !/interleaveByArtist\(tracks\)/.test(src));
check('splits liked from unliked', /const known = tracks\.filter\(\(t\) => liked\.has\(t\.id\)\)/.test(src));
check('falls back when nothing familiar', /if \(known\.length\) forArtist\.push\(known\[0\]\)/.test(src));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
