# Testing notes

> ## How to use this file
>
> This is a **pass plan**, not a changelog. It was rewritten on 23 Oct
> against the shipped UI, replacing 74 sections numbered by build.
> Those were written as each version went out, so they described
> screens that later changed, repeated each other, and could not be
> worked through in order — several covered features that have since
> been removed or switched off by default.
>
> **Why a manual pass exists at all.** Every significant bug this
> project has had was found by looking at a screen, not by a test. The
> empty Mixes page, the dead overflow button, the catalogue filter that
> never fired, and — most recently — a native build that installed,
> opened, and rendered nothing: all of them passed a green suite. The
> suite reads source text. It cannot see an overlapping element, a
> wrong colour, a dialog that never opens, an asset that 404s, or a
> Spotify response that differs from its documentation.
>
> 2,125 assertions pass. That means the source says what it should. It
> says nothing about whether the app works.
>
> **What counts as done.** An item is ticked when it was observed, on a
> real device, in the build being released. Not inferred from adjacent
> behaviour, not remembered from a previous version.
>
> **Order.** Onboarding, sign-in and storage gate everything else — if
> those are broken the rest cannot be reached. Native can only be done
> once a build installs. Everything else is in any order.
>
> **Highest value first**, if the whole pass cannot be done:
>
> 1. **Native apps** — the newest code and the least observed
> 2. **Per-feature blocking** — wrong scoping fails silently
> 3. **Dives — catalogue accuracy** — produces wrong *results*, not a
>    wrong-looking screen
> 4. **Backup and restore** — the only route between browsers, and all
>    that stands between a user and total data loss
> 5. **Last.fm features** — never checked against a real response
> 6. **Demo mode isolation** — a leak here publishes a real artist's
>    name in a screenshot

---

## 1. First run and onboarding

Clear site data first, or use a fresh profile. It is the only way to
see what a new user sees.

- [ ] With no Client ID stored, any route lands on onboarding rather
      than a blank screen or an error
- [ ] The four steps appear in order: create the Spotify app, paste the
      Client ID, optionally add Last.fm, connect
- [ ] Each step has one obvious primary action
- [ ] The Spotify step states the redirect URI to register, and it
      matches this install exactly
- [ ] Copying the redirect URI works, and what is copied is what is
      shown
- [ ] A malformed Client ID is rejected with a readable reason; a valid
      32-character hex ID is accepted
- [ ] "Skip for now" on the Last.fm step proceeds without a key
- [ ] No artist photographs appear anywhere in onboarding
- [ ] Reloading mid-onboarding returns to the same step, not the start
- [ ] Completing onboarding lands on Home, signed in

## 2. Connecting and signing in (web)

- [ ] Connect opens Spotify's authorisation page
- [ ] Approving returns to the app, signed in, with the auth parameters
      cleared from the URL
- [ ] Reloading after that does not re-trigger an exchange or sign out
- [ ] Denying authorisation returns a readable message, not a stall
- [ ] A tampered `state` is refused
- [ ] A token expiring mid-session refreshes without the user noticing
      — leave the app idle past the expiry, then act
- [ ] Disconnect signs out but keeps crate, history and settings
- [ ] After Disconnect the Client ID is still stored, so reconnecting
      does not mean re-onboarding

## 3. Storage and persistence

- [ ] Settings → Data and storage → Storage reports "Working"
- [ ] It reports blocked in a browser with site data disabled, and says
      so plainly rather than failing silently
- [ ] Crate, history and settings survive a reload
- [ ] They survive a browser restart
- [ ] Private/incognito either works or says storage is unavailable —
      it does not appear to work and then lose everything

## 4. Home and search

- [ ] Searching an artist returns results that match the query
- [ ] An artist with no results says so rather than showing an empty
      area
- [ ] Artwork loads for results; a missing image degrades to a
      placeholder rather than a broken icon
- [ ] Before any search, the crate note explains how suggestions appear
- [ ] Suggestions appear after a first search
- [ ] A tile's menu offers adding to crate and blocking
- [ ] The Mixes row links through to the full Mixes screen
- [ ] The support link setting adds and removes the coffee cup in the
      top bar
- [ ] The build number does **not** appear in the top bar — it lives in
      Settings → About only

## 5. Crate

