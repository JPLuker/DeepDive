// Session 2, stopping point B — catalogue accuracy.
//
// Two defects, both about which tracks belong to an artist:
//   1. Compilations and "appeared on" were a single toggle. A greatest-
//      hits record is the artist's own work; a various-artists comp they
//      guest on once is somebody else's. Bundling them meant nobody
//      could take the cheap half without the expensive one.
//   2. "Appeared on" pulled entire albums. One guest verse dragged in
//      the whole tracklist — wrong, and the main reason the option is so
//      request-heavy.
import { buildIncludeGroups } from '../docs/js/search.js';
import { isCreditedTo, SpotifyClient } from '../docs/js/spotify.js';

let pass = 0, fail = 0;
function check(l, c) { if (c) pass++; else { fail++; console.log('FAIL:', l); } }

// --- include groups -------------------------------------------------
check('default is the artist\'s own albums and singles',
  buildIncludeGroups(false, false) === 'album,single');
check('compilations can be taken alone',
  buildIncludeGroups(true, false) === 'album,single,compilation');
check('guest spots can be taken alone',
  buildIncludeGroups(false, true) === 'album,single,appears_on');
check('both together',
  buildIncludeGroups(true, true) === 'album,single,compilation,appears_on');

// --- credit check ---------------------------------------------------
const AID = 'artist-1';
check('credited track is kept',
  isCreditedTo({ artists: [{ id: AID }] }, AID));
check('featured credit counts',
  isCreditedTo({ artists: [{ id: 'other' }, { id: AID }] }, AID));
check('uncredited track is dropped',
  !isCreditedTo({ artists: [{ id: 'other' }] }, AID));
// A missing credit list must not silently delete a real track.
check('missing artists array keeps the track', isCreditedTo({}, AID));
check('empty artists array keeps the track', isCreditedTo({ artists: [] }, AID));

// --- catalogue read -------------------------------------------------
// A fake transport: getArtistCatalogTracks only ever goes through
// `get`, so overriding it exercises the real gathering logic.
function fakeClient() {
  const c = Object.create(SpotifyClient.prototype);
  c.get = async (path, params) => {
    if (path === `artists/${AID}/albums`) {
      c.lastGroups = params.include_groups;
      return {
        total: 2,
        items: [
          { id: 'own-1', album_group: 'album' },
          { id: 'guest-1', album_group: 'appears_on' },
        ],
        next: null,
      };
    }
    if (path === 'albums/own-1') {
      return {
        id: 'own-1', name: 'Their Record', release_date: '2020-01-01', album_type: 'album',
        tracks: { items: [
          { id: 't1', name: 'Theirs A', artists: [{ id: AID }] },
          { id: 't2', name: 'Theirs B', artists: [{ id: AID }] },
        ], next: null },
      };
    }
    if (path === 'albums/guest-1') {
      return {
        id: 'guest-1', name: "Someone Else's Record", release_date: '2021-01-01', album_type: 'album',
        tracks: { items: [
          { id: 'g1', name: 'Not Theirs', artists: [{ id: 'other' }] },
          { id: 'g2', name: 'Their Guest Verse', artists: [{ id: 'other' }, { id: AID }] },
          { id: 'g3', name: 'Also Not Theirs', artists: [{ id: 'other' }] },
        ], next: null },
      };
    }
    throw new Error('unexpected path ' + path);
  };
  return c;
}

const client = fakeClient();
const tracks = await client.getArtistCatalogTracks(AID, {
  includeGroups: buildIncludeGroups(false, true),
});
const names = tracks.map((t) => t.name);

check('own album keeps every track',
  names.includes('Theirs A') && names.includes('Theirs B'));
check('guest album keeps the credited track', names.includes('Their Guest Verse'));
check('guest album drops uncredited tracks',
  !names.includes('Not Theirs') && !names.includes('Also Not Theirs'));
check('four tracks became three', tracks.length === 3);
check('album group is carried through',
  tracks.find((t) => t.name === 'Their Guest Verse').album.album_group === 'appears_on');
check('own releases are not filtered by credit',
  tracks.find((t) => t.name === 'Theirs A').album.album_group === 'album');
check('requested groups reached the endpoint',
  client.lastGroups === 'album,single,appears_on');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
