import { SpotifyClient } from '../docs/js/spotify.js';
let pass=0,fail=0; function check(l,c){if(c)pass++;else{fail++;console.log('FAIL:',l);}}
const ok = (body={}) => ({status:200,headers:{get:()=>null},json:async()=>body,text:async()=>JSON.stringify(body)});
const rl = (retryAfter='0') => ({status:429,headers:{get:(k)=>k==='Retry-After'?retryAfter:null},json:async()=>({error:{message:'rate'}}),text:async()=>'{}'});

// 1) No 429s -> no throttling, stays fast
{
  const c=new SpotifyClient(async()=>'t');
  global.fetch=async()=>ok({ok:1});
  const t0=Date.now();
  for(let i=0;i<8;i++) await c.get('me');
  const elapsed=Date.now()-t0;
  check('no 429 => no pacing added (8 calls fast)', elapsed<300);
  check('throttle stays at 0', c._throttleMs===0);
}

// 2) A 429 causes a permanent back-off for the rest of the run
{
  const c=new SpotifyClient(async()=>'t');
  let n=0;
  global.fetch=async()=>{ n++; return n===1 ? rl('0') : ok({ok:1}); };
  await c.get('me');
  check('recovered after 429', n===2);
  check('throttle engaged after 429', c._throttleMs>0);
  const engaged=c._throttleMs;
  // subsequent calls should now be paced
  const t0=Date.now(); await c.get('me'); const gap=Date.now()-t0;
  check('subsequent request is paced', gap>=engaged-50);
}

// 3) Repeated 429s escalate but stay capped
{
  const c=new SpotifyClient(async()=>'t');
  let n=0;
  global.fetch=async()=>{ n++; return n<=5 ? rl('0') : ok({ok:1}); };
  await c.get('me');
  check('escalates with repeated 429s', c._throttleMs>220);
  check('capped at max', c._throttleMs<=1200);
}

// 4) onRateLimit fires so the UI can report waiting
{
  const c=new SpotifyClient(async()=>'t');
  let notified=null;
  c.onRateLimit=(ms)=>{notified=ms;};
  let n=0;
  global.fetch=async()=>{ n++; return n===1 ? rl('0') : ok({ok:1}); };
  await c.get('me');
  check('onRateLimit callback fired', notified!==null);
}

// 5) Gives up eventually rather than looping forever
{
  const c=new SpotifyClient(async()=>'t');
  global.fetch=async()=>rl('0');
  let threw=null;
  try { await c.get('me'); } catch(e){ threw=e; }
  check('eventually throws after exhausting retries', threw && threw.status===429);
}

// 6) A throwing onRateLimit callback can't break the retry
{
  const c=new SpotifyClient(async()=>'t');
  c.onRateLimit=()=>{ throw new Error('ui blew up'); };
  let n=0;
  global.fetch=async()=>{ n++; return n===1 ? rl('0') : ok({ok:1}); };
  const r=await c.get('me');
  check('bad UI callback does not break retry', r.ok===1);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
