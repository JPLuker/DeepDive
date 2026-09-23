# CLAUDE.md — notes for whoever picks this up next

Written for a future session with no memory of this one. Read this
before touching anything.

**Last updated at build 2.9.87.** If the build in `js/app.js` is well
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

## Demo isolation

**Demo mode must never persist beyond a `?demo` URL.** Build 2.9.73 and
earlier stored the active demo screen in sessionStorage, so visiting a
screenshot URL once could make the ordinary `/app/` route keep using
staged data. That broke the live app in the same tab. The query parameter
is now the entire activation boundary. Do not reintroduce persistence for
demo activation; only harmless demo configuration such as the whitelist
and shuffle seed may persist.

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

**Version numbers are Joseph's call.** Claimed 2.9 twice, then 3.0 once
— that last from reading "3.0 was the new 2.9 target" as permission to
take the number, when it meant 3.0 is what the work is aiming at. When
a message mentions a version, it is far more likely to be about the
plan than a licence to bump. Ask. 2.9 marks the finished rework
and has been claimed early twice — the second time by deciding a
session's completion amounted to it. Finishing a session is not
finishing the rework. Bump patches and let him say when.

**Ideas go in the roadmap; bugs get fixed now.** When Joseph describes
something broken, fix it in the moment. When he describes something he
wants, the job is to find the right place for it in `ROADMAP.md` and
write it there — including any decision it depends on — rather than
building it immediately or asking what to do with it. He often sends a
batch of notes mixing both; sort them and say which went where.

- **A screenshot sent to show a bug is not a landing-page asset.** One
  was put on the landing page without asking. When the plan says "I'll
  ask for screenshots", ask for them.
  **2.9.76:** Joseph supplied and approved the complete nine-shot landing
  set: Home, chooser, Leisure Hour dive, Mixes top, Mix ideas, Houseghost
  results, VIAL dive, Crate and Multi-Dip. Those are now the marketing
  assets; don't substitute a debugging screenshot without asking.
- **Don't delete what you didn't create without asking.** Cutting two
  landing panels also deleted the VIAL and Houseghost photos, which are
  in deliberate use while Joseph seeks the artists' permission.
- **"Do what you think is best"** after a proposal means build the
  proposal. Report what you changed from it and why.
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

1,555 assertions, 57 suites at 2.9.84, plus a syntax check and a boot
check. It takes seconds.

