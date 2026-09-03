import { artistsWithOneTrack, artistsNotAddedRecently, librarySuggestions, seededPick } from '../docs/js/insights.js';
let pass=0,fail=0; function check(l,c){if(c)pass++;else{fail++;console.log('FAIL:',l);}}
function t(id, artistId, artistName, added){ return {id, artists:[{id:artistId,name:artistName}], added_at:added}; }

const lib = [
  t('1','a1','Solo Artist','2026-05-01'),                      // exactly 1
  t('2','a2','Two Songs','2020-01-01'), t('3','a2','Two Songs','2020-02-01'),
  t('4','a3','Old Favourite','2018-03-01'), t('5','a3','Old Favourite','2018-04-01'),
  t('6','a4','Recent Band','2026-06-01'), t('7','a4','Recent Band','2026-06-02'),
  t('8','a5','Another Oneoff','2026-01-15'),                   // exactly 1
];

// one-track artists
{
  const r = artistsWithOneTrack(lib);
  const names = r.map(x=>x.name);
  check('finds artists with exactly one track', names.includes('Solo Artist') && names.includes('Another Oneoff'));
  check('excludes multi-track artists', !names.includes('Two Songs') && !names.includes('Recent Band'));
  check('reason is stated', r[0].reason === '1 song liked');
  check('most recent first', names[0]==='Solo Artist');
  check('respects limit', artistsWithOneTrack(lib,{limit:1}).length===1);
}

// not-added-recently
{
  const r = artistsNotAddedRecently(lib);
  check('oldest last-added first', r[0].name==='Old Favourite');
  check('reason names the year, and says "added" not "played"', /^last added \d{4}$/.test(r[0].reason));
  check('excludes single-track artists by default', !r.some(x=>x.name==='Solo Artist'));
}

// combined row
{
  const r = librarySuggestions(lib, { limit: 4 });
  check('returns a mix, capped at limit', r.length<=4 && r.length>0);
  check('no duplicates by id', new Set(r.map(x=>x.id)).size===r.length);
  check('every pick carries a reason', r.every(x=>typeof x.reason==='string' && x.reason.length));
}

// exclusions honoured (pins / blocked / already shown)
{
  const r = librarySuggestions(lib, { exclude: new Set(['a1','solo artist']), limit: 6 });
  check('excluded artist omitted', !r.some(x=>x.name==='Solo Artist'));
}

// empty / missing data safety
{
  check('empty library safe', librarySuggestions([], {limit:5}).length===0);
  check('tracks without artists safe', librarySuggestions([{id:'x'}], {limit:5}).length===0);
  check('tracks without added_at safe', artistsWithOneTrack([t('z','az','No Date',undefined)]).length===1);
}

// stable shuffle
{
  const items = Array.from({length:10},(_,i)=>({id:'i'+i}));
  const a = seededPick(items, 5, 42).map(x=>x.id).join(',');
  const b = seededPick(items, 5, 42).map(x=>x.id).join(',');
  const c = seededPick(items, 5, 99).map(x=>x.id).join(',');
  check('same seed => same order (stable per session)', a===b);
  check('different seed => different order', a!==c);
  check('respects count', seededPick(items,3,7).length===3);
  check('count larger than input is safe', seededPick(items,50,7).length===10);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
