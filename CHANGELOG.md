# Changelog

## v1.7.3
- Fixed: catalog tracks could vanish from search results entirely —
  not shown as a match, not shown as new, nothing. Root cause was in
  `find_candidates()` (added in v1.7.0): catalog tracks sharing the
  same (normalized title, exact duration) key were silently collapsed
  to whichever one was encountered first, intended to avoid showing
  the same new song three times across album/deluxe/single. But this
  ran *before* classification, so if two different *unliked* releases
  of the same recording shared that key (common when an artist reuses
  the exact same master across releases — e.g. two singles), only the
  first ever got evaluated; the second was dropped outright, before it
  could become a match candidate or even a "new track." Confirmed via
  a real case: two singles of an already-multiply-liked song were both
  missing from the results page for exactly this reason. This
  collapsing has been removed — every catalog track (already
  guaranteed unique by ID upstream) is now evaluated and shown
  independently. The tradeoff: a genuinely new song released on
  several editions can now show up as several separate "new" entries
  instead of one. That's a minor display redundancy, not the silent
  data loss it replaces.

## v1.7.2
- Fixed: playlist creation/reuse failed with `403 Insufficient client
  scope` on `GET /me/playlists`. The Feb 2026 migration's de-dup check
  (finding an existing same-named playlist to reuse) reads the user's
  private playlists, which needs `playlist-read-private` — this scope
  was missing from `SCOPE` entirely (the existing `playlist-modify-*`
  scopes only cover creating/editing playlists, not listing them).
  Existing connections are auto-detected as outdated (same mechanism as
  the v1.4.0 scope bump) and prompted to reconnect.
- Fixed: single-artist search and full library scrub could silently
  miss genuine cross-release duplicates. Root cause was in the Feb
  2026 two-phase matching added in v1.7.0: a catalog track only gets
  its real ISRC checked (phase 2) if it first passes a fuzzy title
  match against something already liked (phase 1) — and that phase-1
  filter was strict enough to reject genuine same-recording re-releases
  before ISRC ever got a say. Concretely: a single adding "(feat. X)"
  to a title that wasn't on the liked album cut dropped title
  similarity from 100% to ~46%, well under the old 90% bar, so the
  track was never even ISRC-checked and fell straight into "new."
  Two changes:
  - `normalize_title()` now also strips feat./ft./with credits,
    "(Original Mix)", and parenthetical versions of tags that were
    previously only recognized in "- Suffix" form (single/album/mono/
    stereo version, bonus track), and normalizes `[brackets]` to
    `(parens)` so both styles hit the same patterns.
  - Phase-1 candidate selection (deciding whether a track is *worth* an
    ISRC lookup) now uses its own looser threshold (72% title
    similarity, ±5s duration) instead of the same 90%/±3s bar used for
    the final no-ISRC fallback decision. This is safe to loosen: ISRC
    is the actual arbiter once a track becomes a candidate, so a wider
    net here just means a few more (cheap, one-per-candidate) ISRC
    lookups — it can't produce a false-positive duplicate, since a
    non-matching ISRC still correctly falls back to "new" in phase 2.
    The original 90%/±3s bar is unchanged for the two places that
    still need it (matching a track with no ISRC at all, and the
    opt-in remaster-matching toggle), since those have no ISRC to
    fall back on and staying conservative there still matters.
  - Also fixed the same bracket-vs-parens gap in the exclude-live/
    censored/instrumental/a-cappella/remaster filters, which only
    recognized `(Live)`-style tags and missed `[Live]`-style ones.
  - `_find_fuzzy_match()` now returns the *closest* title match among
    eligible liked tracks rather than the first one encountered, for
    when a candidate could plausibly match more than one liked track.

## v1.7.1
- Fixed: confirming a search (liking tracks / building a playlist) had
  no error handling at all, so any API failure became a raw Flask 500
  white page — throwing away results that took minutes to produce.
  Liking and playlist-building are now handled independently: if one
  fails the other still reports its result, the real Spotify error is
  shown on the page, and the cached results are kept so you can go back
  and retry without re-running the whole search.

## v1.7.0 — February 2026 API migration

The cause of every failure across v1.6.1–v1.6.13 turned out to be a
documented Spotify platform change, not a bug in DeepDive:

> **February 11, 2026** — New Development Mode apps are created with new restrictions
> **March 9, 2026** — Existing Development Mode apps are migrated to new restrictions

That explains why apps that had worked for months broke without any
local change, and why creating a fresh Spotify app didn't help — both
apps are Development Mode, and both were migrated. Extended Quota apps
are unaffected.