- [ ] An empty crate explains how to add an artist
- [ ] Adding from search puts the artist in the crate
- [ ] Adding from a tile menu does the same
- [ ] Removing takes them out, and that survives a reload
- [ ] A crate artist can be dived directly
- [ ] "Dive one of these at random" picks from the crate

## 6. Dives — catalogue accuracy

The oldest unverified work, and the part that can produce a wrong
*answer* rather than a wrong-looking screen. Check against the
artist's actual discography, not against what looks plausible.

- [ ] A Dip returns a small sample; a Dive walks the full catalogue
- [ ] Multi-Dip runs several artists and keeps their results distinct
- [ ] Include compilations off excludes them; on includes them
- [ ] Appears-on behaves the same way
- [ ] The filter for live takes, radio edits and instrumentals removes
      those and does not remove ordinary studio tracks
- [ ] Tracks already in Liked Songs are not reported as missing
- [ ] A track liked under a different release — same recording, ISRC
      match — is not reported as missing
- [ ] An artist with one release gives the right answer; the smallest
      case is where off-by-one errors show
- [ ] An artist with a very large catalogue completes, or stops with a
      clear reason
- [ ] Counts shown match the number of rows actually listed

## 7. Dive progress, interruption and resume

- [ ] Progress shows a count reflecting real progress, and never a
      total it cannot know
- [ ] On Android, the display does not sleep while the full-screen
      progress view is open
- [ ] A browser without Screen Wake Lock shows the do-not-close warning
      instead of implying background execution
- [ ] Switching away and back recovers without restarting the dive
- [ ] Cancelling after several releases, then restarting the same
      artist with the same options, continues rather than re-fetching
- [ ] Completing a dive clears the checkpoint — starting again begins
      fresh
- [ ] After closing and reopening with saved progress, Continue resumes
      the same artist and options; Discard removes the prompt

## 8. Dive photos and the slideshow

Untouched since the first session, and the place where a photograph
can appear somewhere it is not cleared for (see Demo mode and the
landing page).

- [ ] Photos appear during a dive and change as it runs
- [ ] The slideshow works when only some photos have loaded
- [ ] An artist with no photo degrades gracefully — no broken image,
      no empty frame
- [ ] A slow photo never blocks the dive itself
- [ ] Photos do not appear on screens where they should not: onboarding
      and any staged screenshot screen
- [ ] Nothing is layered over the progress count or the controls

## 9. Per-feature blocking

If scoping is wrong here it is wrong silently. A blocked artist must
disappear from exactly the surfaces they should and remain everywhere
they should.

- [ ] Blocking from a tile menu removes the artist from suggestions
- [ ] They do not reappear after a reload
- [ ] Settings → Suggestions → Blocked artists lists them
- [ ] Unblocking restores them to suggestions
- [ ] A blocked artist can still be searched for deliberately
- [ ] A blocked artist already in the crate behaves as the UI says —
      whichever that is, it is consistent between screens
- [ ] Blocking does not alter past history entries

## 10. Mixes and recommendations

Every named block on the Mixes screen, because an empty Mixes page has
shipped before.

- [ ] Every tile on the Mixes screen opens something
- [ ] **Recommended** returns tracks, and not ones already liked
- [ ] **Suggested** likewise
- [ ] **Genres** returns tracks that plausibly match the genre
- [ ] **If you like…** names a real seed artist and returns related
      music
- [ ] **Similar artists** resolves to real artists
- [ ] **Build your own** accepts its inputs and produces a mix
- [ ] **Mix ideas** opens
- [ ] "Surprise me" returns a different selection each run
- [ ] A year mix returns only tracks added in that year
- [ ] A block with nothing to show explains itself rather than
      rendering empty
- [ ] Blocked artists do not appear in any of these

## 11. Playlists

- [ ] Building a playlist creates it in Spotify with the expected name
      and track count
- [ ] The tracks in Spotify match those shown before building
- [ ] A cover image upload succeeds, or explains that the permission
      was not granted
- [ ] Re-authorising for the upload scope does not lose the session
- [ ] Tidy up playlists finds DeepDive playlists, including ones made
      before the app kept a record
- [ ] It does not offer to remove playlists DeepDive did not create
- [ ] Removing is confirmed before anything is deleted

## 12. Last.fm features

Three of these shipped in one day and none has been checked against a
real response.

- [ ] With no key, genre mixes and popular tracks are absent and
      nothing refers to them
- [ ] Saving a key enables them without a reload
- [ ] An invalid key fails with a readable message and does not appear
      saved
