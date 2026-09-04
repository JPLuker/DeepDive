# What still needs testing

Everything from **2.6.6 to 2.8.0** shipped without a run against a real
Spotify account, because the quota locked partway through. This is the
list to work through once it clears.

Most of it is one session's work on a single symptom — "artist photos
look low-res" — which turned out to be five separate causes. The last
item, catalogue accuracy, is unrelated and is the one most likely to
still be wrong, since it changes *which tracks exist* rather than how
they look.

**Nothing here has been seen working end to end.** The test suite is
green at 473 assertions across 35 suites, but those assert against the
source, not against Spotify.

---

## Before starting

- [ ] Confirm the quota has actually cleared — a dive that fails
      instantly with a rate-limit banner means it hasn't
- [ ] Hard-refresh so the browser isn't holding an old `app.js`
- [ ] Check Settings shows **2.8.0**. If it doesn't, nothing below is
      being tested

---

## 1. Dive photos — the main thread of the session

The bug that started it: photos looked pixelated, and the slideshow
appeared not to run.

### 1a. Dive from the search box
- [ ] Type an artist and dive
- [ ] Spinner reading "Starting dive…" appears over the home screen
- [ ] The full screen opens **already showing the photo** — no flash of
      black, no blurry frame first
- [ ] The photo is sharp for the whole dive and never degrades

*This path was working at 2.7.1. If it's broken now, 2.7.3's rewrite of
the opening sequence is the cause.*

### 1b. Dive from a suggestion tile
- [ ] Tap a suggested artist on Home
- [ ] Identical to 1a — same spinner, same sharp photo
- [ ] Specifically: no pixelated image at any point, including several
      seconds in

*This is the path that was wrong for five straight builds. The tile's
own thumbnail used to go up while the artist was looked up, and it could
survive into the rotation. It's gone now, so 1a and 1b should be
indistinguishable.*

### 1c. Dive from a pin
- [ ] Same as 1b, from a pinned artist
- [ ] Pins created *before* this session should behave the same as new
      ones

### 1d. An artist with no photo on Spotify
- [ ] Find an obscure artist Spotify has no portrait for
- [ ] The dive still opens rather than hanging on the spinner
- [ ] It falls back to album art, and doesn't sit blank

*The preload gives up after five seconds and ignores a broken URL
specifically so this can't hang. Worth confirming it actually doesn't.*

---

## 2. The slideshow

- [ ] Run a **sampler**
- [ ] Photos rotate roughly every 4.5 seconds
- [ ] Each slide is a different artist, and each is sharp
- [ ] Run a **library scan** and confirm the same

*The sampler and scan were the paths where rotation genuinely ran, and
they were showing 160px thumbnails upscaled to full screen. They now get
the 640px original.*

Known and expected: **a single-artist dive shows one photo and holds
it.** Spotify provides one photo per artist, so there is nothing to
rotate through. Not a bug.

---

## 2b. Sampler photo loading (2.8.2)

- [ ] Start a sampler. A spinner appears first, then the screen opens
      with a photo already showing — no loading field
- [ ] The rotation moves to a second photo rather than sitting on one
- [ ] Later artists' photos join as the run goes on
- [ ] If the first artists have no photo on Spotify, the screen still
      opens rather than hanging

*The spinner now reads "Starting…", since a sampler isn't a dive.*

## 3. Sampler screen layering

- [ ] Start a sampler and let it finish
- [ ] When the results dialog opens, the page behind it is **home** —
      not the sampler intro card
- [ ] Start a sampler and **cancel** partway
- [ ] You land on home, not back on the sampler intro

*The intro renders into the page body while the dive screen is a fixed
overlay above it. Nothing cleared it, so it was underneath the whole
time and reappeared whenever the overlay came down.*

---

## 4. Catalogue accuracy — the least proven work here

This changes which tracks are in a catalogue, so errors show up as
**wrong results**, not visual glitches. Worth the most attention.