**Ported to the new API surface:**
- `GET /tracks?ids=`, `/albums?ids=`, `/artists?ids=` — batch endpoints
  removed (403). Now fetched individually.
- `PUT /me/tracks` → `PUT /me/library?uris=` (still batched, 40 per call).
- `POST /users/{id}/playlists` → `POST /me/playlists`.
- `POST|GET /playlists/{id}/tracks` → `/playlists/{id}/items`, including
  the `.track` → `.item` field rename.
- `GET /search` limit max 50 → 10.
- `GET /artists/{id}/albums` limit max 50 → 10 (this was the "Invalid
  limit" 400 — nothing to do with any of the theories chased earlier).
- `artist.popularity` removed; `find_artist()` no longer sorts by it and
  falls back to Spotify's own search relevance.

**Two-phase matching (the significant change).** ISRC only exists on
full track objects, and batch fetching is gone — so reading ISRCs for a
whole catalog would now be one request per track. Instead:
1. Read the catalog from album responses (no ISRC) and narrow to tracks
   that plausibly match something already liked. Free.
2. Fetch real ISRCs only for those few candidates, and let ISRC decide
   duplicate vs. different recording.

ISRC precision is kept exactly where it decides something. A track
resembling nothing in your library never costs a lookup.

*Honest trade-off:* previously an ISRC match could catch a duplicate
whose title differed from the liked version. Now a track must look
similar enough to become a candidate before its ISRC is checked. Title
normalisation and the duration window make that rare, but it is a real
(small) loss of recall — accepted to keep the feature viable at all.

**Performance:** single-artist search costs more requests than before
(roughly one per release) but is fine. **Full library scrub is now
substantially more expensive** — for a large library it may not be
practical. Left in place rather than removed unilaterally; worth a
conversation.

**Corrections to earlier changelog entries:** v1.6.11/v1.6.12 blamed
spotipy's `Content-Type` header, and v1.6.7 blamed connection pooling.
Both diagnoses were wrong — they were theories built on a mental model
of an API that had changed months earlier. The v1.6.12 rewrite is kept
because it works and removes a dependency on spotipy's internals, but
it was not the cause. v1.6.7's pooling change was reverted in v1.6.13
after it caused a real slowdown of its own.

## v1.6.13
- Fixed: `400 Invalid limit` on the artist releases lookup. Direct
  testing against the live API (plain `requests`, no spotipy, no app)
  found `limit=50` and `limit=20` both rejected, while `limit=10` and
  the endpoint's default of 5 both succeeded — same token, same artist,
  same moment, only the limit differing. Now uses limit=10, the largest
  value confirmed to actually work. Most likely Spotify lowered the max
  for this endpoint server-side; notably, older versions of this app
  that had previously worked started failing identically without any
  local change, which is what a server-side change looks like.
- Corrected: v1.6.11/v1.6.12 attributed this error to spotipy's forced
  `Content-Type` header. That diagnosis was wrong — the test that
  "proved" it used limit=20, which was already failing on its own, so
  adding the header proved nothing. The v1.6.12 rewrite (bodyless
  requests bypassing spotipy) is kept regardless: it's tested, it
  works, and it removes a dependency on spotipy's internals. But the
  Content-Type header was not the cause.
- Fixed: restored HTTP connection pooling, which v1.6.7 disabled on an
  unconfirmed theory about stale connections. Without pooling, every
  request in a 100+ page Liked Songs fetch paid for a fresh TCP+TLS
  handshake, slowing the fetch enough to trip the stage timeout — a
  regression introduced by that earlier speculative fix.
- Changed: raised the per-stage timeout from 5 to 30 minutes. A stage
  can legitimately be 100+ paginated requests for a large library, and
  genuine per-request hangs are already handled far tighter (25s) at
  the request level. The old 5-minute ceiling was mostly punishing
  large libraries for being large.

## v1.6.12
- Fixed comprehensively, not just for the one endpoint caught so far.
  After v1.6.11 fixed `/artists/{id}/albums`, live testing immediately
  surfaced the *same* underlying issue on a second, unrelated endpoint
  (`/artists?ids=...`, used for suggestion photos — a 403 this time,
  not a 400, but the same root cause). Rather than keep patching
  endpoints one at a time as each one happens to get exercised, every
  bodyless request in the app (every GET, plus liking tracks which is
  a bodyless PUT) has been moved off spotipy's internal request
  machinery entirely — the actual source of the forced Content-Type
  header. Playlist creation and adding tracks to a playlist are
  deliberately left unchanged: those send genuine JSON bodies where
  Content-Type is correct, and they've been working reliably all
  session. Verified all 11 read functions plus the mixed-path playlist
  function individually: correct requests, correct results, and zero
  Content-Type headers on any request that shouldn't have one.

## v1.6.11
- Fixed, now with direct confirmation of the actual cause: the "Invalid
  limit" error had nothing to do with `limit` OR `offset` — it was
  never really about the parameters. Direct side-by-side testing
  proved it: taking the exact request that had just succeeded and
  adding only a `Content-Type: application/json` header reproduced the
  failure exactly. spotipy sets that header unconditionally on every
  request it makes, including GETs with no body, with no way to
  disable it through spotipy's normal API — and Spotify's API rejects
  it on this endpoint specifically, with a misleading error message
  that blamed the wrong parameter the entire time. Rewrote
  `get_artist_album_ids()` to bypass spotipy's internal request
  machinery entirely (a small direct-`requests` helper) for both the
  initial request and pagination, so this header is never sent at all.
  Verified directly: no Content-Type header is sent on either request,
  pagination across multiple pages still works, and error handling/
  retry-on-transient-failure both still work correctly through the new
  path.

## v1.6.10
- Fixed for real this time — found via directly comparing four raw API
  requests against Spotify's servers (bypassing DeepDive and spotipy
  entirely). The "Invalid limit" 400 error was misleading: it wasn't
  actually about the `limit` value at all (confirmed: 50 and 20 both
  failed identically). The real trigger is spotipy's `artist_albums()`
  method itself — its signature hardcodes `offset=0` as a default and
  always sends it explicitly, with no way to omit it through the
  normal method call. Spotify's API is now rejecting this specific
  combination of an explicit `limit` with an explicit `offset` on this
  endpoint. Fixed by bypassing spotipy's `artist_albums()` wrapper for
  the first request (via its lower-level `_get()`) so `offset` can
  genuinely be left out — confirmed via direct testing this is exactly
  the combination Spotify accepts.

