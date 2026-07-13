# DeepDive PWA Migration Plan

**Goal:** rebuild DeepDive as a client-side Progressive Web App — one
codebase serving desktop, Android, and iOS, no backend server, no
hosting cost beyond free static file hosting. Users keep providing their
own Spotify Client ID (PKCE flow, no secret needed), same as today.

**What stays the same:** the actual matching logic (ISRC + fuzzy
duplicate detection, live/censored filtering, playlist de-duplication),
the visual identity, and the "your own Spotify app credentials" model
that avoids Spotify's extended-quota process entirely.

**What changes:** everything server-side disappears. Flask, Jinja
templates, background threads, and the in-memory `RESULTS_CACHE` /
`progress.py` job tracker all get replaced by client-side equivalents.

---

## Phase 0 — Architecture decisions (before writing code)

Decide these up front since they shape everything after:

- **Build tooling: vanilla JS/ES modules vs. a lightweight framework
  (Svelte/Preact) with Vite.** Vanilla keeps the current project's
  no-build-step simplicity; a small framework makes the reactive UI
  (progress bars, checkbox states, dynamic lists) easier to maintain as
  it grows. Recommendation: start vanilla for the port, revisit if the
  UI code gets unwieldy.
- **Token storage: IndexedDB vs. localStorage.** Both are readable by
  any JS on the page (standard SPA risk, same as every browser-based
  Spotify app). IndexedDB is the slightly more conventional choice for
  structured data; either is fine here.
- **Persisting scrub progress across reloads:** since there's no
  server-side job surviving a closed tab, decide whether the full-library
  scrub should checkpoint progress to IndexedDB (artist-by-artist) so a
  refresh or accidental tab close can resume rather than restart from
  zero. Recommended — this is the one place the client-side model is
  genuinely more fragile than the current server-side version, and it's
  worth designing around from the start rather than bolting on later.

---

## Phase 1 — Auth: port to PKCE

- Implement Authorization Code with PKCE directly against Spotify's
  `/authorize` and `/api/token` endpoints via `fetch()` — no secret,
  no backend token exchange.
- Generate and store the PKCE code verifier/challenge, and a `state`
  value for CSRF protection, per the standard PKCE flow.
- Store access + refresh tokens client-side; implement the same
  "refresh when expired" logic `get_token()` handles today.
- Same scope string as v1.4.0 (`user-library-read`,
  `user-library-modify`, `playlist-modify-private`,
  `playlist-modify-public`, `user-top-read`,
  `user-read-recently-played`).
- Confirm Spotify's Web API CORS policy still permits direct browser
  calls for PKCE clients (it does today, per their docs — worth a quick
  recheck against current docs since this is the load-bearing assumption
  for the whole architecture).

## Phase 2 — Port the core logic

- `matching.py` → `matching.js`: ISRC grouping, fuzzy title/duration
  matching (reimplement or use a small string-similarity utility in
  place of Python's `difflib.SequenceMatcher`), live/censored regex
  filters, within-library duplicate detection. This is mechanical,
  low-risk — the logic itself doesn't change, just the language.
- `spotify_client.py` → `spotify.js`: all the `fetch()`-based API calls
  (liked songs pagination, artist album enumeration, batched track
  fetches, playlist creation/dedup), plus the retry-with-backoff wrapper
  (`_call()`'s logic ports directly to a `fetchWithRetry()` helper).
- Decide sequencing: async/await naturally keeps the UI responsive
  without needing a Web Worker for most of this, since the real cost is
  network wait time, not computation. A Web Worker is only worth adding
  if UI jank shows up in testing during heavy classification passes.

## Phase 3 — Rebuild the UI

- Port each Jinja template's *behavior* (not literally the HTML) into
  client-rendered views: home/search, progress bar, results/confirm,
  quick-scan results, full-scrub results, setup/credentials entry.
- Progress bar: no more polling a Flask endpoint — just update local
  state directly as each async step completes.
- Full-scrub cancellation: replace the server-side `cancel_requested`
  flag with a local `AbortController` or simple boolean checked between
  iterations.
- Keep the existing visual identity (palette, type, crate-header/
  index-card styling) — that's just CSS, ports over directly regardless
  of what renders it.

## Phase 4 — PWA shell

- `manifest.json`: name, icons (multiple sizes), theme colors, `display:
  standalone`.
- Service worker: cache the app shell (HTML/CSS/JS) for instant loads
  and installability. Not for offline API access — Spotify calls always
  need a live connection regardless.
- Test "Install app" flow on desktop Chrome/Edge and Android Chrome.

## Phase 5 — Platform-specific testing (do this before calling it done)

- **Desktop** (Chrome, Edge, Firefox): should be closest to today's
  experience.
- **Android**: install-to-homescreen flow, backgrounding behavior during
  a full scrub.
- **iOS Safari**: the platform most likely to surprise you — test
  specifically whether a full-library scrub survives backgrounding the
  tab, or whether iOS throttles/kills it. This determines whether you
  need to add explicit user-facing guidance ("keep this tab active
  during a full scrub on iPhone") or lean harder on the checkpoint/resume
  design from Phase 0.

## Phase 6 — Packaging (optional, do only if store presence matters)

- **Android**: wrap with Capacitor for a real Play Store APK — thin
  native shell around the same JS, not a separate codebase.
- **Windows**: PWABuilder or Tauri if you want a Microsoft Store
  presence or a native-feeling installer; otherwise "install from
  browser" already covers Windows/Mac/Linux with zero extra work.
- Both are additive — the core PWA is fully usable without either.

## Phase 7 — Hosting & launch

- Static file hosting only (GitHub Pages, Netlify, Vercel, or Cloudflare
  Pages free tiers all sufficient — no backend means no real hosting
  cost).
- Update the Spotify app's registered Redirect URI to the real domain.
- Point the "Buy Me a Coffee"/Patreon links at the new site if pursuing
  that monetization path from here.

---

## Sequencing notes

- Build the PWA as a parallel project (e.g. a `pwa/` directory) rather
  than modifying the Flask app in place — keeps the current
  Windows/Linux desktop version working throughout the migration, and
  gives you a fallback if the rewrite hits a snag.
- Phases 1-2 (auth + logic port) are the most mechanical and lowest-risk
  — good place to start and validate the architecture works before
  investing in the full UI rebuild.
- Phase 5 (platform testing, especially iOS backgrounding) is the phase
  most likely to reveal a real design problem rather than just bugs —
  don't leave it until the very end if avoidable; spot-check iOS
  behavior as soon as a rough full-scrub flow exists, not after
  everything else is polished.
- Once the PWA reaches feature parity and has been tested across
  platforms, the Flask/desktop version can be deprecated in favor of it
  — or kept alongside as a power-user/offline-friendly option, your call.