- [ ] An artist's popular tracks resolve to real tracks
- [ ] A Last.fm outage degrades only the affected feature — the rest of
      the app keeps working
- [ ] The key is never shown back in full, and never leaves in a
      diagnostic blob or a backup

## 13. Backup and restore

The only route between browsers or devices, and the only protection
against clearing site data. **Needs two browsers.**

- [ ] Export produces a file
- [ ] It contains crate, history, settings and blocked artists
- [ ] It contains **no** Client ID and **no** Last.fm key
- [ ] Import into a second browser restores all of the above
- [ ] The second browser still needs its own Client ID, and says so
- [ ] A backup from a newer version is refused with a readable reason
      rather than partially applied
- [ ] A corrupt file fails cleanly and leaves existing data untouched
- [ ] Import is confirmed before it overwrites anything

## 14. Settings

### Appearance
- [ ] Light, Dark and System each apply immediately
- [ ] System follows the device, including a change made while open
- [ ] The chosen theme survives a reload
- [ ] No screen is unreadable in either theme — check empty states and
      dialogs, the ones that get missed

### Spotify
- [ ] Refresh library syncs and reports how many songs were synced
- [ ] Disconnect behaves as above

### Advanced
- [ ] Advanced is collapsed by default
- [ ] Reset pacing clears the remembered slowdown
- [ ] **Show incomplete features** is off by default
- [ ] With it off, the duplicate scan is absent from Dives
- [ ] With it on, the duplicate scan appears and runs
- [ ] The explanation of why it is unfinished is accurate about the
      request cost
- [ ] Turning it off removes it again, with no leftover entry point
      anywhere
- [ ] Test endpoints runs, reports each Spotify endpoint, and measures
      a request cost

### About
- [ ] Version matches the build being tested
- [ ] Licence reads MIT and links to the licence
- [ ] Source links to the repository
- [ ] "Open an issue" opens the issue tracker
- [ ] Copy diagnostic info copies version, browser and storage state
- [ ] The diagnostic blob contains **no** Client ID value and **no**
      Last.fm key value — only whether each is set

## 15. Demo mode and demo/live isolation

Demo mode stages screenshots. A leak here publishes a real artist's
name or photograph, so isolation is the point of the section.

- [ ] Approved artists can be searched for and added
- [ ] Removing one takes effect
- [ ] Shuffle assignments changes which approved artists appear per
      screen without changing the list
- [ ] Save artists persists the list
- [ ] **No unapproved artist appears on any staged screen** — not in
      results, suggestions, mixes, the crate or a photo
- [ ] Demo data does not leak into live screens, and live library data
      does not leak into demo screens
- [ ] Refresh library is unavailable in demo mode, and says why
- [ ] The green-screen chooser opens the Dip, Dive and Multi-Dip popups
      on solid chroma green
- [ ] Leaving demo mode restores the real library untouched
- [ ] Demo Spotify data does not persist past the session, as the note
      claims

## 16. Landing page

A separate file from the app, so an app change never updates it and it
has to be checked on its own.

- [ ] Every section renders: How far in?, Know what you missed, Mixes,
      A crate to dig through, Prepare for your show, the privacy
      section, Found a problem?, Try it out
- [ ] Every link works, including "Try it out" into the app
- [ ] "Found a problem?" reaches the issue tracker
- [ ] The licence is named
- [ ] Screenshots match the current UI — they predate the recent
      redesign unless retaken
- [ ] **Artist photography appears only inside device frames**, and
      only the artists cleared for it while permission is pending
- [ ] It reads correctly at phone width and at desktop width
- [ ] Both themes are legible

## 17. Native apps — Windows, Linux, Android

**The newest code and the least observed.** Everything here is built
by CI and has been run by a human only where ticked. An untested
platform is untested, per `RELEASES.md` Part 2.

### Installing
- [ ] Windows: the installer runs and the app launches
- [ ] Linux: the `.deb`, `.rpm` or `.AppImage` installs and launches
- [ ] Android: the APK installs
- [ ] Android: installing **over an existing DeepDive** succeeds. Until
      a stable signing key exists this will fail, because each CI run
      signs with its own debug key — if it fails, uninstall first, and
      note that signing is still outstanding

### It actually renders
This is the regression that shipped: `frontendDist` omitted the app's
scripts and fonts, so three green builds produced blank apps.

