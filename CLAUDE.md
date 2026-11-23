# CLAUDE.md — notes for whoever picks this up next

Written for a future session with no memory of this one. Read this
before touching anything.

**Last updated at build 2.9.158.** If the build in `js/app.js` is well
ahead of that, treat this file with suspicion and verify against the
code — then bring it up to date.

---

## Covers, single refresh, Save dialog — 2.9.158

From Joseph's first 2.9.157 run on his phone, 23 Nov:

- **Broken covers.** The native CSP's `img-src` allowed only
  `*.scdn.co`. Covers uploaded through the API (DeepDive uploads its
  own) are served from `image-cdn-*.spotifycdn.com`, so every one was
  blocked; the web app has no CSP and showed them. `*.spotifycdn.com`
  is allowed now, and a capture-phase `error` listener swaps any
  `img.track-art` that fails for the note tile (inline `onerror` would
  break `script-src 'self'`). Refresh's picker had the same broken
  covers since 2.9.146; nobody had seen it in the app.
- **Row Refresh runs that playlist.** 2.9.157 opened the picker with one
  ticked, which read as not doing what he asked. `refreshOne(p)` calls
  `startRefresh([entry], { checkNew: false })` directly; `refreshDone()`
  sends cancel, review Back and Apply back to the playlists screen.
  New releases stays off for these (a whole catalogue read); the
  picker under Dives still has the toggle.
- **Save dialog.** Exports send `pick: true`; MainActivity opens
  `ACTION_CREATE_DOCUMENT` (legacy `startActivityForResult`, which needs
  no registration before `onCreate`) and writes to the chosen URI.
  Dismissed → `place: "cancelled"` → "Not saved." Downloads stays the
  fallback if no picker exists. The export's message is a toast too:
  Settings' own message line is at the bottom of the page and he never
  saw it.

Compiled and published: run 45203016325, `v2.9.158-untested-android`.
Not run on a device.

---

## Playlists screen, Liked Songs export, Android file saving — 2.9.157

Joseph, 23 Nov (wording in ROADMAP "Shipped since"). Three parts:

- **Tidy up playlists is a screen**, `renderPlaylists` in app.js, rules
  in `playlists.js`. Spotify keeps no creation date on a playlist, so a
  date is history's record (last 20 actions only) or else the first
  item's `added_at` (`playlistFirstAddedAt`, one `limit=1` request),
  stored in `deepdive_playlist_dates` so each playlist costs it once.
  Empty playlists store `""`: known, undated, never "old". Dive rows get
  a Refresh icon that calls `renderRefresh({ from: "playlists", only })`;
  `_refreshFrom` decides where its Back goes. Bulk removals confirm,
  single ones don't (as before).
- **Export Liked Songs** (`exportLikedSongs`, layout in
  `liked-export.js`): syncs the cache, then Exportify-style columns plus
  Genres from cached Last.fm tags. More than `GENRE_AUTO_TOPUP` untagged
  artists asks before a lookup on the dive screen. Spotify genres were
  not used: batch `?ids=` is 403, so it would be one request per artist.
- **Exports did nothing in the Android app.** A WebView ignores a
  `blob:` download link (no DownloadListener, and one can't fetch blob:
  anyway), so backup and mix exports "succeeded" silently. `files.js`
  sends the text to `DeepDiveFiles` in MainActivity.kt, which checks the
  bundled page, allows only `.csv`/`.json` names and those two types,
  and writes into Downloads through MediaStore off the main thread
  (app-specific Downloads on Android 9 and older; no storage
  permission). It answers with a `deepdive-file-saved` event.
  `downloadFile` is now async and returns `{ ok, place }`.

Found by rendering it: `ev.currentTarget` is null after `await
confirmDialog`, so bulk removal threw before its first delete. Take the
button before awaiting. `tools/e2e-playlists.mjs` drives the screen,
the 30-day removal, the single refresh and both export paths against a
mocked Spotify and Last.fm. The Kotlin compiled and the APK published
(run 45196267354, `v2.9.157-untested-android`). **Not checked:**
anything on a device. Desktop builds still use the blob link; whether WebKitGTK and
WebView2 save it is unverified.

---

## Desktop sign-in callback — 2.9.156

Joseph, 18 Nov, Linux: "I do the sign in but it keeps bringing me back
to the last part of setup." The published 2.9.155 .deb's desktop file
read `Exec=deepdive` with no `%u` (downloaded and unpacked it: Tauri's
default template), so the browser's deepdive://callback launched
DeepDive with no URL. `src-tauri/linux/deepdive.desktop` is our template
with `%u`, used by the .deb and .rpm (`bundle.linux.*.desktopTemplate`).

Second cause, Linux and Windows: a deep link always starts a new
process. `tauri-plugin-single-instance` (desktop only, `deep-link`
feature, registered before every other plugin) forwards the URL to the
running app's deep-link plugin, which emits `deep-link://new-url` as on
Android, and brings the `main` window forward. AppImages have no
installed .desktop file, so `register_all()` runs at startup on Linux
and Windows. `cargo check` passes locally (webkit2gtk dev packages
installed in the sandbox).

