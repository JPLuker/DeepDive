import { beginBackgroundWork, withBackgroundWork, backgroundDelay, supportsBackgroundWork, checkBackgroundWork } from '../docs/js/background-work.js';
import { LibraryCache } from '../docs/js/library-cache.js';
import { patchManifest } from '../tools/android-manifest.mjs';
import { readFileSync } from 'node:fs';
let pass = 0, fail = 0;
const check = (label, ok) => { if (ok) pass++; else { fail++; console.log('FAIL:', label); } };
globalThis.window = {};
check('browser reports no native background execution', !supportsBackgroundWork());
const web = await beginBackgroundWork('browser');
check('browser has no active service', !web.active);
await web.release();
check('browser jobs still return their result', await withBackgroundWork('web', async () => 7) === 7);
await backgroundDelay(0);
const listeners = new Map();
window.addEventListener = (name, fn) => listeners.set(name, fn);
const commands = [];
let beginsFail = false, holdBegin = false, delayedBegin;
function answer(call, error = null) {
  listeners.get('deepdive-background-response')({ detail: { id: call.id, result: true, error } });
}
window.DeepDiveBackground = { postMessage(json) {
  const call = JSON.parse(json);
  commands.push(call);
  if (call.op === 'begin' && holdBegin) { delayedBegin = call; return; }
  if (call.op === 'delay') return; // native clock is manually advanced below
  queueMicrotask(() => answer(call, beginsFail && call.op === 'begin' ? 'service denied' : null));
} };
check('Android bridge detected', supportsBackgroundWork());
const a = await beginBackgroundWork('dive');
const b = await beginBackgroundWork('library');
check('overlapping work gets separate native tokens', a.active && b.active && commands[0].token !== commands[1].token);
let finished = false;
const delay = backgroundDelay(60000).then(() => { finished = true; });
const timer = commands.at(-1);
check('request pacing uses the native clock while jobs run', timer.op === 'delay' && timer.ms === 60000 && !finished);
answer(timer); await delay;
check('native completion releases the timer', finished);
await a.release(); await a.release();
check('releasing a job is idempotent', commands.filter(c => c.op === 'end').length === 1);
const delay2 = backgroundDelay(0); answer(commands.at(-1)); await delay2;
check('ending one job keeps the other on native timers', commands.at(-1).op === 'delay');
await b.release();
const count = commands.length; await backgroundDelay(0);
check('idle app does not request native timers', commands.length === count);
let threw = false;
try { await withBackgroundWork('failure', async () => { throw new Error('network failure'); }); } catch { threw = true; }
check('network failure propagates and still releases its job', threw && commands.at(-1).op === 'end');
beginsFail = true;
const oldWarn = console.warn; console.warn = () => {};
check('denied service still permits foreground work', await withBackgroundWork('denied', async () => 8) === 8);
console.warn = oldWarn; beginsFail = false;
holdBegin = true;
const late = beginBackgroundWork('cancelled during startup');
const cancel = late.then(lease => lease.release());
answer(delayedBegin); await cancel; holdBegin = false;
check('cancellation during startup releases the exact late token', commands.at(-1).op === 'end' && commands.at(-1).token === delayedBegin.token);
// Exercise real library integration, including cleanup when paging fails.
const data = new Map();
const cache = new LibraryCache({ get: async () => ({ items: [], total: 0 }) }, { get: async k => data.get(k), set: async (k,v) => data.set(k,v) });
const before = commands.length; await cache.getLikedTracks();
check('library read owns a service lease without the full-screen UI', commands[before]?.op === 'begin' && commands.at(-1).op === 'end');
cache.client.get = async () => { throw new Error('offline'); };
try { await cache.getLikedTracks({ forceFull: true }); } catch {}
check('failed library read releases the service', commands.at(-1).op === 'end');
const timed = await beginBackgroundWork('timeout');
const waiting = backgroundDelay(10000); // catch before emitting the stop
const rejection = waiting.catch(() => true);
listeners.get('deepdive-background-stopped')();
check('Android timeout rejects pending native timers', await rejection === true);
threw = false; try { checkBackgroundWork(); } catch { threw = true; }
check('Android timeout blocks further Spotify requests for the run', threw);
await timed.release();
const retry = await beginBackgroundWork('retry');
checkBackgroundWork(); await retry.release();
check('a new explicit run can retry after timeout', commands.at(-1).op === 'end');
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const manifest = '<manifest><application><activity><intent-filter><category android:name="android.intent.category.LAUNCHER" /></intent-filter></activity></application></manifest>';
const patched = patchManifest(manifest).xml;
for (const name of ['FOREGROUND_SERVICE', 'FOREGROUND_SERVICE_DATA_SYNC', 'WAKE_LOCK', 'POST_NOTIFICATIONS'])
  check('declares Android permission ' + name, patched.includes('android.permission.' + name + '"'));
check('service is private and typed for data sync', /<service[^>]*android:exported="false"[^>]*android:foregroundServiceType="dataSync"/.test(patched));
check('manifest patch remains idempotent', patchManifest(patched).xml === patched);
const activity = read('src-tauri/android/MainActivity.kt');
check('activity compensates for Wry pausing the WebView during active work', /override fun onPause\(\)[\s\S]*?super.onPause\(\)[\s\S]*?workWebView\?\.onResume\(\)/.test(activity));
check('CPU wake lock is bounded and released', /PARTIAL_WAKE_LOCK/.test(activity) && /acquire\(MAX_RUN_MS\)/.test(activity) && /wakeLock\?\.release\(\)/.test(activity));
check('Android FGS timeout stops the worker', /override fun onTimeout[^\n]*expire\(\)/.test(activity));
check('service cannot restart an empty WebView after process death', /return START_NOT_STICKY/.test(activity));
check('native bridge restricts messages to the bundled page', /if \(!bundledPage\(\)\) return@post/.test(activity));
const app = read('docs/js/app.js');
check('progress screen releases its service on close', /background\.then\(lease => lease.release\(\)\)/.test(app));
check('backup picker cannot consume row width', /id="set-import-file"[^>]*class="hidden"/.test(app));
check('backup buttons are below the description', /title: "Backup",\s*block: true/.test(app));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
