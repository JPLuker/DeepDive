# THINGS-LEARNED.md — DeepDive

> **What this is:** the lessons this project taught about *how to build software*: planning, structure, testing, shipping, and working with Joseph. Not a bug list. When the project wraps up, these get harvested into [`LESSONS.md`](https://github.com/JPLuker/InternalDesignGuidelines/blob/main/LESSONS.md) in InternalDesignGuidelines, so every future project starts smarter.
>
> **How to use it:** see "Rules for agents" at the bottom. Copied from `templates/THINGS-LEARNED.md` in InternalDesignGuidelines.

---

## Entries

Newest first. Copy the block below for each new lesson.

<!--
### YYYY-MM-DD · <short title, a few words>
- **What happened:** what went wrong (or right), with the version and file if it helps. Two or three lines.
- **Lesson:** one sentence, written so it makes sense outside this project.
- **Applies to:** this project only | every project
- **What we changed:** the test, rule, doc or code change that keeps it from happening again (or "nothing yet").
- **Harvested:** no
-->

### 2026-11-15 · A mocked API is the camera when the real one is out of reach
- **What happened:** the sandbox can't reach Spotify, so the `?demo=` screens render error cards and a new feature (Refresh dive playlists, 2.9.146) had no way to be seen. A Playwright script with fake tokens in localStorage and `page.route` answering `api.spotify.com` drove the real screens with real data flow, and printed every DELETE body so the API calls could be checked too.
- **Lesson:** when a flow needs a remote service the build environment can't reach, mock the service at the network layer and drive the real app, rather than staging a fake screen.
- **Applies to:** every project
- **What we changed:** `tools/e2e-refresh.mjs`; pointer in `CLAUDE.md`.
- **Harvested:** no

### 2026-11-15 · Release notes written into the publish script go stale
- **What happened:** `tools/publish-android.sh` carried notes written for 2.9.143. The 2.9.145 APK shipped with them, and the in-app updater showed them as what's new. The script also uploaded with `--clobber`, so a published APK could be replaced under the same number.
- **Lesson:** generate release notes from the changelog at publish time, refuse to publish a version with no entry, and never overwrite a published artifact (CODING 10.4, 10.5).
- **Applies to:** every project
- **What we changed:** `tools/release-notes.mjs`, `tools/version-guard.sh` (runs first in CI; only a 404 counts as "unpublished"), `test_release_notes.mjs`.
- **Harvested:** no

### 2026-11-15 · A class with no rule is invisible in one theme
- **What happened:** 2.9.143 gave the backup buttons `btn-secondary`, which had no CSS. The base `.btn` sets no colour, so the text was the browser's black: fine in light mode, 1.18:1 in dark. Source tests passed for two builds; `tools/review.mjs` found it in its first run of the session.
- **Lesson:** run the measured design check every session, and check that every modifier class used in markup has a rule (L-3).
- **Applies to:** every project
- **What we changed:** `test_button_classes.mjs`.
- **Harvested:** no

### 2026-11-15 · Two progress reports in a row: the second one wins
- **What happened:** the dive's catalogue callback set the bar to the stage's progress, then called a helper that set it again to the stage's *start*. Joseph saw the bar sit at 25% for the whole catalogue read and jump to 75% (#19). It had been like that for months, in the app and the notification.
- **Lesson:** a progress test records the whole sequence of values reported and asserts it never goes backwards, rather than checking the final value.
- **Applies to:** every project
- **What we changed:** one call per tick in `search.js`; `test_progress_redux.mjs` checks the sequence.
- **Harvested:** no

### 2026-11-15 · Work inside a visible job is part of that job
- **What happened:** the Liked Songs sync inside a dive registered its own Android notification job, so the notification said "2 jobs" and its collapsed bar flipped between two percentages (#19).
- **Lesson:** nested work joins the job the person started instead of registering a second one; only work with nothing running owns its own.
- **Applies to:** every project with background jobs or notifications
- **What we changed:** `withBackgroundWork(..., { join: true })`.
- **Harvested:** no

### 2026-11-15 · Android holds foreground-service notifications back ten seconds
- **What happened:** a short job (a Dip) never showed its notification. Android 12+ defers the notification of a new foreground service by up to ten seconds unless it asks for immediate display.
- **Lesson:** on Android 12+, set `FOREGROUND_SERVICE_IMMEDIATE` on progress notifications people expect to see (L-32).
- **Applies to:** every Android project
- **What we changed:** `MainActivity.kt`. Not yet confirmed on a device.
- **Harvested:** no

### 2026-11-15 · A name is a label, not an identity
- **What happened:** picking "idk" from the search list made a dip for "Artist Unknown" (#18). Every dive entry point passed only the name, the dive searched Spotify again, and the lookup took the top result when nothing matched exactly.
- **Lesson:** when the person picked a specific thing, carry its id, not its name; when a lookup falls back to "closest", say so on screen (CODING 3.3).
- **Applies to:** every project
- **What we changed:** `startSearch(name, { artist | id })`, `findArtist` flags `closestMatch`, `test_artist_identity.mjs` fails on any new bare-name entry point.
- **Harvested:** no

### 2026-11-15 · `Closes #N` closes a fix nobody has confirmed
- **What happened:** the #18 commit said `Closes #N`, but the bug couldn't be reproduced from here. GitHub closed it on push, against WORKFLOW.md 1.1, and it had to be reopened by hand.
- **Lesson:** only put a closing keyword in a commit when the fix is proven; otherwise comment "possibly fixed" and leave the issue open.
- **Applies to:** every project
- **What we changed:** note in `CLAUDE.md` "Working with Joseph".
- **Harvested:** no

### Earlier lessons, already in LESSONS.md

Harvested on 2026-11-11 at 2.9.143 from `CLAUDE.md` (bitten list, deliberate decisions, working notes): L-1 to L-4, L-6, L-8 to L-10, L-12, L-13, L-15, L-16, L-18, L-23 and more. `CLAUDE.md` "Things that have bitten" keeps the full stories.

---

## Rules for agents

**What counts as a lesson.** Something that would change how you build the *next* project. Things that went *right* and should be copied count too.

**What doesn't.** One-off bugs, API quirks only this project hits, and routine changes. Those go in the changelog, `CLAUDE.md` "Things that have bitten", or `API_SURFACE.md`.

**Before you write one,** check whether [`CODING.md`](https://github.com/JPLuker/InternalDesignGuidelines/blob/main/CODING.md) already teaches it. If it does, the entry is one line plus the lesson number.

**When to add an entry:** in the same commit as the work that taught it, and at the end of every session ("did anything today change how I'd build the next project?").

**Harvesting into LESSONS.md:** at 3.0, maintenance mode, or retirement, or early for anything serious. If you can push to InternalDesignGuidelines, add them to `LESSONS.md`; if not, open an issue there titled `Lessons from DeepDive (v<version>)`. Then set each entry's **Harvested** line to `L-<number> (<date>)` or `issue #<n> (<date>)`. Keep this file after harvesting.
