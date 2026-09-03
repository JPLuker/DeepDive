import { collapseDuplicateRecordings, collapseNeedsIsrc } from '../js/matching.js';
let pass=0, fail=0;
function check(l,c){ if(c)pass++; else{fail++;console.log('FAIL:',l);} }
function t(id,name,album,albumType='album',dur=214000,date='2024-01-01',isrc=null,artist='DURRY'){
  const o={id,name,artists:[{id:'a',name:artist}],duration_ms:dur,
    album:{id:album,name:album,album_type:albumType,release_date:date},external_ids:{}};
  if(isrc)o.external_ids.isrc=isrc; return o;
}

// --- THE REAL BUG: DURRY Audiotree, same recording on single + EP ---
{
  const r = collapseDuplicateRecordings([
    t('single-wln',"Who's Laughing Now - Audiotree Live","WLN Single",'single',214000,'2024-03-01'),
    t('ep-wln',    "Who's Laughing Now - Audiotree Live","Audiotree EP",'album',214000,'2024-01-15'),
    t('ep-coa',    "Coming of Age - Audiotree Live",     "Audiotree EP",'album',190000,'2024-01-15'),
  ]);
  check('collapses the duplicate recording', r.tracks.length===2);
  check('reports 1 collapsed', r.collapsedCount===1);
  check('keeps the album version over the single', r.tracks.some(x=>x.id==='ep-wln') && !r.tracks.some(x=>x.id==='single-wln'));
  check('keeps the unrelated track', r.tracks.some(x=>x.id==='ep-coa'));
  check('records the alternative for later', (r.groups['ep-wln']||[]).some(x=>x.id==='single-wln'));
}

// --- ISRC takes precedence when present ---
{
  const r = collapseDuplicateRecordings([
    t('a','Song X','Alb A','album',200000,'2020-01-01','ISRC1'),
    t('b','Totally Different Title','Alb B','single',300000,'2021-01-01','ISRC1'),
  ]);
  check('same ISRC collapses regardless of title/duration', r.tracks.length===1 && r.collapsedCount===1);
}

// --- FALSE POSITIVE GUARDS (must NOT collapse) ---
{
  const r = collapseDuplicateRecordings([
    t('studio','Bubble of My Gum','Album','album',180000),
    t('live','Bubble of My Gum - Audiotree Live','EP','album',214000), // different title AND length
  ]);
  check('studio vs live not collapsed', r.tracks.length===2 && r.collapsedCount===0);

  const r2 = collapseDuplicateRecordings([
    t('x','Same Name','Alb','album',180000,'2020-01-01',null,'Artist One'),
    t('y','Same Name','Alb','album',180000,'2020-01-01',null,'Artist Two'),
  ]);
  check('same title different artist not collapsed', r2.tracks.length===2);

  const r3 = collapseDuplicateRecordings([
    t('p','Long Song','Alb','album',180000),
    t('q','Long Song','Alb2','album',240000), // 60s apart
  ]);
  check('same title very different duration not collapsed', r3.tracks.length===2);

  const r4 = collapseDuplicateRecordings([
    t('i','Different ISRCs Same Title','A','album',200000,'2020-01-01','ISRC-A'),
    t('j','Different ISRCs Same Title','B','album',200000,'2021-01-01','ISRC-B'),
  ]);
  check('different ISRCs never collapsed (remaster case)', r4.tracks.length===2);
}

// --- canonical picking: earliest album beats later album ---
{
  const r = collapseDuplicateRecordings([
    t('late','S','Deluxe','album',200000,'2022-01-01'),
    t('early','S','Original','album',200000,'2019-01-01'),
  ]);
  check('earliest album wins', r.tracks[0].id==='early');
}
// --- single that later appears on a compilation keeps the single ---
{
  const r = collapseDuplicateRecordings([
    t('sng','S','The Single','single',200000,'2018-01-01'),
    t('comp','S','Greatest Hits','compilation',200000,'2023-01-01'),
  ]);
  check('single beats later compilation', r.tracks[0].id==='sng');
}

// --- ordering preserved ---
{
  const r = collapseDuplicateRecordings([
    t('1','A','Al','album',100000), t('2','B','Al','album',150000), t('3','C','Al','album',200000),
  ]);
  check('order preserved when nothing collapses', r.tracks.map(x=>x.id).join(',')==='1,2,3');
}

// --- empty / single input ---
check('empty input safe', collapseDuplicateRecordings([]).tracks.length===0);
check('single track untouched', collapseDuplicateRecordings([t('z','Z','Al')]).tracks.length===1);

// --- collapseNeedsIsrc flags boundary-straddling pairs ---
{
  const groups = collapseNeedsIsrc([
    t('m','Edge Case','A','album',239900), // 3:59.9
    t('n','Edge Case','B','album',240100), // 4:00.1
    t('o','Unique','C','album',180000),
  ]);
  check('flags same-title pair for ISRC check', groups.length===1 && groups[0].length===2);
}


// === REGRESSION: the real DURRY screenshot case (2.0.2 follow-up) ===
// Titles differ only by a trailing "version", same duration. Reported
// live after the first 2.0.2 fix, which required an exact normalized
// match and so missed this.
{
  const r = collapseDuplicateRecordings([
    t('single',"Who's Laughing Now - Audiotree Live version","Who's Laughing Now",'single',221000,'2024-03-01'),
    t('ep',    "Who's Laughing Now - Audiotree Live","DURRY on Audiotree Live",'album',221000,'2024-01-15'),
  ]);
  check('DURRY screenshot case collapses', r.tracks.length===1 && r.collapsedCount===1);
  check('DURRY screenshot keeps EP version', r.tracks[0].id==='ep');
}
// Guard: studio vs live at identical length must still stay separate
{
  const r = collapseDuplicateRecordings([
    t('studio',"Who's Laughing Now",'Album','album',221000),
    t('live',  "Who's Laughing Now - Audiotree Live",'EP','album',221000),
  ]);
  check('studio vs live at same length stays separate', r.tracks.length===2);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
