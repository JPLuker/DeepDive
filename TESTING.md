# Testing notes

> ## ⛔ Full pass required before 2.9
>
> Joseph's call, 7 Sept: most of this is believed to work from daily
> use, and the sections below were written as each build shipped rather
> than as a plan. **Nothing is to be released as 2.9 until a deliberate
> pass has been made through this file.**
>
> Not because the app looks broken — it doesn't — but because every
> significant bug this project has had was found by a screenshot rather
> than a test. The empty Mixes page, the dead overflow button, the
> missing artist popup, the catalogue filter that never fired: all of
> them passed a green suite. The assertions read source text, so they
> cannot see an overlapping element, a wrong colour, a dialog that never
> opens, or a request that returns something other than what the
> documentation describes.
>
> **A second gate, added 7 Sept:** every readable string gets rewritten
> before release so the app doesn't sound machine-written. The tells,
> counted in this codebase, are listed in `CLAUDE.md` — sixteen em
> dashes in user-facing strings, the same error phrased two ways, and
> the interface explaining its own architecture. Accurate copy that
> reads as generated is worse in a tool people trust with their library
> than in one they don't.
>
> The highest-value sections, in order:
>
> 1. **Per-feature blocking** — if scoping is wrong it is wrong silently
> 2. **Last.fm features** — three of them shipped in one day and none
>    has been checked against a real response
> 3. **Catalogue accuracy** — the oldest unverified work, and the one
>    that can produce wrong results rather than a wrong-looking screen
> 4. **Dive photos and the slideshow** — untouched since the first
>    session


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

## 4g. Results screen, second pass (2.8.4)

- [ ] `?demo=results` — artist photo full bleed at the top, name and
      three colour-coded counts beneath it
- [ ] Scrolling fades the photo out rather than holding it
- [ ] Like Songs / Create Playlist / Both stay docked at the bottom
      while the lists scroll, Back to home underneath
- [ ] The docked bar clears the mobile tab bar rather than sitting under
      it, and the last track row isn't trapped behind it

## 4h. Dive speed (2.8.4)

- [ ] **Check first:** in the browser console,
      `localStorage.deepdive_throttle_ms`. A large value means a learned
      throttle was making every dive slow, which is the suspected cause
      of "reading releases is slow now"
- [ ] Settings → Speed → Reset pacing, then run a standard dive
- [ ] Reading releases is back to being the fast part

## 4i. Rate-limit lockout (2.8.7)

**Check this first — it may be what's blocking you right now.**

- [ ] In the browser console: `localStorage.deepdive_limited_until`
- [ ] If it returns a number, that's the stale pause. Clear it with
      `localStorage.removeItem('deepdive_limited_until')` and reload
- [ ] On 2.8.7 this should self-correct: startup makes one request and
      clears the flag if Spotify answers
- [ ] The red banner now has a "Check again" button that does the same

## 4j. Desktop layout (2.8.14)

Testable in the browser with no quota — resize the window rather than
running a dive.

- [ ] At full width: Home and Settings sit in the top bar on the left,
      with the current one highlighted
- [ ] No left rail — the first attempt had one and it was wrong
- [ ] Suggestion tiles are three across around 900–1280px, four above
- [ ] Playlist cards do the same
- [ ] The wordmark lines up with the content below it, not centred on
      the whole screen
- [ ] Drag the window narrow: below 900px it should return to the phone
      layout with the bottom tab bar, no half-state in between
- [ ] `?demo=results` at desktop width — the docked buttons line up with
      the content rather than spanning the whole window
- [ ] The build tag sits beside the support link in the top bar

*Built without being rendered: Chrome won't install in the sandbox, so
this was written against the stylesheet. The rail and the docked action
bar are the two things most likely to be off.*

## 4k. Settings rework (2.8.16)

No quota needed.

- [ ] Advanced is collapsed when the page opens, and a casual read can
      stop at it
- [ ] Opening it shows Speed, Your data, Diagnostics and Credentials
- [ ] Theme and the support-link switch are together under Appearance
- [ ] "Show build number" is **off** — turning it on puts the version
      back in the top bar, turning it off removes it
- [ ] Every button still works: scan, find playlists, pins, history,
      reset pacing, export, import, refresh, disconnect, save Client ID