**Checked on the published 2.9.156 .deb** (downloaded through `gh api
.../releases/assets/<id>` with `Accept: application/octet-stream`, run
under `dbus-run-session -- xvfb-run`): its desktop file has `Exec=
deepdive %u`; with one DeepDive running, launching `deepdive
'deepdive://callback?...'` exits in under a second and the first stays
up. The 2.9.155 binary under the same script started a second app that
ran until killed at 20s. Not checked: that the first window's web layer
completes sign-in with a real Spotify code. The Flatpak already
had `%u` from `tools/flatpak-manifest.sh`, but needed single-instance
too. Single-instance uses a D-Bus name under the app id, which Flatpak
allows without extra permissions.

---

## Restore from a backup during setup — 2.9.155

Joseph, 15 Nov: "why can't I use my export import tool first thing to
not set everything up?" Three reasons, all fixed: backups didn't carry
the Client ID or Last.fm key (`SETUP_KEYS` in history.js now does), the
setup screens had no import (`restoreBlockHtml`/`wireRestore` on the
first screen and step 1), and merge mode dropped every setting. Merge
now fills a setting or setup value only when this device has none;
replace overwrites. Setup values must match the 32-hex format or they're
skipped. `deepdive_actions` was exported but never imported; it merges
by id now. Sign-in tokens are still never exported. Backup format stays
version 1: the new keys are additive and older builds ignore them.

After a restore with a Client ID: Last.fm step if no key, else Connect.
In the native app the Spotify app still needs `deepdive://callback`;
Connect's "Invalid redirect URI" hint covers that. Checked by driving a
fresh browser profile through restore (good and bad files) with
Playwright; the rules are in `test_restore_setup.mjs`.

---

## One publisher for every untested build — 2.9.149

`tools/publish-untested.sh <Platform> <suffix> <dir> <files...>` is the
only way a native build reaches a release. It fails closed (RELEASES.md
Part 6): every listed file must exist and be non-empty, no unlisted file
may ride along, the version needs changelog notes, the tag must not
exist yet; then SHA256SUMS.txt, a pre-release that is never Latest and
titled `UNTESTED — <Platform> build for DeepDive <v>`, notes opening
with the Part 2.3 warning, and an after-check that every asset is there
at the size that was built. `publish-android.sh` is a one-line call to
it, keeping the APK name the updater looks for. The `publish-desktop`
job does the same for Windows (Setup .exe, .msi, portable .exe) and
Linux (AppImage, .deb, .rpm) on manual runs only. Flatpak and tar.gz
aren't built yet. `test_publish_untested.mjs` drives every branch with
a stub `gh`.

**First runs, 15 Nov.** 2.9.149's APK build compiled and verified but
`gh release create` with the files and `--latest=false` in one call got
"HTTP 403: Resource not accessible by integration" from CI's token;
2.9.152 went back to create-then-upload, the sequence that published
every APK through 2.9.148. 2.9.149 was never published and keeps its
number. The 2.9.151 desktop run built Linux but Windows died in "Stamp
the version" with no annotation; two suspects fixed in 2.9.152 (python3
Store stub, cp1252 decoding app.js), neither confirmed. Linux's build
succeeded but publish-desktop waits on both, so nothing was published.

**2.9.152 published all three** (runs 43727225154 and 43727236234):
`v2.9.152-untested-android`, `-linux` (AppImage, .deb, .rpm) and
`-windows` (Setup .exe, .msi, portable .exe), each with SHA256SUMS.txt,
pre-release, UNTESTED title and warning block. The updater's tag regex
only matches `-untested-android`, so desktop releases can't confuse it.
Nobody has run any of them yet.

**2.9.153 adds .tar.gz and Flatpak to Linux.** The tarball is the .deb's
`usr/` tree. The Flatpak repackages the .deb (`tools/flatpak-manifest.sh`,
GNOME 47 runtime, app id `io.github.jpluker.deepdive`) in the
`flatpak` job; `publish-desktop` runs if the build succeeded even when
Flatpak failed, and the Linux notes then say there's no Flatpak
(RELEASES.md 6.4, decided: optional). First run (43728525152) built all
five Linux formats including the Flatpak, and published them.

---

## Release notes and the version guard — 2.9.148

`tools/publish-android.sh` used to carry notes written for 2.9.143, so
2.9.145 shipped describing 2.9.143, and the updater shows release notes
as what's new. Notes now come from `CHANGELOG.md` through
`tools/release-notes.mjs`: **every build needs a `## <version>` section
before it can publish.** `tools/version-guard.sh` runs first in the
Android job and fails if the APK for this number is already on its
release (a 404 is the only "free" answer; any other lookup failure
fails the build), or if the changelog has no section. `--clobber` is
gone, so a published APK is never replaced.

The 2.9.145 release body still has the old notes: this session type
can't edit releases (HTTP 403). Joseph can paste the 2.9.145 changelog
section into it, or leave it.

---

## Refresh dive playlists — 2.9.146

