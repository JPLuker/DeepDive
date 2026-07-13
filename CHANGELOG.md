# Changelog

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
