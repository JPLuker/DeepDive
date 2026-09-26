Warning: truncated output (original token count: 32861)
Total output lines: 2458

# Changelog

> Entries for the 2.x rewrite were never backfilled — the history below
> stops at the Flask era. The 2.x record lives in the git log and
> `ROADMAP.md`'s "Shipped since".

## 2.9.100
- Rebuilt Full library scrub as a duplicate-only scan. It still checks
  each liked artist's releases, but now discards every genuinely new
  track and returns only alternate Spotify copies of recordings already
  in Liked Songs.
- Removed the giant-library playlist path. The sole result action likes
  the matched copies so future dives recognize them as already owned;
  those likes are recorded for Undo.
- Renamed the entry point to Duplicate scan and rewrote its setup,
  progress and results copy around that single job.

## 2.9.99
- Rewrote the app's copy in the voice Joseph set on the landing page.
  Every user-facing em dash is gone (40 strings touched), "&" is now
  "and", and the strings that explained their own reasoning say the
  thing instead: the guest-appearance warning, the rate-limit
  diagnostics, the undo and export notes, and the blocking note.
- Dip and Dive now say "their most popular tracks first" and "their
  entire discography, checked against your library", matching the
  landing page.
- The app's welcome screen now opens with the same line as the landing
  page rather than the old one.
- Labels and buttons were left alone: they were already short.

## 2.9.98
- Replaced the landing page's Crate screenshot with Joseph's updated
  capture, showing the current search, ordering, sampler and Up next UI.
- Kept the complete composition while resizing and compressing it to the
  landing page's existing 490-by-724 screenshot slot.

## 2.9.97
- Replaced the Maciann Dip/Dive chooser on the landing page with
  Joseph's new VIAL capture.
- Removed the chroma-green capture background, preserved a transparent
  rounded cutout, and resized the asset for the page without redrawing
  its photography, text or controls.

## 2.9.96
- Demo Settings now has a green-screen chooser capture: search Spotify
  for any exact artist, then open the real Dip, Dive and Multi-Dip popup
  over a flat `#00ff00` background for clean cutting.
- Closing the popup always restores the normal backdrop, and ordinary
  chooser launches explicitly clear any leftover capture state.

## 2.9.95
- Applied the landing page copy rewrite: 15 strings in Joseph's words,
  23 kept, 10 removed. The seven grey labels above the headings are
  gone, and so is the "See the Dive happen" section, which explained a
  loading screen.
- Two corrections carried into it: the page no longer says the mixes
  come from listening history (they come from the library, and play
  counts aren't available), and the title, description and link preview
  now match the new opening line.
- One card grid instead of two, since removing that section left a card
  alone in a row; the last of three now takes the full width.
- The VIAL screenshot came off the page with that section. The file
  stays and the footer still credits VIAL, because Joseph wants them
  back on the page; a test holds the file and the credit together.

## 2.9.94
- Copy rewrite: the landing page's 48 strings are decided (16
  rewritten, 22 kept, 10 removed). Recorded in
  `copy/rewrite-answers.json`; still not applied to the page.

## 2.9.93
- Started the copy rewrite in chat rather than the PDF, which was
  unworkable on a phone. Answers are recorded in
  `copy/rewrite-answers.json` as they're given, id by id. Nothing is
  applied to the app yet: the landing page changes land in one pass
  once its strings are done.

## 2.9.92
- Added `copy/strings-2.9.91.json` and `copy/extract-strings.py`: the
  488 user-facing strings behind the full copy-rewrite PDF, each with
  its id, file and line. Whoever types Joseph's rewrites back in needs
  to know which id was which line, and the PDF alone doesn't say.

## 2.9.91
- README is now the landing page in GitHub's form: the same sections in
  the same order and the same words, from "How far in?" through to
  "DeepDive cannot collect your data", then setup. No screenshots at
  all, so nothing depends on the photography hold. Tests check the
  sections are present and that no screenshot returns.

## 2.9.90
- README reworked in the landing page's voice but in GitHub's idiom:
  logo and tagline, the three depths as a table, the Mixes screen, the
  install table, licence and PWA badges, and setup with GitHub's own
  callouts. Troubleshooting and a "running it yourself" section are
  collapsed rather than cut.
- The only screenshot used is the Mixes grid, which carries no artist
  photography. The hold in `ROADMAP.md` limits artist shots to the
  landing page, and a test now fails if one appears in the README.

## 2.9.89
- Removed the Flask app from the tree: `app.py`, `matching.py`,
  `progress.py`, `spotify_client.py`, `watchlist.py`, `templates/`,
  `static/`, `run.sh` and `requirements.txt`, plus
  `PWA_MIGRATION_PLAN.md` (carried out) and `SETLISTFM_SURFACE.md`
  (setlist.fm is dropped). Nothing in `docs/` or `tests/` referenced
  any of it. The modules that say they are a port of one of those files
  keep their comments; `CLAUDE.md` says the originals are at commit
  `80d4a54` and in the v1.x tags. `regen-app.sh` stays: live tooling.
- Rewrote the README around the app as it is. It still sold the v1
  duplicate finder and never mentioned Dip, Multi-Dip, Mixes, the
  Crate, covers, history or Last.fm.
- Fixed a real error in it: the redirect address it told people to
  register was `.../DeepDive/`. The app is served from `/DeepDive/app/`
  and sends that, so anyone following the README hit "Invalid redirect
  URI" at login. It also now states Premium before the steps.

## 2.9.88
- Fixed the sampler duplicate from Joseph's 4 Sept notes: a censored
  version of a track already in the mix. The sampler builds one artist
  at a time and only guarded across artists by track id. A
  collaboration comes back for both parties, and the two copies can be
  different cuts of the same recording, with different ids and
  different ISRCs, so both went in. ISRC can't catch this, since a
  clean edit carries its own by design.
- Tracks are now compared across artists by song and artists, ignoring
  the annotations that mark a censored cut (`mixDedupeKey`). Whichever
  cut arrives first, the uncensored one is what stays, in the running
  order the first copy held.

## 2.9.87
- Recorded the full pre-3.0 checklist in `ROADMAP.md`, ordered by who
  has to do each item. No code change.

## 2.9.86
- Fixed the empty space around the chooser on the landing page. The
  capture was 490x724 but the modal only filled the middle of it: 149px
  of transparent frame above and 185px below, which the page drew as
  gaps. The file is trimmed to the modal and its shadow (450x406).
- Fixed the gap between the two rows of feature cards. They sat 70px
  apart on a phone while the cards inside them sat 14px apart, so a
  band read as two. Rows now use the same gap as the cards.
- Tests now read a PNG's real size from its header and check the page
  declares that size, so a capture's dimensions can't drift again.

## 2.9.85
- Attribution in the app, not just on the landing page. Settings now
  credits Spotify for metadata and artwork and Last.fm for tags and
  popularity, says that artwork and photographs belong to their owners,
  disclaims affiliation, and links the source and licence. Spotify's
  Developer Terms require this and the app itself had none.
- Added a LICENSE: MIT for DeepDive's own code. It states plainly that
  it covers the code only, claims nothing over content from Spotify or
  Last.fm, and does not license the artist photographs on the landing
  page, which are there pending the artists' permission.
- README has a licence and credits section.

## 2.9.84
- Reworked the landing privacy statement into a clear message rather than
  a literal sentence: DeepDive cannot collect user data because it has no
  server, database or account system.

## 2.9.83
- Replaced the landing privacy explanation with Joseph's exact statement:
  "It is impossible for Deepdive to collect any data".

## 2.9.82
- Replaced the VIAL progress capture with Joseph's corrected image.
- Reordered the landing page around the product journey: choose a depth,
  watch the Dive, review results, use Mixes and Crate, build a Multi-Dip,
  then close with the browser-only privacy explanation.

## 2.9.81
- Replaced the Dip/Dive/Multi-Dip chooser capture with Joseph's complete
  transparent 490×724 version and removed the generic screenshot frame
  around it so the modal floats cleanly on the landing page.

## 2.9.80
- Removed the stray colored side-edge pixels baked into the VIAL landing
  capture while preserving its 490×724 framing.

## 2.9.79
- Replaced seven landing captures with Joseph's final, consistently framed
  490×724 crops for Home, Dive, Mixes, results, Multi-Dip, VIAL and Crate.
  They are served as optimized JPEGs without any CSS cover cropping.

## 2.9.78
- Removed the landing page's forced cover crops. The approved captures
  were already tightly framed; preserving their natural proportions keeps
  headers, artist imagery, controls and action buttons visible.

## 2.9.77
- Tightened the landing page's feature screenshots into deliberate
  viewport crops. Mix ideas, results, Multi-Dip, VIAL and Crate now keep
  their relevant UI in frame without making paired cards inherit five
  unrelated source heights.

