# Changelog

> Entries for the 2.x rewrite were never backfilled — the history below
> stops at the Flask era. The 2.x record lives in the git log and
> `ROADMAP.md`'s "Shipped since".

## 2.8.65
- Fixed the genres cache properly. It was a race, not a storage
  failure: loading set the cache to an empty object, awaited the store,
  then replaced the cache with a merged one. Mixes renders three
  sections at once, so the second and third callers took the empty
  object and held a reference to something the first then discarded —
  permanently empty for the life of the page. Concurrent callers now
  share one load, and loaded data is merged in place rather than
  replacing the object.

## 2.8.64
- Suggestions no longer reload every time you switch tabs. Your top
  artists and recently-played were re-read on each visit to Home or
  Dives — two Spotify requests to rebuild an answer that moves over
  days, and the row reshuffled while you were looking at it. Held for
  the session now; the refresh control still goes back to Spotify.

## 2.8.63
- Genres should no longer ask to be found again after a reload. The
  rehydration checked the cache once per artist — sixteen hundred round
  trips to rebuild a map the cache already is — and now reads the whole
  thing in one go. If it still prompts, the panel says how many artists
  it already knows, which will say where the problem is.
- Added "Show all genres". The broad tags — rock, pop, alternative —
  always outrank subgenres by track count, so shoegaze and midwest emo
  sat below fourteen coarser ones on a page that advertises exactly
  those.
- Added "Worth another listen" to Recommended: one mix drawn from every
  similar artist you own a little of and rarely play. The per-artist
  cards each answer "if you like X"; this answers what they imply.

## 2.8.62
- Added **"If you like…"** to the Recommended row: name any artist and
  DeepDive builds a mix from the ones in your library that resemble
  them. You don't have to own the artist you name — asking "if you like
  Radiohead" while owning no Radiohead is the more interesting
  direction, since what matters is what comes out.
- Replaced the landing page screenshot with one taken after the Order
  layout fix.

## 2.8.61
- Fixed: in the mix dialog, "Order" sat inline beside the last track-count
  pill instead of starting its own row. The container carried
  `.card-len`, which is a wrapping flex row, and the options render
  their own rows inside it — so the labels became flex items too.
- The landing page no longer claims "no account, nothing installed".
  A Spotify Client ID is required; it says so, and gives the reason —
  nothing you listen to is pooled with anyone else's.
- Added recommendations to the page: an "If you like Oliver Tree" item
  and a panel of its own. It was the newest feature, visible in the
  device row, and never mentioned in the copy.
- The duplicate check within your own library is mentioned for the
  first time. It's the app's original premise and the page had never
  said it existed.
- Removed the landing page's copy of the sampler styles, dead since
  2.8.25.

## 2.8.60
- Swapped in the correctly cropped results screenshot, and corrected
  the height declared for it — a stale one reserves the wrong space and
  the page jumps as the image loads.
- Added a check that every declared image dimension matches the actual
  file, since each screenshot swap is a chance to leave one behind.

## 2.8.59
- The results panel now shows a Houseghost dive, which has all three
  outcomes on screen — already yours, yours under a different release,
  and new. The previous screenshot only showed two, so the copy could
  finally name the middle case the app exists for.

## 2.8.58
- Leisure Hour leads the device row; the second panel shows a VIAL dive
  rather than repeating the Mixes screen that already appears above it.

## 2.8.57
- The landing page shows three different screens — Home, a dive, and
  Mixes — instead of the same dive photograph three times. Two of them
  are the app's own interface rather than an artist.
- Added a wordmark and an "Open the app" link at the top. The page had
  neither, so a first-time visitor arrived with nothing telling them
  what they'd found.
- The results section no longer quotes the numbers off its screenshot.
  One person's library isn't the product's claim; the image is an
  example of the screen, nothing more. Same for the figures band.
- The footer credits Joseph with GitHub, LinkedIn and Buy Me a Coffee.

## 2.8.56
- Landing page rebuilt on stats.fm's structure: a text-led hero with
  three device screens beneath it, a figures band, a plain feature
  list, two alternating panels, a closing panel, and a real footer with
  columns. Their green becomes DeepDive's blue — the structure is
  borrowed, the identity isn't.
- **No artist photograph is used as page imagery.** They appear only
  inside device frames, as examples of the app running, which is how
  stats.fm shows album artwork too.
