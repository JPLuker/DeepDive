# CLAUDE.md — notes for whoever picks this up next

Written for a future session with no memory of this one. Read this
before touching anything.

**Last updated at build 2.9.1.** If the build in `js/app.js` is well
ahead of that, treat this file with suspicion and verify against the
code — then bring it up to date.

---

## Keep these two files current — this is part of the work

**`CLAUDE.md` (this file) and `ROADMAP.md` are the only memory this
project has between sessions.** Chats end, sandboxes reset, and the next
Claude starts from nothing but the repo. A stale handover is worse than
none, because it will be trusted.

Update them **as part of the change**, in the same commit, not as a
tidy-up afterwards:

- **Shipped something?** Move it out of the roadmap's upcoming sessions
  and into "Shipped since", with the build number.
- **Joseph rejected an idea, or one turned out to be unworkable?** Put it
  under "Rejected, with reasons" — with the reason. The reason is the
  valuable part; without it the idea gets reproposed.
- **Hit a failure worth not repeating?** Add it to "Things that have
  bitten". Every entry there cost real time; each one earned its place.
- **Learned something about Spotify's API behaving differently to its
  documentation?** Record it under the API section. That knowledge is
  expensive to reacquire.
- **Made a deliberate decision that looks arbitrary from outside?** Add
  it to "Deliberate decisions worth not reversing", so it isn't undone by
  someone assuming it was an oversight.
- **Changed the version or release plan?** Update both files.

Before finishing a session, re-read both and check they still describe
reality. If something here contradicts the code, the code is right and
this file needs fixing.

---

## What DeepDive is

A client-side web app that reconciles an artist's Spotify catalogue
against your Liked Songs. Its original purpose: you liked the album cut
of a song, the same recording later appeared on an EP, and Spotify shows
it to you as if it were new. DeepDive finds those, using ISRC with a
fuzzy title/duration fallback.

It has since grown playlist generation, a sampler, pins, history and undo.

- **Live:** `https://jpluker.github.io/DeepDive/` (marketing page)
- **App:** `https://jpluker.github.io/DeepDive/app/`
- **Repo:** `github.com/JPLuker/DeepDive`, served from `docs/`

**No backend, ever.** PKCE auth, everything in the browser, storage is
localStorage and IndexedDB. This is a deliberate constraint, not a
limitation waiting to be fixed. A hosted version was scoped in detail and
rejected.

---

## Working with Joseph

**Ideas go in the roadmap; bugs get fixed now.** When Joseph describes
something broken, fix it in the moment. When he describes something he
wants, the job is to find the right place for it in `ROADMAP.md` and
write it there — including any decision it depends on — rather than
building it immediately or asking what to do with it. He often sends a
batch of notes mixing both; sort them and say which went where.

- Correct him when he's wrong, kindly. He'll do the same, and he's
  usually right — several of the worst bugs here were found because he
  pushed back on an explanation of mine that didn't hold.
- Give instructions one step at a time.
- He handles all testing on real devices and manages his own tokens. Do
  not lecture him about token hygiene; he's asked for that explicitly.
- He pushes via personal access tokens he pastes in. **Verify the push
  landed** — compare `HEAD` against `origin/main` — because a failed
  auth still prints success if you echo on the wrong condition. That has
  happened.

---

## How the code is laid out

```
docs/
  index.html          marketing page — standalone, loads no app JS
  app/index.html      the app shell (derived; see regen-app.sh)
  app/manifest.json   PWA manifest — required for real installation
  app/sw.js           service worker, deliberately network-first
  js/app.js           all UI, views, and wiring (large)
  js/auth.js          PKCE
  js/spotify.js       API layer: retry, adaptive pacing, error shaping
  js/search.js        runSearch / runFullScrub orchestration
  js/matching.js      ISRC + fuzzy duplicate detection
  js/library-cache.js incremental Liked Songs cache
  js/insights.js      cache-derived suggestions and playlist cards
  js/history.js       dives, undoable actions, export/import
  js/storage.js       IndexedDB with a memory fallback
  js/watchlist.js     pins and blocklist
tests/run.sh          runs everything
regen-app.sh          rebuilds app/index.html's <head> from index.html
```

**`regen-app.sh` matters.** `app/index.html` shares `index.html`'s head
with asset paths climbing one level. Editing one without running it has
already broken the font once and would have shipped a redesign to only
half the site.

---

## Untested work

