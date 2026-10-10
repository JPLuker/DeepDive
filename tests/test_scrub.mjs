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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
