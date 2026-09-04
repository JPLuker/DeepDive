# DeepDive — Roadmap

Rewritten after the 2.9 review. Two structural changes:

1. **Version numbers rolled back.** Patch-bumping every small fix pushed
   the build to 2.9, which implied concert prep was imminent when it
   isn't. Renumbered so the remaining 2.x work has room.
2. **Every release is a session.** Each is scoped to be finishable,
   testable and shippable in one sitting. Releases with several parts
   list them as separate stopping points — stop after any one and the
   app is coherent and deployable.

---

## Keeping this current

This file and `CLAUDE.md` are the project's memory between sessions —
chats end and the next one starts from the repo alone.

Update this **in the same commit as the change**: move shipped work into
"Shipped since" with its build number, record rejected ideas with the
reason they were rejected, and note anything that turned out to be
blocked or more expensive than expected. A roadmap describing plans that
already shipped, or still proposing something Joseph turned down, will
actively mislead.

---

## Versioning, going forward

- **x.0** — identity shifts. 3.0 is concert prep. Nothing else earns one.
- **x.y** — a feature someone would notice and could describe.
- **x.y.z** — fixes and refinements to the release above.

**Current state is renamed 2.4.** Published tags stay as they are —
rewriting released history causes more confusion than it solves — but
the roadmap and future builds use the corrected numbers.

**Release names** continue as songs. Next is **"Changes" by Black
Sabbath**. A retroactive renaming pass sits in 2.9.

---

## Session 1 — 2.5 "Changes" · Bugs and cleanup — **BUILT**

> **Built and pushed, not tagged.** The code is live so it can be tested,
> but no GitHub release exists. **"Changes" by Black Sabbath is the next
> tagged release** — but not soon. Joseph has deferred it deliberately:
> there is substantial work still to come, including the playlist and
> mix generation in 2.8, and he would rather cut one release covering
> all of it than tag a staging post. Do not propose cutting it; he will
> say when.
> Everything since 2.4 is commits only.
>
> Work continued past this into what is now build **2.6.2**, listed under
> "Shipped since" below.

Defects from the 2.9 review, not new ideas. Ship first so the app is
clean before anything is built on it.

**Stopping point A — bugs**
- "Never suggest" confirmation appears in Pins but not on Home
- Sampler's Preview button does nothing → remove it
- No way to remove old samplers *(ones created before playlist recording
  existed have no stored id; needs matching by name)*

**Stopping point B — trims**
- Remove "About DeepDive" from the app menu. The marketing page is the
  front door; the app needn't re-explain itself.
- Move Full Library Scan into the Settings tab, freeing a bottom-bar slot
- Move the Buy Me a Coffee link somewhere less prominent; the disable
  toggle stays in Settings

---

## Shipped since — build 2.8.1

Delivered while working through Joseph's review notes, ahead of the
sessions below:

- Settings became a real page; the nav drawer and its gear are gone
- Bottom tab bar reduced to Home and Settings, dividing evenly
- Support link moved to the topbar, still disableable
- Our own confirm dialog, replacing the browser's
- Single removals no longer confirm; bulk removal does, and a
  "Remove all" was added for playlist cleanup
- Playlist cleanup finds DeepDive playlists by name, including ones
  created before it kept records
- Service worker added — Android will not create a real installed app
  without one, which is why it was labelled "Web App"
- Proper app icons, padded for the maskable crop
- Toast messages float instead of rendering below the page fold
- Tap highlight suppressed; skeleton placeholders while suggestions load
- Playlist links open the installed Spotify client
- **The dive is full-screen** with a crossfading slideshow: every artist
  photo, then album covers as the catalogue is read, and every artist in
  turn for a sampler or library scan

**Dive photography, 2.6.6-2.7.4.** What began as "artist photos look
low-res" turned out to be five separate causes, fixed in order:
`images` is one photo at three sizes and all three were being queued;
`onArtist` had never once fired, because it was called a line above its
own `const` declaration inside a `try/catch` that swallowed the
ReferenceError; the suggestion row borrowed only the small variant from
a cache that held both; tiles were fed a 64px image for a 56px slot;
and finally the dive opened full-screen before it had anything to show,
so it filled the gap with a stretched thumbnail. It now waits behind a
spinner and opens onto a loaded photo. A blurred-backdrop treatment was
tried at 2.7.0 on the theory that 640x640 is too small for a phone —
that was wrong and was reverted, since dives from the search box had
always looked correct at exactly that size.

**Test suite recovered.** 30 of 34 suites had been dead since the app
moved under `docs/`, and three more were asserting against the
marketing page rather than the app shell. 48 assertions were running;
455 run now.

Fixed in 2.6.6: the dive's artist photo degraded to a 160px upscale
partway through, and the slideshow appeared not to run — both caused by
treating Spotify's `images` array as three photographs when it is one
photograph at three sizes. Album art is now a fallback for artists with
no photo rather than a co-star. Separately, 30 of 34 test suites had been
silently dead since the app moved under `docs/`; 430 assertions run now
against 48 before.

Also fixed after the full-screen dive shipped (2.6.3–2.6.4): rate-limit
warnings, the error view, the library scan's cancel and the sampler's
cancel had all been left pointing at elements the rewrite removed, and
the progress percentage had been dropped entirely.

**Still open from the review notes:**

- A custom playlist builder letting users choose all variables — belongs
  with 2.8's playlist work
- **Genre shuffle**: a playlist from a genre you have plenty of but
  haven't touched lately. Needs a design decision first — artist genres
  aren't on the track objects the cache stores, so this needs either a
  per-artist fetch (expensive, the pattern behind every rate limit here)
  or a genre snapshot built once and cached

---

## Session 2 — 2.6 · Search overhaul

