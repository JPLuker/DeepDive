import { playlistCards } from '/home/claude/dd/js/insights.js';
let pass=0,fail=0; function check(l,c){if(c)pass++;else{fail++;console.log('FAIL:',l);}}
const t=(id,aid,date)=>({id,name:id,artists:[{id:aid,name:'A'+aid}],added_at:date,album:{name:'Al',images:[{url:'i.jpg'}]}});

// A library spanning several years with a mix of one-offs and repeats.
const lib=[];
for(let i=0;i<30;i++) lib.push(t('a'+i,'shared','2019-0'+((i%9)+1)+'-01'));
for(let i=0;i<20;i++) lib.push(t('b'+i,'shared2','2022-0'+((i%9)+1)+'-01'));
for(let i=0;i<10;i++) lib.push(t('c'+i,'solo'+i,'2026-0'+((i%9)+1)+'-01')); // 10 one-offs

{
  const cards = playlistCards(lib);
  const ids = cards.map(c=>c.id);
  check('produces cards', cards.length>0);
  check('one-offs card present', ids.includes('one-offs'));
  check('year cards present', ids.some(i=>i.startsWith('year-')));
  check('every card has tracks', cards.every(c=>Array.isArray(c.tracks) && c.tracks.length));
  check('count matches track list', cards.every(c=>c.count===c.tracks.length));
  check('every card has a title and subtitle', cards.every(c=>c.title && c.subtitle));
  check('no card is below the minimum', cards.every(c=>c.count>=5));
}
// Cards must never be offered when they would be empty
{
  check('empty library yields no cards', playlistCards([]).length===0);
  check('null-safe', playlistCards(null).length===0);
  const tiny=[t('x','a','2020-01-01'),t('y','b','2020-02-01')];
  const c=playlistCards(tiny);
  check('tiny library yields no under-filled cards', c.every(x=>x.count>=5));
}
// Year cards capped and ordered newest-first
{
  const many=[];
  for(const y of ['2018','2019','2020','2021','2022','2023']) for(let i=0;i<8;i++) many.push(t(y+i,'sh','%s-01-01'.replace('%s',y)));
  const cards=playlistCards(many,{maxYears:3});
  const years=cards.filter(c=>c.id.startsWith('year-')).map(c=>c.id);
  check('year cards capped', years.length<=3);
  check('newest year first', years[0]==='year-2023');
}
// Chronology within a year card
{
  const cards=playlistCards(lib);
  const y=cards.find(c=>c.id.startsWith('year-'));
  const dates=y.tracks.map(x=>x.added_at);
  check('year card is chronological', dates.join()===dates.slice().sort().join());
}
// One-offs really are one-per-artist
{
  const cards=playlistCards(lib);
  const oneoff=cards.find(c=>c.id==='one-offs');
  const artists=oneoff.tracks.map(x=>x.artists[0].id);
  check('one-offs are unique artists', new Set(artists).size===artists.length);
  check('one-offs excludes repeat artists', !artists.includes('shared'));
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
