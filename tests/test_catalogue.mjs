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
// The previous version of this test handed the client an
// `album_group: "appears_on"` and then asserted the filter used it.
// That proved the branch worked *given* the field, and never that the
// field arrives. It didn't — the code fell back to `album_type`, which
// is "album" for an album, so the guest check never fired and whole
// records by other artists came through. Ownership is now decided from
// the album's own `artists`, which is always present.
function fakeClient(albums) {
  const c = Object.create(SpotifyClient.prototype);
  c._pacingMs = () => 0;
  c.setRunPacing = () => {};
  c.get = async (path, params) => {
    if (path === `artists/${AID}/albums`) {
      c.lastGroups = params.include_groups;
      return { total: albums.length, items: albums.map((a) => a.listing), next: null };
    }
    const hit = albums.find((a) => path === `albums/${a.listing.id}`);
    if (hit) return hit.full;
    throw new Error('unexpected path ' + path);
  };
  return c;
}

const OWN = {
  listing: { id: 'own-1', album_group: 'album' },
  full: {
    id: 'own-1', name: 'Their Record', release_date: '2020-01-01', album_type: 'album',
    artists: [{ id: AID, name: 'Them' }],
    tracks: { items: [
      { id: 't1', name: 'Theirs A', artists: [{ id: AID }] },
      { id: 't2', name: 'Theirs B', artists: [{ id: AID }] },
    ], next: null },
  },
};

// The case that was broken in the wild: a record by someone else, with
// album_group MISSING from the listing exactly as Spotify may send it.
const GUEST_NO_GROUP = {
  listing: { id: 'guest-1' },
  full: {
    id: 'guest-1', name: "Someone Else's Record", release_date: '2021-01-01', album_type: 'album',
    artists: [{ id: 'other', name: 'Someone Else' }],
    tracks: { items: [
      { id: 'g1', name: 'Not Theirs', artists: [{ id: 'other' }] },
      { id: 'g2', name: 'Their Guest Verse', artists: [{ id: 'other' }, { id: AID }] },
      { id: 'g3', name: 'Also Not Theirs', artists: [{ id: 'other' }] },
    ], next: null },
  },
};

// A various-artists compilation: not tagged appears_on, not their
// record either.
const COMP = {
  listing: { id: 'comp-1', album_group: 'compilation' },
  full: {
    id: 'comp-1', name: 'Various Artists Vol. 3', release_date: '2019-01-01', album_type: 'compilation',
    artists: [{ id: 'va', name: 'Various Artists' }],
    tracks: { items: [
      { id: 'c1', name: 'Someone', artists: [{ id: 'other' }] },
      { id: 'c2', name: 'Their Contribution', artists: [{ id: AID }] },
    ], next: null },
  },
};

const client = fakeClient([OWN, GUEST_NO_GROUP, COMP]);
const tracks = await client.getArtistCatalogTracks(AID, {
  includeGroups: buildIncludeGroups(true, true),
});
const names = tracks.map((t) => t.name);

check('own album keeps every track', names.includes('Theirs A') && names.includes('Theirs B'));
check('guest album keeps the credited track', names.includes('Their Guest Verse'));
// The regression, stated plainly.
check('guest album drops uncredited tracks even with no album_group',
  !names.includes('Not Theirs') && !names.includes('Also Not Theirs'));
check('compilation keeps only their contribution',
  names.includes('Their Contribution') && !names.includes('Someone'));
check('seven tracks became four', tracks.length === 4);
check('ownership is recorded on the release',
  tracks.find((t) => t.name === 'Theirs A').album.own_release === true &&
  tracks.find((t) => t.name === 'Their Guest Verse').album.own_release === false);
check('requested groups reached the endpoint',
  client.lastGroups === 'album,single,compilation,appears_on');

// Instrumentation: whether the filter engaged must be observable, since
// it being unobservable is how this survived twenty builds.
const seen = [];
const client2 = fakeClient([OWN, GUEST_NO_GROUP]);
client2.onCatalogAlbum = (e) => seen.push(e);
await client2.getArtistCatalogTracks(AID, { includeGroups: buildIncludeGroups(false, true) });
check('every release is reported', seen.length === 2);
check('guest release is flagged as not their own', seen.some((e) => e.creditedOnly && e.dropped === 2));
check('own release is not filtered', seen.some((e) => !e.creditedOnly && e.kept === 2));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