- Fixed: the link preview image was an artist photo, which is a
  headline use by any reasonable reading. It's the app icon now.
- Every pictured artist is named in the footer, with the endorsement
  disclaimer.

## 2.8.55
- The landing page now credits Spotify and Last.fm, states that album
  artwork and artist photography belong to their respective owners,
  names the artists pictured, and disclaims endorsement. It had no
  attribution at all, which the Developer Terms require regardless of
  the photography question.
- Added a figures band in the manner of stats.fm's — but theirs counts
  a platform and DeepDive has none, so these are what one real dive
  produced, and how much of it leaves your browser. That last figure is
  a zero.

## 2.8.54
- Rebuilt the landing page again. The first attempt fanned three phone
  screenshots across the hero, which is app-marketing wallpaper — the
  default arrangement rather than a decision.
- The page now opens the way a dive does: the artist fills the frame,
  the words sit over the bottom of the photograph, nothing competes
  with the picture. The product's most distinctive screen is a better
  source for the page's design than the template is.
- Replaced the four bordered cards with four plain statements, each
  naming the situation it resolves rather than the feature. A rounded
  box and a matching icon per idea is the SaaS kit; the text reads
  faster without them.
- The copy now covers dips and genre mixes, which the page had never
  mentioned.
- Removed the styles and images the rebuild orphaned.

## 2.8.53
- Rebuilt the landing page around the app itself. The hero is three
  dive screens fanned out — a dive fills the screen with the artist,
  which is the least utility-like thing about this utility and the
  reason anyone remembers it. **"Hear it all."** is the headline.
- Added a section showing a finished dive: three tracks already owned,
  fifty-eight new. The numbers make the argument faster than a feature
  list.
- The tagline now appears consistently in the page title, the link
  preview and the app manifest. There was no description anywhere
  before, so search results and shared links had nothing to show.
- Screenshots compressed from 5.6 MB to 355 KB, sized to avoid reflow,
  with the below-fold one loading lazily.

## 2.8.52
- Pacing no longer persists between sessions. It still slows down after
  each rate limit *within* a run, which is the part that works — but a
  bad afternoon no longer leaves every later dive crawling with nothing
  failing and nothing explaining it. Anything stored by an earlier build
  is cleared on load.

## 2.8.51
- Fixed: tapping an artist showed no popup for anyone who had ever
  ticked "Don't ask again" — which meant Dip did not exist for them,
  since the popup is the only route to it.
- Removed that option. It made sense when the dialog only chose how deep
  a dive went, so skipping it meant accepting a default. Now it chooses
  what to do, and a skipped choice is a missing feature. Any previously
  stored preference is cleared.

## 2.8.50
- Tapping an artist now offers **Dip** and **Dive** as the two things
  the dialog is about, each saying what it does. They were buttons in a
  footer beneath a page of options, which made Dip look like a setting
  rather than a choice.
- The search options moved behind a gear against Dive, since they adjust
  what a dive reads and have nothing to do with a dip.
- Opened from the search bar's options icon there's no artist to act on,
  so it goes straight to the options and hides the choices.

## 2.8.49
- Added **dips** — an artist's best hour. A dip runs the same catalogue
  read and duplicate check as a dive, then keeps only the tracks worth
  keeping, ordered by what people actually play.
- Dip sits beside Dive at the bottom of the artist popup and takes the
  same options.
- Ordered by Last.fm's top tracks, matched on normalised titles because
  the two services spell the same recording differently. Filled to a
  duration rather than a track count: an hour of an artist is a
  meaningful thing to ask for, whereas twenty tracks might be fifty
  minutes or two hours.
- Costs one extra request on top of the dive it already ran. Without a
  Last.fm key it still builds, ordered by catalogue instead — and says
  so if Last.fm can't be reached.
- A recording appearing on several releases only appears once, so a
  deluxe edition doesn't put the same song in twice.

## 2.8.48
- Mixes opens straight into Recommended. The page title and description
  are gone: Dives has neither, the tab already says where you are, and
  each section's own heading said it better than the paragraph above
  them did.

## 2.8.47
- Fixed: Last.fm data was fetched again on every page load. Tags and
  similar artists lived in memory only, so opening the app spent sixty
  or more requests re-learning what it already knew.