Joseph asked for it on 15 Nov (wording in ROADMAP "Shipped since"). The
rules are in `docs/js/refresh.js`, pure and tested in `test_refresh.mjs`;
the screen, job view and review are `renderRefresh`, `startRefresh` and
`renderRefreshReview` in app.js. Removal uses `DELETE
/playlists/{id}/items` with `{ items: [{ uri }] }`, the current endpoint;
it has not been run against a real account yet.

**Add new releases is single-playlist only** (Joseph, 15 Nov):
`canAddNewReleases(n)` in refresh.js; the screen disables and clears
the toggle otherwise, and `planRefresh` ignores it for more than one.

Dive playlists are identified by their description, which is what
separates them from dips, mixes and Multi-Dips sharing the "DeepDive · "
prefix. If the dive playlist name or description ever changes, change
`DIVE_DESCRIPTION` with it.

**`tools/e2e-refresh.mjs` drives the real app against a mocked Spotify**
(fake tokens in localStorage, `page.route` answering api.spotify.com).
The `?demo=` routes can't reach Spotify from the sandbox; this can, so
it's the pattern to copy when a flow needs real data to render.

---

## Progress redux — 2.9.145 (#19)

Joseph: one dive's progress looked wrong, another showed no notification,
and syncing songs showed two tasks. Three causes, all in
`test_progress_redux.mjs`:

- `runSearch`'s catalogue callback called `stageCb` and then `report()`,
  and `report` sets the bar to the stage's *start*. Every tick reset it
  to 25%. One call now carries both the fraction and the count.
- `LibraryCache.getLikedTracks` took its own native lease even inside a
  dive or scan. `withBackgroundWork(..., { join: true })` now rides on a
  running job with no row and no progress of its own; with nothing
  running it still owns one. `readLibraryFullScreen` still passes its
  screen lease explicitly.
- Android 12+ defers foreground-service notifications by ten seconds;
  `FOREGROUND_SERVICE_IMMEDIATE` on API 31+. The collapsed notification
  now follows the newest job by start order, not by latest update.

Not run on a device. The APK is built by the `[native-build]` commit.

---

## Artist identity — 2.9.144 (#18)

Picking "idk" produced a dip for "Artist Unknown". Dive entry points
passed only a name and the dive re-searched Spotify, taking the top
result when nothing matched. **A pick that knows its Spotify id passes
it:** `startSearch(name, { artist })` or `{ id }`, and
`rememberArtistChoice` seeds `_artistLookups` so every later
`lookupArtist(name)` in that dive returns the chosen artist. Only typed
text and the retry button start a dive by name alone, and
`test_artist_identity.mjs` fails if another bare call appears.
`findArtist` prefers an exact name, then a punctuation-only match, and
otherwise returns the top result flagged `closestMatch`; the chooser
then shows "Closest match on Spotify". Last.fm's autocorrect folding a
name into "[unknown]" is re-asked without autocorrect (`artistCall` in
`lastfm.js`). Not reproduced against live Spotify from here: which of
the two routes Joseph hit is unconfirmed, so both are covered.

---

## Testing feedback and Android updater — 2.9.143

Joseph ended the collect-only testing phase and explicitly requested implementation
and a build. This batch covers all collected 2.9.142 feedback.

