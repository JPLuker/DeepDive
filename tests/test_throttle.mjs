import { SpotifyClient } from '../docs/js/spotify.js';
import { readFileSync } from 'fs';
const sp = readFileSync(new URL('../docs/js/spotify.js', import.meta.url),'utf8');
const app = readFileSync(new URL('../docs/js/app.js', import.meta.url),'utf8');
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

// The throttle persisting was right; persisting forever was not.
// setMinimumPacing only ever raises, so one wide dive or one bad
// afternoon of 429s permanently slowed every later dive — and
// resetPacing(), written for exactly this, was never called from
// anywhere.
check('learned pacing decays', /THROTTLE_DECAY_MS/.test(sp));
check('decay is time-stamped', /deepdive_throttle_at/.test(sp));
check('stale pacing is cleared on load', /localStorage\.removeItem\("deepdive_throttle_ms"\);\s*\n\s*localStorage\.removeItem\("deepdive_throttle_at"\);/.test(sp));
check('there is a manual way back', /set-reset-pacing/.test(app) && /client\.resetPacing\(\)/.test(app));


// Pace before being punished, not after. The catalogue read is one
// request per release; firing them flat out and waiting for a 429 means
// taking the penalty first and being slow afterwards. It only looked
// fine while a stale throttle from an earlier run was slowing things
// down by accident.
import { pacingForReleaseCount } from '../docs/js/spotify.js';
check('small catalogues stay fast', pacingForReleaseCount(12) === 0 && pacingForReleaseCount(40) === 0);
check('medium catalogues pace', pacingForReleaseCount(80) === 250);
check('wide reads pace hardest', pacingForReleaseCount(400) === 350);
check('pacing is set before the loop, from the release count', /setRunPacing\(pacingForReleaseCount\(albumRefs\.length\)\)/.test(sp));

// One field was doing two jobs, so a wide dive left every later dive in
// the session paced for no reason.
check('run pacing can go down', /setRunPacing\(ms\) \{[\s\S]*?this\._runMs = Math\.max\(0/.test(sp));
check('learned floor still wins', /_pacingMs\(\) \{\s*\n\s*return Math\.max\(this\._throttleMs \|\| 0, this\._runMs \|\| 0\);/.test(sp));
check('run pacing is not persisted', !/setRunPacing[\s\S]{0,200}localStorage/.test(sp));

// The throttle started at zero and only rose after a 429, so every
// fresh session sprinted into the limit and took a 15s penalty before
// slowing down. That was hidden for months because a learned value
// persisted across sessions and quietly protected later dives; adding
// decay in 2.9.0 removed the protection and the sprint came back.
// Pace from the first request instead.
const se = readFileSync(new URL('../docs/js/search.js', import.meta.url),'utf8');
check('baseline pacing exists', /export const CATALOG_PACING_MS = 250;/.test(sp));
check('wide reads pace harder', /export const WIDE_CATALOG_PACING_MS = 350;/.test(sp));
check('standard dives are paced too', !/if \(includeAppearsOn && typeof client\.setMinimumPacing/.test(se));
check('both entry points pace', (se.match(/client\.setMinimumPacing\(includeAppearsOn \?/g) || []).length === 2);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