- [ ] The full interface renders, not just the header and tab bar
- [ ] Fonts are the app's own, not a system fallback
- [ ] The logo and artwork load
- [ ] The launcher icon is DeepDive's, not the default Tauri icon
- [ ] Every tab opens its screen
- [ ] No screen shows a missing-image placeholder

### Android layout — insets and keyboard
Added 23 Oct from the Android session. A webview does not get the
system insets for free, so these fail by overlapping rather than by
erroring.

- [ ] The logo and page content sit below the status icons, in both
      themes
- [ ] Bottom controls clear gesture navigation **and** three-button
      navigation
- [ ] Rotating the device keeps content clear of any cutout and of the
      navigation bar
- [ ] Opening the keyboard in setup or search keeps the focused input
      reachable, and closing it restores the content height

### Signing in
Several things in sequence, none yet observed end to end. Needs
`deepdive://callback` registered in your own Spotify app.

- [ ] Sign in opens the **system browser**, and DeepDive stays open
- [ ] Approving returns to DeepDive and Home loads
- [ ] Closing and reopening keeps the connection
- [ ] **Process death:** start a sign-in, background DeepDive, kill its
      process with ADB (not Force stop), then approve in the browser —
      the callback reopens DeepDive and connects
- [ ] Denying access shows the error, and Connect works on retry
- [ ] The same callback arriving twice does not produce a second token
      exchange or a state-mismatch screen
- [ ] It works on a device where DeepDive has never run
- [ ] Web and PWA sign-in still returns to its own HTTPS address

### Shell behaviour
- [ ] The Spotify dashboard, Last.fm, GitHub and support links all open
      **outside** DeepDive
- [ ] "Open in Spotify" on a playlist or result is handled by the
      system without replacing the DeepDive screen
- [ ] The "See what DeepDive does" link goes somewhere real
- [ ] The window resizes to its minimum without the layout breaking
- [ ] Closing and reopening preserves crate, history and settings
- [ ] Storage is separate from the web app's — a native install starts
      empty, and the only route across is a backup file

## 18. Offline and PWA

- [ ] Installing the web app as a PWA works
- [ ] Opening it offline shows something explanatory, not a browser
      error
- [ ] An action needing the network while offline fails readably
- [ ] Reconnecting recovers without a reload
- [ ] A new version replaces the cached one rather than serving stale
      files indefinitely

## 19. Quota and rate limits

- [ ] A dive hitting a burst limit slows and recovers without the user
      doing anything
- [ ] `QUOTA_EXCEEDED` is reported honestly as a quota problem, and is
      not retried into a worse one
- [ ] A scan reaching its request budget stops and says so, with what
      it found so far intact
- [ ] Nothing claims a remaining quota figure — Spotify does not report
      one

## 20. Accessibility and input

- [ ] Every screen is reachable by keyboard alone
- [ ] Focus is visible at all times
- [ ] A dialog traps focus and returns it on close
- [ ] Escape closes dialogs
- [ ] The tab bar is operable by keyboard
- [ ] Icon-only buttons have screen-reader labels
- [ ] The app is usable at 200% zoom
- [ ] Reduced-motion settings are respected

## 21. Visual conformance

Against `DESIGN.md`. A screenshot is the instrument.

- [ ] The tab bar is the floating glass pill
- [ ] No hard dividers remain
- [ ] No ALL-CAPS labels remain
- [ ] Spacing follows the 4px grid
- [ ] Nothing overlaps at phone width
- [ ] Nothing overlaps at desktop width
- [ ] Long artist and track names truncate rather than overflow
- [ ] Empty states are designed, not bare
- [ ] Loading states exist wherever a request can be slow

## 22. Attribution and licence

- [ ] The Spotify attribution note appears in Settings
- [ ] It states DeepDive is not affiliated with Spotify AB
- [ ] Artwork and metadata are credited to Spotify wherever shown
- [ ] Last.fm is credited where its data is used
- [ ] The licence is named in Settings → About and on the landing page

## 23. Release checks

- [ ] `CHANGELOG.md` covers everything in the build
- [ ] The version in About matches the tag
- [ ] No open `bug` issues block normal use
- [ ] Untested platforms ship as `-untested-<platform>` pre-releases
      with the warning in the notes (`RELEASES.md` Part 2)
- [ ] Release notes say what an unsigned build will show the user
- [ ] Every shipped zip carries only a placeholder `.env`