- Their terms actually **require** caching — clause 4.4 asks for similar
  artist and chart data to be held for at least a week. That's the
  opposite of Spotify's rule, and carrying the Spotify assumption across
  is what caused this. Now cached to the same persistent store as the
  library for 30 days.
- The session's maps rehydrate from that cache on load, so a reload no
  longer offers to find genres it has already found.

## 2.8.46
- Added **Recommended** at the top of Mixes, the second feature on the
  Last.fm key. Similar artists on their own give you names you can't
  play, so the recommendation is the intersection: artists Last.fm says
  resemble the ones you play most, that you already own and rarely
  reach for. "If you like Norah Jones" is a mix you can press play on.
- Fetched on demand like genres — twelve requests, a few seconds, on a
  button rather than in the background.
- Renamed the original card row to **From your library**. Genres and
  recommendations are mixes too, so calling one of the three "Mixes"
  had stopped meaning anything.
- The Mixes page has a title again. It lost one in 2.8.25 when a
  duplicate heading was removed, and has opened with a bare sentence
  ever since.

## 2.8.45
- Fixed the actual cause of an empty Mixes page: **nothing ever filled
  the library cache** except running a dive or using Settings → Refresh
  library. Anyone who opened Mixes first was told to "open Home and
  it'll cache in the background", which Home does not do — a loop with
  no way out.
- Mixes and Genres now offer a "Read my library" button where you're
  standing, with progress on the button itself.
- Home says something too. Half the suggestions come from the library,
  so without a cache the row was quietly thinner with nothing
  explaining it — the state was already being passed to that renderer
  and never read.

## 2.8.44
- The Genres section had the same silent-empty problem as the mixes row
  and also swallowed the error from reading the cache. Both now say
  which case they're in.

## 2.8.43
- Fixed: an empty Mixes page said nothing. Three separate paths cleared
  the page and returned — no cached library, no cards generated, or an
  exception — so all three looked identical to simply having no mixes,
  and the only explanation went to a console nobody has open. Each now
  says which it is.

## 2.8.42
- Added genre mixes, the first feature built on Last.fm. Tags are far
  finer-grained than Spotify's artist genres — shoegaze, midwest emo,
  riot grrrl rather than "rock" — and DeepDive now builds a mix from
  each one it finds enough tracks for.
- Tagging costs one request per artist, so it never happens in the
  background. Mixes shows what it would cost in requests and seconds,
  you press a button, you watch it, and you can stop at any point and
  keep what's been found.
- Artists are looked up heaviest-first. One you own thirty tracks by
  will carry a genre mix alone; one you own a single track by mostly
  won't, so the first fifty requests produce nearly all the useful
  mixes. A "do the rest" option covers the tail.
- A tag needs a weight of 25 or more and eight tracks behind it before
  it becomes a mix, which keeps out both one-person jokes and genres
  you own too little of.
- Without a key the section explains what it would do and points at
  Settings, rather than erroring or hiding.

## 2.8.41
- Added Last.fm support, the groundwork for genre mixes, dips and
  artist similarity — all data Spotify has removed or deprecated.
- Each user supplies their own API key. Free and instant from
  last.fm/api. A key shipped in the build would be readable by anyone
  opening devtools, pooled across every user, and revocable because of
  one person, so it follows the same model as the Spotify Client ID.
- Entered on the setup screen, marked optional, and changeable in
  Settings. Without a key nothing breaks — the features built on it
  simply don't appear.
- Requests are paced at 250ms, inside Last.fm's five-per-second limit,
  and both their HTTP status codes and their in-body error codes are
  checked, since they use either.
- Tags are normalised before use: "hip-hop", "hip hop" and "HipHop"
  collapse to one genre, and tags describing the listener rather than
  the music — "seen live", "favourites", decade tags — are dropped.
- Added `LASTFM_SURFACE.md`: what we call, what it costs, and why the
  rest of their API is out of scope.

## 2.8.40
- The artist search in Build your own is now the same component as the
  dive search — same field, same dropdown, same keyboard handling. Only
  the source differs: it filters the library already in hand rather than
  asking Spotify, so it costs nothing and can't be rate-limited. There
  should not be two artist searches in the app that look different.
- Track count in Build your own uses the same choices as every other
  mix, with "all" removed. An unbounded custom mix can be thousands of
  tracks, and every hundred is a request when it's created.