## 2.9.76
- Rebuilt the landing page around Joseph's final nine screenshot set.
  Home, a dive and Mixes lead the page; the artist chooser now explains
  Dip / Dive / Multi-Dip visually instead of through a text list.
- Replaced the repeated alternating-panel layout with two-up feature cards
  and a wider Multi-Dip section. Mix ideas, finished results, privacy and
  the Crate each use the screen that demonstrates that feature.
- Added the missing dedicated Multi-Dip marketing section and rewrote the
  landing regression checks around the final assets.

## 2.9.75
- Added the missing staged Dive chooser to demo mode. `?demo=chooser`
  opens the real Dip / Dive / Multi-Dip chooser over a whitelist-safe
  staged Home screen with a real approved Spotify artist and photo.
- Selecting an artist while already in demo mode now opens that chooser,
  matching the live app instead of jumping directly to fake results.
- Dip, Dive and Multi-Dip actions from the demo chooser remain staged and
  cannot fall through into live library work.

## 2.9.74
- Fixed a demo-mode isolation bug that could contaminate the live app in
  the same browser tab. Demo mode is now active only when the current URL
  explicitly contains `?demo`; it is never restored from sessionStorage.
- Loading the normal `/app/` URL clears the legacy persisted demo flag,
  so tabs affected by older builds recover automatically after refresh.
- “Leave demo mode” now removes the `demo` query parameter before
  rendering the live app.

## 2.9.73
- Corrected the mobile results treatment: the contextual result controls
  now replace/cover the app tab bar instead of moving into document flow.
  Their dock is fixed at the bottom with a higher stacking level than the
  Home/Dives/Mixes/Settings bar.
- Restored Back to home inside that contextual dock so the covered global
  navigation does not trap the user on results.

## 2.9.72
- Mobile result actions are no longer fixed above the app navigation.
  They now sit in normal document flow after the result lists, so they do
  not cover tracks while scrolling or visually stack on the tab bar.
- Removed the mobile dock backdrop, border and reserved bottom clearance;
  the regular app tab bar remains fixed and unobstructed.

## 2.9.71
- Simplified the mobile result actions. The fixed bar now contains only
  Like Songs, Create Playlist and Both; the redundant full-width “Back to
  home” row is hidden because Home is already directly beneath it in the
  tab bar.
- Reduced the mobile result-bottom clearance to match the shorter action
  bar, so it no longer reads as a large sheet covering the page/navigation.

## 2.9.70
- Demo result tracks now carry album artwork into the shared result-row
  renderer. Spotify search returns album images as `album.images[]`, while
  the real catalogue path uses `album.image_url`; demo tracks now normalize
  to that same shape instead of showing the music-note placeholder.
- Updated the demo and results UI regression checks to cover the artwork fix
  and the 2.9.68/2.9.69 result-copy changes.

## 2.9.69
- Tightened the top of dive results after the summary copy was removed.
  The first results section no longer adds its normal section margin on top
  of the results-body padding, removing the oversized blank band below the
  artist hero on phones.

## 2.9.68
- Dive results no longer repeat the hero counts in explanatory paragraphs
  before the track lists. The result goes straight from the count badges to
  “Already yours, elsewhere” or “New to you”.

## 2.9.67
- Tapping or searching an artist in demo mode now opens the staged result
  for that exact approved artist. It can no longer run a real library dive,
  which was the source of the persistent 16/16 split.
- The demo module URL is build-versioned so mobile browsers cannot combine
  a current app controller with stale demo data.
- Home's visible mix preview is now Surprise me rather than another
  artist-specific card.

## 2.9.66
- Demo results fetch and preload the selected artist's full Spotify image
  before rendering, fixing the blank gradient hero.
- The staged result is deliberately uneven and now visibly includes three
  duplicate candidates alongside seven new tracks and eleven already liked.

## 2.9.65
- Crate, Multi-Dip and Full library scan now open their staged versions
  from the demo Dives screen instead of falling through to live state.
- Demo Mixes now represents the real range of recipes: years, discovery
  timing, albums, earliest likes, random picks and regular artists rather
  than filling nearly every card with an artist name.

## 2.9.64
- Demo Settings now searches Spotify directly and saves the selected
  artist identities, so same-name artists cannot resolve to the wrong act.
- Suggestion and library refresh controls are unavailable in demo mode;
  neither can pull an unapproved artist into a staged screenshot.

## 2.9.63
- Demo mode now has an approved-artist list in Settings. Every staged
  screen draws only from that list, with assignments held steady until
  "Shuffle assignments" is pressed.
- Demo artists, photos, albums and tracks come from the connected Spotify
  account instead of placeholders. Search is staged too: it stays inside
  the approved list while retaining real Spotify presentation data.
- The demo index now covers Home, Dives, Mixes, finished results, Sampler,
  full scan, Crate, Multi-Dip and Settings.

## 2.9.62
- Recommended now reads "from across your mixes." The original "a
  little of everything" was vague and did not explain the shelf.

## 2.9.61
- Recommended is now a real top-of-page shelf: Sampler plus a changing
  selection drawn from Similar artists, Mix ideas and Genres. It uses
  data already cached on the device and starts no Last.fm fetches.
- The former Recommended section is now "Similar artists — already in
  your library," which describes what those cards actually are.
- Every Dives destination now shares the tinted-gradient card treatment.
  Multi-Dip is blue, Crate teal, history purple and the long full-library
  scan gold, so Multi-Dip no longer looks like the lone designed control.

## 2.9.60
- Reordered the Dives page around intent instead of treating every
  destination alike. Multi-Dip now sits directly below artist search as
  the featured whole-bill action, before the artist suggestion list.
- The remaining destinations now read Crate, Dive history, then Full
  library scan. The scan is separated under "Go further," placed last,
  and says plainly that it can take hours.

## 2.9.59
- With no Last.fm key, Mixes opens directly into its only available grid
  instead of spending the top of the page on a redundant section heading.
- With Last.fm connected, that section is now "Mix ideas — dates, artists
  and albums." "From your library" wrongly implied Recommended and Genres
  were not also built around the user's saved music.

## 2.9.58
- Welcome screen explains the whole setup in two short paragraphs:
  make a free Spotify app, paste its Client ID, sign in with a Premium
  account; Last.fm optional, and what it adds.
- Mix cards read from the top. Their text was pushed to the foot of the
  card, so beside a taller neighbour a card with a one-line subtitle
  opened a gap under its icon.
- Features that need Last.fm are off without a key, dimmed with the
  reason rather than hidden:
  - Dip, in the chooser. Without a key it had been quietly reading the
    whole catalogue in catalogue order, which isn't a Dip.
  - Multi-Dip, in the chooser, the Dives menu, and on its own screen.
  - Genres has no section at all without a key, since there would be
    nothing under the heading. Recommended already worked this way.

## 2.9.57
- The bottom tab bar, and the top navigation on desktop, are hidden
  during onboarding. Every tab needs a Spotify connection that doesn't
  exist yet. They come back on the first screen of the app proper.

