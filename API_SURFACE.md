# The Spotify surface DeepDive actually uses

Checked against the OpenAPI schema on **4 September 2026**:
`https://developer.spotify.com/reference/web-api/open-api-schema.yaml`

This is a derived audit, not a copy of Spotify's documentation. Fetch
the schema when you need the full picture — it moves fast, and a
mirrored copy in here would be wrong within weeks. What this file is
for is the part that matters to us: what we call, whether it still
works, and where we're out of line.

**The rule established by testing:** an endpoint marked
`deprecated: true` in the schema returns **403** for a Development Mode
app. Two for two — `/albums?ids=` and `/artists/{id}/top-tracks` both
403 with a valid token while their non-deprecated neighbours return
200. Check the schema before designing around an endpoint.

---

## What we call

| Endpoint | Status | Limit | Notes |
|---|---|---|---|
| `GET /search` | current | max 10 | Was 50. We match at `SEARCH_LIMIT_MAX`. |
| `GET /artists/{id}` | current | — | Artist photo fallback. |
| `GET /artists/{id}/albums` | current | max 10, default 5 | Was 50. `ARTIST_ALBUMS_LIMIT_MAX` is at the ceiling. |
| `GET /albums/{id}` | current | — | One per release. The dominant cost of a dive. |
| `GET /tracks/{id}` | current | — | Singular only; the batch form is deprecated. |
| `GET /me` | current | — | ⚠️ Schema lists `user-read-private` / `user-read-email` as required. We request neither and it works, so enforcement is lax. If it tightens, playlist creation breaks — it reads the user id from here. |
| `GET /me/tracks` | current | 50 | Liked Songs. |
| `GET /me/top/artists` | current | — | Suggestions. |
| `GET /me/player/recently-played` | current | — | Suggestions. |
| `GET /me/playlists` | current | — | Playlist reuse and cleanup. |
| `GET /playlists/{id}/items` | current | 50 | Migrated off `/tracks`. |
| `POST /playlists/{id}/items` | current | 100 uris | |
| `PUT /me/library` | current | 40 uris | Liking tracks. |
| `DELETE /me/library` | current | 40 uris | Unliking, and now playlist removal. |

## What we must not call

| Endpoint | Why |
|---|---|
| `GET /albums?ids=` | Deprecated → 403. Confirmed. This is why a catalogue read is one request per release. |
| `GET /artists/{id}/top-tracks` | Deprecated → 403. Confirmed. **Blocks dips** — see below. |
| `GET /tracks?ids=`, `/artists?ids=` | Deprecated. Same family. |
| `DELETE /playlists/{id}/followers` | Deprecated. We used this for playlist deletion until 2.9.2 and it was probably failing silently — every caller swallows the error to keep bulk cleanup going. |
| `GET /artists/{id}/related-artists` | Deprecated. Why artist similarity is planned via Last.fm / Deezer. |
| `GET /recommendations`, `/audio-features`, `/audio-analysis` | Deprecated. |
| `PUT|DELETE /me/tracks`, `/me/albums`, `/me/episodes`, `/me/shows` | Deprecated in favour of `/me/library`. Already migrated. |

## No popularity data exists

`artist.popularity` was removed in February. `/artists/{id}/top-tracks`
403s. The simplified track objects from `albums/{id}` carry no
`popularity` field, and the full track object that does would cost one
request per track.

So **"most popular" is not something DeepDive can compute from Spotify**
at any acceptable cost. Dips need either an external source (Last.fm
`artist.getTopTracks` is the obvious one, already planned for
similarity) or a different definition.

## Quota buckets — why one thing works and another doesn't

Spotify groups endpoints into separate quota budgets. Requests in the
same bucket share a limit, so a healthy home screen says nothing about
whether a dive can run.

Observed 5 Sept 2026: suggestions and the library loaded instantly while
`GET /artists/{id}/albums` returned 429 on its very first call. The
user-data bucket was fine; the catalogue bucket was spent. Pacing cannot
help with this — it is refusal on request one, not a burst.

A 429 carries `reason` in the body. `QUOTA_EXCEEDED` means the budget is
gone and retrying is pointless; anything else is a rate limit worth
backing off from. Treat them differently.

## Scopes

Requested: `user-library-read`, `user-library-modify`,
`playlist-read-private`, `playlist-modify-private`,
`playlist-modify-public`, `user-top-read`, `user-read-recently-played`.

Each is used. Nothing is requested preemptively. `DELETE /me/library`
accepts `playlist-modify-public`, which we already hold, so removing a
playlist needs no new scope.

Adding `ugc-image-upload` for custom playlist covers would force every
existing user to reauthorise — worth knowing before that feature is
scheduled.

---

## Where we're out of line

**Attribution is missing.** The Developer Terms require attributing
content to Spotify. There is none anywhere in the app. Clearest gap we
have, and cheap to close.

**Caching.** The terms forbid caching content beyond immediate use.
This rules out the album-tracklist cache that would otherwise be the
obvious fix for dive speed — tracklists never change, which is exactly
why keeping them permanently is what's prohibited. `library-cache.js`
holds the user's Liked Songs on a 24-hour reconcile window; that's the
user's own data serving an immediate function, but it isn't clearly
"immediate use" either. Undecided.

---

## Efficiency: where a dive's requests go

For an artist with **R** releases and a library of **N** liked tracks:

- Preflight — 3
- Artist lookup — 1
- Liked Songs — `N/50`, usually served from cache
- Release listing — `R/10` (was `R/50` before February)
- **Reading releases — R**, one request each
- Long albums — one extra per 50 tracks beyond the first

A 60-release artist is roughly **70 requests**, and at 250ms pacing
about 17 seconds of deliberate waiting. That is the floor. There is no
batching to reclaim and no caching permitted, so the only remaining
levers are asking for fewer releases (the compilations and guest-spot
toggles) or accepting the time.

Pacing from the first request is not a nicety. Sprinting earns a 429 and
a 15-second penalty, which costs more than pacing the entire read.
