# DeepDive — client-side rewrite (in progress)

This is the client-side (no-backend) rewrite of DeepDive, per
`CLIENT_MIGRATION_PLAN.md` in the main repo. It is **not finished** — it's
being built in verifiable phases. This directory is the parallel project;
the Flask app remains the shipping version until this reaches parity.

## Status

- **Phase 0 — CORS/PKCE reality check: DONE, PASSED.** Confirmed in a real
  browser against the live DeepDive Spotify app that PKCE token exchange
  and every endpoint DeepDive uses (reads + playlist writes) work
  client-side with no backend. The no-backend architecture is viable.
- **Phase 2 (partial) — `js/matching.js`: DONE, VERIFIED.** Full port of
  `matching.py`, proven equivalent to the Python:
  - `sequenceRatio` (a from-scratch port of Python's
    `difflib.SequenceMatcher.ratio()`) matches CPython across 518 cases
    including a 503-case fuzz set with autojunk-triggering long strings.
  - `normalizeTitle` + all five exclusion filters: 95/95 vs Python.
  - Two-phase `findCandidates`/`confirmCandidates`: 18/18 across all key
    scenarios, including the three historical bug-regressions (Leisure
    Hour cross-release, feat.-credit re-release, remaster toggle) and the
    false-positive guard.
- **Phase 2 (rest) — `js/spotify.js`: DONE, structurally verified.** Full
  port of `spotify_client.py` — the Feb 2026 API surface, all reads,
  playlists, and library writes. Can't be diffed against Python (it hits
  the network), but verified via a mock-fetch harness (23/23): URL/param
  construction, `next`-pagination, the 40-uri library-save and 100-uri
  playlist-add chunking, the retry state machine (429 w/ Retry-After,
  5xx, and 403-fails-fast), playlist dedup/reuse, and scrub cancellation.
  Two intentional structural changes from the Python, both forced by the
  browser:
    - Everything is `async` (the Python blocked with `time.sleep` in a
      thread; the browser awaits a promise-based delay instead).
    - The client is constructed with an async `getToken()` *function*
      rather than a raw token, so auth.js can refresh transparently
      mid-run — the client-side equivalent of the Python `get_token()`
      refreshing when expired.
  The one thing only a real browser can confirm is that live calls
  actually succeed end-to-end — but Phase 0 already proved every one of
  these endpoints works browser-side with clean CORS, so the risk there
  is low.

- **Phase 1 — `js/auth.js`: DONE, logic-verified.** Browser PKCE auth,
  the client-side replacement for the Python's server-side OAuth. This is
  the flow the Phase 0 CORS diagnostic already proved works, turned into
  a reusable module. No client secret; tokens in localStorage; transparent
  refresh via `getToken()`. Verified (21/21) with stubbed browser globals:
  valid-token passthrough, expiry-triggered refresh, concurrent-refresh
  coalescing, logout preserving the Client ID, and the full redirect
  callback (state-mismatch rejection + code-for-token exchange). The
  actual redirect navigation + `crypto.subtle` challenge can only run in a
  browser, but that exact path was already exercised live in Phase 0.

## Not done yet

- Phase 3 — the orchestration + UI (all pages, client-rendered): the
  equivalent of app.py's run_search_job / run_full_scrub_job / confirm
  flow, plus the home/results/scrub/setup/watchlist views and nav. This
  is the big remaining piece and the least unit-testable — it's where a
  real browser becomes necessary.
- Phase 4 — PWA shell (manifest + service worker) — the "add to home
  screen" finish
- Phase 5 — platform testing (esp. iOS backgrounding)
- Phase 6 — static hosting

## Foundations complete + first runnable build

All logic modules are done and verified (706 assertions passing across
matching, spotify, auth, watchlist, and the search/scrub orchestration).
On top of them there's now a **runnable UI**: `index.html` + `js/app.js`
wire everything into the full flow — setup → connect → home (search,
autofill, recommendations, To-Dive row, settings panel) → progress →
results (like + build playlist), plus the full-library scrub and the
To-Do list page, all in the v1.10 monochrome+blue design.

This is the first point where the app actually runs in a browser. The
logic underneath is verified; the UI layer is structurally checked (all
imports resolve, boot-critical element IDs present, nav wired) but has
NOT been run against live Spotify yet — that's the next step, and it
needs you.

### How to run it (local)

From this directory, serve it over http (not file://, which breaks ES
modules and the Spotify redirect):

```
python3 -m http.server 8888
```

Then open `http://127.0.0.1:8888/` and:
1. It'll show the setup page — paste your DeepDive **Client ID**.
2. Add `http://127.0.0.1:8888/` as a Redirect URI in your Spotify app
   (note: the app root, not a `/callback` path — the client app uses its
   own origin as the redirect).
3. Connect, then try a search.

### What to check first (likely rough edges)

- Does login complete and land on the home page?
- Does a single-artist search run start-to-finish and show results?
- Do "like" and "build playlist" actually work?
- Autofill dropdown as you type?
- The full-library scrub (start one, try cancelling)?

## Not done yet

- Phase 4 — PWA shell (manifest + service worker) — the "add to home
  screen" finish
- Phase 5 — platform testing (esp. iOS backgrounding)
- Phase 6 — static hosting
- Polish/parity passes once real-browser testing surfaces issues

## Running the tests

Requires Node (for the test harness only — the app itself has no build
step and no Node dependency). From this directory:

```
node tests/test_ratio.mjs      # SequenceMatcher vs Python, hand cases
node tests/test_fuzz.mjs       # SequenceMatcher vs Python, 503 fuzz cases
node tests/test_logic.mjs      # normalizeTitle + filters vs Python
node tests/test_classify.mjs   # two-phase classification vs Python
node tests/test_spotify.mjs    # spotify.js request logic (mock fetch)
```

The `*_expected.json` files are ground truth generated from the actual
`matching.py`; regenerate them from the Python if that logic ever changes,
then re-run to confirm the port still matches.
