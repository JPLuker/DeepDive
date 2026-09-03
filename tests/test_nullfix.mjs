import { LibraryCache } from '../docs/js/library-cache.js';
let pass=0,fail=0; function check(l,c){if(c)pass++;else{fail++;console.log('FAIL:',l);}}
function memStore(){const m=new Map();return{async get(k){return m.has(k)?m.get(k):null;},async set(k,v){m.set(k,v);}};}

// A library where Spotify reports total=5 but one entry has a null track
// (unavailable / pulled). This is the exact real-world shape that broke it.
function client(counter, nullCount=1, playable=4){
  const items=[];
  for(let i=0;i<playable;i++) items.push({added_at:`2026-01-${String(20-i).padStart(2,'0')}T00:00:00Z`,
    track:{id:'t'+i,name:'S'+i,artists:[{id:'a',name:'A'}],duration_ms:200000,album:{name:'Al'},external_ids:{isrc:'i'+i}}});
  for(let i=0;i<nullCount;i++) items.push({added_at:'2026-01-01T00:00:00Z', track:null});
  return { async get(url){ counter.calls++; return { items, total: playable+nullCount, next:null }; } };
}

// === THE BUG: with an unavailable track, does the cache ever engage? ===
{
  const store=memStore(); const c={calls:0};
  const cache=new LibraryCache(client(c), store, {now:()=>1000});
  const first=await cache.getLikedTracks();
  const afterFirst=c.calls;
  check('first read returns only playable tracks', first.length===4);

  const second=await cache.getLikedTracks();   // should be CHEAP now
  const secondCost=c.calls-afterFirst;
  check('second read still correct', second.length===4);
  check('BUG FIXED: second read is cheap (1 page, not a full re-read)', secondCost===1);

  const third=await cache.getLikedTracks();
  check('third read also cheap', c.calls-afterFirst-secondCost===1);
}

// === guards: the checksum must still catch real changes ===
{
  // an unlike (playable drops 4 -> 3) must trigger reconcile
  const store=memStore(); const c={calls:0};
  const cache1=new LibraryCache(client(c,1,4), store, {now:()=>1000});
  await cache1.getLikedTracks();
  const before=c.calls;
  const cache2=new LibraryCache(client(c,1,3), store, {now:()=>2000});
  const after=await cache2.getLikedTracks();
  check('unlike still detected and reconciled', after.length===3);
}
{
  // A track becoming unavailable while STILL saved: Spotify's total is
  // unchanged because it still counts the entry. Keeping it cached is
  // correct — it is still in the user's Liked Songs, just unplayable,
  // and DeepDive should still report it as already theirs.
  const store=memStore(); const c={calls:0};
  const c1=new LibraryCache(client(c,1,4), store, {now:()=>1000});
  await c1.getLikedTracks();
  const c2=new LibraryCache(client(c,2,3), store, {now:()=>2000});
  const r=await c2.getLikedTracks();
  check('track going unavailable keeps it cached (still liked)', r.length===4);
}
{
  // a library with NO unavailable tracks must behave exactly as before
  const store=memStore(); const c={calls:0};
  const cache=new LibraryCache(client(c,0,5), store, {now:()=>1000});
  await cache.getLikedTracks();
  const before=c.calls;
  const again=await cache.getLikedTracks();
  check('no-unavailable library: still cheap on re-read', c.calls-before===1 && again.length===5);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