- Removed "As found" as an order. It meant "whatever order the generator
  emitted", which isn't something anyone can reason about. Shuffle is
  the default now. The sampler still uses its built order internally —
  each artist led by a track you already liked — because shuffling
  scatters the structure it was assembled around.

## 2.8.39
- Fixed: the artist filter in Build your own was a dropdown holding
  every artist in the library, which is unusable on a phone and barely
  better on a desktop. It's a type-to-search field now, and an
  unrecognised name says so rather than silently matching nothing.
- The match count updates as you type rather than only when a field
  loses focus.
- Made the cost explicit: building a mix reads nothing from Spotify —
  it runs against your cached library. Only creating the playlist makes
  requests, at one per hundred tracks, and large mixes now say so.
- Removed "Always create a new playlist". Reusing a playlist of the same
  name is the behaviour rather than an option, so re-running a mix
  updates it instead of leaving duplicates behind.

## 2.8.38
- Many more mix types. The set was fifteen recipes plus year and decade
  cards, almost all of them about *when* a track was liked or released.
  Added the other axes the cache already knows about: small hours, one
  each, albums you went deep on, loose ends, the three-minute rule, two
  names on the label, one name only, there on day one, took your time,
  an artist retrospective in release order, that one afternoon, cards by
  year of release, and one per season. A library like Joseph's now
  generates around forty rather than twenty-four.
- Added **Build your own**, beside the sampler at the head of the row.
  Era, year range, year liked, artist, collaborations, one-per-artist,
  length bounds, ordering and a cap — combined however you like, so a
  mix nobody wrote a card for is still reachable.
- The builder only offers years and artists that exist in your library,
  and shows a live count as you narrow, so an over-tight combination is
  obvious before you commit rather than after.
- Random picks below those two went from six to ten.

## 2.8.37
- Blocking is now per feature. It was one list applied to dive
  suggestions and the sampler pool but to no other mix — so a blocked
  artist was barred from one kind of mix and left in all the rest, which
  was an accident of where the filter happened to be written rather than
  a decision.
- Blocking from an artist tile means dives. Mixes are blocked separately
  from Pins & blocked, where each blocked artist now has a Dives and a
  Mixes checkbox. Turning both off removes the block entirely.
- Mix cards honour the mix block, which they never did before — it's
  applied to the source rather than taught to fifteen card builders.
- Pinned artists can be blocked as well as unpinned. Their tiles only
  offered unpin.
- Existing blocks are read as blocking both, since that is what they
  meant when they were written.

## 2.8.36
- Fixed: revealing a tile's actions worked, but the overflow control
  stayed put on top of them. It is absolutely positioned over the right
  edge, which is exactly where the revealed buttons appear — so it
  covered the unpin button it had just uncovered. It now steps aside
  once open.

## 2.8.35
- Reworked the tile overflow rather than patching it a third time. Two
  structural faults remained, either of which killed the button on its
  own:
  - It was only visible below the mobile breakpoint, with a hover reveal
    above it. So the behaviour depended on window width, and the half
    that was broken was the half most people saw.
  - Handlers were bound per render. Pinning an artist repaints the pins
    alone, and those fresh tiles came back with nothing attached — which
    is exactly the case that failed.
- One control at every width, no hover reveal, and the click handler is
  delegated once from the document so no repaint can orphan it.

## 2.8.34
- Fixed: the "…" button on tiles did nothing. The pin and remove buttons
  were hidden with `opacity:0`, which hides them visually while leaving
  them in the layout and still clickable — so the invisible buttons sat
  exactly where the overflow control is and swallowed every tap meant
  for it.
- That also meant the width was never actually reclaimed, which was the
  entire point of moving them behind an overflow. On touch they now
  leave the layout completely until revealed.

## 2.8.33
- Pins, blocked artists, dive history and playlist cleanup now use
  filled rows, matching track rows and settings rows. They were a
  bordered list, which is the outlines-over-fills problem the rest of
  the app moved away from.
- Their actions stay visible rather than moving behind an overflow.
  Unlike a tile — two buttons competing with an avatar and a name in a
  230px grid cell — these are full-width rows where acting on the entry
  is the whole point, and most carry a single button that hiding would
  only add a tap to.
- Removed the gold and teal label classes and the rule spans from every
  heading. They stopped meaning anything when headings were restyled
  from pills to plain type, and left markup implying colour-coding that
  no longer exists.