`TESTING.md` lists everything shipped but never run against a real
account. The quota locked during the 2.6.6-2.8.0 session, so all of it
is unverified. Keep that file current: add to it when shipping
something Joseph hasn't been able to test, and clear items once he
confirms them.

## Before you push

```bash
./tests/run.sh
```

430 assertions, 34 suites, plus a syntax check and a boot check. It takes
seconds.

**A suite reporting "(no output)" is not a passing suite.** The runner
scores those as absent, not failed, so the summary line can read
reassuringly while most of the suite never executes. This happened for
real: when the app moved under `docs/`, 30 of 34 suites kept reading the
old paths, errored on import, and printed nothing — the runner reported
"48 passed, 0 failed" for months while the safety net was disconnected.
If the assertion total drops sharply, something has silently stopped
running. Check the total, not just the failure count.

**Read every failure before pushing, not after.** I pushed past failures
three times in one session; twice they were stale assertions, and once
they were pointing at real dead code operating on elements that no longer
existed.

**When a test fails, decide honestly which is wrong.** Many of these
assertions pin exact strings and legitimately go stale when a design
changes deliberately. Update those with a comment saying what superseded
them. But check the code first — sometimes the test is right.

---

## Things that have bitten, repeatedly

**A protection that only engages after the damage.** The rate-limit
throttle started at zero and rose only after a 429, so every session
took a penalty before slowing down — the outcome its own comment said
it existed to avoid. It looked fine for months because a learned value
persisted across sessions and protected later dives by accident. Adding
decay removed the accident and the original bug reappeared.

*When something adaptive looks like it works, check whether it works or
whether stale state is covering for it.*

**A guard that swallows the error it was written to survive.** The dive
screen's `onArtist(artist)` sat one line above `const artist = await
client.findArtist(...)`, wrapped in `try { } catch (e) {}` so that a
display callback could never fail a search. `const` is in the temporal
dead zone until its declaration executes, so it threw a ReferenceError
on every dive — and the guard hid it completely. The callback had never
once fired, through several releases that built features on top of it.
Two rounds of photo fixes were made to code that was unreachable.

*A bare `catch (e) {}` around a callback is a place a bug can live
forever. If a guard is genuinely needed, log inside it.*

**Regex edits that over-match.** A pattern meant to delete one block
silently removed `loadPlaylistCards`, `renderCardRow` and a template's
closing backtick, because the target's `</div>` wasn't followed by a
newline and the non-greedy match ran on 2,758 characters. Another removed
`demoArtists` while its call site remained, which broke the entire
suggestion row for five releases.

*Do bounded deletions and assert the size of what you're removing.*
`tests/test_defined.mjs` exists solely to catch this — it checks that
every startup helper is actually defined, which `node --check` cannot,
because a deleted function with a live call site is still valid syntax.

**Edits applying twice.** Scripts that fail an assertion *after* writing
leave partial state. Duplicate `openSampler`, `renderSamplerIntro` and
`runSampler` declarations once stopped the module loading entirely. If an
edit script errors, re-read the file rather than re-running it.

**Code left pointing at removed elements.** When the dive became
full-screen, four functions kept operating on the old progress card's
elements. `renderProgressError` rendered nothing, so a failed dive showed
a blank screen; the library scan threw on a null reference at its first
line; rate-limit warnings went nowhere, so a dive appeared to freeze for
up to ninety seconds in silence; and the sampler's cancel stopped setting
the flag its loop checks, so cancelling left it running invisibly.

*`tests/test_defined.mjs` now audits every `getElementById` target
against the markup.* Run it after any redesign.

**Guessing instead of instrumenting.** I spent five releases on a missing
artist photo, offering four wrong explanations — Spotify dropped the
field, the cache missed, the artist had no photo, Brave blocked it. The
actual cause was `z-index: -1` on an element inside the page, painting it
behind the body's opaque background. I had added logging specifically to
settle it and never once read the output.

*If two explanations have failed, stop theorising and get data.*

---

## Spotify's API, as it actually behaves

The February 2026 changes were substantial and are not all documented
where you'd expect:

- Batch `?ids=` endpoints return 403 for Dev Mode apps
- `artist.popularity` is gone
- `artists/{id}/albums` limit dropped from 50 to 10
- `artists/{id}/top-tracks` is refused — the sampler falls back to a
  scoped track search
- `market=from_token` is deprecated and fails the request outright
- Library writes are `PUT /me/library?uris=`, 40 at a time

**640x640 is the ceiling for an artist photo**, and it is enough. A
full-bleed dive at that size looks right on a phone — this was doubted,
"fixed" with a blurred backdrop in 2.7.0, and reverted in 2.7.1. If one
entry point looks correct and another does not, the size is not the
variable; find what differs between the two paths instead.

**Batch `?ids=` really is gone — retested 4 Sept 2026.** With a fresh
client-credentials token, `GET /v1/albums?ids=a,b` returned **403**
while `GET /v1/albums/a` returned **200** seconds later. So one request
per release is the floor for a catalogue read, and there is no batching
route back. Don't re-open this without a new test; do re-test if
Spotify announces changes, because it is the single biggest lever on
dive speed.

Note the current public rate-limit docs still describe Get Multiple
Albums as a batching option. They are describing Extended Quota
behaviour; Dev Mode apps get 403. The docs are not a reliable guide to
what this app can do.

**An `images` array is one image at three sizes, not three images.**
Widest first: 640, 320, 160. This reads like a gallery and isn't one.
Treating it as one gave the dive a "slideshow" that crossfaded between
identical frames and upscaled the 160px copy across a whole phone
screen. Always take `images[0]`. It also means a single artist supplies
exactly one photo — a solo dive cannot rotate through several without
spending a request per extra artist, which is the pattern behind every
rate limit here.

**Spotify publishes no remaining-quota header** — no
`X-RateLimit-Remaining`, nothing. The only signal is `Retry-After` on a
429, which means the app cannot predict a limit, only remember one it has
been told about. It stores the expiry and refuses to start dives, scans
or samplers until it passes, since every request would fail on the first
call.

**Rate limiting is the recurring failure mode.** One request per release,
no batching, so a prolific artist is hundreds of requests. `spotify.js`
paces itself adaptively and persists what it learned. A `Retry-After` far
beyond a sane wait means a sustained penalty — hours — and the app now
says so plainly rather than retrying into a wall.

**The worst bug in the project's history:** the library cache compared
its own size against Spotify's `total`, but `total` counts entries that
come back with a null track. One unavailable song meant the checksum
could never balance, so every single search re-read the entire library.
It looked like rate limiting for two days.

---

## Design direction

Modernised in 2.8–2.9 against Spotify and stats.fm as references.

- **Artwork leads.** Tiles are 56px album art flush to the edge, two
  across. Suggestions carry a reason line — "1 song liked", "last added
  2019" — because an unexplained recommendation is clutter.
- **Fills, not outlines.** Heavy borders are the strongest "this is a web
  page" signal. Cards and fields are filled surfaces; the accent shows
  focus.
- **Near-black base** (`#0B0C0F`), with cards stepped above it. Pure
  black reads as an OLED test card and leaves nothing to float on.
