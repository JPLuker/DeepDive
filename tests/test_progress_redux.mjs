// #19: Android background progress — "not accurate", "didn't show a
// notification at all", "shows 2 tasks when syncing songs".
//
// Three causes, each with a check that fails on 2.9.144:
//   1. The dive's catalogue stage set the bar, then immediately reset it
//      to the stage's start with a second call carrying the count. The
//      bar sat at 25% for the whole read and jumped at the end, in the
//      app and in the notification alike.
//   2. The Liked Songs sync inside a dive or scan took its own native
//      job, so the notification said "2 jobs" and its collapsed bar
//      flipped between the two percentages.
//   3. Android 12+ holds foreground-service notifications back for ten
//      seconds, so a short job such as a dip never showed one.
import { readFileSync } from 'node:fs';
import { runSearch } from '../docs/js/search.js';
import { beginBackgroundWork } from '../docs/js/background-work.js';
import { LibraryCache } from '../docs/js/library-cache.js';

let pass = 0, fail = 0;
const check = (label, ok) => { if (ok) pass++; else { fail++; console.log('FAIL:', label); } };

// --- 1. the dive's bar moves through the catalogue -----------------------
{
  const releases = 8;
  const seen = [];
  const client = {
    async getAllLikedTracks(cb) { cb(1, 1); return []; },
    async getArtistCatalogTracks(id, { onProgress }) {
      for (let i = 1; i <= releases; i++) onProgress(i, releases);
      return [];
    },
    async getTracksWithIsrc() { return []; },
  };
  await runSearch(client, 'Someone', {
    resolvedArtist: { id: 'a1', name: 'Someone', images: [] },
    onProgress: (pct, stage) => seen.push({ pct, stage }),
  });
  const reading = seen.filter((s) => /releases… \(\d+\/\d+\)/.test(s.stage));
  check('every catalogue tick carries its count', reading.length === releases);
  check('the bar rises during the catalogue read', reading.length > 1 && reading.at(-1).pct > reading[0].pct);
  check('halfway through the releases is past the stage start',
    reading.find((s) => s.stage.includes(`(${releases / 2}/${releases})`))?.pct >= 25 + 25 - 1);
  let monotonic = true;
  for (let i = 1; i < seen.length; i++) if (seen[i].pct < seen[i - 1].pct) monotonic = false;
  check(`the dive never goes backwards (${seen.map((s) => s.pct).join(',')})`, monotonic);
}

// --- 2. one notification job per screen ---------------------------------
{
  const listeners = new Map();
  globalThis.window = { addEventListener: (name, fn) => listeners.set(name, fn) };
  const commands = [];
  window.DeepDiveBackground = { postMessage(json) {
    const call = JSON.parse(json);
    commands.push(call);
    if (call.op === 'delay') return;
    queueMicrotask(() => listeners.get('deepdive-background-response')({ detail: { id: call.id, result: true } }));
  } };
  const data = new Map();
  const cache = new LibraryCache({ get: async () => ({ items: [], total: 0 }) },
    { get: async (k) => data.get(k), set: async (k, v) => data.set(k, v) });

  const dive = await beginBackgroundWork('Diving into Someone…');
  const before = commands.length;
  await cache.getLikedTracks();
  const during = commands.slice(before);
  check('a Liked Songs sync inside a dive adds no second job', !during.some((c) => c.op === 'begin'));
  check('and posts no competing progress', !during.some((c) => c.op === 'progress'));
  check('and does not end the dive\'s job', !during.some((c) => c.op === 'end'));
  await dive.release();

  const alone = commands.length;
  await cache.getLikedTracks({ forceFull: true });
  const own = commands.slice(alone);
  check('with nothing running, a library read still owns a job', own[0]?.op === 'begin' && own.at(-1)?.op === 'end');
}

// --- 3. native notification -----------------------------------------------
{
  const kt = readFileSync(new URL('../src-tauri/android/MainActivity.kt', import.meta.url), 'utf8');
  check('foreground notification is shown immediately on Android 12+',
    /SDK_INT >= 31\) setForegroundServiceBehavior\(Notification\.FOREGROUND_SERVICE_IMMEDIATE\)/.test(kt));
  const progressFn = kt.slice(kt.indexOf('fun progress('), kt.indexOf('fun finish('));
  check('a progress update does not change which job leads', progressFn.length > 0 && !/order\s*=/.test(progressFn));
  check('the newest job leads the notification', /order = \+\+progressOrder\)/.test(kt) && /maxByOrNull \{ it\.order \}/.test(kt));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