## 2.8.32
- Pin and remove now sit behind an overflow button on each tile rather
  than taking width on every row for actions used occasionally. On touch
  they were permanently visible, since there is no hover to hide behind.
  One row opens at a time and tapping elsewhere closes it.
- Run settings were already in the artist popup — all seven have been
  there since the intent chooser was built — so that item was marked
  done rather than rebuilt.

This closes Session 3. The rework itself continues — Sessions 4 and 5
are still ahead, and 2.9 is reserved for when it's actually done.

## 2.8.31
- The keyboard now closes when you submit a search. On a phone it stayed
  up over the dive screen that had just opened, covering the thing you
  searched for.
- Added a refresh control to the suggestion row. It draws a different
  handful from a pool three times the size of the row, so it costs no
  requests — the candidates were already gathered and thrown away.
- Added a random dive: picks from the artists on screen, so it can't
  offer something already blocked or filtered out.
- Added an API trouble banner. The suggestion row touches Spotify on
  every load and is the first thing to go quiet, so when it fails the
  page now says what happened — with an error code, and a button that
  runs the real diagnosis and clears the banner if things have
  recovered. Previously the row just came back short and nothing
  anywhere explained why.

## 2.8.30
- The desktop layout is continuous rather than stepped. The measure was
  fixed at 880px, then 1080px above 1280px wide, and tile columns
  snapped from three to four at the same point — so every width in
  between was either cramped or half empty. The measure is now
  `clamp(860px, 88vw, 1440px)` and the grids fill by available width, so
  the column count follows the window instead of jumping.
- Home's preview counts read from the same rule as the CSS rather than
  their own copy of the breakpoints, so a preview row fills at any
  width.
- Removed the "More ways to dive" label — the rows say what they are —
  and gave the group real clearance from the tiles above it.

## 2.8.29
- Reworked "More ways to dive" on the Dives page. It was three identical
  pills with a single warning floating above all of them, so a full
  library scan — the most expensive thing in the app — looked exactly
  like opening a list of pins. They're now rows that each say what they
  do, with the cost attached to the one that has it, matching the
  settings rows.

## 2.8.28
- Fixed: the support-link switch looked broken. The rebuilt settings
  page renamed the wrapper class, and the checked-state styling was
  scoped to the old one — so the checkbox toggled underneath while the
  switch never moved.
- Fixed: the GitHub link in the footer pointed at the repository rather
  than Joseph's profile. It's a credit, not a project link.

## 2.8.27
- Settings rebuilt. It was headings above loose buttons — the shape of a
  form rather than a list of things you can change — with every
  description floating unattached to the control it described. It is now
  grouped rows on filled surfaces, the same vocabulary as tiles and
  track rows, with the control on the right of the thing it controls.
- Controls that can't share a line with a label on a phone — the theme
  picker, the Client ID field — get their own row instead of being
  squeezed alongside.
- Removed the full library scan, pins and history from Settings. Dives
  has owned them since 2.8.24 and listing them in both places was
  duplication.
- Added a footer crediting Joseph, with GitHub and LinkedIn links.

## 2.8.26
- Fixed: the mixes grid collapsed into a staircase of odd-width cards on
  mobile. Removing the old sampler button styles deleted the rule's
  selector line but left its declarations and closing brace behind, and
  from that stray brace onward the browser parsed the rest of the
  stylesheet as garbage — so every rule below it, the mixes grid
  included, stopped applying.
- Added a structural check on both stylesheets: braces must balance,
  there must be no stray closing brace, and no declarations may sit
  outside a rule. Nothing would have caught this otherwise — the app
  booted, and every suite asserts against source text rather than
  parsing the CSS.

## 2.8.25
- The sampler is now the first card in the mixes grid rather than a
  full-width strip below the suggestion row. It is a mix like the
  others, and sitting apart made it look like a different kind of thing.
- Fixed: Mixes rendered its own heading and the card row rendered
  another, so the page said "Mixes — from your library" twice.
- Fixed: the sampler's artist pool was only built while loading
  suggestions, which Mixes doesn't do — so its card would never have
  appeared there. It is now built wherever cards are drawn, from the
  same cached read.
- Fixed: the pool was being reassigned to its own trimmed output on
  every render, so it shrank to twelve artists and stopped being a pool
  to draw different handfuls from.
