# The setlist.fm surface DeepDive would use

Read from the API documentation on **7 September 2026**. Derived
reference, not a copy — the originals are at
`api.setlist.fm/docs/1.0/index.html`.

**Nothing here is built.** The integration is blocked on CORS; see the
bottom of this file.

---

## The blocker: CORS

A browser-only app cannot call an API that refuses cross-origin
requests. The check at `/DeepDive/cors-check.html`, run from the real
origin on **Brave**, failed after 357ms with `Failed to fetch` — the
shape of a rejected preflight, where the browser refuses before
setlist.fm ever sees the key.

**Not yet confirmed.** Brave's Shields block cross-site requests
aggressively enough to produce an identical failure that has nothing to
do with the server. Re-run on Chrome or Firefox, or with Shields down,
before treating this as settled.

If it holds, the options are a serverless proxy — which means running a
server and contradicting the architecture — or dropping real setlists
and deriving a likely set from top tracks instead.

## The other problem: artists are MusicBrainz, not Spotify

Every artist here is identified by an **MBID**, a MusicBrainz
identifier. Spotify does not expose MBIDs, so there is no direct join
between an artist in someone's library and an artist here.

The bridge is `/1.0/search/artists?artistName=`, matching on name —
which is exactly the fuzzy, ambiguous step this project has spent
months avoiding elsewhere. Two artists sharing a name, punctuation
differences and "The" prefixes all land here. Any design should assume
the match can be wrong and let the user correct it.

ISRC doesn't help: setlist.fm records songs as names within a set, not
as recordings.

## Endpoints that matter

| Path | For |
|---|---|
| `/1.0/search/artists` | name → MBID, the bridge from Spotify |
| `/1.0/artist/{mbid}/setlists` | recent sets for one artist — the core call |
| `/1.0/setlist/{setlistId}` | one set in full |
| `/1.0/search/setlists` | filter by artist, venue, city, date |
| `/1.0/venue/{venueId}/setlists` | what gets played at a given venue |

`/1.0/user/{userId}/attended` is interesting for a different feature —
shows someone has actually been to — but needs their setlist.fm user
id, not an API concern.

## Shapes worth knowing before designing

**Everything is paginated.** List responses wrap in a Result carrying
`total`, `itemsPerPage` and `page`. A prolific touring artist has many
pages of sets, so "recent" means deciding how many pages are enough.

**A setlist is sets, not songs.** A setlist contains one or more sets,
and encores are sets too. Flattening loses the encore distinction,
which is exactly the part a concert-prep feature would want to keep.

**Setlists are wiki-edited and versioned.** The same setlist id can
have different content over time; each edit creates a new `versionId`.
Two setlists are only identical if their `versionIds` match. So this
data is contributed, not authoritative — a set can be wrong, partial,
or missing entirely for a show nobody logged.

**Songs are names.** No identifiers, no durations. Matching them to
Spotify tracks is a title match against the artist's catalogue, with
covers and guest spots credited to other artists inside the set.

## Practical consequences for 3.x

- The set for the specific show you're attending usually **doesn't
  exist yet** — it's logged after the fact. What's available is what
  they played on recent nights of the same tour, which is the useful
  thing anyway.
- Coverage is uneven. A stadium act has every night logged; a small
  band may have nothing. The feature has to degrade to top-tracks
  ordering, which is what 3.0 already does without setlist.fm at all.
- Rate limits aren't stated in the docs read here. Check before
  building anything that loops.
