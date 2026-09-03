import { collapseDuplicateRecordings } from '../docs/js/matching.js';
import { readFileSync } from 'fs';
const src = readFileSync(new URL('../docs/js/app.js', import.meta.url),'utf8');
const app = readFileSync(new URL('../docs/app/index.html', import.meta.url),'utf8');
const root = readFileSync(new URL('../docs/index.html', import.meta.url),'utf8');
let pass=0,fail=0; function check(l,c){if(c)pass++;else{fail++;console.log('FAIL:',l);}}

// --- fonts ---
check('app shell font path climbs a level', /url\('\.\.\/assets\/Martius/.test(app));
check('marketing page font path stays relative', /url\('assets\/Martius/.test(root));
check('no stale asset urls in the app shell', !/url\('assets\//.test(app));

// --- sampler duplicates ---
check('matching imported', /import \* as matching from "\.\/matching\.js"/.test(src));
check('collapse applied per artist', /matching\.collapseDuplicateRecordings\(tracks\)\.tracks/.test(src));
check('cross-artist dedup', /seenTrackIds\.has\(t\.id\)/.test(src));
check('seen set initialised', /const seenTrackIds = new Set\(\);/.test(src));

// the collapse itself, on the shape search returns
const t=(id,name,isrc,dur)=>({id,name,artists:[{id:'a',name:'A'}],duration_ms:dur,
  external_ids:isrc?{isrc}:{}, album:{name:'Al'+id, album_type:'album', release_date:'2020-01-01'}});
{
  // same recording, three releases, same ISRC
  const r = collapseDuplicateRecordings([t('1','Song','ISRC1',200000),t('2','Song','ISRC1',200000),t('3','Song','ISRC1',200000)]);
  check('three copies collapse to one', r.tracks.length===1);
  check('collapse count reported', r.collapsedCount===2);
}
{
  // same title/duration, no ISRC
  const r = collapseDuplicateRecordings([t('1','Song',null,200000),t('2','Song',null,200000)]);
  check('no-ISRC duplicates collapse', r.tracks.length===1);
}
{
  // genuinely different songs must survive
  const r = collapseDuplicateRecordings([t('1','One','I1',200000),t('2','Two','I2',240000)]);
  check('different songs kept', r.tracks.length===2);
}
{
  // live vs studio must not merge
  const live = t('2','Song - Live','I2',205000);
  const r = collapseDuplicateRecordings([t('1','Song','I1',200000), live]);
  check('live version not merged with studio', r.tracks.length===2);
}

// cross-artist dedup logic
{
  const seen=new Set(); const out=[];
  for (const list of [[{id:'x'},{id:'y'}],[{id:'x'},{id:'z'}]])
    for (const t of list) if(!seen.has(t.id)){seen.add(t.id);out.push(t);}
  check('shared track appears once across artists', out.length===3);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
