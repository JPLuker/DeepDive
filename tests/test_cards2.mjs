import { playlistCards } from '../docs/js/insights.js';
import { readFileSync } from 'fs';
let pass=0,fail=0; function check(l,c){if(c)pass++;else{fail++;console.log('FAIL:',l);}}
const t=(id,aid,added,dur,rel)=>({id,name:id,artists:[{id:aid,name:'A'+aid}],added_at:added,duration_ms:dur,album:{name:'Al',release_date:rel,images:[{url:'i.jpg'}]}});

const lib=[];
for(let a=0;a<5;a++) for(let i=0;i<8;i++) lib.push(t('r'+a+'_'+i,'reg'+a,'2026-0'+((i%9)+1)+'-01',200000,'2021-01-01'));
for(let i=0;i<15;i++) lib.push(t('o'+i,'solo'+i,'2025-0'+((i%9)+1)+'-01',420000,'1995-01-01')); // one-offs, long, 90s
for(let i=0;i<12;i++) lib.push(t('s'+i,'sh','2019-0'+((i%9)+1)+'-01',100000,'2005-01-01'));    // short, 2000s
const cards=playlistCards(lib);
const ids=cards.map(c=>c.id);

check('fresh additions card', ids.includes('recent'));
check('one-hit wonders card', ids.includes('one-offs'));
check('surprise card', ids.includes('surprise'));
check('year cards', ids.some(i=>i.startsWith('year-')));
check('top artists card', ids.includes('top-artists'));
check('decade cards', ids.some(i=>i.startsWith('decade-')));
check('epics card', ids.includes('epics'));
check('shorts card', ids.includes('shorts'));
check('meaningfully more options than before', cards.length >= 8);
check('all cards have tracks', cards.every(c=>c.tracks.length>0));
check('all cards meet the minimum', cards.every(c=>c.count>=5));
check('ids are unique', new Set(ids).size===ids.length);

// content sanity
const epics=cards.find(c=>c.id==='epics');
check('epics really are 6min+', epics.tracks.every(x=>x.duration_ms>=360000));
const shorts=cards.find(c=>c.id==='shorts');
check('shorts really are under 2:30', shorts.tracks.every(x=>x.duration_ms<=150000));
const dec=cards.find(c=>c.id.startsWith('decade-'));
check('decade card groups by release year', dec.tracks.every(x=>x.album.release_date.slice(0,3)===dec.id.slice(7,10)));

// surprise is stable within a day
const a=playlistCards(lib).find(c=>c.id==='surprise').tracks.map(x=>x.id).join();
const b=playlistCards(lib).find(c=>c.id==='surprise').tracks.map(x=>x.id).join();
check('surprise is stable within the day', a===b);

// tiny libraries still produce nothing rather than junk
check('tiny library yields nothing', playlistCards([t('x','a','2020-01-01',200000,'2020-01-01')]).length===0);

// UI: count no longer on the card face
const app=readFileSync(new URL('../docs/js/app.js', import.meta.url),'utf8');
check('count removed from the card face', !/pcard-count/.test(app));
// Superseded by 2.3.6: the row sits at the bottom of the page, so all
// cards are shown rather than hidden behind a 'more' click.
check('all cards rendered, none hidden', !/CARDS_VISIBLE/.test(app) && !/More ideas/.test(app) && /_cards\.map/.test(app));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
