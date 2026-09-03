import { artistsBarelyExplored } from '/home/claude/dd/js/insights.js';
let pass=0,fail=0; function check(l,c){if(c)pass++;else{fail++;console.log('FAIL:',l);}}
const t=(id,aid,an,added)=>({id,artists:[{id:aid,name:an}],added_at:added,album:{images:[{url:'i.jpg'}]}});
const lib=[];
for(let i=0;i<20;i++) lib.push(t('h'+i,'heavy','Heavy Rotation','2026-01-01'));  // 20 tracks
for(let i=0;i<3;i++)  lib.push(t('m'+i,'three','Exactly Three','2026-06-01'));   // 3
for(let i=0;i<2;i++)  lib.push(t('p'+i,'two','Just Two','2025-01-01'));          // 2
lib.push(t('s1','one','Only One','2026-08-01'));                                 // 1
lib.push(t('f1','four','Four Tracks','2026-01-01'));
for(let i=0;i<3;i++) lib.push(t('f'+(i+2),'four','Four Tracks','2026-01-01'));    // 4 total

const r = artistsBarelyExplored(lib);
const names = r.map(x=>x.name);
check('includes artists with 1 track', names.includes('Only One'));
check('includes artists with 2 tracks', names.includes('Just Two'));
check('includes artists with exactly 3', names.includes('Exactly Three'));
check('excludes artists with 4', !names.includes('Four Tracks'));
check('excludes heavy rotation', !names.includes('Heavy Rotation'));
check('carries the count', r.every(x=>typeof x.count==='number' && x.count<=3));
check('carries artwork where available', r.some(x=>x.image_url));
check('most recent discovery first', names[0]==='Only One');
check('threshold is adjustable', artistsBarelyExplored(lib,{maxTracks:4}).map(x=>x.name).includes('Four Tracks'));
check('respects limit', artistsBarelyExplored(lib,{limit:2}).length===2);
check('empty library safe', artistsBarelyExplored([]).length===0);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
