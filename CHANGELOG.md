# Changelog

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