- Backup/data controls now live under Advanced (Joseph's explicit deviation from
  DESIGN.md 14.19's top-level Data & storage category). Export/import are filled,
  wrapped buttons with success feedback beside them. Do not move them back out.
- Generated playlist names are automatic everywhere; the editable fields in
  results and mix dialogs are removed. Naming rules and playlist reuse remain.
- Mixes shows six top genres on a horizontal artwork shelf. Browse genres opens
  a dedicated full-screen searchable list of all available genres; each opens
  its mix. No inline Show all/Show fewer wall, and no multi-select genre picker.
- The artist chooser footer is transparent instead of a hard rectangular slab.
  Results use a detached rounded glass action dock, measured clearance (including
  font scaling), a scroll reset before hero fade, and a compact missing-image
  header. The dive's already downloaded photo is reused if needed.
- The native background reassurance is removed. Collapsed scan/dive notifications
  start with the percentage, before potentially long stage details; expanded
  stage and count text stays available.

AndroidUpdater.kt is installed beside MainActivity by android-activity.mjs. It
fetches only the fixed GitHub release listing; selects numeric newer versions,
exact universal APK names and repo URLs, and requires GitHub's SHA-256 asset
digest. Testing includes prereleases; Stable excludes them. Drafts, old debug
APKs, missing hashes and incomplete uploads are ignored. HTTPS redirects are
limited to exact GitHub asset hosts. Downloads are size/time bounded, cancelable,
and written to a private .part file before verification and atomic rename.

Before staging AND installation: validate byte length/hash, package, version,
higher versionCode, and the installed/candidate certificate against our permanent
SHA-256 pin. Installation is blocked during active work both in JS and native,
requires a foreground window, and launches Android's installer through a private
FileProvider exposing only files/updates. Unknown-source permission opens Android
settings with an explicit return-and-tap-install-again instruction. No silent
installation, arbitrary URL bridge or external storage permission. Installed app
data remains in place during a same-key upgrade. One manual APK install is needed
to acquire this updater; the next newer release will test its actual upgrade flow.

Settings → Updates has automatic checks, Stable/Testing channel, manual check,
plain-text release notes, download percent/MB, cancel, verification and install
states. Automatic checks run once per launch and expose a quiet Update header
button only when a newer APK exists. Defaults: checks on, Testing channel for
this testing distribution. Downloads do not promise process-death recovery or a
foreground service of their own; restart/retry if Android kills the process.

Verification: 2,346 checks across 77 suites, including real bridge state/retry/
permission flows and an executed genre-search/drill-in regression. The previous
build fails the new visual/genre/naming regression. Browser installation failed
(truncated Chromium download), so actual phone layout and notification/updater
installation remain device checks. CI must compile/sign and verify before release.

---

## Phone feedback, library jobs and notification progress — 2.9.142

2.9.141 is the first successfully published permanent-key release:
run 40708590022, signer SHA-256
`e729122a7c4ea1ea13385aa29bc5fd9989d57ade818ca4338d21d4123bf18633`,
versionCode 2009141. Joseph installed it and reported the next phone bugs.
Do not require another uninstall for updates signed with this same key.

The last max-width:640px .wrap shorthand overwrote the tab-bar clearance
with 60px. Both mobile rules now reserve measured bar height plus 32px
and the safe-area inset; toast placement uses the same measure.
Import feedback is beside the control and in a live-region toast after
any redraw. History previously discarded its success message during
renderHistory; Settings' message was far below the import control.
The shared backup-import module shows a busy state, reports actual added
counts (or no new items), and resets the picker for retry.

Explicit library reads/refreshes now own the same full-screen view as a
dive. LibraryCache shares one in-flight paging operation across callers
and broadcasts counts/artwork to subscribers. Tab changes are blocked
while that explicit job is active. Cancel stops between requests and
cannot replace the last complete cache with partial data. Old cancelled
jobs cannot close a newer screen. The screen's native lease is reused
by its cache read so it appears as one notification job.

Native progress messages carry a task token, current/total and stage.
Notifications show a determinate bar and percentage when totals exist,
or an indeterminate bar otherwise; expanded text shows simultaneous
jobs separately. Notification redraws are coalesced to 500ms and late
updates cannot revive completed work. Screen progress, library page
counts and rate-limit waits feed the service without extra Spotify calls.

Blank progress views now rotate full-size pin photos and cached album
art, capped at 12 downloads. First-sync pages can supply their own album
art before the cache is saved. Primary artist photos replace fallback
art; delayed artwork from a previous job is ignored. No per-artist API
requests are made for decoration and small pin thumbnails are excluded.

Tests cover shared paging across tab-like subscribers, cancellation,
cache integrity, progress leases, import success/error/duplicate feedback,
artwork selection and the winning phone padding rule. Chromium is not
installed in this environment; phone visual checks and actual Android
notification presentation remain device checks.

---

## Verify PEM certificate data — build 2.9.141

Run 40705794291 compiled the 2.9.140 release but parsed zero signers;
it did not establish that a different key signed the APK. Expected
public certificate SHA-256 is
`e729122a7c4ea1ea13385aa29bc5fd9989d57ade818ca4338d21d4123bf18633`.

Verification now explicitly requests --print-certs-pem, captures both
stdout/stderr, and compares canonical X.509 PEM certificate fingerprints.
Human-readable label parsing is retained for compatibility tests, but
the real APK verifier requires PEM data. A successful apksigner exit
status and matching certificates remain mandatory. Missing certificate
output now reports the signing tool's public verification output rather
than another ambiguous zero-signer failure. No private key or password
is passed to that tool or included in its verification-mode output.

The Android Rust cache uses a dedicated android-release shared key;
the old cache reported up-to-date despite repeatedly recompiling release
profiles, so it could not be relied upon to retain the newly built deps.

---

## APK certificate verification formats — build 2.9.140

Joseph corrected the GitHub secrets. Run 40702871721 attempt 2 passed
keystore/alias validation and compiled/signed a release APK, but the
certificate comparison rejected it. No APK was published. Do not ask
him to change the password again: credential validation now passes.

The verifier originally recognized only `Signer #N` labels. AOSP
apksigner also emits `Signer (minSdkVersion=..., maxSdkVersion=...)`
for v3.1 signatures. Accept SDK-range rows only when every row matches
the same configured certificate, reject multiple declared/numbered
signers, and normalize the configured certificate with X509Certificate
before comparing. Public expected/actual fingerprints are now logged,
so a real mismatch can be distinguished from an unsupported label.
The new range-format test fails on the old parser. This does not yet
establish which case the failed APK hit: inspect the next run's public
fingerprint report before claiming the signature check has passed.

Rust cache now saves on failed Android jobs too, so a post-compile
verification failure does not discard the completed release compilation.
The signing keystore stays in RUNNER_TEMP outside that cache.

---

## Signing credential diagnosis — build 2.9.139

The first permanent-key run (40701922061, build 2.9.138) failed at
keystore validation before compilation. Four secrets were present and
Base64 was syntactically valid, but keytool could not open the key with
the provided store password/alias. No signed APK was published.
The original generic failure did not establish which input was wrong.

2.9.139 classifies keytool errors into fixed safe messages for password,
alias or unreadable file. Raw keytool output and secret values remain
suppressed. Full keystore validation now runs immediately after Java
setup, before downloading the SDK/NDK or compiling. Disposable keys
verify password/alias diagnosis and cleanup. Check the new run before
asking Joseph to change a particular secret; do not guess or request
that he paste credentials into chat.

---

## Permanent Android signing — build 2.9.138

Joseph generated and backed up his own JKS in Termux, then added all four
repository secrets: ANDROID_KEYSTORE_BASE64, ANDROID_KEYSTORE_PASSWORD,
ANDROID_KEY_ALIAS, ANDROID_KEY_PASSWORD. No private signing material is
stored in this repo or supplied to this session.

The Android workflow now builds release APKs. `android-signing.mjs`
validates required secrets/Base64, writes a mode-0600 temporary keystore,
validates its store password/alias with keytool, and patches generated
Gradle to read passwords directly from environment variables. Store and
entry passwords can differ. It also preserves @JavascriptInterface
members under R8 for the background-work bridge. There is no debug
fallback if signing fails; the temporary key is removed even on failure.

`android-verify-signing.mjs` runs real apksigner/aapt against the final
universal release APK before copying or publishing. It compares the
APK's sole signer against the configured key certificate and checks app
ID, version and non-debuggable status. It logs only the public certificate
SHA-256 fingerprint and version. Signing files are ignored by git.

Direct download name: DeepDive-<version>-Android-universal-UNTESTED.apk
on v<version>-untested-android. The debug suffix is gone. The first move
from an older debug-key install requires a one-time uninstall after data
export. Later APKs signed with the same permanent key can install over
it. On-device upgrade preservation remains a manual check, not something
inferred from a successful compiler run. No in-app updater is included.

Older entries saying stable signing is outstanding describe earlier
builds and are superseded by this section. Do not regenerate a signing
key on each runner or silently fall back to debug builds.

---

## Android background jobs — build 2.9.137

Joseph requested real background library reads/scans/dives on Android.
`BackgroundWorkService` in the installed MainActivity.kt is a private
`dataSync` foreground service with an ongoing notification and bounded
partial CPU wake lock. The activity resumes its WebView after Wry pauses
it, only while this service is running. An origin-checked JS interface
on the bundled app page manages task tokens and native Handler timers.
`background-work.js` owns leases, duplicate releases and startup races;
Spotify, Last.fm and scan pacing use its clock during active work.
LibraryCache.getLikedTracks owns a lease even without the progress UI;
showDiveScreen/hideDiveScreen own another for dives, scans and mixes.
Overlapping jobs keep separate tokens, so finishing one cannot stop another.

Browser/PWA keeps the previous wake-lock fallback and cannot promise
Android background execution. The native service starts while the app
is visible, stops after work, and does not restart after process death.
Force-stop/swipe-away still stops work; catalogue/duplicate checkpoints
remain the recovery mechanism. Android 15+ limits dataSync services;
onTimeout stops cleanly and pending native waits reject. A 5h55 bound
also protects older releases. Stable signing is still outstanding.
This is not a replacement native task engine surviving WebView destruction.

Backup now puts its buttons below its description, and the file input
uses the hidden class so the native file chooser cannot steal row width
(the screenshot had squeezed the description to one word per line).

Regression suite exercises leases, native timers, concurrent jobs,
startup cancellation, library failure cleanup, timeout and retry. Fourteen
checks fail against 2.9.136. Native compilation and phone screen-off tests
must be checked separately; mocked JS does not prove Android execution.

---

## Android callback admission — build 2.9.136

Joseph installed 2.9.134 successfully but approving Spotify returned to
Connect Spotify without an error. Android routed the intent, but the
plugin discarded it: `DeepLinkPlugin.isDeepLink` rejects every URL when
`plugins.deep-link.mobile` is empty. A manifest filter alone is not
runtime registration. Configure mobile `scheme: ["deepdive"]`,
`host: "callback"`, `appLink: false`; leave paths unconstrained so the
empty callback path is accepted. Source verified in the plugin's
Android `DeepLinkPlugin.kt` and Rust `config.rs` on 23 Oct.

Three regression checks failed on 2.9.134 before adding that configuration.
The earlier mocked callback tests bypassed the Android admission filter
and could not detect this bug. Device sign-in remains unverified until
Joseph tests the new APK.

Joseph requested direct APKs: Android CI now publishes the APK as an
asset on `v<version>-untested-android` prereleases, in addition to its
internal Actions artifact. Give him the releases/download APK link,
not the Actions ZIP. Stable signing remains outstanding.

---

## Android follow-up — build 2.9.134

Joseph's screenshots showed content beneath the Android status bar and
`ERR_UNKNOWN_URL_SCHEME` during OAuth. The latest native workflow was
still `39994429428` at `1d39048`: **2.9.133 had only deployed to Pages**.
Do not infer that an APK contains a source fix because the push passed.

`src-tauri/android/MainActivity.kt` now applies measured Android insets
to the native content container, consuming them to avoid CSS applying
another safe-area gap. It handles system bars, cutouts and the IME.
`tools/android-activity.mjs` installs it into the generated project after
init; a package mismatch, missing activity or multiple activities fails
the build rather than guessing where to write.

**Build delivery:** the Native builds workflow also listens for pushes,
but only an explicit `[native-build]` commit runs the Android job.
Desktop jobs remain manual, and normal pushes skip compilation. Marked
builds take the version from `app.js`; manual runs use their validated
input. This session requests a 2.9.134 APK with the inset change and
2.9.133 OAuth fixes. Check the run result and artifact before claiming
that Android is ready. Device checks, including keyboard and rotation,
remain Joseph's. No on-device verification is claimed here.

---

## Android / native handoff — 23 Oct, build 2.9.133

The native workflow **has compiled successfully**, most recently run
39994429428 at commit `1d39048` (Windows, Linux and Android). The older
queue saying nothing has compiled is superseded. Compilation does not
establish that sign-in works on a device.

This session corrected native OAuth in `docs/js/auth.js`,
`docs/js/native.js`, and the app controller. Use Tauri's global
`core.invoke` for plugin commands: `withGlobalTauri` does not create an
`opener` namespace. Opening a URL needs both `opener:allow-open-url` and
its URL scope. Never fall back to navigating the native WebView when
opening the browser fails. Never replace its history with the custom
callback scheme: that changes origin and throws before token exchange.

The web layer listens to `deep-link://new-url` and calls
`plugin:deep-link|get_current` after subscribing, so a cold-start intent
is recovered. Duplicate intent deliveries are filtered. PKCE data stays
in localStorage across process death; no credentials are logged. Boot
consumes early callbacks before queued event handlers can render.

**Next:** build 2.9.133 with the Native builds workflow and run the
Android checklist at the top of `TESTING.md`: normal sign-in, return
following process death, denial/retry, and Open in Spotify. Runtime
checks use mocked Tauri interfaces; this environment has no Android SDK
or device and cannot establish an on-device result. Current APKs are
debug signed; a stable release signing key is still needed before
reliable upgrades across clean CI runners can be promised.

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

**Handoff is GitHub Issues, not chat.** Per the standards repo's
`WORKFLOW.md` 1.1: read the open issues at the start of every session
and treat them as the to-do list. **Agents close issues themselves**
once the fix is pushed and proven (Joseph, 11 Nov), with the closing
message in WORKFLOW.md 1.2: version, Eastern timestamp, commit, proof,
what wasn't tested. `gh issue` is GraphQL and blocked here; use
`gh api -X PATCH repos/JPLuker/DeepDive/issues/N -f state=closed -f
state_reason=completed`. **A report you couldn't reproduce stays open**
with a "possibly fixed" comment, so don't put `Closes #N` in that
commit: GitHub closes it on push (it happened with #18, 15 Nov). Partly
done gets a comment saying what's left.

**Version numbers are Joseph's call.** Claimed 2.9 twice, then 3.0 once
— that last from reading "3.0 was the new 2.9 target" as permission to
take the number, when it meant 3.0 is what the work is aiming at. When
a message mentions a version, it is far more likely to be about the
plan than a licence to bump. Ask. 2.9 marks the finished rework
and has been claimed early twice — the second time by deciding a
session's completion amounted to it. Finishing a session is not
finishing the rework. Bump patches and let him say when.

**Order every roadmap by who can do the work, Claude first.**
Joseph's call, 20 Oct: he is usually at work while a session runs, so a
plan that interleaves his tasks with Claude's stalls on a question
nobody is there to answer. A roadmap gets two lists — what Claude can
finish unattended, in the order to do it, and what genuinely needs
Joseph, collected in one place so he can clear several at once.

Split a phase if it spans both. The quota work is the example: writing
the escalating-wait change is Claude's and can be ready and waiting,
while the deciding run needs real quota and is his. Don't park the
whole phase behind him.

When something in Claude's list turns out to need him, move it to his
list **with the reason** and carry on down the queue. Don't stop and
wait, and don't guess at an answer that can't be undone.

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
- **Do not ask him for a token, and do not use one he pasted earlier.**
  This sandbox injects GitHub credentials through the agent proxy:
  `GH_TOKEN=proxy-injected`, and `gh api user` returns `JPLuker`. That
  covers push, `gh run`, `gh release`, and workflow dispatch. A pasted
  PAT is not needed for anything.

  Two traps, both of which cost a session:
  - **Never `unset GH_TOKEN`** to "test whether proxy auth works". That
    removes the credential and `gh` replies "please run gh auth login",
    which reads exactly like proof that the proxy has no auth. It is
    not; it is self-inflicted.
  - His PATs are **fine-grained**, so `X-OAuth-Scopes` comes back empty
    and `gh auth status` declares the token invalid even while `git
    push` with it succeeds. Do not conclude from `gh auth status` that
    a token is dead — and do not then reach for `curl` as a
    workaround, because the real fix is to stop passing the token.

  He asked once why a token was still being used after this was
  discovered; the honest answer was that no one had tried the proxy.
  Try it first.

- If a push does go out by URL for any reason: **verify the push
  landed**, because a failed auth still prints success if you echo on
  the wrong condition. That has happened.

  **Verify against the remote, not against `origin/main`.** Pushing by
  full URL — which is what keeps the token out of `.git/config` — does
  not update `refs/remotes/origin/main`, so that ref sits at whatever
  it was last fetched at and `HEAD` looks ahead of it forever. This
  produces a confident false "unpushed commits" warning, including from
  the stop hook, and it has cost time three times now. Ask the remote:

  ```bash
  R=$(git ls-remote "https://JPLuker:$T@github.com/JPLuker/DeepDive.git" refs/heads/main | cut -f1)
  [ "$R" = "$(git rev-parse HEAD)" ] && echo "landed"
  git update-ref refs/remotes/origin/main "$R"   # so the hook agrees
  ```

  That last line is the part that is easy to skip and the reason this
  keeps coming back. Do it in the same command as the push.

  Also: if `git rev-parse origin/main` ever warns that the name is
  ambiguous, there is a stray local *branch* literally called
  `origin/main` (`refs/heads/origin/main`) shadowing the remote-tracking
  ref, and every comparison against it is meaningless. One was deleted
  in 2.9.110. Check with `git for-each-ref | grep origin/main`.

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
```

**The Flask app is gone from the tree.** `app.py`, `matching.py`,
`progress.py`, `spotify_client.py`, `watchlist.py`, `templates/`,
`static/`, `run.sh` and `requirements.txt` were removed in 2.9.89,
along with `PWA_MIGRATION_PLAN.md` (carried out) and
`SETLISTFM_SURFACE.md` (setlist.fm is dropped). Several modules still
carry comments saying they are a port of one of those files, and those
comments are worth keeping: the originals are at commit `80d4a54` and
in the v1.x tags.

**`app/index.html` and `index.html` are separate files. Edit both.**
There used to be a `regen-app.sh` that rebuilt the app shell's `<head>`
from the landing page's, and this note used to say running it mattered.
It was written on 2 Sept, before the app moved under `docs/`, and it
opened `index.html` from the repo root — so it had been dead ever since
and nobody noticed, because nobody ran it.

Worse than dead: the two heads diverged completely while it was broken.
The app shell carries the whole app stylesheet in its head (1,435 lines
against the landing page's 786), so running it would have overwritten
every app style with the landing page's and destroyed the UI. It was
deleted in 2.9.109 rather than repaired, because the premise that one
file derives from the other stopped being true a long time ago.

When a style has to match across both, change it in both and say so in
the commit.

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

1,750 assertions, 62 suites at 2.9.111, plus a syntax check and a boot
check. It takes seconds.

**Gate the push on the suite's exit code.** `run.sh ... | tail -2 &&
git push` pushes whatever the suite said, because `tail` succeeds. That
shipped a failing 2.9.45. Use this shape:

```bash
if bash tests/run.sh > /tmp/t.txt 2>&1; then git add -A && git commit ... && git push ...
else echo "SUITE FAILED, not pushing"; grep "✗" /tmp/t.txt; fi
```

**The gate this file used to show was vacuous.** It was `grep -q " 0
failed" /tmp/t.txt`, and every passing suite prints its own line ending
"N passed, 0 failed", so it matched whenever *any* suite passed. 2.9.150
went out with a failing suite through it (15 Nov). `run.sh` exits 1 on
any failure; use that. InternalDesignGuidelines SOP 9.3 shows the same
grep and needs the same fix.

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

**A name is a label, not an identity.** The search list showed the
user a specific artist, then handed only its name to the dive, which
searched Spotify again and could land on somebody else (#18). When a
pick already knows its id, carry the id; when a lookup falls back to
"closest", say so on screen.

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

**Anchor a CSS slice on the rule, never on position.** Four checks
this week sliced onto the wrong rule and asserted nothing, or asserted
the wrong thing: `.tabbar {` matched the base `display:none` instead of
the floating rule, `.modal {` matched a chroma-key demo override and
later a reduced-motion one, and `.bill-btn {` matched a 30px descendant
override. One of them led to "fixing" a bleed margin that was already
correct, because the generic `.modal` padding is not what applies to
`#intent-modal` on a phone — a more specific rule is.

Match on something only that rule contains (`position:fixed`,
`width:100%`), assert the slice found what you meant, and when a guard
already exists for the thing you are about to check, read it before
writing a second one.

**A green suite is not a working app.** The assertions read source
text. They cannot see an element sitting on top of another, a dialog
that never opens, a stylesheet truncated by a stray brace, or a
response shaped differently from the documentation. Every serious bug
here was found by Joseph looking at a screen. Before 3.0, work through
`TESTING.md` deliberately rather than trusting the count.

**You can render it now — do that before claiming anything visual.**
`node tools/shoot.mjs [screen]` drives the Chromium that ships in the
sandbox over the `?demo=` routes at phone and desktop width in both
themes, writes PNGs to `shots/` (gitignored) and reports console
errors. Serve the site first:

```bash
cd docs && python3 -m http.server 8231 &
node tools/shoot.mjs            # everything, ~40 shots
node tools/shoot.mjs mixes      # one screen
```

This file used to say the desktop work was "built without being
rendered: Chrome won't install in the sandbox". That was true when it
was written and stopped being true without anyone noticing, which cost
the project three bugs that shipped: the demo error screen never
worked, four demo screens threw a TypeError instead of showing it, and
the scan header read "Checked your of all artists". All three were
found in the first run.

**The design checklist can be measured, not just ticked.**
`node tools/review.mjs` runs DESIGN.md Part 21.2 against every demo
screen in both themes: contrast (compositing translucent layers, so
text on glass is scored against what is actually behind it), tap
targets, computed font sizes, and how many primary buttons a view has.
It found four contrast failures and 64 undersized targets the first
time, including white-on-accent at 3.83:1 and a label at **1.04:1**
that had been invisible in the light theme for weeks. A checklist read
by eye gets ticked; this does not.

Two other tools in the same family: `tools/copy-dump.mjs` prints every
visible string per screen in reading order, which is how Part 10 should
be reviewed, and `tools/dead-css.mjs` finds unreachable rules.

**Spotify is not reachable from the sandbox**, so chooser, dive, mixes
and results render their error card rather than content. Home, sampler,
scan, crate, multidip and settings render with empty data. That is
enough to check layout, chrome, glass and both themes; it is not enough
to check anything that needs real artwork or counts.

*Look at the images.* A console-error count of zero is the same trap as
a green suite one level up.

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

## Identity

- Visual style: project's own (Aurora-era) — approved by Joseph
  2026-11-15: "keep the look, it looks fine". Asked whether to move to
  Quiet Precision (DESIGN.md Part B); he said no. Small fixes stay
  within this look; nothing gets restyled without asking again.
- Accent: blue — light `#0B54FF` / dark `#3E7BFF`
- Neutrals: cool near-black (`#0B0C0F` base)
- Semantic shifts: gold and teal secondaries
- Display font: Martius, wordmark only (Geist everywhere else)
- Shape: pill buttons, floating pill tab bar
- Density: default
- Signature detail: the full-bleed dive screen over the artist's photo

## Deviations

From InternalDesignGuidelines defaults, on purpose:

- **Backup lives under Settings → Advanced**, not a top-level "Data &
  storage" category (DESIGN.md A4). Joseph's call during the 2.9.143
  phone review. Don't move it back out.
- **Martius is a third font family** on the wordmark only (A9 allows
  two plus "one brand display face", so this is within the rule now).
- **Release tags are `v<version>-untested-android`** until 3.0, not a
  bare `v<version>`: nothing has been through a full device pass yet
  (RELEASES.md Part 2).

## Design direction

> **The standards changed on 11 Nov.** DESIGN.md v2 split into Part A
> (how screens behave, copy, Settings, accessibility: the default
> everywhere) and Part B (Quiet Precision, an *option* only with
> Joseph's yes). Aurora Glass is archived. Part A applies to DeepDive;
> Part B does not: Joseph, 15 Nov, "keep the look, it looks fine". Ask before any
> visual rework (DESIGN.md B0). The note below predates that.
>
> **Superseded. `JPLuker/InternalDesignGuidelines` wins.** Joseph's
> call, 18 Oct: where the standards repo and this section disagree, the
> standards repo is right. Read its `WORKFLOW.md` at the start of a
> session and `DESIGN.md` ("Aurora Glass") before any UI work.
>
> It reverses things recorded below as deliberate, so the reason
> matters: one house style across every project beats a per-project
> one, and these decisions were made before the standard existed.
> Known conflicts were tracked under issue #14. **Still open:** hard
> dividers in several places; seven ALL-CAPS labels in app chrome; the
> radius tokens are `--radius-*` where Part 20 names them `--r-*`; the
> type scale has not been checked against Part 9.2; the Part 10 copy
> pass and the Part 21 self-review are both outstanding. Already in
> line: pill buttons, fills over outlines, and a working light and dark
> theme.
>
> **Settled since:** the font moved to self-hosted Geist in 2.9.109.
> The ambient layer is out — Joseph's call, 18 Oct, it isn't wanted.
> `Martius` stays on the wordmark as a third family, which the
> two-family rule in Part 9.1 would otherwise forbid; it is the brand
> mark and was not something to change unasked. Settings → About exists
> as of 2.9.110, which several MAINTENANCE.md items hang off. The tab
> bar became a floating glass pill in 2.9.111 (P2, 14.1), which brought
> the first glass tokens into the app: `--glass`, `--glass-blur`,
> `--glass-highlight`, `--glass-shadow`, `--hairline` and
> `--accent-soft-fill`.
>
> **`--hairline` and `--line` are different things, deliberately.**
> `--hairline` is the low-opacity border glass carries (Part 6.1);
> `--line` is the hard 1px edge that the divider work is removing. Don't
> consolidate them — reaching for `--line` on a floating element is how
> the fencing comes back.
>
> Its copy rules (Part 10) are most of what the 3.0 copy-rewrite gate
> was for, so do those as one pass rather than twice.
>
> The rest of this section is kept as the record of what DeepDive did
> before, since it explains why the code looks the way it does.

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

Build **2.9.158**, all 2.9.x. **3.0 is the final release, not a next
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