## 2.9.56
- Onboarding rebuilt. It was the oldest part of the app: a welcome
  screen still in the v1 voice, one long setup page, and a connect
  screen describing the Flask-era app. Now it's one step per screen,
  with "Step n of 4" and a line of dots:
  - Welcome: "Hear it all.", the landing page's line, and what you'll
    need. That includes Spotify Premium, which the old setup never
    mentioned. "See what DeepDive does" links to the landing page.
  - Make a Spotify app: the redirect address with a Copy button (it
    selects the text if the clipboard isn't available), and a button to
    open the dashboard.
  - Paste your Client ID: checked as you type. A Client ID is 32
    letters and numbers; anything else is named, with its length,
    before Spotify has to reject it.
  - Add Last.fm: optional, and "Skip for now" sits beside "Save key".
  - Connect: names the "Invalid redirect URI" case before the button,
    since Spotify stops on its own page and never comes back. A refused
    login returns here with the reason instead of a passing flash.
- Removed: the pre-2.7.1 address-change note, the old welcome's feature
  cards, and the styles only they used, including their phone rules.

## 2.9.55
- Multi-Dip lengths are whole hours, one to six. The half hours are
  gone.

## 2.9.54
- Multi-Dip: the two setting dropdowns are the same width. Each was
  sized to its own options, so they came out different.
- Length of the night now runs from an hour to six hours, in eight
  steps. "Four hours, a festival day" is just "Four hours".

## 2.9.53
- Multi-Dip, visual overhaul:
  - The cover the night will get sits beside the title and redraws as
    the bill fills. It's the real cover code, split between everyone,
    named for whoever is tagged More, otherwise the first act. Under
    the title: how many artists, and how long the night is.
  - Bill rows have the artist's photo, or their initial while it loads.
    The name gets the full width, with the controls on a line beneath
    it. Less and More are one two-way control. Artists added from the
    chooser get their photo from the lookup the chooser already made,
    patched into the row without redrawing, so a drag isn't cut off.
  - The two settings are one compact card, without the explanations.
  - "Build the night" is the one full-width button. Back is a quiet
    "Back to Dives" link beneath it.
  - Shorter intro, and the search bar no longer touches the first row.
- Fixed: the length of the night reset to three hours whenever the
  page redrew, such as when adding an artist. It's now kept.
- Building a night reuses the shared artist lookup, so an artist
  started from the chooser isn't searched for twice.

## 2.9.52
- The chooser's corner button just says "Multi-Dip". With the artist's
  name it truncated on a phone, and the photo above already says who
  the bill starts with.

## 2.9.51
- The chooser offers two depths, Dip and Dive, with a two-rung gauge.
  Multi-Dip was the middle rung, which presented it as a depth when
  it's a different job: a lineup that starts with this artist. It's now
  a button bottom right, opposite Cancel, reading "Multi-Dip with
  [artist]". It shows only on the first step and only when an artist
  was searched. The Dives menu still has it.
- Subtitle is now "A few songs, or everything they've released."
- Fixed: the 2.9.50 photo fade was drawn over the top of the subtitle.
  The photo is positioned, so it painted above the subtitle, which
  wasn't. The subtitle is lifted above it.
- Landing page: "How far in" has two depths, with Multi-Dip listed
  after them without a gauge. The intro says so.

## 2.9.50
- The artist chooser shows the artist. Their photo runs across the top
  of the panel, fading into it, with their name over the fade. It fades
  in once loaded, and the space is held so nothing jumps. If there's no
  photo, the chooser looks as it did before.
- No extra cost to a dive: the chooser starts the artist lookup, and the
  dive uses the same answer instead of searching again. Cancelling the
  chooser does spend that one search.

## 2.9.49
- Landing page, Joseph's second pass:
  - The Houseghost panel now explains what a dive does: matching
    recordings, the three results, filters, liking and playlists, and
    reruns adding to the same playlist. The Dive entry under "How far
    in" is one line pointing down to it.
  - The VIAL panel is now the privacy panel: everything starts from
    your library, and it stays in your browser with no DeepDive server.
    It says plainly that requests go to Spotify and Last.fm. "Around
    it" is gone; Suggested for you is folded in here.
  - Mixes is a panel like the others, with a new screenshot of the app's
    Mixes page. Every mix feature is still named. Joseph plans to redo
    this section, so the copy is interim.
  - Panels now run: Mixes, dive, privacy, crate, alternating sides.

## 2.9.48
- Landing page, Joseph's marked-up pass:
  - Rewrote the hero line. It's about what every playlist is made of
    (the songs you missed) rather than one album-versus-single case.
  - Cut the setup note under the hero (Premium, Client ID).
  - Cut the figures band.
  - Cut four items from "Around it": blocking, covers, the library
    scan, and history and undo. Suggested for you stays.
- Removed the styles those cuts left unused. The tests now guard the
  cuts rather than the old layout.

## 2.9.47
- Landing page: restored the VIAL and Houseghost screenshots, removed
  by mistake in 2.9.45. They're in use while permission is sought. Both
  are back in their original places: Houseghost shows a finished dive,
  VIAL a dive in progress. Their panels have new copy, and the
  "Nothing without asking" item moved out of the list into the results
  panel, so nothing is said twice. Both artists are credited again.

## 2.9.46
- Fixed: the crate's sampler button floated in a 32px gap below the
  search row. Its own margin rule lost to the general `.actions` rule,
  which comes later with the same specificity. The rule now uses both
  classes. The 2.9.45 test only checked the rule existed, so it passed
  over the broken layout; it now checks the rule that wins.

## 2.9.45
- Landing page: every feature now appears once. Added Recommended,
  Suggested, blocking, the full library scan, history and undo, the dive
  filters, guest records, and playlists being added to rather than
  duplicated. The crate moved into its own panel with a screenshot.
- Cut three panels: "What you had, and what you missed" and "If you
  like them" repeated the lists above them, and "It runs on your
  machine" wasn't needed for a web app. Their screenshots are deleted.
- Fixed claims that were no longer true: mixes can't be reordered, and
  there is no in-library duplicate check. Setup now says Spotify
  Premium is required.
- Fixed: the crate's first row sat flush against the sampler button.
- Follow-up commit: 2.9.45 was pushed with one failing test. The new
  class `crate-sampler-row` tripped an old guard against a removed
  `sampler-row` style. Renamed to `crate-sampler-actions`. The push
  command had gated on `tail`'s exit status rather than the suite's;
  it now checks the suite's result before pushing.

## 2.9.44
- Changed: the crate is a list now, not a grid of square photos. Two
  artists per phone screen made a crate of 74 thirty-odd screens long.
  Each artist is a row: a small photo, their name, when you dived them,
  and the star, move-to-top and remove buttons on the right. About
  eight fit on a phone. On a wide screen the rows sit two across.

## 2.9.43
- Fixed: blocking an artist from mixes didn't keep them out of
  Recommended. "If you like Eminem" still appeared with Eminem blocked,
  because the block was only applied where the library mixes were
  built. Recommended, "Worth another listen", genres, "If you like…"
  and Build your own all read the library unfiltered.
- Every mix now reads the library through one filter. A blocked artist
  can't seed a recommendation or appear in one, including as a featured
  artist on someone else's track.
- Build your own no longer offers mix-blocked artists in its picker.

## 2.9.42
- Fixed: on a phone, the blocked artists list drew each name underneath
  its checkboxes. The mobile layout gives a row's buttons the full width
  but never let the row wrap, so the name was squeezed to nothing. Rows
  now wrap: the name on its own line, the controls below. The same rows
  are used for playlist cleanup, which had the same problem.

## 2.9.41
- Dragging a bill row is animated. The row stays under your finger from
  wherever you grabbed it, the others slide out of its way as it
  passes, and on release it drops into its slot rather than snapping.
- Honours reduced-motion settings — with those on, it reorders without
  the movement.

## 2.9.40
- Fixed, probably: dragging a Multi-Dip row did nothing on a phone. The
  row moves around the page during a drag and the handle holding the
  finger sits inside it; mobile browsers can let go of a pointer when
  its element moves, so the drag died after its first step. The drag
  now listens on the window, which never moves.
- A touch on the handle is also stopped from turning into a scroll.
  A touch the browser reads as a scroll ends the drag before it starts,
  and not every mobile browser honours the CSS that should prevent it.
- "Probably" because this couldn't be tested on a phone before it
  shipped.

## 2.9.39
- A Multi-Dip's bill can be reordered, so openers go first. Drag a row
  by its handle; the rows move under your finger as you go. The
  playlist keeps the order, since the order of the bill is the order
  of the night.
- A handle rather than arrows: the row already holds Less, More, a
  song count and remove, and arrows on every row were the crowding that
  removed reordering the first time. The arrow keys work on the handle
  for anyone not dragging.

## 2.9.38 — The Crate
- **Pins are now the Crate**, rebuilt to hold a hundred artists and stay
  usable. It reads from the top like a streaming queue: Up next leads,
  then everyone else.
- **Search** within it, and **sort** by your order, recently added, A–Z,
  or not dived yet — the last one answers "who haven't I got to".
- Each artist is a tile with their photo and one line of where you are
  with them: "not dived yet", or when you last did. Photos load as they
  scroll into view, so a hundred of them don't all fetch at once.
- **Move to the top** from any tile, which is what reordering a queue
  means day to day.
- **Sampler from your crate**: a few songs each from a random handful
  of the people you've put aside — a quick way to decide who to get to
  first.
- **Blocked artists moved to Settings.** Blocking changes what the app
  does rather than what you're listening to, so it belongs there.
- Fixed: the star on the old pins screen never worked. Its handler was
  attached to the library scrub screen instead.

## 2.9.37
- The landing page covers everything the app does. It predated
  Multi-Dip, Up next, playlist covers, the sampler and Build your own,
  and still described a dip as reading an artist's whole catalogue —
  which stopped being true when dips moved onto search.
- It's organised around depth now, the same way the artist chooser is:
  Dip, Multi-Dip and Dive, each with the chooser's gauge. Then the mixes
  cut from your library, then Up next and covers.
- The four pins Home shows when nothing is starred are shuffled, so
  the rest of your pins turn up too. They hold still between tab
  switches and change on refresh.

## 2.9.36 — Up next
- **Up next.** Star a pin to queue it, and Home shows the queue instead
  of every pin. With nothing starred, Home shows four pins so it's never
  empty. Pins were a library that had grown into a wall on Home; Up
  next is the few you actually mean to get to.
- Pins live on their own screen under Dives now rather than being
  listed inline. Each has a star.
- You can star straight from a tile on Home or in suggestions.
  Starring someone who isn't pinned pins them, since Up next is drawn
  from the pins.
- After a playlist is made for someone on Up next, DeepDive asks
  whether you're done with them — take them off, or keep them. That's
  only something you'd know, so it asks rather than guessing. An "If
  you like…" mix doesn't ask, since it isn't a playlist of that artist.

## 2.9.35
- Fixed: tapping the "If you like…" card on Home did nothing. A tapped
  card was looked up only in the main pool of library mixes, and the
  Home row's recommendation and genre come from separate generators —
  so the lookup found nothing and nothing opened.
- Mix sheets no longer offer an order. Nobody wants album order across
  forty tracks from twenty records, and Spotify reorders a playlist
  anyway. It's just how many tracks, then shuffle. The sampler keeps
  its built order, since that structure is the point of it.

## 2.9.34
- Fixed: the slow-dive warning appeared on the first step of the
  chooser, under Dip, Multi-Dip and Dive, whenever "Everything they've
  touched" was the saved mode. It belongs to the dive options and now
  only shows there.
- Removed the track preview from mix sheets. A preview of a shuffled mix
  lists tracks in an order that won't survive being made, and it was
  the tallest thing in the sheet.
- The mix sheet opens from the top like the artist chooser, rather than
  the two dialogs arriving from opposite edges of the screen.
- On a phone, the Home mixes row is two cards — the sampler and one
  "If you like…" — because the row is two columns wide. Kept, at
  Joseph's call.

## 2.9.33
- Fixed the Home mixes row, which 2.9.26 never actually changed. The row
  always prepended Build your own and the sampler as their own tiles,
  so the curated cards came after them and the sampler never reached
  the selection. And recommendations and genres live in maps only the
  Mixes page filled, so Home had none to offer. It now leads with the
  sampler, reads the cached maps, and fills the rest with one
  recommendation, one library mix and one genre.
- "If you like…" mixes shuffle and don't offer an order. Album order
  across nine different artists means nothing.
- Their playlist covers use a photograph of the artist rather than an
  album sleeve. The card only knew the artist through your library,
  which holds album art; the photo is fetched when the playlist is made.
- A Multi-Dip shows only the artist being searched. Adding each photo
  to the slideshow meant it cycled between them, showing the first
  artist while the second was being read.
- Every "playlist created" message is the same popup now. A dive used a
  popup; mixes and the library scrub used a line of text above the
  button.

## 2.9.32
- Fixed: tapping an artist did nothing. Removing the gear left one line
  still referencing it, which threw the moment the chooser opened,
  before anything was wired up.
- The scope check that should have caught it was reading 53 characters
  of a function instead of the whole thing — a destructured parameter
  opens braces of its own, and it was counting from the wrong one. It
  reads whole functions now, and covers the chooser.

## 2.9.31
- The gear is gone. Tapping Dive now asks how deep as a second step,
  with Back and "Start the dive" — a choice and its settings were two
  controls for one decision.
- Opened from Settings, where there's no artist to act on, it goes
  straight to the options rather than showing three choices that lead
  nowhere.

## 2.9.30
- Reworked the artist chooser. Dip, Multi-Dip and Dive aren't three
  unrelated options — they're one scale, from a few songs to a whole
  catalogue — so each row now carries a small gauge showing how far
  down it goes.
- Dive is no longer a saturated blue slab. It was the primary action
  because it used to be the only thing DeepDive did; a dip is cheaper
  and more common now, so the three read as equals and the gauge
  carries the difference.
- The settings gear was a box stuck beside a pill. It's part of the
  same shape now, split by a hairline.
- The heading asks "How far in?" and the line under it names all three
  rather than two.

## 2.9.29
- The dive modes are a dropdown now. They were five stacked cards, each
  with its own paragraph, which pushed the Dive button off the screen
  the moment you opened them — you could read about the modes and not
  act on one. The description shows for whichever mode is selected.
- Fixed a regression from 2.9.28: the chooser had no maximum height, so
  a long panel ran past the bottom of the screen with nothing to
  scroll.

## 2.9.28
- The artist popup actually moves now. 2.9.27 only changed the desktop
  rule; a mobile media query pins every modal to the bottom of the
  screen, so on a phone — the only place it was reported from — nothing
  changed at all. The chooser opens below the search bar; the card
  modal stays a bottom sheet, which suits it.

## 2.9.27
- Removed the options icon from the search bars. It duplicated the one
  in the artist popup, which is where you actually choose what to do —
  two ways in meant guessing which applied to what.
- The artist popup opens near the search bar instead of floating in the
  middle of the screen, and drops into place rather than appearing. It
  belongs to the thing that produced it, so it should arrive next to
  it. Reduced-motion settings are honoured.

## 2.9.26
- The mixes row on Home is one of each kind now: the sampler, an "If
  you like…", something from your library, and a genre. It used to draw
  four cards from one pool, which meant four variations on the same
  idea sitting side by side.
- Recommendations and genres only appear there once Last.fm has been
  asked — opening Home won't start a fetch. Without them the row fills
  from your library instead, so it's never short.
- The full Mixes page is unchanged; it still shows everything.

## 2.9.25
- The dive screen is no longer blank during a Multi-Dip. It used to be
  fed artwork by the catalogue read, and moving dips onto search
  removed that source without replacing it — so the longest job in the
  app ran against an empty field. Each artist's photo now shows as they
  are searched.
- "If you like…" does the same with the artist you named.

## 2.9.24
- Re-running a mix now refreshes its cover. Covers were only ever set
  on a brand-new playlist, so artwork made by an older version of the
  app stayed wrong forever and rebuilding the same mix wouldn't correct
  it. Only playlists DeepDive is recorded as having made are refreshed
  — artwork you set yourself stays yours.

## 2.9.23
- Fixed: Multi-Dip covers had no artist photos. Two lookups returned
  two different artist shapes — `searchArtists` normalised its results
  and `findArtist` handed back Spotify's raw object — so which fields
  existed depended on which one had run. There's one shape now, used by
  both.
- The DeepDive mark no longer sits on a dark disc. The disc kept a
  solid mark from vanishing against a photograph of its own tone, but
  on a pale sleeve it read as a grey blob stuck in the corner. A shadow
  does the same job and only shows where the artwork is light.

## 2.9.22
- A few new artists since the last look are now looked up quietly
  rather than prompted about. Liking three albums shouldn't put "look
  up 3 more artists" under a wall of genres every time the page opens.
  Above fifteen it's still a choice, since the wait is real.
- Fixed: searching genres and then pressing "Show all" kept the search
  applied, with no visible way back out. Expanding or collapsing clears
  it, and the search box has a clear button.
- The track-count picker offers the standard steps only. Showing the
  real count was the same open-ended option wearing a number — 1,044
  tracks is eleven requests and a playlist nobody plays end to end.
- "If you like…" covers use the artist the card is named after.
  "If you like Oliver Tree" was showing blackbear, who is one of the
  similar artists rather than the seed.

## 2.9.21
- Removed "All" from the track-count picker. A generated card can hold
  fourteen hundred tracks and every hundred is a request when the
  playlist is created, so an open-ended option was the wrong thing to
  leave sitting there. The whole mix is still reachable, as its actual
  count — a number says what you're about to make.
- An "If you like…" mix now uses a photo of the artist you named, since
  that's what defines it. It was showing one album cover from the
  result and a title that truncated to "If you like Lei…".

## 2.9.20
- A dip on a small artist now gives you everything they've released,
  best known first, instead of a stub. Last.fm only ranks what people
  have actually played, so a band with a handful of played tracks was
  coming back at seventeen minutes against a target of sixty.
- The catalogue read this needs is cheap precisely when it's needed: an
  artist with few known tracks has few releases.
- Nothing is trimmed in that case — for an artist that small the deep
  cuts are most of what there is. The ranking still orders the tracks
  it knows, and the rest follow.

## 2.9.19
- Fixed: a dip could include tracks by a different band of the same
  name. Spotify has two artists called Provoked, and the search
  verified the credit by name — which treats them as one act. It
  matches on the artist's id now, and a Multi-Dip resolves each name to
  an id before searching.
- Dips are no longer called "in an hour". An hour is the target, not a
  promise: a band with seven tracks gets seventeen minutes, and the
  name claimed otherwise. The subtitle gives the real length.

## 2.9.18
- Fixed: creating a playlist from a dive failed with "news is not
  defined". Adding cover art to that path in 2.9.16 referenced a
  variable belonging to a different function.
- Added a check for that shape of mistake: an identifier used inside
  one result handler but declared in the other. Every suite stayed
  green while this was broken, because source-text assertions can't see
  scope.

## 2.9.17
- The DeepDive mark is top left on playlist covers, opposite the kind.
- Fixed: it wasn't appearing at all. The path was relative to the app
  page, where `assets/` doesn't exist, and a missing logo is
  deliberately not fatal — so the first covers shipped without one and
  nothing said so.
- It sits on a dark disc, since a solid mark disappears against a
  photograph of the same tone.

## 2.9.16
- Playlist…12861 tokens truncated… competed for the same action. There is one
    primary now, and each button names what it does.

## 2.8.0
- Changed: compilations and "appeared on" are now two separate choices.
  A greatest-hits record is the artist's own work; a various-artists
  compilation they guest on once is somebody else's. They were a single
  toggle, so taking the cheap half meant taking the expensive one too —
  compilations are usually a handful of extra releases, while guest
  appearances can be hundreds, at one request each.
- Fixed: including "appeared on" pulled entire albums. One guest verse
  dragged in the whole tracklist, so another artist's record was counted
  as this artist's catalogue. Only tracks they're actually credited on
  are kept now. This is a correctness fix and a rate-limit fix at once,
  since the discarded tracks were being classified and matched.
- A track with no credit list at all is kept rather than dropped: a
  missing field shouldn't silently delete a real recording.

## 2.7.5
- Fixed: the sampler intro page stayed behind the dive screen for the
  whole run. The intro renders into the page body and the dive screen is
  a fixed overlay above it, and nothing ever cleared it — so it
  reappeared the moment the overlay came down, both on cancel and behind
  the results dialog. The intro is now cleared when the run starts, and
  home is restored before the results open.

## 2.7.4
- Changed: the spinner before a dive reads "Starting dive…" rather than
  naming the artist.

## 2.7.3
- Changed: the dive no longer opens full screen until it has a photo to
  show. Tapping an artist now brings up a spinner over the page you were
  already on while the artist is resolved and their photo downloaded;
  the full screen opens onto the finished image. Previously it opened
  immediately and had to fill the gap with something — a thumbnail,
  which looked pixelated, or a blank field.
- The artist lookup that used to happen inside the search now happens
  before the screen opens, and is handed to the search rather than
  repeated, so this costs no extra requests.
- The photo preload gives up after five seconds and ignores a broken
  URL, so a slow image can't hold a dive at the spinner. Artists with no
  photo on Spotify go straight through.

## 2.7.2
- Changed: a dive started from a tile no longer borrows that tile's
  image to fill the screen while the artist is looked up. Tile art is a
  thumbnail and looked pixelated stretched across a phone, which is the
  whole reason a dive from the search box looked right and one from a
  suggestion or pin did not. The dive now shows a quiet loading field
  until the real photo is ready, then fades it in.
- Removed the machinery that existed only to manage that stand-in: the
  placeholder slide, its crossfade timer, the flag guarding load order,
  and the artwork argument threaded through every dive entry point.

## 2.7.1
- Reverted 2.7.0's blurred-backdrop dive screen. It was built on the
  theory that 640x640 is too small to fill a phone, but a dive started
  from the search box has always looked right at exactly that size, so
  the theory was wrong and the change made a working screen worse.
- Fixed: the real cause. A dive from a tile seeds the screen with the
  tile's own small image while the artist is looked up. That stand-in
  could survive the real photo two ways — by finishing its load after
  the photo arrived, appending itself late and then taking its turn in
  the rotation, or by never being dropped at all. Either way the blurry
  copy was what stayed on screen. A dive from the search box has no
  stand-in, which is why it always looked correct.

## 2.7.0
- Changed: the dive screen no longer stretches one photo across the
  whole display. Spotify's largest artist image is 640x640; covering a
  1080x2400 phone scales it 3.75x, so it was always going to look soft
  no matter which URL was chosen. The photo now renders twice from the
  same file — a heavily blurred copy filling the screen, where the
  upscaling is invisible, and a second copy on top at close to native
  size, where it stays sharp.
- Fixed: three test suites had been asserting against the marketing
  landing page instead of the app shell since the two were split. They
  passed because the landing page inherited a copy of the stylesheet,
  so the assertions matched CSS that was no longer the CSS being
  shipped.

## 2.6.9
- Fixed: suggestion and pin tiles were pixelated on Home. Tiles render
  at 56px, which is roughly 168 device pixels on a 3x phone, and they
  were being fed Spotify's smallest variant — 160px for an artist and
  only 64px for album art, so it was upscaled almost threefold. Tiles
  now use the middle variant (320/300), which covers 3x at a fraction
  of the bytes of the 640px original. The full-size copy stays reserved
  for the full-screen dive.

## 2.6.8
- Fixed: suggestion and pin tiles launched dives that stayed pixelated.
  The suggestion row borrows artwork from the library cache to avoid a
  request per artist, but only took the small variant — the cache keeps
  a large one alongside it, and nothing downstream had anything better
  to reach for.
- Changed: the real photo now crossfades over the low-res placeholder
  instead of cutting to it. The slide was getting its visible class in
  the same frame it was appended, so the browser coalesced both into one
  style pass and the CSS transition never ran.

## 2.6.7
- Fixed: the dive screen showed no photo at all when started from
  search, and kept the blurry 44px-tile copy when started from a pin or
  suggestion. `onArtist(artist)` was being called one line above
  `const artist = await client.findArtist(...)`. `const` is in the
  temporal dead zone until its declaration runs, so this threw a
  ReferenceError on every dive — inside a try/catch written to stop a
  display callback breaking a search, which swallowed it silently. The
  callback had never fired. 2.6.6's photo fixes were correct but sat in
  code that never ran.
- Fixed: the tile image shown at dive start is now a placeholder that
  the real photo replaces, rather than a second slide. Otherwise the
  rotation alternated between the sharp photo and the blurry thumbnail.

## 2.6.6
- Fixed: artist photos on the dive screen looked low-resolution partway
  through. Spotify's `images` array is one photograph at three sizes
  (640/320/160, widest first), not three photographs — the dive treated
  it as a gallery and queued all three. Every 4.5 seconds it crossfaded
  to a smaller copy of the same picture, stretched to fill the screen.
  Only the largest is used now.
- Fixed: the same bug was why the slideshow appeared not to run on a
  single-artist dive — it was crossfading between identical frames, so
  the only visible change was the resolution dropping.
- Fixed: album art is now only used for artists Spotify has no photo
  for, rather than joining the rotation alongside one. The
  `_haveArtistPhoto` flag written for exactly this was never read or
  set; it works now.
- Fixed: 30 of the 34 test suites had been dead since the app moved
  under `docs/` — they read paths from an older layout, errored on
  import, printed nothing, and the runner scored them as absent rather
  than failing. 48 assertions were actually executing; 430 are now.

## v1.10.1
- Fixed: every single-artist search and full library scrub was broken
  entirely (`Something went wrong: name 'get_artist_album_ids' is not
  defined`), since v1.9.0. Cause: an earlier edit that inserted
  `search_artists()` used a find-and-replace that matched only
  `get_artist_album_ids`'s function *signature* line, not its body —
  which deleted the `def` line but left the body still sitting in the
  file, now with no function heading above it. Because the orphaned
  body was still indented, Python silently attached it as unreachable
  code at the end of `search_artists()` (after its `return`) instead of
  raising an import-time error, so nothing caught it until an actual
  scan hit the missing function name at runtime. Restored the missing
  `def` line. Added a check across every `.py` file for this exact
  failure signature (indented code stranded after a top-level `return`
  with no enclosing `def`) — none found elsewhere — and cross-checked
  every `sc.*` reference in `app.py` against real functions in
  `spotify_client.py`. Verified by actually running both
  `run_search_job` and `run_full_scrub_job` end-to-end with only the
  network boundary (`_get`) mocked, not the higher-level functions —
  the gap in test depth that let this ship in the first place.

## v1.10.0
- Replaced the placeholder wordmark font (Anton, a Google Fonts
  approximation of the concept image) with the actual Martius font
  file, embedded via `@font-face` from `static/fonts/`.
- Added the real "D" logo mark (waveform-through-letterform, blue
  gradient, from the provided artwork) as an actual asset:
  `static/img/dd-logo.png` (cropped tight to content) and a separate
  centered `static/img/favicon.png` for the browser tab icon. Appears
  next to "DeepDive" in the small top-bar wordmark on every page, above
  the big wordmark on the home hero, and as the favicon.
- Pulled the logo's blue gradient (sampled directly from the artwork:
  `#01A8FF` \u2192 `#0F07FF`) into the UI as the accent color: primary
  buttons, the search-bar submit button, the progress bar fill, the
  "+" add-to-watchlist badge, and checkbox/radio accent colors. Black
  outlines, white space, and body text stay as they were — this
  mirrors the logo's own palette (black stroke, blue fill, white
  ground) rather than introducing a separate new color scheme.

