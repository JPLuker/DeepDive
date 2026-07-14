# DeepDive — Project Context for Claude

This document exists so a fresh Claude chat has full context on DeepDive
without the user needing to re-explain history, decisions, or workflow.
Paste this into Project Knowledge in claude.ai.

---

## What DeepDive is

A self-hosted, single-user Python/Flask tool that reconciles a Spotify
account's Liked Songs against artist catalogs. Core value: Spotify
doesn't tell you when you've liked the album cut of a song but missed
the standalone single/EP version of the *same recording* — DeepDive
finds those cross-release duplicates (primarily via ISRC matching, with
a fuzzy title/duration fallback), lets the user confirm which to like,
and builds a playlist of tracks not yet liked at all.

Repo: **https://github.com/JPLuker/DeepDive**
Current version: **v1.6.0** (see `CHANGELOG.md` in the repo for full
version history).

---

## Architecture

Flask app, server-rendered Jinja templates, no JS framework — vanilla
JS only where needed (progress polling, popup auth, toggle behavior).

**Core files:**
- `app.py` — all routes, background job orchestration, Spotify OAuth
  (Authorization Code flow, not PKCE — this app has a Client Secret
  since it's a confidential/server-side app).
- `matching.py` — the actual duplicate-detection logic. ISRC primary
  signal, fuzzy title+duration+artist fallback. Also houses the
  optional exclusion filters (live, censored/radio-edit, instrumental,
  a cappella) and the remaster-matching toggle.
- `spotify_client.py` — thin wrapper around `spotipy`, including a
  `_call()` retry-with-backoff wrapper (20s timeout, 4 attempts,
  retries on timeout/connection-error/429/5xx, does NOT retry on
  non-transient errors like 400/401).
- `progress.py` — in-memory job/progress tracker for background
  threads (search jobs, full-library scrub). Supports cancellation.
- `templates/` — Jinja templates. `base.html` holds all shared CSS
  (custom "crate-digging / liner notes" visual identity — plum/gold/
  teal palette, Fraunces+Inter+IBM Plex Mono fonts).
- `run.sh` — launcher script (first run sets up venv + deps, every run
  after just starts the app and opens the browser).

**No database, no Redis, no task queue** — `RESULTS_CACHE` and the jobs
dict in `progress.py` are plain in-memory Python dicts. This is
intentional and correct for the current single-user, locally-run model
— do not "fix" this into a real datastore unless the hosting/multi-user
architecture conversation below is being actively revisited.

---

## Key design decisions (read before suggesting changes)

1. **Users provide their own Spotify Client ID/Secret**, entered via an
   in-browser setup page (writes to `.env` via `python-dotenv`'s
   `set_key()`), not hardcoded or shared. This is deliberate: it means
   each user's own Spotify app only ever has one user (themselves), so
   nobody ever approaches Spotify's 25-user Development Mode cap. This
   is *why* DeepDive can be distributed as standalone software with zero
   hosting cost and zero dependency on Spotify's Extended Quota approval
   process. Do not suggest baking in a shared Client ID/Secret without
   flagging that this reintroduces the quota problem.
2. **No backend hosting, by choice.** A full "make this a public
   website" path was scoped out in detail (multi-user data model, real
   job queue, hosting costs ~$25-100+/mo, Spotify Extended Quota
   approval, legal/privacy policy requirements) and explicitly set
   aside in favor of staying standalone. If asked to revisit "make this
   public," start from that earlier analysis rather than re-deriving it.
3. **Monetization, if any, is donation-based** (Buy Me a Coffee /
   Patreon), not a hosted SaaS with billing. No payment integration
   exists or is planned currently.
4. **A PWA migration plan exists** (`PWA_MIGRATION_PLAN.md` in the repo)
   for a hypothetical future where DeepDive becomes a client-side
   JS app (PKCE auth, no backend at all) for one-build-for-all-platforms
   reach (desktop + Android + iOS via browser install, optionally
   wrapped with Capacitor/PWABuilder for app stores). This is a fully
   scoped plan but **not started** — still a Flask app today.
