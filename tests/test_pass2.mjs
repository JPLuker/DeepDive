import { collapseDuplicateRecordings } from '../docs/js/matching.js';
let pass=0,fail=0; function check(l,c){if(c)pass++;else{fail++;console.log('FAIL:',l);}}
function t(id,name,{album='Al',albumType='album',dur=221000,isrc=null,artist='DURRY',date='2024-01-01'}={}){
  const o={id,name,artists:[{id:'d',name:artist}],duration_ms:dur,
    album:{id:album,name:album,album_type:albumType,release_date:date},external_ids:{}};
  if(isrc)o.external_ids.isrc=isrc; return o;
}

// === THE ACTUAL SCREENSHOT CASE ===
{
  const r = collapseDuplicateRecordings([
    t('single',"Who's Laughing Now - Audiotree Live version",{album:"Who's Laughing Now",albumType:'single',dur:221000,date:'2024-03-01'}),
    t('ep',    "Who's Laughing Now - Audiotree Live",        {album:"DURRY on Audiotree Live",albumType:'album',dur:221000,date:'2024-01-15'}),
  ]);
  check('SCREENSHOT CASE: collapses to 1', r.tracks.length===1);
  check('SCREENSHOT CASE: reports 1 collapsed', r.collapsedCount===1);
  check('SCREENSHOT CASE: keeps the EP (album) version', r.tracks[0].id==='ep');
}

// === MUST NOT COLLAPSE ===
{
  // studio vs live, same length coincidentally
  const r1 = collapseDuplicateRecordings([
    t('studio',"Who's Laughing Now",{dur:221000}),
    t('live',  "Who's Laughing Now - Audiotree Live",{dur:221000}),
  ]);
  check('GUARD: studio vs live stays separate', r1.tracks.length===2);

  // different ISRCs = definitively different recordings (remaster)
  const r2 = collapseDuplicateRecordings([
    t('orig','Song - 2011 Remaster',{isrc:'ISRC-A',dur:200000}),
    t('rem', 'Song - 2012 Remaster',{isrc:'ISRC-B',dur:200000}),
  ]);
  check('GUARD: different ISRCs never merged', r2.tracks.length===2);

  // different artists
  const r3 = collapseDuplicateRecordings([
    t('x','Same Song Title',{artist:'Artist One'}),
    t('y','Same Song Title',{artist:'Artist Two'}),
  ]);
  check('GUARD: different artists stay separate', r3.tracks.length===2);

  // different durations
  const r4 = collapseDuplicateRecordings([
    t('p','Long Song',{dur:180000}),
    t('q','Long Song',{dur:240000}),
  ]);
  check('GUARD: 60s duration gap stays separate', r4.tracks.length===2);

  // genuinely different songs by same artist
  const r5 = collapseDuplicateRecordings([
    t('a','Teenagers Forever',{dur:200000}),
    t('b','Coming of Age',{dur:200500}),
  ]);
  check('GUARD: different songs same length stay separate', r5.tracks.length===2);

  // similar-but-real: acoustic version usually differs in length, but test same length
  const r6 = collapseDuplicateRecordings([
    t('e','Song Name',{dur:200000}),
    t('f','Song Name - Acoustic',{dur:200000}),
  ]);
  check('GUARD: acoustic variant stays separate', r6.tracks.length===2);
}

// === three releases of one recording collapse to one ===
{
  const r = collapseDuplicateRecordings([
    t('s1','Track - Live version',{albumType:'single',date:'2024-05-01'}),
    t('s2','Track - Live',        {albumType:'album', date:'2024-01-01'}),
    t('s3','Track - Live Version',{albumType:'compilation',date:'2024-09-01'}),
  ]);
  check('three releases collapse to one', r.tracks.length===1 && r.collapsedCount===2);
  check('keeps earliest album', r.tracks[0].id==='s2');
  check('records both alternatives', (r.groups['s2']||[]).length===2);
}

// === unrelated tracks untouched, order preserved ===
{
  const r = collapseDuplicateRecordings([
    t('1','Alpha',{dur:100000}), t('2','Beta',{dur:150000}), t('3','Gamma',{dur:200000}),
  ]);
  check('nothing collapsed', r.collapsedCount===0);
  check('order preserved', r.tracks.map(x=>x.id).join(',')==='1,2,3');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