## v1.9.0
- **Complete visual rebuild**, from a concept design: monochrome
  black-on-white throughout (every page, not just the home screen),
  bold condensed wordmark, pill-shaped search bar, circular avatar
  pills for artists. Replaces the previous plum/parchment/gold-teal
  "crate-digging" identity entirely.
- Added: slide-out nav drawer (gear icon, top-left, every page) with
  Search, Full Library Scan, To-Do List, and Configuration. Filter
  checkboxes and the full-scrub trigger moved off the home page into
  their own destinations under this menu — the home page is now just
  search + recommendations.
- Added: per-search options (exclude live/censored/instrumental/a
  cappella, count remasters as duplicates) live in a small panel next
  to the search bar now, opened by a settings icon beside the search
  button, instead of a checkbox list under the search box.
- Added: search-bar autofill. Typing 2+ characters queries a new
  `/search/autocomplete` endpoint (debounced, live Spotify artist
  search) and shows a dropdown to pick from; arrow keys + Enter work.
  Deliberately NOT filtered against the To-Do list's "dove into"
  artists — autofill is a direct Spotify search, not a recommendation
  pool, so it can still find an artist you've told DeepDive to stop
  suggesting. Recommendation pools (top artists, recently played, the
  To-Dive row) ARE filtered against "dove into" status.