- Home's preview counts follow the grid instead of being fixed. Four
  items is a full row on a phone and a half-empty one on a desktop grid
  four across, which is why Home looked unfinished at width.

## 2.8.24
- **Home is a summary.** It had become the whole app on one page, which
  is why everything else was hard to find — there was nowhere else to
  look. It now carries the search field, a short row of pins and
  suggestions, and a taste of your mixes, each linking through.
- **Dives** is a destination of its own: search, the full pin and
  suggestion lists, the full library scan, dive history, and pins and
  blocked artists.
- **Playlists are now Mixes**, with the sampler living alongside them.
- Both navigations carry all four destinations — the bottom bar on
  mobile, the top bar on desktop.

## 2.8.23
- Fixed: a mix could contain both the censored and uncensored cut of the
  same song. A clean edit is a genuinely different recording — its own
  ISRC, a title differing by one annotation — so the duplicate collapse
  correctly kept both. Correct for a dive, where you might want either;
  wrong for a mix, where it means the same song twice with one version
  bleeped. Mixes now keep the uncensored cut when both appear.
- Changed: Spotify links open the web player. They used to navigate to a
  `spotify:` URI and race a timer against the page being backgrounded to
  decide whether the desktop app had taken it — but a browser prompting
  "open this app?" backgrounds the page itself and cancels the fallback,
  and a blocked custom-scheme navigation fires nothing at all. Someone
  without the desktop app got neither the app nor the website. The web
  player works for everyone and offers the hand-off itself.

## 2.8.22
- Fixed: including guest appearances still pulled entire albums by other
  artists. Ownership hung on `album_group === "appears_on"` from the
  artist-albums listing, and when that optional field was absent the
  code fell back to `album_type` — which is "album" for an album, so the
  guest check never fired. Ownership is now decided from the album's own
  `artists`, which is always present: if the artist isn't credited on
  the release, only their tracks are kept. This also catches
  various-artists compilations, which were never tagged `appears_on`.
- The catalogue read is now instrumented, and diagnostics shows how many
  releases weren't the artist's own and how many tracks were dropped as
  uncredited. Whether this filter engaged was previously unobservable,
  which is how it stayed broken.
- Fixed: cancelling a sampler left "(33%) Working" in the tab title, so
  it looked stuck. Hiding the screen did reset the title; the run's
  in-flight progress callbacks then set it straight back.
- Removed the track count from playlist cleanup — it read 0 for
  everything.
- Changed: liking or building now reports in a dialog in the middle of
  the screen, and dismissing it returns home. It used to be a banner
  above the buttons, leaving a results list that had already been acted
  on sitting there inviting a second press.

## 2.8.21
- Rolled the version back into 2.8.x. 2.9 is reserved for the finished
  rework and was claimed early; everything shipped as 2.9.0–2.9.15 is
  renumbered 2.8.4–2.8.19.
- Added self-diagnosis. When a dive fails, DeepDive now checks itself
  before reporting anything: it clears a remembered rate-limit pause
  that has already lifted, and clears learned pacing left over from a
  rate limit that stopped happening — both of which caused failures
  during development that looked like Spotify problems and weren't.
- If it repairs something it says so and offers to retry. If it can't,
  it gives a short error code — DD-QUOTA, DD-RATE, DD-AUTH, DD-FORBID,
  DD-NET — with plain-language advice for each, so "it broke" becomes
  something reportable.
- The endpoint test now reads as a speed test as well as a pass/fail:
  it measures what a request actually costs and keeps a rolling
  estimate.
- Dives use that estimate to show time remaining while reading
  releases, instead of a bar moving at an unknown rate. A slow dive and
  a stuck dive used to look identical.

## 2.8.19
- Fixed: the endpoint test reported DeepDive's own throttle as Spotify's
  response time. `_request` paces before it fetches, and the probe timed
  the whole call — so a self-imposed 1200ms wait looked like a slow API.
  Response time and our own waiting are now shown separately.
- The endpoint test now says outright when pacing is heavy, with what it
  costs on a 40-release artist and where to clear it. Learned pacing is
  remembered across sessions and only ever rises on its own, so a dive
  can be five times slower than usual with nothing failing and nothing
  on screen explaining why.

## 2.8.18
- Added an endpoint test under Advanced → Diagnostics. It fires one
  request at each Spotify endpoint DeepDive uses and reports the status,
  including the quota reason when there is one, then says what the
  pattern means: everything refused with a quota error, everything
  rate-limited, some groups refused while others answer, or all clear.