### 4a. The split toggle
- [ ] Open a dive's options. There are now **two** separate checkboxes:
      "Include compilations & greatest hits" and "Include releases they
      only guest on"
- [ ] The same two appear on the library scan screen
- [ ] There's a new "Include compilations" preset between the clean
      option and "Everything they've touched"
- [ ] The slow-option warning appears for guest spots but **not** for
      compilations alone

### 4b. Compilations alone
- [ ] Pick an artist with a greatest-hits record
- [ ] Dive with compilations on, guest spots off
- [ ] Their compilation tracks appear
- [ ] It's only marginally slower than a normal dive

### 4c. Guest spots — the real test
- [ ] Pick an artist with **many** guest credits (a rapper with a lot of
      features, or a session player)
- [ ] Dive with "Everything they've touched"
- [ ] Results contain **only tracks they're actually credited on** —
      spot-check a few against Spotify. If a whole album by someone else
      has come through, the credit filter isn't working
- [ ] Noticeably faster than it used to be at this setting

### 4d. Nothing lost
- [ ] Dive a familiar artist with everything **off**
- [ ] Compare against a dive of the same artist before this change, if
      you remember roughly what it returned
- [ ] Nothing that should be there has gone missing

*The one deliberate softness: a track with no credit list at all is kept
rather than dropped, so a missing field can't silently delete a real
recording. If anything, this errs toward keeping too much.*

---

## 4e. Results screen appearance (2.8.1)

Cosmetic, and the only part of this list not blocked on quota — but it
also hasn't been seen rendered. Chrome wouldn't install in the sandbox,
so it was designed by reading the stylesheet, not by looking at it.

- [ ] Section headings read as plain headings, not uppercase pills
- [ ] Track rows are filled blocks with album art on the left
- [ ] Tapping anywhere on a row toggles its checkbox
- [ ] The summary under the artist name is sentences, not counts
      separated by dots
- [ ] One prominent button, with the alternatives beside it as ghosts
- [ ] **Settings, History and Pins also changed** — the heading style is
      shared. Check those still look right

## 4f. Demo mode (2.8.3)

**This one needs no quota and no account** — it's the way to check
section 4e and most of section 1 without waiting.

- [ ] `…/DeepDive/app/?demo=index` lists the demo screens
- [ ] `?demo=results` shows a finished dive — this is how to judge the
      2.8.1 redesign right now
- [ ] `?demo=home`, `?demo=sampler`, `?demo=scan` each render
- [ ] None of them prompt to connect Spotify or hit the API
- [ ] "Leave demo mode" returns to the real app

## 4g. Results screen, second pass (2.9.0)

- [ ] `?demo=results` — artist photo full bleed at the top, name and
      three colour-coded counts beneath it
- [ ] Scrolling fades the photo out rather than holding it
- [ ] Like Songs / Create Playlist / Both stay docked at the bottom
      while the lists scroll, Back to home underneath
- [ ] The docked bar clears the mobile tab bar rather than sitting under
      it, and the last track row isn't trapped behind it

## 4h. Dive speed (2.9.0)

- [ ] **Check first:** in the browser console,
      `localStorage.deepdive_throttle_ms`. A large value means a learned
      throttle was making every dive slow, which is the suspected cause
      of "reading releases is slow now"
- [ ] Settings → Speed → Reset pacing, then run a standard dive
- [ ] Reading releases is back to being the fast part

## 5. Home tiles

- [ ] Suggestion and pin tiles on Home look sharp rather than blocky

*Tiles are 56px, about 168 device pixels on a 3x phone, and were being
fed a 64px album image. They now use the middle variant. You said this
one doesn't much matter — it's here for completeness.*

---

## If something's wrong

Note **which entry point** — search box, suggestion tile, pin, sampler,
scan. Nearly every bug this session turned out to differ by path rather
than by artist, and "it's pixelated" cost four builds because the path
wasn't clear. A screenshot mid-dive settles it fastest.