- Added: home page now shows a "From your To-Dive list" row above the
  regular listening-based suggestions, pulled from the To-Do List's
  pending entries. Each pill there is click-to-search, same as a
  regular suggestion, with a small checkmark badge (visible on hover)
  to mark it as dove into directly from the home page. Regular
  suggestion pills got the mirror feature: a small "+" badge to add
  that artist to the To-Do list on the spot, capturing its Spotify id
  and avatar immediately (no extra lookup needed later).
- Added: watchlist entries now carry an optional Spotify artist id +
  avatar. Entries added via a pill's "+" get this immediately; entries
  added by free-typed name (still possible from the To-Do List page)
  get it resolved lazily, a few at a time per home-page load, and
  cached to `watchlist.json` so the lookup only ever happens once.
- Added: "mark as dove into" now fully removes that artist from every
  home-page recommendation source — not just the To-Do list row, but
  also filtered out of the top-artists/recently-played suggestion row
  even if Spotify keeps returning it. Reversible: the new dedicated
  To-Do List page (nav drawer) has a collapsible "Completed" section
  listing everything marked dove into, each with Undo (back to
  pending) and Remove permanently.
- Behavior note: "mark as dove into" and "remove" are now different
  actions. Previously (v1.8.0) the only watchlist states were pending/
  done with no distinct home-page treatment; done entries were still
  visible on the home page's watchlist card. Now, done means fully
  hidden from recommendations, with the Completed section as the only
  place to see or undo it.