- **Bottom tab bar** on mobile — Home and Settings. Two for now; more as
  features earn a slot. There is no drawer any more.
- **The dive is full-screen**, with a crossfading slideshow of artist
  photos and album covers, and the status along the bottom.

---

## Deliberate decisions worth not reversing

- **Nothing is created without confirmation.** Playlist cards are offers.
- **Undo covers likes only.** Deleting a playlist someone may have
  edited or shared is destructive in a way unliking isn't. Playlist
  removal exists but is a separate, explicit action.
- **Single removals don't confirm; bulk ones do.** Removing one playlist
  is a click to redo. Removing thirty is not.
- **The service worker is network-first.** Cache-first is faster and is
  how you serve someone a stale `app.js` forever. Given how often this
  ships, arriving at the current version matters more.
- **Import merges by default.** Arriving on a device that already has
  pins must not silently discard them.
- **Suggestions are session-stable; playlist cards rotate per load.**
  You should be able to return to an artist you spotted, but seeing the
  same six playlist ideas forever is the bigger risk.

---

## Where things stand

See `ROADMAP.md`. In short: 2.5 "Changes" is built and pushed but **not
tagged as a release** — that's the next release, cut from this work once
Joseph has tested it. Everything since is commits only.

Two gates neither of which has been run, both cheap, both blocking real
work:

1. **setlist.fm CORS** — blocks all of 3.x. A browser-only app cannot
   call an API that refuses cross-origin requests, whoever owns the key.
2. **Canvas export from Spotify's image CDN** — blocks custom playlist
   cover art, which also needs the `ugc-image-upload` scope and so a
   reconnect.

Given how the appeared-on and top-tracks endpoints turned out, test both
before designing around them.