- It doesn't retry. Every other path hides a 429 behind retries, which
  is right in normal use and useless when the question is which
  endpoints are refused — and retrying would spend more of a budget
  that's already short.
- Fixed public ids and 350ms pacing, so a failure means the endpoint
  rather than the data, and the test can't be what trips the limit it
  then reports.

## 2.8.17
- Fixed: the sampler asked for `/artists/{id}/top-tracks` once per
  artist and fell back to search each time it was refused. That endpoint
  is deprecated and refused for the whole app, not per artist, so every
  sampler run spent eight to twelve guaranteed-failing requests to learn
  something already known. The first refusal is now remembered for the
  session.

## 2.8.16
- Settings reorganised. It was nine sections, most of them a heading
  above a single button, in no particular order — Appearance and Theme
  were separated by Playlists, and "Manage" said nothing about the pins
  inside it. Theme and the support-link switch are now one Appearance
  section, and the pins section is named for what it contains.
- Added an **Advanced** section, collapsed by default, holding anything
  that is irreversible, asks for a credential, or is only meaningful
  when something has gone wrong: Client ID and Redirect URI, backup
  import/export, Reset pacing, and the build-number toggle.
- Added: a switch for the build number in the top bar, off by default.
  It reads well and has settled several "is this deployed yet?"
  questions, but it is developer furniture.
- Added Spotify attribution, which the Developer Terms require and which
  was missing from the app entirely.

## 2.8.15
- Fixed: the desktop layout sat slightly left of centre. A centred block
  is centred inside the space the scrollbar leaves, so any page long
  enough to scroll loses about eight pixels on the right. The scrollbar
  gutter is now reserved on both sides, which also stops the page
  shifting sideways when a short view becomes a long one.
- Section edges now share one gutter variable rather than each element
  carrying whatever padding it happened to have.

## 2.8.14
- Added a desktop layout. Every breakpoint in the stylesheet was
  `max-width`, so the base styles were a 760px column that a wide screen
  simply centred — two thirds of the display empty — and because the tab
  bar is hidden above 640px, desktop had no navigation at all.
- The tab bar becomes a fixed left rail at 900px and up. Same markup, so
  nothing in the app logic knows which layout is showing.
- Tiles go to three across at 900px and four at 1280px; playlist cards
  do the same. The content measure widens to 880px, then 1080px.
- The measure stays bounded rather than filling the display. Both
  reference points Joseph gave keep content in a readable column at
  width, and the tile vocabulary reads as sparse stretched across a
  1920px screen.
- The results screen's docked actions now clear the rail instead of
  sitting under it.

## 2.8.9
- Added: the build number now shows in the top bar on every screen. It
  was only at the bottom of Settings and in diagnostics, which made it
  easy to test a stale cached bundle after a push and draw the wrong
  conclusion from the result.

## 2.8.8
- Fixed: a quota limit was being retried like a rate limit. Both arrive
  as 429, but they mean different things — Spotify's July 2026 change
  added a `reason` field so they can be told apart, and DeepDive was
  parsing it off the response and then ignoring it. A `QUOTA_EXCEEDED`
  429 now stops immediately instead of retrying ten times over two
  minutes, since every retry was guaranteed to fail and spent more of
  the budget that was already gone.
- The message says what actually happened. Spotify groups endpoints into
  separate budgets, which is why the home screen can load instantly
  while a dive can't start at all: reading a catalogue draws on a
  different budget from your library and listening history.

## 2.8.7
- Fixed: the app could report itself rate-limited while everything else
  loaded instantly, and stay that way. A sustained 429 stores when the
  pause lifts, taken from `Retry-After`, and only a *successful* response
  clears it — but the flag aborts dives, samplers and scans before they
  issue a request. So it blocked the very calls that would have cleared
  it, and with Home served from cache nothing made a live call at all.
  The lockout held itself in place until the stored time expired,
  however wrong it was.
- The pause is now re-checked with one cheap request on startup, and the
  banner has a "Check again" button. A success clears it immediately.
- A stored pause is capped at one hour rather than trusting a
  `Retry-After` verbatim. Self-correcting: if the ban really is longer,
  the next attempt earns a fresh 429.