## v1.8.0
- Added: **To-Dive-Into List** on the home page — a persistent watchlist
  of artists to come back to later. Add a name, it survives restarts
  (stored in `watchlist.json`, gitignored like `.env`/`.cache-deepdive`
  since it's per-user data), and each entry has a one-click "Search now"
  plus a "Mark as dove into" toggle to keep history without deleting.
- Added: sort control on the "New to you" list (both single-artist
  search and full library scrub) — release date (newest/oldest first)
  or title, alongside the existing "as found" order. Client-side only;
  purely display order, doesn't affect what gets liked or playlisted.
  Sorting by popularity isn't possible — Spotify removed the
  `popularity` field from track/album objects in the Feb 2026 changes,
  so the data doesn't exist to sort by anymore.
- Added: a quick connection health check (`GET /me`, one saved track,
  one playlist — covering the three scope areas DeepDive actually
  depends on) runs before a search or full scrub starts, so a token or
  scope problem surfaces in a few seconds instead of after a long scan,
  or worse, only once you try to confirm results (see v1.7.2).
- Added: the browser tab title now shows the live progress percentage
  while a search or scrub is running, so it's visible without the tab
  being focused.
- Not implemented: integrating with Spotify's editorial "This Is
  [Artist]" playlists. Blocked by the Feb 2026 API changes, not
  difficulty — `GET /playlists/{id}/items` is documented as only
  available for playlists the user owns or collaborates on, and
  DeepDive doesn't own Spotify's editorial playlists. No workaround
  within Development Mode.

## v1.7.3
- Fixed: catalog tracks could vanish from search results entirely —
  not shown as a match, not shown as new, nothing. Root cause was in
  `find_candidates()` (added in v1.7.0): catalog tracks sharing the
  same (normalized title, exact duration) key were silently collapsed
  to whichever one was encountered first, intended to avoid showing
  the same new song three times across album/deluxe/single. But this
  ran *before* classification, so if two different *unliked* releases
  of the same recording shared that key (common when an artist reuses
  the exact same master across releases — e.g. two singles), only the
  first ever got evaluated; the second was dropped outright, before it
  could become a match candidate or even a "new track." Confirmed via
  a real case: two singles of an already-multiply-liked song were both
  missing from the results page for exactly this reason. This
  collapsing has been removed — every catalog track (already
  guaranteed unique by ID upstream) is now evaluated and shown
  independently. The tradeoff: a genuinely new song released on
  several editions can now show up as several separate "new" entries
  instead of one. That's a minor display redundancy, not the silent
  data loss it replaces.

## v1.7.2
- Fixed: playlist creation/reuse failed with `403 Insufficient client
  scope` on `GET /me/playlists`. The Feb 2026 migration's de-dup check
  (finding an existing same-named playlist to reuse) reads the user's
  private playlists, which needs `playlist-read-private` — this scope
  was missing from `SCOPE` entirely (the existing `playlist-modify-*`
  scopes only cover creating/editing playlists, not listing them).
  Existing connections are auto-detected as outdated (same mechanism as
  the v1.4.0 scope bump) and prompted to reconnect.
- Fixed: single-artist search and full library scrub could silently
  miss genuine cross-release duplicates. Root cause was in the Feb
  2026 two-phase matching added in v1.7.0: a catalog track only gets
  its real ISRC checked (phase 2) if it first passes a fuzzy title
  match against something already liked (phase 1) — and that phase-1
  filter was strict enough to reject genuine same-recording re-releases
  before ISRC ever got a say. Concretely: a single adding "(feat. X)"
  to a title that wasn't on the liked album cut dropped title
  similarity from 100% to ~46%, well under the old 90% bar, so the
  track was never even ISRC-checked and fell straight into "new."
  Two changes:
  - `normalize_title()` now also strips feat./ft./with credits,
    "(Original Mix)", and parenthetical versions of tags that were
    previously only recognized in "- Suffix" form (single/album/mono/
    stereo version, bonus track), and normalizes `[brackets]` to
    `(parens)` so both styles hit the same patterns.
  - Phase-1 candidate selection (deciding whether a track is *worth* an
    ISRC lookup) now uses its own looser threshold (72% title
    similarity, ±5s duration) instead of the same 90%/±3s bar used for
    the final no-ISRC fallback decision. This is safe to loosen: ISRC
    is the actual arbiter once a track becomes a candidate, so a wider
    net here just means a few more (cheap, one-per-candidate) ISRC
    lookups — it can't produce a false-positive duplicate, since a
    non-matching ISRC still correctly falls back to "new" in phase 2.
    The original 90%/±3s bar is unchanged for the two places that
    still need it (matching a track with no ISRC at all, and the
    opt-in remaster-matching toggle), since those have no ISRC to
    fall back on and staying conservative there still matters.
  - Also fixed the same bracket-vs-parens gap in the exclude-live/
    censored/instrumental/a-cappella/remaster filters, which only
    recognized `(Live)`-style tags and missed `[Live]`-style ones.
  - `_find_fuzzy_match()` now returns the *closest* title match among
    eligible liked tracks rather than the first one encountered, for
    when a candidate could plausibly match more than one liked track.

## v1.7.1
- Fixed: confirming a search (liking tracks / building a playlist) had
  no error handling at all, so any API failure became a raw Flask 500
  white page — throwing away results that took minutes to produce.
  Liking and playlist-building are now handled independently: if one
  fails the other still reports its result, the real Spotify error is
  shown on the page, and the cached results are kept so you can go back
  and retry without re-running the whole search.

## v1.7.0 — February 2026 API migration

The cause of every failure across v1.6.1–v1.6.13 turned out to be a
documented Spotify platform change, not a bug in DeepDive:

> **February 11, 2026** — New Development Mode apps are created with new restrictions
> **March 9, 2026** — Existing Development Mode apps are migrated to new restrictions

That explains why apps that had worked for months broke without any
local change, and why creating a fresh Spotify app didn't help — both
apps are Development Mode, and both were migrated. Extended Quota apps
are unaffected.

**Ported to the new API surface:**
- `GET /tracks?ids=`, `/albums?ids=`, `/artists?ids=` — batch endpoints
  removed (403). Now fetched individually.
- `PUT /me/tracks` → `PUT /me/library?uris=` (still batched, 40 per call).
- `POST /users/{id}/playlists` → `POST /me/playlists`.
- `POST|GET /playlists/{id}/tracks` → `/playlists/{id}/items`, including
  the `.track` → `.item` field rename.
- `GET /search` limit max 50 → 10.
- `GET /artists/{id}/albums` limit max 50 → 10 (this was the "Invalid
  limit" 400 — nothing to do with any of the theories chased earlier).
- `artist.popularity` removed; `find_artist()` no longer sorts by it and
  falls back to Spotify's own search relevance.

**Two-phase matching (the significant change).** ISRC only exists on
full track objects, and batch fetching is gone — so reading ISRCs for a
whole catalog would now be one request per track. Instead:
1. Read the catalog from album responses (no ISRC) and narrow to tracks
   that plausibly match something already liked. Free.
2. Fetch real ISRCs only for those few candidates, and let ISRC decide
   duplicate vs. different recording.

ISRC precision is kept exactly where it decides something. A track
resembling nothing in your library never costs a lookup.

*Honest trade-off:* previously an ISRC match could catch a duplicate
whose title differed from the liked version. Now a track must look
similar enough to become a candidate before its ISRC is checked. Title
normalisation and the duration window make that rare, but it is a real
(small) loss of recall — accepted to keep the feature viable at all.

**Performance:** single-artist search costs more requests than before
(roughly one per release) but is fine. **Full library scrub is now
substantially more expensive** — for a large library it may not be
practical. Left in place rather than removed unilaterally; worth a
conversation.

**Corrections to earlier changelog entries:** v1.6.11/v1.6.12 blamed
spotipy's `Content-Type` header, and v1.6.7 blamed connection pooling.
Both diagnoses were wrong — they were theories built on a mental model
of an API that had changed months earlier. The v1.6.12 rewrite is kept
because it works and removes a dependency on spotipy's internals, but
it was not the cause. v1.6.7's pooling change was reverted in v1.6.13
after it caused a real slowdown of its own.

## v1.6.13
- Fixed: `400 Invalid limit` on the artist releases lookup. Direct
  testing against the live API (plain `requests`, no spotipy, no app)
  found `limit=50` and `limit=20` both rejected, while `limit=10` and
  the endpoint's default of 5 both succeeded — same token, same artist,
  same moment, only the limit differing. Now uses limit=10, the largest
  value confirmed to actually work. Most likely Spotify lowered the max
  for this endpoint server-side; notably, older versions of this app
  that had previously worked started failing identically without any
  local change, which is what a server-side change looks like.
- Corrected: v1.6.11/v1.6.12 attributed this error to spotipy's forced
  `Content-Type` header. That diagnosis was wrong — the test that
  "proved" it used limit=20, which was already failing on its own, so
  adding the header proved nothing. The v1.6.12 rewrite (bodyless
  requests bypassing spotipy) is kept regardless: it's tested, it
  works, and it removes a dependency on spotipy's internals. But the
  Content-Type header was not the cause.
- Fixed: restored HTTP connection pooling, which v1.6.7 disabled on an
  unconfirmed theory about stale connections. Without pooling, every
  request in a 100+ page Liked Songs fetch paid for a fresh TCP+TLS
  handshake, slowing the fetch enough to trip the stage timeout — a
  regression introduced by that earlier speculative fix.
- Changed: raised the per-stage timeout from 5 to 30 minutes. A stage
  can legitimately be 100+ paginated requests for a large library, and
  genuine per-request hangs are already handled far tighter (25s) at
  the request level. The old 5-minute ceiling was mostly punishing
  large libraries for being large.

## v1.6.12
- Fixed comprehensively, not just for the one endpoint caught so far.
  After v1.6.11 fixed `/artists/{id}/albums`, live testing immediately
  surfaced the *same* underlying issue on a second, unrelated endpoint
  (`/artists?ids=...`, used for suggestion photos — a 403 this time,
  not a 400, but the same root cause). Rather than keep patching
  endpoints one at a time as each one happens to get exercised, every
  bodyless request in the app (every GET, plus liking tracks which is
  a bodyless PUT) has been moved off spotipy's internal request
  machinery entirely — the actual source of the forced Content-Type
  header. Playlist creation and adding tracks to a playlist are
  deliberately left unchanged: those send genuine JSON bodies where
  Content-Type is correct, and they've been working reliably all
  session. Verified all 11 read functions plus the mixed-path playlist
  function individually: correct requests, correct results, and zero
  Content-Type headers on any request that shouldn't have one.

## v1.6.11
- Fixed, now with direct confirmation of the actual cause: the "Invalid
  limit" error had nothing to do with `limit` OR `offset` — it was
  never really about the parameters. Direct side-by-side testing
  proved it: taking the exact request that had just succeeded and
  adding only a `Content-Type: application/json` header reproduced the
  failure exactly. spotipy sets that header unconditionally on every
  request it makes, including GETs with no body, with no way to
  disable it through spotipy's normal API — and Spotify's API rejects
  it on this endpoint specifically, with a misleading error message
  that blamed the wrong parameter the entire time. Rewrote
  `get_artist_album_ids()` to bypass spotipy's internal request
  machinery entirely (a small direct-`requests` helper) for both the
  initial request and pagination, so this header is never sent at all.
  Verified directly: no Content-Type header is sent on either request,
  pagination across multiple pages still works, and error handling/
  retry-on-transient-failure both still work correctly through the new
  path.

## v1.6.10
- Fixed for real this time — found via directly comparing four raw API
  requests against Spotify's servers (bypassing DeepDive and spotipy
  entirely). The "Invalid limit" 400 error was misleading: it wasn't
  actually about the `limit` value at all (confirmed: 50 and 20 both
  failed identically). The real trigger is spotipy's `artist_albums()`
  method itself — its signature hardcodes `offset=0` as a default and
  always sends it explicitly, with no way to omit it through the
  normal method call. Spotify's API is now rejecting this specific
  combination of an explicit `limit` with an explicit `offset` on this
  endpoint. Fixed by bypassing spotipy's `artist_albums()` wrapper for
  the first request (via its lower-level `_get()`) so `offset` can
  genuinely be left out — confirmed via direct testing this is exactly
  the combination Spotify accepts.

## v1.6.9
- Fixed: after switching to a freshly created Spotify app, the artist
  releases lookup (`/artists/{id}/albums`) started failing with
  `400 Invalid limit` on `limit=50` — the first time this specific
  error has shown up in testing. Possibly a recent tightening on
  Spotify's side for this endpoint specifically (this file's other
  endpoints using `limit=50` haven't shown the same error, so this is
  a targeted fix, not a blanket change). Lowered this endpoint's page
  size to 20, comfortably within any historically valid range. Can't
  fully confirm Spotify's current server-side validation from here —
  this needs a real live test to confirm it resolves it.