- [ ] The Spotify attribution line is present

*The button check matters most — the whole page was rewritten, and
although every element id was preserved, that was verified by reading
rather than by clicking.*

## 4l. Endpoint test (2.8.18)

**Run this first when anything is refused.** Settings → Advanced →
Diagnostics → Test endpoints. Ten requests, paced, read-only.

- [ ] It lists every endpoint with a tick or a status code
- [ ] The verdict line at the end says what the pattern means

What the result tells us — this is the thing a whole session of guessing
could not settle:

- **Everything refused** → an app-wide limit. If the reason says
  QUOTA_EXCEEDED it's a spent budget and only time helps; if it's a bare
  429 it's the rolling 30-second limit, so wait a minute and re-run.
- **"Artist releases" and "Album tracklist" refused while the account
  and library endpoints answer** → the budget really is per-group, and
  dives are blocked while samplers keep working.
- **Everything answers but a dive still fails** → it's request *volume*,
  not the endpoints. Pacing and asking for fewer releases are the levers.

## 6. Current batch (2.8.22–2.8.23)

Confirmed already: catalogue accuracy, sampler cancel, playlist cleanup.

- [x] **Confirmation dialog** — like or build something. The result
      should appear centred over the screen with an "Open playlist"
      button, and dismissing it should return home rather than leaving
      the results list you just acted on. *Needs quota.*
- [x] **Censored duplicates** — run a sampler and check no song appears
      twice with one version bleeped. Hard to force; worth watching for
      over a few runs rather than testing directly.
- [x] **Spotify links** — "Open playlist" and the Open buttons in
      playlist cleanup should reach the web player every time, including
      where the desktop app isn't installed. Previously these could do
      nothing at all.
- [x] **Catalogue instrumentation** — after a dive, Settings → Advanced →
      Technical details shows "Last catalogue read". Sanity-check it
      against what you saw: releases counted, how many weren't the
      artist's own, tracks dropped as uncredited.

## 7. Navigation (2.8.24)

No quota needed for most of this — it's structure.

- [x] Four destinations in the nav: Home, Dives, Mixes, Settings. On
      desktop they're in the top bar; on mobile, the bottom bar
- [ ] The current one is highlighted, and stays highlighted after
      navigating
- [x] **Home** — search field, a short row of pins and suggestions, and
      a row of mixes. "All dives" and "All mixes" links go where they say
- [ ] **Drag the window slowly from narrow to full width.** Columns
      should be added one at a time as room appears, with no jump and no
      row left half empty at any point. This is the thing that was
      wrong: fixed counts meant every width between the breakpoints was
      either cramped or sparse
- [x] **Dives** — search, every pin, full suggestions, and three rows
      under "More ways to dive". Each row should say what it does, with
      the scan carrying its own cost warning rather than one hint
      floating above all three
- [ ] All three rows must actually open something — the whole row is the
      target, not just the chevron
- [x] **Mixes** — one heading, not two, and the sampler is the first
      card in the grid
- [ ] **Sampler from Mixes** — go straight to Mixes without visiting
      Home or Dives first. The sampler card should still be there and
      still work; its pool is built from the same cached read the other
      cards use
- [ ] Launch the sampler twice — it should draw a different handful each
      time, not the same twelve
- [ ] Nothing that worked before has gone missing — searching, pinning,
      opening a mix card

## 8. Settings rebuilt (2.8.27)

No quota needed.

- [x] Grouped rows on filled surfaces — a label, a line explaining it,
      and the control on the right — rather than headings above loose
      buttons
- [ ] Theme picker and Client ID field each get their own line rather
      than being squeezed beside a label
- [ ] Scan, pins and history are **gone** from Settings — Dives owns
      them. Check they still work there
- [x] Footer credits you. GitHub goes to your **profile**, not the repo
- [x] The support-link switch actually slides when toggled, and the
      coffee cup appears and disappears from the top bar to match
- [ ] **Every control still works**, since the page was rewritten again:
      refresh library, find playlists, disconnect, theme, support-link
      switch, reset pacing, build-number switch, test endpoints, export,
      import, save Client ID
- [ ] Advanced still collapsed by default

## 9. Friction batch and API banner (2.8.31)

- [ ] Search an artist on a phone — the keyboard should close as the
      dive opens rather than sitting over it
