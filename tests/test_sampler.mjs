// The sampler's duplicate: a censored cut of a song already in the mix
// (Joseph's notes, 4 Sept; fixed 2.9.88).
//
// The sampler assembles one artist at a time and deduped across artists
// by track id. A collaboration comes back for both parties, and the two
// copies can be different cuts with different ids and different ISRCs,
// so both went in.
import { readFileSync } from 'fs';
import { mixDedupeKey, isRadioEditOrCensored } from '../docs/js/matching.js';
const src = readFileSync(new URL('../docs/js/app.js', import.meta.url), 'utf8');
let pass = 0, fail = 0;
function check(l, c) { if (c) pass++; else { fail++; console.log('FAIL:', l); } }

const a = { id: 'a1', name: 'Artist A' }, b = { id: 'b2', name: 'Artist B' };
const clean = { id: 't1', name: 'Song (Radio Edit)', artists: [a, b], external_ids: { isrc: 'X1' } };
const explicit = { id: 't2', name: 'Song', artists: [b, a], external_ids: { isrc: 'X2' } };
const other = { id: 't3', name: 'Other Song', artists: [a] };
const sameTitleOtherAct = { id: 't4', name: 'Song', artists: [{ id: 'zz', name: 'Someone Else' }] };

// The key itself.
check('the two cuts share a key', mixDedupeKey(clean) === mixDedupeKey(explicit));
check('ISRC could not have done this', clean.external_ids.isrc !== explicit.external_ids.isrc);
check('artist order does not matter', mixDedupeKey(explicit) === mixDedupeKey({ ...explicit, artists: [a, b] }));
check('different songs keep different keys', mixDedupeKey(clean) !== mixDedupeKey(other));
check('the same title by another act is not a duplicate', mixDedupeKey(explicit) !== mixDedupeKey(sameTitleOtherAct));
check('a cover with no artist ids is not folded into everything', mixDedupeKey({ id: 'x', name: 'Song', artists: [] }) !== mixDedupeKey(sameTitleOtherAct));

// The guard as it is written in buildSampler, run against stubs.
{
  const i = src.indexOf('      for (const t of forArtist) {');
  const j = src.indexOf('\n      }', src.indexOf('if (matching.isRadioEditOrCensored(out[at])', i)) + 8;
  check('the guard was found in buildSampler', i > -1 && j > i);
  const body = src.slice(i, j);
  const run = (batches) => {
    const out = [], seenTrackIds = new Set(), seenRecordings = new Map();
    const matching = { mixDedupeKey, isRadioEditOrCensored };
    const f = new Function('forArtist', 'out', 'seenTrackIds', 'seenRecordings', 'matching', body);
    for (const batch of batches) f(batch, out, seenTrackIds, seenRecordings, matching);
    return out;
  };
  check('the censored cut does not follow the explicit one in', run([[explicit], [clean]]).length === 1);
  check('and the explicit one replaces the censored one, whichever came first',
    run([[clean], [explicit]]).map((t) => t.id).join() === 't2');
  check('the surviving track keeps its place in the running order',
    run([[other], [clean], [{ id: 't5', name: 'Third', artists: [b] }], [explicit]]).map((t) => t.id).join() === 't3,t2,t5');
  check('the same id twice is still only one track', run([[clean], [clean]]).length === 1);
  check('genuinely different tracks all survive', run([[clean, other], [{ id: 't6', name: 'Fourth', artists: [b] }]]).length === 3);
  check('a track by another act with the same title survives', run([[explicit], [sameTitleOtherAct]]).length === 2);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