## v1.6.8
- Fixed the actual, now-confirmed root cause: **HTTP 429 (rate
  limited)**. v1.6.6/v1.6.7 finally surfaced this as a real, visible
  error instead of a silent hang — Spotify was rejecting requests as
  "too many," entirely plausible after this many searches and full
  scrubs in one extended session. The real bug: spotipy exposes exactly
  how long Spotify wants us to wait via the `Retry-After` header on a
  429 response, and `_call()` was never reading it — it retried with
  the same short flat backoff used for ordinary transient errors, which
  likely just re-triggered the same rate limit immediately rather than
  actually waiting out the window. 429s now get their own longer retry
  budget and genuinely wait however long Spotify asks (capped at 90s so
  it still can't hang forever on an extreme value), falling back to a
  conservative 15s wait only if Spotify doesn't send a usable header.
  Verified directly: a simulated 429 with `Retry-After: 2` now waits
  exactly ~2 seconds before retrying, not a guessed short delay: other
  error types (5xx, timeouts, non-retryable 4xx) are confirmed
  unaffected by this change.

## v1.6.7
- Fixed (hopefully the real root cause): direct `curl` testing showed
  Spotify's API responding in 0.17s outside the app, while the app's
  own long-running process kept hanging on the same domain. spotipy
  keeps a persistent, connection-pooling `requests.Session` for the
  lifetime of the client — in a server process alive for hours across
  many requests, a single pooled connection going stale/stuck on
  Spotify's end can then get handed out again on every subsequent
  call, including retries, while a fresh one-off process (like curl)
  never touches that same broken connection. Disabled session/
  connection pooling entirely (`requests_session=False`, an option
  spotipy documents specifically for this trade-off) — a little more
  overhead per request (a fresh connection each time instead of a warm
  reused one), in exchange for not being able to get permanently stuck
  on one bad connection for the rest of the process's life.

## v1.6.6
- Fixed at the actual root, this time: every previous timeout fix
  (v1.6.2-v1.6.5) wrapped increasingly large chunks of work (a whole
  artist, a whole stage) in a hard deadline — but a single underlying
  HTTP request could still hang far longer than the configured 20s
  `REQUEST_TIMEOUT`, since that setting depends on the `requests`
  library actually honoring it, which real-world testing showed
  wasn't reliably happening. Added a true hard timeout
  (`HARD_CALL_TIMEOUT`, 25s) at the lowest level — every individual
  API call attempt inside `_call()` now has its own daemon-thread
  backstop, independent of whether `REQUEST_TIMEOUT` is respected.
  Verified directly: a call simulated to hang forever, completely
  bypassing `REQUEST_TIMEOUT`, is now still caught and retried on a
  short, predictable schedule. This should be the actual fix for the
  repeated stall reports, not another layer further out from the
  problem.
- Fixed: progress stage labels only updated after a stage's first
  request succeeded, so a stuck first request left a stale, misleading
  label the whole time it was stuck. Labels now update immediately
  when each stage begins.

## v1.6.5
- Fixed: the actual root cause behind the "page just loads forever"
  reports. `get_token()`'s access-token refresh call had zero timeout
  protection — and it runs on the way into *every* authenticated route,
  including the very first hit to the home page. v1.6.3/v1.6.4 fixed
  the suggestions fetch, but that code never even ran if the token
  refresh itself hung first, which is exactly what was happening.
  Wrapped it with the same hard-timeout helper; if a refresh can't
  complete quickly, the session is cleared and the user sees "Connect
  Spotify" again instead of the page hanging indefinitely.

## v1.6.4
- Fixed: v1.6.3 accidentally broke the home page. It applied the same
  5-minute background-job timeout to the suggestions fetch, but the
  home page loads synchronously (no progress bar, just a normal page
  request) — so if Spotify was being slow, the whole page would just
  sit blank for up to 5 minutes before rendering anything. Suggestions
  now get their own much shorter timeout (8s); if that trips, they're
  silently skipped and the page renders immediately, same as any other
  suggestions failure.

## v1.6.3
- Fixed: the hard-timeout fix from v1.6.2 only covered the full-scrub's
  per-artist crawl. Single-artist search had zero timeout protection on
  any of its stages and could hang forever the same way (confirmed: a
  real search stalled 6+ minutes on "Reading your Liked Songs..." with
  no recovery). Generalized the fix into a reusable `run_with_timeout()`
  helper and applied it to every network stage in both single-artist
  search and full-scrub — nothing in either job can hang indefinitely
  anymore, regardless of which stage or which job type.
- Added: artist photos on the home page's listening-based suggestions.
  Top-artist suggestions already come with images from Spotify's API;
  recently-played-derived suggestions don't, so those get one small
  follow-up batch request for their photos. Falls back to a text-only
  pill per-artist if that fetch fails, rather than losing the
  suggestion entirely.

## v1.6.2
- Fixed: the v1.6.1 per-artist time budget didn't actually work for the
  failure mode that was actually happening in practice. It checked the
  deadline cooperatively (between completed API calls), which does
  nothing if a *single* call never returns at all — exactly what was
  observed with a real library (stalled 11+ minutes on one artist,
  past the "5 minute" budget, because the very first request for that
  artist's releases never got a chance to check in). Replaced with a
  hard deadline: each artist now crawls in its own daemon thread, and
  the main scrub loop gives up waiting after 5 minutes regardless of
  what's happening inside — this works even if a call hangs completely
  and never calls back at all, not just a slow-but-progressing one.
  (Also caught and avoided a subtler bug in the first version of this
  fix during testing: using `ThreadPoolExecutor` here would have made
  an abandoned/hung artist silently prevent the whole Flask process
  from shutting down cleanly later, since Python joins every thread a
  `ThreadPoolExecutor` ever created at process exit regardless of
  `shutdown(wait=False)`. Daemon threads don't have that problem.)
- Fixed: skipped-artist detail on the results page now shows correctly
  for this failure mode too (was added in v1.6.1, still applies).

## v1.6.1
- Fixed: the full library scrub had no ceiling on how long it would
  spend on a single artist. If one artist had an unusually large
  catalog (or the API was persistently slow for that artist), the
  overall progress bar would sit frozen — indistinguishable from
  actually being stuck, since progress only advanced between artists,
  never within one. Added a hard 5-minute-per-artist budget: if a
  single artist is still going after that, it's abandoned and the
  scrub moves on, guaranteeing forward progress no matter what.
- Fixed: the results page only showed a generic count of "some artists
  couldn't be scanned" with no detail. Now lists each skipped artist by
  name with the actual reason (time budget exceeded, API error, etc.)
  instead of a vague "transient API issue" message.

## v1.6.0
- Removed: **Quick duplicate check**. This feature scanned existing
  Liked Songs for accidental double-likes and offered to *unlike* one
  copy — a cleanup tool, not a discovery tool. In practice this wasn't
  wanted and was easily confused with Full library scrub (which finds
  and *likes* missing versions) since both lived under "Scan your whole
  library." Removed entirely, including its route, background job,
  templates, and the now-unused `find_duplicate_groups_in_liked()` /
  `unlike_tracks()` helpers, rather than leaving dead code around.
  Full library scrub is unaffected and is now the only option in that
  section of the home page.

## v1.5.0
- Added: "Exclude instrumentals" and "Exclude a cappella versions" filters,
  available on both single-artist search and the full library scrub.
  Same conservative pattern-matching approach as the existing live/
  censored filters (won't false-positive on a song literally titled
  "Instrumental").
- Added: "Count remasters as duplicates of the original" checkbox. Off by
  default — remasters usually carry a different ISRC than the original
  recording, so by default they're only matched if they happen to share
  the exact ISRC (unusual). With this on, DeepDive will also title-match
  a remaster against your liked tracks the same way it already does for
  tracks missing an ISRC, so "liked the original, missed the remaster"
  (or vice versa) gets caught as a duplicate candidate instead of showing
  up as a new track.

## v1.4.0
- Added: **quick duplicate check** — scans your existing Liked Songs
  against each other (no catalog crawling) to find songs you've already
  liked twice under different releases. Fast, review-and-unlike workflow.
- Added: **full library scrub** — crawls every distinct artist in your
  Liked Songs the same way single-artist search does, to catch every
  cross-release duplicate and every new track across your entire library.
  This is genuinely slow for large libraries (potentially 30-60+ minutes)
  since it's equivalent to running a search once per artist — but it's
  cancellable at any time and keeps whatever was found before cancelling.
  One artist failing to fetch no longer kills the whole scrub.
- Added: **listening-based artist suggestions** on the home page, pulled
  from your top artists and recently-played tracks — one click to search
  any of them.
- These new features require two additional Spotify permission scopes
  (`user-top-read`, `user-read-recently-played`). Existing sessions are
  automatically detected as outdated and prompted to reconnect rather
  than silently failing later.

## v1.3.1
- Added: `run.sh` launcher script. Sets up the virtual environment and
  installs dependencies automatically on first run only; every run after
  that just starts the app. Also opens your browser automatically a
  couple seconds after the server comes up. No more remembering the
  venv/activate/pip/python incantation each time.

## v1.3.0
- Added: optional "Exclude live recordings" filter on search, using
  conservative title/album pattern matching (won't false-positive on
  songs literally titled things like "Clean" or "Live Life").
- Added: optional "Exclude radio edits & censored/clean versions" filter,
  same conservative pattern-matching approach.
- Both filters apply before matching, so excluded tracks never show up as
  a match candidate or a new-track suggestion. Results page notes how
  many were filtered out.
- Added: "Build a playlist from these" toggle on the results page — when
  unchecked, DeepDive only likes the confirmed matches and skips playlist
  creation entirely, rather than requiring you to uncheck every track.

## v1.2.0
- Fixed: Client Secret field on the setup page was unstyled (CSS only
  targeted `input[type=text]`, not `input[type=password]`).
- Fixed: Spotify API calls used a 5-second timeout (spotipy's default),
  which could fail on slower connections or heavier batch requests. Raised
  to 20s and added automatic retry with backoff (up to 4 attempts) for
  timeouts, connection errors, and transient 429/5xx responses. Non-
  transient errors (bad requests, auth failures) still fail immediately.

## v1.1.0
- Added: live progress bar during search (background job + polling),
  since large catalogs could take a while with no feedback.
- Added: Spotify auth now opens in a popup window and closes itself
  automatically on success, instead of navigating the whole tab away.
- Added: in-browser setup page for pasting Client ID/Secret — no more
  manually editing `.env` in a text editor.
- Added: playlist de-duplication — re-running DeepDive for an artist
  reuses the existing playlist by name and skips tracks already in it,
  so re-running never creates duplicate entries. Confirmation page now
  reports how many were skipped.

## v1.0.0
- Initial release: connect Spotify, search an artist, detect liked-song
  duplicates across releases via ISRC (with fuzzy fallback), confirm
  which to like, and build a playlist of everything not yet liked.
