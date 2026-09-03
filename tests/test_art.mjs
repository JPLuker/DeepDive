import { artworkFromCache, artistsWithOneTrack, librarySuggestions } from '/home/claude/dd/js/insights.js';
let pass=0,fail=0; function check(l,c){if(c)pass++;else{fail++;console.log('FAIL:',l);}}
const t=(id,aid,an,added,imgs)=>({id,artists:[{id:aid,name:an}],added_at:added,album:{images:imgs}});
const lib=[
  t('1','a1','Solo','2026-05-01',[{url:'big.jpg'},{url:'small.jpg'}]),
  t('2','a2','Duo','2020-01-01',[{url:'d.jpg'}]), t('3','a2','Duo','2020-02-01',null),
  t('4','a3','NoArt','2019-01-01',null),
];
{
  const r=artistsWithOneTrack(lib);
  check('one-track artist carries album art', r.find(x=>x.name==='Solo').image_url==='small.jpg');
}
{
  const {byId,byName}=artworkFromCache(lib);
  check('artwork keyed by id', byId.get('a1')==='small.jpg');
  check('artwork keyed by lowercased name', byName.get('duo')==='d.jpg');
  check('artists with no art are absent', !byId.has('a3'));
}
{
  const r=librarySuggestions(lib,{limit:5});
  check('every pick has image_url defined (may be null)', r.every(x=>'image_url' in x));
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