- [ ] Same when picking a name from the autofill list
- [ ] The refresh icon in the Suggested heading gives a different set of
      artists, and does so instantly — it costs no requests
- [ ] The dice icon starts a dive on one of the artists shown
- [ ] With no artists to pick from it says so rather than doing nothing

**The banner** is hard to trigger deliberately. To force it: turn off
wifi, load Home, and the suggestion row should fail into a red banner
naming the problem with a code. "Check connection" should then clear it
once you're back online.

- [ ] Banner appears with an explanation and a code
- [ ] "Check connection" clears it when things work again
- [ ] It doesn't linger once a normal load succeeds

## 10. Tile actions (2.8.32)

- [x] On a phone, pin and remove no longer sit on every tile. A "⋯"
      button appears instead
- [x] Tapping it reveals that tile's actions; tapping another tile's
      button closes the first
- [x] Tapping anywhere else closes it
- [x] Tapping "⋯" does **not** start a dive — the tile behind it is also
      a button, so this is the thing most likely to be wrong
- [x] Tapping "⋯" actually responds. In 2.8.32 it didn't: the hidden
      buttons were still in the layout on top of it, eating the tap
- [x] With the actions hidden, the tile name has the full row width
- [x] **Pin someone, then immediately unpin them** — this is the case
      that was broken: pinning repaints the pins, and the fresh tile
      used to come back with a dead button
- [x] The overflow works the same on desktop as on a phone; there is no
      hover reveal any more

## 11. Pins, history and list rows (2.8.33)

- [x] Pins & blocked, dive history and playlist cleanup show filled rows
      rather than a bordered list
- [x] Their buttons are still visible — deliberately not hidden behind
      an overflow the way tile actions were
- [x] Section headings on those pages still read as headings after the
      colour classes were stripped

## 12. Per-feature blocking (2.8.37)

- [ ] A pinned artist's "⋯" now offers block as well as unpin
- [ ] Blocking from a tile says "won't be suggested for dives"
- [ ] Pins & blocked shows Dives and Mixes checkboxes per blocked artist
- [ ] Unticking both removes the artist from the list entirely
- [ ] An artist blocked for **dives only** still appears in mixes and
      samplers — that's the point of the split
- [ ] An artist blocked for **mixes** stops appearing in mix cards and
      samplers but can still be suggested for a dive
- [ ] Anyone blocked before this build stays blocked for both, since
      that's what it meant at the time

## 13. Expanded mixes and Build your own (2.8.38)

- [x] Mixes shows ten cards, with **Build your own** and **Sampler**
      leading the row
- [ ] Refreshing the page brings a different ten — there are ~40 now
- [ ] New types appear over a few loads: Small hours, One each, Albums
      you went deep on, Loose ends, Two names on the label, There on day
      one, Took your time, an artist retrospective, That one afternoon,
      Released in <year>, seasonal cards
- [x] **Build your own** — the artist field looks and behaves exactly
      like the search on Home and Dives
- [ ] Typing filters to artists you actually have; the ✕ clears it
- [ ] Track count is a picker with the same options as other mixes, and
      no "all"
- [ ] Order defaults to Shuffled, and "As found" is gone from every
      mix's order list
- [ ] A sampler still groups each artist together rather than shuffling
- [ ] There is no "Always create a new playlist" option; re-running a
      mix with the same name updates it rather than duplicating
- [ ] The match count updates as you change filters
- [ ] A deliberately impossible combination says so rather than building
      an empty mix
- [ ] Preview mix opens the usual dialog, and creating it works

## 14. Genre mixes (2.8.42)

Needs a Last.fm key in Settings. Spotify quota is not involved.

- [ ] With no key, Mixes shows a Genres section explaining what it
      would do, with a button through to Settings — no error
- [ ] With a key, it offers to look up your top 60 artists and says how
      long that takes
- [ ] Progress counts up, and **Stop** actually stops it
- [ ] Stopping keeps what was already found rather than discarding it
- [ ] Genre cards appear and open like any other mix
- [ ] The genres look like real genres — if you see "Seen Live",
      "Favourites" or a decade, the tag filtering has a gap
- [ ] No two cards are the same genre spelled differently
      ("Hip Hop" and "Hiphop" both appearing means normalisation missed)