The least-touched screen since the rewrite, and the most dated.

**Stopping point A — the dive screen** — *shipped. The dive is
full-screen, artist-led and waits for its photo before opening (2.6.x),
and the results screen was modernised in 2.8.1. Note the section-heading
restyle is shared markup, so Settings, History, Pins and scan results
moved with it — revert `.crate-header` in the stylesheet if that is
unwanted.*

**Stopping point B — catalogue accuracy** — *shipped in 2.8.0. Both
defects fixed: the toggle is split in the dive options, the presets and
the library scan, and `appears_on` releases keep only credited tracks.
`album_group` is now carried through the catalogue read, which is what
makes the distinction possible. Covered by `tests/test_catalogue.mjs`.*

**Stopping point D — sampler photo loading** *(from Joseph's notes)*
- Give the sampler the same treatment a single dive got: wait behind the
  spinner until there is a photo, rather than opening onto the loading
  field.
- **Decision needed first.** A single dive preloads one photo. A sampler
  spans 8-12 artists, and waiting for all of them is a visibly long
  spinner. Either wait for the first artist only and stream the rest in
  as they load, or wait for two or three so the rotation has something
  to move between from the outset. The first is the lighter option and
  the current recommendation, but it is Joseph's call.

**Stopping point C — foundation** — *shipped. `showDiveScreen` /
`addDiveImage` are shared, and the sampler and library scan both feed
the same rotation. Note the sampler cannot preload the way a single
dive does, since it spans many artists; it keeps the loading field.*

---

## Session 3 — 2.7 · Tile interactions

**Stopping point A**
- Hide pin and remove behind a swipe or overflow button instead of
  sitting permanently beside every tile. They currently take width on
  every row for actions used occasionally.

**Stopping point B**
- Apply the same treatment to the Pins and History rows

---

## Session 4 — 2.8 · Playlist generation, widened

"Way more playlist generation options", requested before 3.0.

**Stopping point 0 — navigation and naming** *(from Joseph's notes)*
- Home becomes a summary rather than the full surface
- A **Dives** destination giving the complete view of dive features
- **Playlists** are renamed **Mixes**, with the sampler living under them

Deliberately first in this session rather than its own: it renames and
reorganises the exact screens the rest of the session widens, and doing
it afterwards would mean touching all of them twice.

**Stopping point A — more sources**
- Card types beyond the current fifteen
- Combined filters (decade + length, artist + era)

**Stopping point B — cleanup tooling**
- Playlist cleanup in Settings: find and mass-remove DeepDive-created
  playlists, including ones predating playlist recording

**Stopping point C — mini dive**
- An hour-long playlist from one artist: the shape most people actually
  want, rather than everything they've never heard. Uses the existing
  length tooling with a duration target rather than a track count.

**Stopping point D — custom cover art** *(gated)*
- Composite the artist photo with a DeepDive overlay, upload as the
  playlist cover

⚠️ **Gate before C:** needs the `ugc-image-upload` scope — a reconnect
for every existing user — and canvas export from Spotify's image CDN,
which fails if that CDN doesn't send CORS headers. Test in a throwaway
page first. Same discipline as the setlist.fm check, and just as cheap.

---

## Session 5 — 2.9 · Presentation

**Stopping point A — marketing page overhaul**
- The treatment the app got: artwork-led, tiles, gradient cards, with
  stats.fm as the reference

**Stopping point B — screenshots**
- Use demo mode to produce a clean screenshot per advertised feature
- Place them on the marketing page

**Stopping point C — housekeeping**
- Rename existing GitHub releases to match the song-title convention

---

## Session 6 — 3.0 · Concert prep

⚠️ **Prerequisite — setlist.fm CORS check.** Still never run. If
setlist.fm doesn't send permissive CORS headers, a browser-only app
can't call them at all and the whole 3.x design needs rethinking.

Then 3.0 foundation (top-tracks, no extra keys), 3.1 real setlists,
3.2 edge cases, 3.3 library-aware layer, 3.4 Last.fm ranking, and
3.5 festival mode — **"Mitch X Presents Sucks"** — with the per-artist
song count slider.

---

## 4.x — Dashboard

Library overview, dive history promoted, Last.fm extended features, and
the concert discovery investigation.

---

## Under investigation

- **"Fans also like"** — Spotify's related-artists endpoint was among the
  things restricted in the Feb 2026 changes, so the obvious route is
  likely closed; worth a five-minute check before assuming. If it is
  gone, Last.fm's `artist.getSimilar` gives the same thing with match
  scores, and Deezer's related-artists needs no auth at all. Both are
  already noted for the 4.x dashboard, so this may simply arrive with
  that work rather than needing its own slot.

---

## Rejected, with reasons

- **"What's new since I last dove"** — only useful proactively, which
  means one request per artist across the dived list: the exact pattern
  behind every rate limit here. Tied to a manual dive it's pointless,
  since the dive surfaces the new tracks anyway.
- **Venue event listings** — the official Bandsintown API is
  artist-scoped with no venue endpoint, and its terms are for artists and
  their representatives. A library-intersection version was considered
  and rejected: it only surfaces artists you already know, which misses
  the point of following a venue.
- **A hosted, multi-user DeepDive** — scoped in detail, set aside.
- **Popularity sorting** — the field was removed in Feb 2026.
- **Shareable links** — needs a backend.

---

## Standing risks

- Spotify has broken things twice with API changes. Assume it will again.
- IndexedDB isn't permanent and privacy browsers may block it outright.
  The cache must always be rebuildable.
- Per-artist request patterns cause every rate limit. Anything scanning
  broadly needs pacing designed in from the start.
- Storage is per-browser; export/import mitigates, it doesn't fix.