**Gate the push on the suite's own result.** `run.sh ... | tail -2 &&
git push` pushes whatever the suite said, because `tail` succeeds. That
shipped a failing 2.9.45. Use this shape:

```bash
bash tests/run.sh > /tmp/t.txt 2>&1
if grep -q " 0 failed" /tmp/t.txt; then git add -A && git commit ... && git push ...
else echo "SUITE FAILED, not pushing"; fi
```

**Prove every new check fails first.** Swap in the previous version of
the file (`git show HEAD:path > path`), run the suite, restore. A check
that can't fail is decoration; several this session passed over the
exact breakage they were written for until this was done.

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

**From the 22 Sept session (2.9.42 to 2.9.58), briefly:**

- **Same specificity, later in the sheet, wins.** `.crate-sampler-actions`
  lost to `.actions`, declared further down, and the button floated in a
  32px gap. Test the rule that wins, not the rule that exists.
- **Class names collide.** A new `.show-actions` footer rule was one
  commit from restyling Home's tiles, whose open state is
  `.tile-wrap.show-actions`. Grep a new class name in the old files
  before using it.
- **A new class can trip an old guard.** `crate-sampler-row` contained
  `sampler-row`, which a test forbids as a dead style. Read the name
  the guard is actually matching.
- **A positioned element paints over an unpositioned one.** The
  chooser's photo header covered the subtitle below it until the
  subtitle was positioned too.
- **Handing a render function straight to `addEventListener`** passes
  the click event as its first argument. `renderConnect(error)` would
  have shown "Spotify said: [object PointerEvent]". Wrap it:
  `() => renderConnect()`. A test forbids the bare form.
- **A check scoped too loosely.** The first "no phone rule touches this"
  check sliced from the first `@media` to the end of the file and caught
  desktop rules. Match the media block's braces.
- **State held in the DOM resets on redraw.** The Multi-Dip length
  select was rebuilt with three hours selected every render. Keep it in
  a variable.

**Reach for the endpoint test before theorising.** Settings → Advanced
→ Diagnostics fires one request at each endpoint and reports the raw
status. A whole session went into competing explanations for "rate
limited" — stale throttle, spent quota bucket, rolling 30-second limit
— none of which could be told apart without knowing which endpoints
answer. Ten requests settle it. Run it first.

**A flag that blocks the thing that would clear it.** The remembered
rate-limit pause was written from a Retry-After and cleared only by a
successful response — while itself aborting every dive, sampler and
scan before a request went out. Nothing could disprove it. It presented
as "rate limited even though everything loads instantly", because Home
was rendering from cache and making no live call.

*Any latch that persists needs a route out that doesn't depend on the
thing it latches.*

**A protection that only engages after the damage.** The rate-limit
throttle started at zero and rose only after a 429, so every session
took a penalty before slowing down — the outcome its own comment said
it existed to avoid. It looked fine for months because a learned value
persisted across sessions and protected later dives by accident. Adding
decay removed the accident and the original bug reappeared.

*When something adaptive looks like it works, check whether it works or
whether stale state is covering for it.*

**One shape per thing, normalised at the source.** `searchArtists`
returned `{image_url, image_url_large}` and `findArtist` returned
Spotify's raw object, so what a caller got depended on which lookup had
run — and a field that exists on one shape and not the other fails
silently. Multi-Dip covers lost their photographs to it, and album art
had already been lost to the same thing (`album.images[]` versus
`album.image_url`). Fix the producer, not the call site: patching one
caller leaves the next to trip over it.

**A flag that means three things will be wrong for someone.** `simple`
meant create-a-new-playlist, keep-the-built-order, *and* cap at twenty.
The cap was the sampler's alone, and it silently trimmed Multi-Dip,
Build your own and dips — a three-hour bill became the first twenty
tracks, all by one artist. When a flag accumulates meanings, split it
before adding the next caller.

**Reusing a row shape costs more than writing one.** The Multi-Dip bill
borrowed `.watchlist-row`, which is built for a name and a single
button. With a position, an order control, a marker and a remove button
the name and the controls overlapped. A shared component is right when
the needs match; when they don't, the shared one bends until it breaks
in a way source-text tests cannot see.

**One artist search, everywhere.** `wireArtistSearch` is the component;
pass it a source and an onChoose. Any new place that searches artists
uses it rather than growing its own field — the custom mix had a
`<select>` of several hundred artists and then a datalist, and both
looked like a different feature.

**Keep element ids literal in markup.** Building them from arguments —
`id="${id}"` inside a helper — hides every one from the
`getElementById` orphan audit in `test_defined.mjs`, which is the check
that catches a handler still bound to markup that was deleted. It has
caught two real bugs in a day. A slightly more verbose call site is
worth keeping it able to see.

**Bind interaction handlers by delegation, not per render.** Several
screens repaint a section on its own — pinning an artist repaints the
pins — and anything bound with `querySelectorAll(...).forEach(addEvent
Listener)` after a full render comes back dead on those fresh nodes.
The tile overflow failed exactly this way and was patched twice before
the cause was found. Delegate from a stable parent once, as `initTabs`
already does.

**A check that passes everything is worse than no check.** The stray-
local audit counted braces from the first `{` after a function's name,
which in `openIntentModal(artistName, { force = false } = {})` is the
parameter — so it read 53 characters and passed. It had been green over
a bug it was written to catch. When adding a check, break the code on
purpose and confirm it fails.

**Two functions with similar shapes will lend each other variables.**
`applyResults` and `renderResults` both take `r` and both deal in
tracks, and a cover-art line written for one was pasted into the other
referencing `news`, which only exists in the first. Nothing caught it:
`node --check` parses fine, and source-text assertions cannot see
scope. `test_defined.mjs` now checks both handlers for stray locals.

**A mobile override will quietly undo a desktop rule.** The artist
chooser was moved to the top of the screen and nothing changed, because
a `@media` block near the end of the stylesheet pins every modal to
`flex-end`. Changing a base rule for a problem reported from a phone
means checking the mobile block too — the fix looked right in the
source and was invisible on the only device that mattered.

**A green suite is not a working app.** The assertions read source
text. They cannot see an element sitting on top of another, a dialog
that never opens, a stylesheet truncated by a stray brace, or a
response shaped differently from the documentation. Every serious bug
here was found by Joseph looking at a screen. Before 2.9, work through
`TESTING.md` deliberately rather than trusting the count.

**A skip that predates a feature will hide it.** "Don't ask again" was
added when the artist dialog only chose how deep a dive went. When Dip
became the other half of that dialog, anyone who had ticked the box got
no popup and no dip — the feature simply did not exist for them. When a
dialog gains a new purpose, re-examine every way there is of not
seeing it.

**A lazy loader that reassigns its own cache will lose concurrent
readers.** `loadCache` set `_cache` to an empty object, awaited storage,
then replaced `_cache` with a merged one. Anything that called it during
that await got the empty object and kept a reference to something that
was then thrown away. Mixes starts three renders at once, so two of
them saw an empty cache forever. Share one in-flight promise, and merge
into the existing object rather than replacing it.

**Spend the cheaper source first.** Dips read an entire catalogue to
keep an hour of it, because they were built on the dive pipeline that
already existed rather than on what the job needed. Last.fm names the
tracks for nothing and a search makes each playable — about eighteen
requests against forty to eighty — on a quota group that survives
longer. When a feature is expensive, check whether it's spending the
right currency before optimising how much it spends.

**Two sources, two opposite caching rules.** Spotify's terms forbid
retaining content beyond immediate use. Last.fm's terms *require*
caching similar-artist and chart data for at least a week. Don't carry
one assumption to the other — doing exactly that is why Last.fm data
was re-fetched on every page load for five builds.

**Any job measured in minutes gets the dive screen.** Dives, genre
fetches, recommendation fetches and Multi-Dip builds all spend hundreds
of requests over a minute or more. Reporting that through a line of
text under a form reads as stalled, which is exactly how the genre
fetch was described before 2.9.7 moved it. The rule is the shape of the
work, not which feature it belongs to.

**Check preconditions before the work, not after it.** Cover upload
tests for its scope at upload time, so a Multi-Dip spent several
catalogue reads and minutes of quota before reporting that a reconnect
was needed. Anything knowable for free at the start — granted scopes, a
present key, a warm cache — belongs at the start. Same error as the
rate-limit deadlock: a knowable state, checked too late to help.

**The library cache is only filled deliberately.** `peek()` reads it;
`getLikedTracks()` fills it, and until 2.8.45 only a dive or Settings →
Refresh library ever called that. Anything built on the cache must
handle it being absent and offer a way to fill it, not tell the user to
go somewhere that does nothing.

**`opacity:0` is not hidden.** It leaves an element in the layout and
still clickable. Tile actions hidden that way sat on top of the
overflow button that was meant to reveal them and ate every tap, and
the width they were supposed to give back was never given back. Use
`display:none`, or `pointer-events:none` where a fade is wanted.

**Never delete CSS with a line-based regex.** Removing the sampler
button's styles took out the selector line and left the declarations
and closing brace behind. Everything after that stray brace was parsed
as garbage, so rules far below it stopped applying and the mixes grid
collapsed — while the app booted normally and every suite passed.
`tests/test_css.mjs` now checks both stylesheets for balance and for
declarations outside a rule.

**A `||` fallback that makes a conditional silently never fire.** The
guest-track filter keyed off `album_group === "appears_on"`, read as
`a.album_group || a.album_type`. When the optional field was absent the
fallback produced "album", the condition was never true, and entire
records by other artists came through as the artist's own catalogue for
twenty builds. Its test passed throughout, because the test supplied
the field itself.

*Prefer a field that is always present over an optional one with a
fallback. And if a test constructs the input, check it fails when the
behaviour is removed.*

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

`LASTFM_SURFACE.md` covers the optional second source. Last.fm has no
quota, only a rate — slowing down is always a sufficient answer there,
unlike Spotify. Its errors arrive in the response body as often as in
the status code, so check both.

`API_SURFACE.md` is the audit of what we call, what we must not call,
and where we're out of line with the Developer Terms. Check it before
adding an endpoint, and re-check the schema when Spotify announces
changes — we deliberately do not mirror their docs, because a local
copy goes stale and this year proved how fast.

**Deprecated in the schema means 403 in Dev Mode.** Tested twice on
4 Sept 2026: `/albums?ids=` and `/artists/{id}/top-tracks` are both
marked `deprecated: true` in the OpenAPI schema and both returned 403
with a valid token, while their non-deprecated neighbours returned 200.
So the schema is a reliable predictor — check it at
`https://developer.spotify.com/reference/web-api/open-api-schema.yaml`
before designing anything around an endpoint, rather than discovering
it at runtime.

Everything DeepDive currently calls is non-deprecated. Already migrated
off `/playlists/{id}/tracks` and the type-specific library endpoints.

**No popularity data is available.** `artist.popularity` was removed in
February, `/artists/{id}/top-tracks` 403s, and the simplified track
objects from `albums/{id}` carry no `popularity` field. Anything
described as "most popular" needs an external source or a different
definition. This directly affects **dips**.

**Spotify's Developer Terms forbid caching content beyond immediate
use.** This rules out the album-tracklist cache that would otherwise be
the obvious fix for dive speed — tracklists never change, which is
exactly why keeping them permanently is the thing prohibited. Pacing is
the whole fix. `library-cache.js` (24h reconcile on the user's own
Liked Songs) predates this reading and is Joseph's call.

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

- **Widths are continuous, not stepped.** The measure is
  `clamp(860px, 88vw, 1440px)` and grids use `auto-fill` with a minimum
  column width, so the layout follows the window. Fixed column counts at
  breakpoints left every width in between wrong in one direction or the
  other. If JS needs a column count, it calls `columnsAtWidth()`, which
  mirrors the CSS — two copies of the rule drift.
- **Two layouts, not one that scales.** Mobile is the primary influence
  and desktop takes its structure from it: at 900px the tab bar becomes
  a fixed left rail (same markup) and the grids grow their column count.
  The content measure is bounded at 880/1080px rather than filling the
  display — both reference apps keep a readable column at width, and
  these tiles look sparse stretched wider.

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

Build **2.9.84**, all 2.9.x. **3.0 is the final release, not a next
step**, and its number is Joseph's to take. The live picture, including
what to pick up next, is the "Stopping point" section at the top of
`ROADMAP.md`.

Gates before 3.0, none done:

1. **The copy rewrite.** Joseph has a fillable PDF of ~520 strings.
   Its landing-page strings are long stale (the landing page was
   rewritten several times in 2.9.45 to 2.9.51) and onboarding was
   rebuilt in 2.9.56, so those ids no longer match. Offer short separate
   PDFs for the landing page and onboarding rather than regenerating the
   whole thing, which would renumber ids he may be partway through.
2. **A full `TESTING.md` pass** on his phone.
3. **Renaming the GitHub releases** to the song-title convention.

Settled since the older notes: setlist.fm is dropped (CORS blocks it on
two browsers). Custom playlist covers work and shipped.

## Before any release: rewrite the words

**Joseph's rule, 7 Sept.** Every string a user can read — button
labels, errors, empty states, descriptions, the landing page — gets
rewritten before a release goes out. Not proofread. Rewritten, by
someone reading it as a person rather than as its author.

This is not about correctness. The copy in this app is accurate and
still reads as machine-made, which is worse in a tool people are
trusting with their library.

**The tells, measured in this codebase rather than imagined:**

- **Em dashes.** Sixteen of them in user-facing strings at 2.8.65. It's
  the strongest single signal, and it's mine — I reach for one whenever
  a sentence has two clauses. Most should be a full stop.
- **The same message written twice, differently.** "Last.fm rejected
  the key — check it in Settings." sat alongside "Last.fm rejected the
  key. Check it in Settings." A person writing an app writes that once.
- **Explaining the reasoning in the interface.** "Crawls every artist
  you've liked. Thorough, and slow — one request per release." The user
  does not need the architecture; they need to know it takes a while.
- **Balanced pairs and triads.** "Dip for the highlights, dive for
  everything." Reads well, but three of them on one screen reads like
  a house style nobody chose.
- **Hedging that softens a plain fact.** "should", "usually", "can" in
  places where the app knows the answer.
- **Over-explaining an empty state.** Two sentences where one would do.

**The test:** read it aloud. If it sounds like a product describing
itself rather than a person telling you something, rewrite it.
