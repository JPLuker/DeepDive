import { readFileSync } from 'fs';
import { runFullScrub } from '../docs/js/search.js';

const src = readFileSync(new URL('../docs/js/app.js', import.meta.url), 'utf8');
const searchSrc = readFileSync(new URL('../docs/js/search.js', import.meta.url), 'utf8');
let pass = 0, fail = 0;
function check(label, condition) {
  if (condition) pass++;
  else { fail++; console.log('FAIL:', label); }
}

const track = (id, name, isrc, album) => ({
  id, name, duration_ms: 180000,
  artists: [{ id: 'artist-1', name: 'Artist' }],
  album: { id: album, name: album, album_type: 'album', release_date: '2026-01-01' },
  external_ids: { isrc },
});

const liked = [track('same-a', 'Same Song', 'USAAA2600001', 'Original album')];
const catalogue = [
  track('same-b', 'Same Song', 'USAAA2600001', 'Compilation'),
  track('remaster', 'Same Song - 2026 Remaster', 'USAAA2600002', 'Remaster'),
  track('other', 'Other Song', 'USAAA2600003', 'Other album'),
];
let reads = 0, catalogReads = 0;
const cache = { async getLikedTracks() { reads++; return liked; } };
const client = {
  setMinimumPacing() {},
  async getArtistCatalogTracks() { catalogReads++; return catalogue; },
  async getTracksWithIsrc(ids) { return catalogue.filter((t) => ids.includes(t.id)); },
};
const result = await runFullScrub(client, { libraryCache: cache });

check('scrub reads Liked Songs once', reads === 1);
check('scrub reads each liked artist catalogue', catalogReads === 1 && /getArtistCatalogTracks/.test(searchSrc.slice(searchSrc.indexOf('export async function runFullScrub'))));
check('scrub finds alternate copies of liked recordings', result.duplicate_candidates.length === 1);
check('scrub reports the duplicate copy and kept match', result.duplicate_candidates[0].track.id !== result.duplicate_candidates[0].matched_liked_track.id);
check('different-ISRC remaster stays distinct', !result.duplicate_candidates.some((d) => d.track.id === 'remaster'));
check('scrub returns no new-track pool', result.new_tracks.length === 0 && result.tracks_scanned === 1);

let failure = null;
try {
  await runFullScrub({
    setMinimumPacing() {},
    async getArtistCatalogTracks() { throw new Error('Spotify refused the request'); },
  }, { libraryCache: cache });
} catch (e) { failure = e; }
check('failed artist cannot be counted as scanned', failure?.message.includes('Duplicate scan stopped while checking Artist'));

const view = src.slice(src.indexOf('function renderScrubForm()'), src.indexOf('// Watchlist page'));
check('scrub UI says duplicate scan', /Find duplicate songs/.test(view) && /Find duplicate copies/.test(view));
check('scrub UI has no playlist path', !/Build playlist|scrub-build|playlist-name|addTracksToPlaylistDeduped/.test(view));
check('selected copies are liked and cache is cleared', /client\.likeTracks\(ids\)/.test(view) && /libraryCache\.clear\(\)/.test(view));

// A long scan must resume after Spotify refuses a later request. Complete
// artist catalogues are not read again, and discoveries already made are
// carried into the resumed result.
const likedTwo = [
  track('liked-1', 'One', 'USAAA2600011', 'One album'),
  { ...track('liked-2', 'Two', 'USAAA2600012', 'Two album'), artists: [{ id: 'artist-2', name: 'Artist Two' }] },
];
let stopAfterFirst = false;
let saved = null;
const resumeReads = [];
const resumeClient = {
  setMinimumPacing() {},
  async getArtistCatalogTracks(id) {
    resumeReads.push(id);
    return id === 'artist-1'
      ? [track('copy-1', 'One', 'USAAA2600011', 'Copy album')]
      : [{ ...track('copy-2', 'Two', 'USAAA2600012', 'Copy two'), artists: [{ id: 'artist-2', name: 'Artist Two' }] }];
  },
  async getTracksWithIsrc(ids) {
    return ids.map((id) => id === 'copy-1'
      ? track(id, 'One', 'USAAA2600011', 'Copy album')
      : { ...track(id, 'Two', 'USAAA2600012', 'Copy two'), artists: [{ id: 'artist-2', name: 'Artist Two' }] });
  },
};
await runFullScrub(resumeClient, {
  libraryCache: { async getLikedTracks() { return likedTwo; } },
  isCancelled: () => stopAfterFirst,
  onCheckpoint: async (state) => { saved = state; stopAfterFirst = true; },
});
check('partial scan saves a resumable checkpoint', saved?.completed_artist_ids?.[0] === 'artist-1');
resumeReads.length = 0;
const resumed = await runFullScrub(resumeClient, {
  libraryCache: { async getLikedTracks() { return likedTwo; } },
  resume: saved,
});
check('resume skips artists already completed', resumeReads.length === 1 && resumeReads[0] === 'artist-2');
check('resume keeps earlier discoveries', resumed.duplicate_candidates.some((d) => d.track.id === 'copy-1'));
check('scrub UI exposes saved progress', /Resume duplicate scan/.test(view) && /SCRUB_CHECKPOINT_KEY/.test(view));

