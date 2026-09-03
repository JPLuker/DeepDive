import { bestStore, makeMemoryStore } from '../docs/js/storage.js';
let pass=0,fail=0; function check(l,c){if(c)pass++;else{fail++;console.log('FAIL:',l);}}

// THE REPORTED CASE: indexedDB.open() that never settles (Brave-style block)
{
  globalThis.indexedDB = { open(){ return { onupgradeneeded:null, onsuccess:null, onerror:null, onblocked:null }; } };
  const store = bestStore();
  const t0 = Date.now();
  const v = await store.get('anything');
  const elapsed = Date.now()-t0;
  check('hanging IndexedDB does not hang the caller', elapsed < 7000);
  check('returns rather than never resolving', v === null || v === undefined);
}
// open() that throws outright
{
  globalThis.indexedDB = { open(){ throw new Error('blocked'); } };
  const store = bestStore();
  const v = await store.get('x');
  check('throwing IndexedDB falls back cleanly', v === null || v === undefined);
  await store.set('x', {a:1});
  check('set still works via memory fallback', (await store.get('x')) !== undefined);
}
// no indexedDB at all
{
  globalThis.indexedDB = undefined;
  const store = bestStore();
  await store.set('k', {v:2});
  const got = await store.get('k');
  check('absent IndexedDB uses memory', got && got.v===2);
}
// memory store basics
{
  const m = makeMemoryStore();
  await m.set('a', 1);
  check('memory get/set', (await m.get('a'))===1);
  await m.set('a', null);
  check('memory null clears', (await m.get('a'))===null);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
