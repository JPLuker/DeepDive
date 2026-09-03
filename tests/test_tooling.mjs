import { SpotifyClient } from '/home/claude/dd/js/spotify.js';
const store=new Map();
globalThis.localStorage={getItem:(k)=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v)),removeItem:(k)=>store.delete(k)};
let pass=0,fail=0; function check(l,c){if(c)pass++;else{fail++;console.log('FAIL:',l);}}
const ok=(b={})=>({status:200,headers:{get:()=>null},json:async()=>b,text:async()=>JSON.stringify(b)});

function mock(existingPlaylist){
  return async (url, init) => {
    if (url.endsWith('/me')) return ok({id:'u1'});
    if (url.includes('/me/playlists?')) return ok({items: existingPlaylist ? [{id:'PL1',name:'Mine',owner:{id:'u1'},external_urls:{spotify:'http://old'}}] : [], next:null});
    if (url.includes('/playlists/PL1/items') && init.method==='GET') return ok({items:[],next:null});
    if (url.includes('/me/playlists') && init.method==='POST') return ok({id:'PL2',external_urls:{spotify:'http://new'}});
    return ok({});
  };
}
// default reuses an existing playlist
{
  const c=new SpotifyClient(async()=>'t');
  global.fetch=mock(true);
  const r=await c.addTracksToPlaylistDeduped('Mine','d',['a']);
  check('default reuses a playlist of the same name', r.reused===true && r.url==='http://old');
}
// forceNew creates a fresh one instead
{
  const c=new SpotifyClient(async()=>'t');
  global.fetch=mock(true);
  const r=await c.addTracksToPlaylistDeduped('Mine','d',['a'],{forceNew:true});
  check('forceNew creates a new playlist', r.reused===false && r.url==='http://new');
}
// no existing playlist behaves the same either way
{
  const c=new SpotifyClient(async()=>'t');
  global.fetch=mock(false);
  const r=await c.addTracksToPlaylistDeduped('Mine','d',['a']);
  check('creates when none exists', r.reused===false);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
