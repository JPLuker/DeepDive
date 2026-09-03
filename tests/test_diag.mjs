import { SpotifyClient, SpotifyApiError } from '/home/claude/dd/js/spotify.js';
const store=new Map();
globalThis.localStorage={getItem:(k)=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v)),removeItem:(k)=>store.delete(k)};
let pass=0,fail=0; function check(l,c){if(c)pass++;else{fail++;console.log('FAIL:',l);}}
const ok=(b={})=>({status:200,headers:{get:()=>null},json:async()=>b,text:async()=>JSON.stringify(b)});
const rl=(ra)=>({status:429,headers:{get:(k)=>k==='Retry-After'?ra:null},json:async()=>({error:{message:'Too many requests'}}),text:async()=>'{}'});

// === THE REAL CASE: Retry-After 23456 (6.5 hours) ===
{
  store.clear();
  const c=new SpotifyClient(async()=>'t');
  let calls=0;
  global.fetch=async()=>{calls++; return rl('23456');};
  const t0=Date.now();
  let err=null;
  try { await c.get('artists/abc/albums'); } catch(e){ err=e; }
  const elapsed=Date.now()-t0;
  check('gives up immediately, does not retry for 2 minutes', elapsed<2000);
  check('only one request made', calls===1);
  check('flagged as sustained', err.sustained===true);
  check('retryAfterSeconds carried through', err.retryAfterSeconds===23456);
}
// === a SHORT Retry-After should still be retried normally ===
{
  store.clear();
  const c=new SpotifyClient(async()=>'t');
  let n=0;
  global.fetch=async()=>{ n++; return n===1 ? rl('1') : ok({ok:1}); };
  const r=await c.get('me');
  check('short Retry-After still retried', r.ok===1 && n===2);
}
// === request logging ===
{
  store.clear();
  const c=new SpotifyClient(async()=>'t');
  global.fetch=async()=>ok({ok:1});
  await c.get('me');
  await c.get('me/tracks',{limit:50});
  await c.get('artists/2VYQTNDsvvKN9wmU5W7xpj/albums');
  await c.get('artists/2VYQTNDsvvKN9wmU5W7xpj/albums');
  check('total counted', c.log.total===4);
  check('ids collapsed to {id}', Object.keys(c.log.counts).some(k=>k.includes('{id}')));
  check('repeat endpoint counted twice', Object.values(c.log.counts).includes(2));
}
// === failure recorded for the diagnostics view ===
{
  store.clear();
  const c=new SpotifyClient(async()=>'t');
  global.fetch=async()=>rl('23456');
  try { await c.get('artists/abc/albums'); } catch(e){}
  check('lastError captured status', c.log.lastError.status===429);
  check('lastError captured Retry-After', c.log.lastError.retryAfter==='23456');
  check('lastError captured message', /Too many requests/.test(c.log.lastError.message));
}
// === explainError mapping (mirrored) ===
{
  function explain(status, ra){
    if(status===429 && !Number.isNaN(ra) && ra>0) return 'paused-with-time';
    if(status===429) return 'ratelimited';
    if(status===401||status===403) return 'auth';
    if(status===0) return 'network';
    return 'generic';
  }
  check('429 + Retry-After => paused with a time', explain(429,23456)==='paused-with-time');
  check('429 without header => generic rate limit', explain(429,NaN)==='ratelimited');
  check('403 => auth guidance', explain(403,NaN)==='auth');
  check('0 => network', explain(0,NaN)==='network');
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