## v1.6.9
- Fixed: after switching to a freshly created Spotify app, the artist
  releases lookup (`/artists/{id}/albums`) started failing with
  `400 Invalid limit` on `limit=50` — the first time this specific
  error has shown up in testing. Possibly a recent tightening on
  Spotify's side for this endpoint specifically (this file's other
  endpoints using `limit=50` haven't shown the same error, so this is
  a targeted fix, not a blanket change). Lowered this endpoint's page
  size to 20, comfortably within any historically valid range. Can't
  fully confirm Spotify's current server-side validation from here —
  this needs a real live test to confirm it resolves it.

## v1.6.8
- Fixed the actual, now-confirmed root cause: **HTTP 429 (rate
  limited)**. v1.6.6/v1.6.7 finally surfaced this as a real, visible
  error instead of a silent hang — Spotify was rejecting requests as
  "too many," entirely plausible after this many searches and full
  scrubs in one extended session. The real bug: spotipy exposes exactly
  how long Spotify wants us to wait via the `Retry-After` header on a
  429 response, and `_call()` was never reading it — it retried with
  the same short flat backoff used for ordinary transient errors, which
  likely just re-triggered the same rate limit immediately rather than
  actually waiting out the window. 429s now get their own longer retry
  budget and genuinely wait however long Spotify asks (capped at 90s so
  it still can't hang forever on an extreme value), falling back to a
  conservative 15s wait only if Spotify doesn't send a usable header.
  Verified directly: a simulated 429 with `Retry-After: 2` now waits
  exactly ~2 seconds before retrying, not a guessed short delay: other
  error types (5xx, timeouts, non-retryable 4xx) are confirmed
  unaffected by this change.

## v1.6.7
- Fixed (hopefully the real root cause): direct `curl` testing showed
  Spotify's API responding in 0.17s outside the app, while the app's
  own long-running process kept hanging on the same domain. spotipy
  keeps a persistent, connection-pooling `requests.Session` for the
  lifetime of the client — in a server process alive for hours across
  many requests, a single pooled connection going stale/stuck on
  Spotify's end can then get handed out again on every subsequent
  call, including retries, while a fresh one-off process (like curl)
  never touches that same broken connection. Disabled session/
  connection pooling entirely (`requests_session=False`, an option
  spotipy documents specifically for this trade-off) — a little more
  overhead per request (a fresh connection each time instead of a warm
  reused one), in exchange for not being able to get permanently stuck
  on one bad connection for the rest of the process's life.

## v1.6.6
- Fixed at the actual root, this time: every previous timeout fix
  (v1.6.2-v1.6.5) wrapped increasingly large chunks of work (a whole
  artist, a whole stage) in a hard deadline — but a single underlying
  HTTP request could still hang far longer than the configured 20s
  `REQUEST_TIMEOUT`, since that setting depends on the `requests`
  library actually honoring it, which real-world testing showed
  wasn't reliably happening. Added a true hard timeout
  (`HARD_CALL_TIMEOUT`, 25s) at the lowest level — every individual
  API call attempt inside `_call()` now has its own daemon-thread
  backstop, independent of whether `REQUEST_TIMEOUT` is respected.
  Verified directly: a call simulated to hang forever, completely
  bypassing `REQUEST_TIMEOUT`, is now still caught and retried on a
  short, predictable schedule. This should be the actual fix for the
  repeated stall reports, not another layer further out from the
  problem.
- Fixed: progress stage labels only updated after a stage's first
  request succeeded, so a stuck first request left a stale, misleading
  label the whole time it was stuck. Labels now update immediately
  when each stage begins.

## v1.6.5
- Fixed: the actual root cause behind the "page just loads forever"
  reports. `get_token()`'s access-token refresh call had zero timeout
  protection — and it runs on the way into *every* authenticated route,
  including the very first hit to the home page. v1.6.3/v1.6.4 fixed
  the suggestions fetch, but that code never even ran if the token
  refresh itself hung first, which is exactly what was happening.
  Wrapped it with the same hard-timeout helper; if a refresh can't
  complete quickly, the session is cleared and the user sees "Connect
  Spotify" again instead of the page hanging indefinitely.

## v1.6.4
- Fixed: v1.6.3 accidentally broke the home page. It applied the same
  5-minute background-job timeout to the suggestions fetch, but the
  home page loads synchronously (no progress bar, just a normal page
  request) — so if Spotify was being slow, the whole page would just
  sit blank for up to 5 minutes before rendering anything. Suggestions
  now get their own much shorter timeout (8s); if that trips, they're
  silently skipped and the page renders immediately, same as any other
  suggestions failure.

## v1.6.3
- Fixed: the hard-timeout fix from v1.6.2 only covered the full-scrub's
  per-artist crawl. Single-artist search had zero timeout protection on
  any of its stages and could hang forever the same way (confirmed: a
  real search stalled 6+ minutes on "Reading your Liked Songs..." with
  no recovery). Generalized the fix into a reusable `run_with_timeout()`
  helper and applied it to every network stage in both single-artist
  search and full-scrub — nothing in either job can hang indefinitely
  anymore, regardless of which stage or which job type.
- Added: artist photos on the home page's listening-based suggestions.
  Top-artist suggestions already come with images from Spotify's API;
  recently-played-derived suggestions don't, so those get one small
  follow-up batch request for their photos. Falls back to a text-only
  pill per-artist if that fetch fails, rather than losing the
  suggestion entirely.

## v1.6.2
- Fixed: the v1.6.1 per-artist time budget didn't actually work for the
  failure mode that was actually happening in practice. It checked the
  deadline cooperatively (between completed API calls), which does
  nothing if a *single* call never returns at all — exactly what was
  observed with a real library (stalled 11+ minutes on one artist,
  past the "5 minute" budget, because the very first request for that
  artist's releases never got a chance to check in). Replaced with a
  hard deadline: each artist now crawls in its own daemon thread, and
  the main scrub loop gives up waiting after 5 minutes regardless of
  what's happening inside — this works even if a call hangs completely
  and never calls back at all, not just a slow-but-progressing one.
  (Also caught and avoided a subtler bug in the first version of this
  fix during testing: using `ThreadPoolExecutor` here would have made
  an abandoned/hung artist silently prevent the whole Flask process
  from shutting down cleanly later, since Python joins every thread a
  `ThreadPoolExecutor` ever created at process exit regardless of
  `shutdown(wait=False)`. Daemon threads don't have that problem.)
- Fixed: skipped-artist detail on the results page now shows correctly
  for this failure mode too (was added in v1.6.1, still applies).

## v1.6.1
- Fixed: the full library scrub had no ceiling on how long it would
  spend on a single artist. If one artist had an unusually large
  catalog (or the API was persistently slow for that artist), the
  overall progress bar would sit frozen — indistinguishable from
  actually being stuck, since progress only advanced between artists,
  never within one. Added a hard 5-minute-per-artist budget: if a
  single artist is still going after that, it's abandoned and the
  scrub moves on, guaranteeing forward progress no matter what.
- Fixed: the results page only showed a generic count of "some artists
  couldn't be scanned" with no detail. Now lists each skipped artist by
  name with the actual reason (time budget exceeded, API error, etc.)
  instead of a vague "transient API issue" message.

## v1.6.0
- Removed: **Quick duplicate check**. This feature scanned existing
  Liked Songs for accidental double-likes and offered to *unlike* one
  copy — a cleanup tool, not a discovery tool. In practice this wasn't
  wanted and was easily confused with Full library scrub (which finds
  and *likes* missing versions) since both lived under "Scan your whole
  library." Removed entirely, including its route, background job,
  templates, and the now-unused `find_duplicate_groups_in_liked()` /
  `unlike_tracks()` helpers, rather than leaving dead code around.
  Full library scrub is unaffected and is now the only option in that
  section of the home page.

## v1.5.0
- Added: "Exclude instrumentals" and "Exclude a cappella versions" filters,
  available on both single-artist search and the full library scrub.
  Same conservative pattern-matching approach as the existing live/
  censored filters (won't false-positive on a song literally titled
  "Instrumental").
- Added: "Count remasters as duplicates of the original" checkbox. Off by
  default — remasters usually carry a different ISRC than the original
  recording, so by default they're only matched if they happen to share
  the exact ISRC (unusual). With this on, DeepDive will also title-match
  a remaster against your liked tracks the same way it already does for
  tracks missing an ISRC, so "liked the original, missed the remaster"
  (or vice versa) gets caught as a duplicate candidate instead of showing
  up as a new track.

## v1.4.0
- Added: **quick duplicate check** — scans your existing Liked Songs
  against each other (no catalog crawling) to find songs you've already
  liked twice under different releases. Fast, review-and-unlike workflow.
- Added: **full library scrub** — crawls every distinct artist in your
  Liked Songs the same way single-artist search does, to catch every
  cross-release duplicate and every new track across your entire library.
  This is genuinely slow for large libraries (potentially 30-60+ minutes)
  since it's equivalent to running a search once per artist — but it's
  cancellable at any time and keeps whatever was found before cancelling.
  One artist failing to fetch no longer kills the whole scrub.
- Added: **listening-based artist suggestions** on the home page, pulled
  from your top artists and recently-played tracks — one click to search
  any of them.
- These new features require two additional Spotify permission scopes
  (`user-top-read`, `user-read-recently-played`). Existing sessions are
  automatically detected as outdated and prompted to reconnect rather
  than silently failing later.

## v1.3.1
- Added: `run.sh` launcher script. Sets up the virtual environment and
  installs dependencies automatically on first run only; every run after
  that just starts the app. Also opens your browser automatically a
  couple seconds after the server comes up. No more remembering the
  venv/activate/pip/python incantation each time.

## v1.3.0
- Added: optional "Exclude live recordings" filter on search, using
  conservative title/album pattern matching (won't false-positive on
  songs literally titled things like "Clean" or "Live Life").
- Added: optional "Exclude radio edits & censored/clean versions" filter,
  same conservative pattern-matching approach.
- Both filters apply before matching, so excluded tracks never show up as
  a match candidate or a new-track suggestion. Results page notes how
  many were filtered out.
- Added: "Build a playlist from these" toggle on the results page — when
  unchecked, DeepDive only likes the confirmed matches and skips playlist
  creation entirely, rather than requiring you to uncheck every track.

## v1.2.0
- Fixed: Client Secret field on the setup page was unstyled (CSS only
  targeted `input[type=text]`, not `input[type=password]`).
- Fixed: Spotify API calls used a 5-second timeout (spotipy's default),
  which could fail on slower connections or heavier batch requests. Raised
  to 20s and added automatic retry with backoff (up to 4 attempts) for
  timeouts, connection errors, and transient 429/5xx responses. Non-
  transient errors (bad requests, auth failures) still fail immediately.

## v1.1.0
- Added: live progress bar during search (background job + polling),
  since large catalogs could take a while with no feedback.
- Added: Spotify auth now opens in a popup window and closes itself
  automatically on success, instead of navigating the whole tab away.
- Added: in-browser setup page for pasting Client ID/Secret — no more
  manually editing `.env` in a text editor.
- Added: playlist de-duplication — re-running DeepDive for an artist
  reuses the existing playlist by name and skips tracks already in it,
  so re-running never creates duplicate entries. Confirmation page now
  reports how many were skipped.

## v1.0.0
- Initial release: connect Spotify, search an artist, detect liked-song
  duplicates across releases via ISRC (with fuzzy fallback), confirm
  which to like, and build a playlist of everything not yet liked.