// --- Issue #11: a pause must not end the scan (2.9.107) ---
//
// A whole-library scan is thousands of requests against a Dev Mode
// quota, so penalties are routine. Until now the first one ended the
// run and someone had to come back and restart it by hand.
{
  const limited = (secs) => {
    const e = new Error('Rate limited');
    e.status = 429; e.sustained = true; e.retryAfterSeconds = secs;
    return e;
  };
  const twoArtists = [
    track('liked-1', 'One', 'USAAA2600011', 'A'),
    { ...track('liked-2', 'Two', 'USAAA2600012', 'B'), artists: [{ id: 'artist-2', name: 'Other' }] },
  ];
  let attempts = [], refusals = 2;
  const pausingClient = {
    setMinimumPacing() {},
    async getArtistCatalogTracks(id) {
      attempts.push(id);
      // Refuse the first artist twice, then let everything through.
      if (id === 'artist-1' && refusals-- > 0) throw limited(0.02);
      return [];
    },
    async getTracksWithIsrc() { return []; },
  };
  const stages = [];
  const started = Date.now();
  // Caught, because the behaviour before this was to throw: letting that
  // escape would end the suite here and hide every check below it.
  let result = { artists_scanned: -1, artists_total: -1 };
  try {
    result = await runFullScrub(pausingClient, {
      libraryCache: { async getLikedTracks() { return twoArtists; } },
      onProgress: (pct, stage) => stages.push(stage),
    });
  } catch (e) {
    console.log('FAIL: the scan threw instead of waiting:', e?.message || e);
    fail++;
  }
  check('a rate limit does not end the scan', result.artists_scanned === 2 && result.artists_total === 2);
  check('the refused artist is retried, not skipped', attempts.filter((id) => id === 'artist-1').length === 3);
  check('and the rest of the library still gets checked', attempts.includes('artist-2'));
  check('the wait is reported, not silent', stages.some((s) => /Spotify has paused us\. Waiting/.test(s)));
  check('it says it will carry on', stages.some((s) => /carrying on where it stopped/.test(s)));
  check('waiting actually waits', Date.now() - started >= 40);

  // Cancel has to answer during a wait, or the only way out of a
  // multi-hour pause is closing the tab.
  attempts = []; refusals = 50;
  let cancelled = false;
  setTimeout(() => { cancelled = true; }, 30);
  let stopped = { artists_scanned: -1 };
  try {
    stopped = await runFullScrub(pausingClient, {
      libraryCache: { async getLikedTracks() { return twoArtists; } },
      isCancelled: () => cancelled,
    });
  } catch (e) {
    console.log('FAIL: cancel during a pause threw:', e?.message || e);
    fail++;
  }
  check('cancel is answered while paused', cancelled && stopped.artists_scanned === 0);

  // Something failing forever is not a quota problem, and must not spin.
  attempts = []; refusals = Infinity;
  let gaveUp = null;
  try {
    await runFullScrub(pausingClient, { libraryCache: { async getLikedTracks() { return twoArtists; } } });
  } catch (e) { gaveUp = e; }
  check('an endless refusal still reports', /Duplicate scan stopped while checking/.test(gaveUp?.message || ''));
  check('after a bounded number of tries', attempts.filter((id) => id === 'artist-1').length === 21);
}

// A non-rate-limit error is still a failure: a 403 will never clear by
// waiting, and pretending otherwise would hide it behind a countdown.
{
  const client403 = {
    setMinimumPacing() {},
    async getArtistCatalogTracks() { const e = new Error('Forbidden'); e.status = 403; throw e; },
    async getTracksWithIsrc() { return []; },
  };
  let err = null;
  try {
    await runFullScrub(client403, { libraryCache: { async getLikedTracks() { return liked; } } });
  } catch (e) { err = e; }
  check('a 403 fails immediately', /Forbidden/.test(err?.message || ''));
}

// --- A spent quota is not a burst limit (2.9.108) ---
//
// spotify.js throws QUOTA_EXCEEDED immediately on purpose: retrying
// cannot refill a quota and each attempt spends more of what is gone.
// 2.9.107 caught that and retried it twenty times an artist.
{
  const quota = () => { const e = new Error('Quota'); e.status = 429; e.quotaExhausted = true; return e; };
  let calls = 0;
  const spent = {
    setMinimumPacing() {},
    async getArtistCatalogTracks() { calls++; throw quota(); },
    async getTracksWithIsrc() { return []; },
  };
  let err = null;
  const started = Date.now();
  // Bounded, because the behaviour this replaces retried twenty times a
  // minute apart. Left unbounded the suite hangs and the runner scores
  // it as absent rather than failed, which reads as green.
  const tooSlow = Symbol('timeout');
  try {
    const outcome = await Promise.race([
      runFullScrub(spent, { libraryCache: { async getLikedTracks() { return liked; } } }),
      new Promise((resolve) => setTimeout(() => resolve(tooSlow), 3000)),
    ]);
    if (outcome === tooSlow) { console.log('FAIL: a spent quota was retried instead of stopping'); fail++; }
  } catch (e) { err = e; }
  check('a spent quota stops instead of retrying', calls === 1);
  check('and does not sit waiting first', Date.now() - started < 1000);
  check('the failure names the artist', /Duplicate scan stopped while checking/.test(err?.message || ''));
  // explainError reads these off the top-level error, so the wrapper
  // has to carry them or the user gets the generic failure page.
  check('the quota tag survives the wrapper', err?.quotaExhausted === true);
  check('with the status alongside it', err?.status === 429);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