## 2.8.6
- Fixed: removing a playlist used `DELETE /playlists/{id}/followers`,
  which is deprecated in favour of Remove Items from Library. Every
  other deprecated endpoint we tested returns 403 in Development Mode,
  and all three callers swallow errors to keep a bulk cleanup running —
  so playlist deletion was most likely failing silently. It now uses
  `DELETE /me/library`, which needs no new scope.
- Added `API_SURFACE.md`: every endpoint DeepDive calls, checked against
  the OpenAPI schema, with the deprecated ones to avoid, the scopes we
  hold, where we're out of line with the Developer Terms, and where a
  dive's requests actually go.

## 2.8.5
- Fixed: dives tripping Spotify's rate limit partway through and taking
  a 15-second penalty. The adaptive throttle started at zero and only
  rose *after* a 429, so every fresh session sprinted into the limit
  first — the exact "penalty box first, slow afterwards" outcome it was
  written to avoid. It went unnoticed because a learned value persisted
  across sessions and quietly protected later dives; 2.8.4 added decay,
  which removed that protection and brought the sprint back.
- Catalogue reads are now paced from the first request: 250ms normally,
  350ms for wide reads including guest appearances. A 60-release artist
  spends about 15 seconds on pacing, which is less than a single
  rate-limit penalty and, unlike one, predictable.

## 2.8.4
- Changed: the results screen leads with the artist. Full-bleed photo,
  name beneath it, and colour-coded counts — duplicates in teal, new in
  gold, already liked in white. The photo fades and drifts as you scroll
  into the lists rather than holding the screen.
- Changed: the three actions — Like Songs, Create Playlist, Both — are
  docked at the bottom and stay put while you scroll, with Back to home
  on its own row beneath them. The decision is the point of the screen,
  and scrolling to the end to reach it was friction.
- Fixed: learned rate-limit pacing persisted forever. `setMinimumPacing`
  only ever raises, and the value is stored across sessions, so one wide
  "everything they've touched" dive or one afternoon of 429s
  permanently slowed every later dive — including standard ones, which
  spend it on one request per release. `resetPacing()` existed for this
  and was never called from anywhere. Pacing now decays after six hours,
  and Settings has a Reset pacing control.

## 2.8.3
- Rebuilt demo mode. It previously substituted a fixed artist list into
  the suggestion row and drew it with the pre-2.2 `pill` markup — a UI
  the app no longer has, so any screenshot taken from it advertised the
  wrong product. It also couldn't stage anything but Home.
- Demo screens now run ahead of every auth check and make no Spotify
  calls at all, so the app can be photographed with the quota locked or
  with no account: `?demo=home`, `?demo=results`, `?demo=sampler`,
  `?demo=scan`, and `?demo=index` for a menu of them.
- Each screen renders through the real renderer with fixed data, rather
  than a second copy of the markup that can fall behind it.
- No artwork URLs anywhere in the demo data — tiles and rows use the
  app's own gradient-initial fallback. Self-contained, nothing to rot,
  and no other artist's album covers on a marketing page.
- Changed: the pre-dive spinner reads "Starting…" rather than "Starting
  dive…", since a sampler isn't a dive.

## 2.8.2
- Changed: the sampler now waits behind the spinner for its first two
  artist photos before opening, the same way a single dive waits for
  one. It can't preload all 8-12 without a visibly long spinner, so the
  rest stream in as they load. Two rather than one, so the opening
  rotation has somewhere to move to. The URLs are already in hand from
  the suggestion row, so this costs downloads, not requests.

## 2.8.1
- Changed: the results screen was the last place the original Flask
  design showed through, and it has been brought in line with the rest
  of the app.
  - Section headings were tracked-out uppercase monospace pills beside a
    hairline rule. They are now plain Inter headings, matching Home.
    This markup is shared, so Settings, History, Pins and scan results
    all move with it.
  - Track rows were a bordered list with a coloured spine per row —
    outlines, against the app's "fills, not outlines" direction — and
    carried no artwork on the one screen where every line has an album
    cover. They are now filled rows with the art flush to the left edge,
    and the whole row toggles its checkbox.
  - Album artwork is carried through the catalogue read to make that
    possible. It was already in the response; nothing extra is fetched.
  - The summary line was a meta string of counts joined by middle dots.
    It now says what was found in sentences.
  - Three primary buttons competed for the same action. There is one
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
