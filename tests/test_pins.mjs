const store=new Map();
globalThis.localStorage={getItem:(k)=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v)),removeItem:(k)=>store.delete(k)};
const wl = await import('../docs/js/watchlist.js');
let pass=0,fail=0; function check(l,c){if(c)pass++;else{fail++;console.log('FAIL:',l);}}

// pins reuse the existing store, so old To-Dive entries survive
{
  wl.pin('Big Thief', {spotifyId:'bt', imageUrl:'http://i'});
  check('pin stores the artist', wl.pinned().some(p=>p.name==='Big Thief'));
  check('isPinned finds it (case-insensitive)', wl.isPinned('big thief')===true);
  check('isPinned false for others', wl.isPinned('Nobody')===false);
  const found = wl.findPinByName('BIG THIEF');
  check('findPinByName is case-insensitive', found && found.name==='Big Thief');
  check('stores spotify id + image', found.spotify_id==='bt' && found.image_url==='http://i');
}
// unpin
{
  const e = wl.findPinByName('Big Thief');
  wl.unpin(e.id);
  check('unpin removes it', wl.pinned().length===0);
}
// duplicates
{
  wl.pin('Wednesday'); wl.pin('wednesday');
  check('duplicate pin ignored (case-insensitive)', wl.pinned().filter(p=>/wednesday/i.test(p.name)).length===1);
}
// clear all
{
  wl.pin('Alvvays'); wl.pin('Turnstile');
  check('multiple pins held', wl.pinned().length>=3);
  wl.clearAllPins();
  check('clearAllPins empties it', wl.pinned().length===0);
}
// blocklist
{
  wl.block('Nickelback','nb');
  check('block stores the artist', wl.listBlocked().some(b=>b.name==='Nickelback'));
  check('blockedNameSet is lowercased', wl.blockedNameSet().has('nickelback'));
  wl.block('nickelback');
  check('duplicate block ignored', wl.listBlocked().length===1);
  wl.unblock('NICKELBACK');
  check('unblock is case-insensitive', wl.listBlocked().length===0);
  check('blank block ignored', (wl.block('  '), wl.listBlocked().length===0));
}
// corrupted storage tolerated
{
  store.set('deepdive_blocklist','{not json');
  check('corrupt blocklist => empty, no throw', wl.listBlocked().length===0);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