- [ ] "Do the rest" picks up the remaining artists
- [ ] A deliberately wrong key says the key was rejected rather than
      grinding through every artist

## 15. Dips, recommendations, genres (2.8.42–2.8.49)

All three need a Last.fm key in Settings.

- [ ] Tapping an artist offers **Dip** and **Dive** as two clear
      choices, each explaining itself
- [ ] The gear beside Dive opens the search options; they're hidden
      until then
- [ ] The search bar's options icon still opens straight to the options,
      with no artist chosen
- [ ] Running a dip produces an hour-ish mix, best-known tracks first
- [ ] A deluxe edition doesn't put the same song in twice
- [ ] With the Last.fm key removed, a dip still builds — just ordered by
      catalogue rather than popularity
- [ ] **Recommended** leads the Mixes page and the cards open like any
      other mix
- [ ] **Genres** look like genres, with no duplicates under different
      spellings
- [ ] **Reload the app** — genres and recommendations should already be
      there rather than offering to find them again. That's the cache
      their terms require
- [ ] Leaving it a month should re-fetch; there's no way to test that
      quickly short of clearing site data

## 17. Suggestions and genres (2.8.63–2.8.64)

- [ ] Switch between Home, Dives and Mixes repeatedly — the Suggested
      row should stay put rather than reshuffling each time
- [ ] The refresh icon should still bring a different set
- [ ] **Reload the app, open Mixes** — genres should already be there.
      If it still asks, note whether the panel says how many artists it
      already knows; that number says where the fault is
- [ ] "Show all genres" reveals the subgenres buried under rock and pop
- [ ] "Worth another listen" appears in Recommended

## 16. "If you like…" (2.8.62)

- [ ] The first card in Recommended is "If you like…" and opens a
      search
- [ ] Naming an artist you own plenty of neighbours for builds a mix
- [ ] Naming an artist you own **nothing** by still works — that's the
      point
- [ ] Naming someone obscure enough that you own none of their
      neighbours says so, and names any it did find
- [ ] A nonsense name says Last.fm doesn't know them rather than
      failing silently

## 18. Multi-Dip (2.9.0–2.9.5)

- [ ] **Never run against real data** — this is the newest and most
      expensive feature in the app, tested only against synthetic
      catalogues. Start here, and start with two artists rather than a
      festival bill
- [ ] Artists share the night evenly until tagged; **More** and **Less**
      shift the balance, and pressing an active tag clears it
- [ ] Pin one artist to a few songs — they get exactly that many, and
      the others expand to keep the night its stated length

- [ ] Search an artist — the popup offers **Multi-Dip** as well as Dip
      and Dive, and choosing it opens the screen with that artist
      already on the bill
- [ ] From that popup, add a second artist and build — **both** must
      appear. Starting from the popup used to lose that artist entirely,
      and the night was built from whoever was left
- [ ] Anyone left out is named under the result rather than vanishing
- [ ] The playlist name matches what's in it — an untagged bill is
      named after everyone, and only a **More** tag produces
      "X and support"
- [ ] The summary lists tracks per artist, so you can see the split
- [ ] Dives → Multi-Dip opens the same screen empty
- [ ] Adding artists builds a bill; the last one is marked as headlining
- [ ] The arrows reorder the bill and the headliner marker follows
- [ ] Remove takes one off
- [ ] Building runs one catalogue read per artist, naming who it's on
- [ ] The result runs openers first, headliner last
- [ ] The headliner has visibly more tracks than the opener
- [ ] A three-hour night is roughly three hours
- [ ] A bill with one artist works — it's just a dip
- [ ] An artist that fails doesn't lose the others

## 19. Cover art (2.9.6)

- [ ] If your connection predates the permission, **DD-SCOPE** appears
      as a banner when you open the app — not after a job has run
- [ ] Reconnect from the banner, then create a playlist — it gets a
      cover
- [ ] "Not now" hides it for the session and it returns next time
- [ ] After that, a **newly created** playlist gets a cover built from
      its album art
- [ ] A playlist that already existed and was updated keeps its
      existing cover
- [ ] With the switch off, nothing changes and no permission is asked
      for
- [ ] Refusing the permission at Spotify's screen doesn't break
      anything — playlists still build, just without covers

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