5. **Windows installer**: decided to build via Inno Setup producing a
   `.exe` (not WiX/.msi — user picked the simpler option). Build method
   was left open ("dealer's choice" — GitHub Actions auto-build on tag
   push vs. building locally on the user's own Windows machine). **Not
   yet built** — this is an open item, not completed work.
6. **Matching philosophy**: ISRC is the primary/trusted signal (shared
   across re-releases of the *same recording*, not shared across
   genuinely different recordings like remixes/live/new masters — this
   is exactly the distinction the app wants). Fuzzy fallback (title
   normalization + duration tolerance + shared artist) only applies to
   ISRC-less tracks by default. The v1.5.0 "match remasters as
   duplicates" toggle is the one deliberate exception — it opts into
   fuzzy-matching remasters specifically, since remasters often carry a
   distinct ISRC from the original despite being "the same song" to a
   listener.
7. **Exclusion filters are pre-classification drops**, not
   post-hoc hiding — excluded tracks (live/censored/instrumental/a
   cappella) never appear as either a match candidate or a new-track
   suggestion. Pattern-matching for these is deliberately conservative
   (requires parenthetical/suffix annotation, not a bare word) to avoid
   false-positiving on real song titles like "Clean" (Taylor Swift) or
   "Live Life" (Fleetwood Mac) — this was specifically tested for.

---

## Established workflow (how updates get shipped)

**Local dev/testing** happens in my (Claude's) sandbox — I write code,
run unit tests and Flask-test-client integration tests against mocked
Spotify API calls (never real network calls to Spotify from the
sandbox), then package a zip and hand it to the user via `present_files`.

**The user's local machine** (hostname `Lappy`, Ubuntu/Debian-based
Linux) has **two kinds of folders that must not be confused**:
- **Working/testing folders** — e.g. `~/Pictures/deepdive-v1.5.0/` —
  where the user actually unzips and runs a version (`./run.sh`), with
  its own `.env` (real credentials), `venv/`, `.cache-deepdive`. These
  are NOT git repos (may have a stray leftover empty `.git` from a
  zip that included one at some point — harmless but confusing, worth
  cleaning up if noticed: `rm -rf` the stray `.git`).
- **The actual git repo** — `~/Pictures/deepdive-git/` (recreated via
  `git clone` after the original `deepdive-v1.2.0-git` folder was lost
  — this is now the canonical local repo, tracking
  `https://github.com/JPLuker/DeepDive`).

**Shipping a new version** (established, repeatable pattern):
```bash
cd ~/Pictures/deepdive-git
git log --oneline --decorate   # sanity check: confirm this is really the repo
rsync -a --exclude='.git' --exclude='.env' ~/path/to/new-version/deepdive/ ./
git add .
git status --short   # MUST verify .env is NOT listed before committing — always check this explicitly with the user
git commit -m "vX.Y.Z: <short summary>"
git tag vX.Y.Z
git push
git push --tags
```

**Publishing a GitHub Release** (now uses `gh` CLI, installed and
authenticated as of this doc):
```bash
gh release create vX.Y.Z ~/path/to/deepdive-vX.Y.Z.zip \
  --title "<Descriptive Name> vX.Y.Z" \
  --notes "<summary — usually the CHANGELOG.md entry for this version>"
```
User likes releases to have a **descriptive title**, not just a bare
version number (e.g. "Full Library Scan v1.5.0", not just "v1.5.0") —
suggest one alongside the version number whenever handing off a new
build.

**Known minor inconsistency** (not urgent to fix, just documented so it
doesn't cause confusion later): the "No Censorship Build v1.3.1" GitHub
Release is tagged `v1.3.0` instead of `v1.3.1` (mismatch from when the
git history was being reconstructed after the original repo folder was
lost). Also, tags v1.4.0 and v1.5.0 point at the same commit (multiple
versions were synced into git in one batch rather than one commit per
version) — cosmetic only, does not affect functionality.

**Every zip handoff always ships with only a placeholder `.env`**
(copied fresh from `.env.example`), never real credentials — this
is a hard rule that's been verified repeatedly throughout development,
not just a one-off check.

---

## Feature summary by version (see CHANGELOG.md for full detail)

- **v1.0.0**: core matching (ISRC + fuzzy), single-artist search,
  confirm-before-like, playlist builder.
- **v1.1.0**: live progress bar (background jobs), popup-based Spotify
  auth, in-browser credential setup (no manual `.env` editing),
  playlist de-duplication on repeat runs (reuses existing playlist by
  name, skips already-present tracks).
- **v1.2.0**: fixed unstyled password field CSS, fixed aggressive 5s API
  timeout (raised to 20s + retry-with-backoff).
- **v1.3.0**: exclude-live and exclude-censored/radio-edit filters.
- **v1.3.1**: `run.sh` launcher script.
- **v1.4.0**: quick duplicate check (within existing Liked Songs, fast,
  no crawling), full library scrub (crawls every artist, slow —
  30-60+ min for large libraries, cancellable, resilient to individual
  artist failures), listening-based artist suggestions (top artists +
  recently played — required adding `user-top-read` and
  `user-read-recently-played` scopes; old tokens missing these scopes
  are auto-detected and the user is prompted to reconnect rather than
  hitting silent 403s).
- **v1.5.0**: exclude-instrumental and exclude-a-cappella filters,
  "count remasters as duplicates" toggle (off by default — see design
  decision #6 above).
- **v1.6.0**: removed **Quick duplicate check** entirely (unliking
  accidental double-likes) — it was a cleanup tool the user didn't
  want and was easy to confuse with Full library scrub (which likes
  missing versions, the opposite direction). Home page now shows only
  Full library scrub under "Scan your whole library." If a future chat
  is asked to re-add duplicate cleanup, confirm that's genuinely wanted
  first — it was deliberately removed, not just deprioritized.

---

## User preferences (from `<userPreferences>`, apply generally)

- Correct the user when they're wrong, but kindly — don't just agree.
- If asked for objective grading/criticism, give it straight, don't
  soften or hide it.
- When giving instructions, one step at a time (don't dump a long
  multi-step sequence and expect it to be followed in order without
  checking in).

---

## Open items / natural next questions in this thread

- Windows installer (Inno Setup) — scoped, not built.
- PWA migration — fully planned (`PWA_MIGRATION_PLAN.md`), not started.
- Public/hosted version — explicitly scoped and set aside in favor of
  standalone. Revisit only if the user brings it back up.
- Monetization — donation links only, not implemented yet.
