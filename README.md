# DeepDive

A self-hosted tool that reconciles your Spotify Liked Songs against a full
artist catalog. Type an artist, and DeepDive:

1. Pulls your Liked Songs and everything the artist has released (albums, singles, EPs).
2. Finds recordings you've already liked under a *different* release — e.g.
   you liked the album cut of a song, but not the standalone single or EP
   version — using ISRC codes (with a fuzzy title/duration fallback for
   the rare track missing one).
3. Lets you review and confirm which of those to add to your Liked Songs.
4. Builds a playlist of everything by that artist you haven't liked at all.

Nothing is liked or added automatically without you checking a box and
clicking confirm.

Tested on Linux (Python 3.10+). Should also run on macOS/Windows unchanged,
but Linux is the supported target.

## Setup

**1. Create a Spotify app** (free, ~2 minutes)

Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard),
log in, and click **Create app**. Fill in any name/description. For
**Redirect URI**, add exactly:

```
http://127.0.0.1:8888/callback
```

Save, then open the app's settings and copy the **Client ID** and **Client Secret**.

## Running it

**Easiest — the launcher script:**

```bash
cd deepdive
./run.sh
```

First time you run it, this sets up a virtual environment and installs
dependencies automatically (only happens once). Every time after that, it
just starts the app immediately. It also opens your browser to
`http://127.0.0.1:8888` for you a couple seconds after the server comes up.
Press `Ctrl+C` in that terminal to stop it.

If double-clicking `run.sh` from your file manager does nothing (some file
managers open scripts as text instead of running them by default), either
run it from a terminal as above, or right-click it → Properties →
Permissions → enable "Allow executing file as program", then double-click.

**Manual, if you'd rather not use the script:**

```bash
cd deepdive
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python3 app.py
```

Either way, since no Spotify credentials are configured yet on first run,
you'll land on an in-app setup page: it shows you the exact Redirect URI to
paste into your Spotify app's settings, and has fields to paste in your
Client ID and Client Secret directly — no config files to open or edit.
Save, and you're taken straight to the search page.

(A `.env` file is still used under the hood to persist these between runs,
but you never need to open it by hand.)

## Notes on the matching

- The primary signal is **ISRC** (a per-recording code Spotify exposes on
  full track objects). If the album cut and the single share an ISRC,
  they're the same recording and get flagged as a match.
- If a track has no ISRC (uncommon but happens), DeepDive falls back to
  fuzzy title matching + duration tolerance (±3s) restricted to tracks by
  the same artist.
- Genuinely different recordings — remixes, live versions, alternate
  masters with a new ISRC — are correctly treated as *new*, not duplicates.
- Nothing is perfect here; that's why the app shows you every match before
  touching your library rather than auto-liking anything.

## Notes on artist matching

DeepDive only pulls the artist's own **albums and singles**, not tracks
where they merely "appear on" someone else's release (guest features,
compilations), to keep results focused on their own catalog.

## Scanning your whole library, not just one artist

Below the search box on the home page, **full library scrub** runs the
same crawl the single-artist search does, once per distinct artist in
your Liked Songs. This is thorough but genuinely slow for a large,
varied library — budget for it to possibly take 30-60+ minutes. You can
cancel at any point and still see whatever was found up to that point.

You'll also see artist suggestions pulled from your recent listening
activity and top artists, each one click away from a search.

**Note:** these features need two additional Spotify permissions beyond
what earlier versions requested. If you're upgrading from an older
version, DeepDive will notice your existing connection is missing them
and prompt you to reconnect — just click Connect Spotify again and
approve the updated permissions.

## Re-running for the same artist

If you run DeepDive again for an artist you've already built a playlist
for, it reuses the existing playlist (matched by exact name) instead of
creating a duplicate one, and skips any track that's already in it — so
re-running never adds the same song twice. The results page after
confirming will tell you how many tracks were skipped as already present.

## Connecting your account

Clicking **Connect Spotify** opens Spotify's login/consent screen in a
popup window rather than navigating away from DeepDive — approve access
there and the popup closes itself automatically, dropping you back into
the search page. If your browser blocks the popup, a fallback link appears
to do it as a normal page redirect instead.

## Progress while searching

Large catalogs (an artist with hundreds of releases) can take a while to
fully read, since DeepDive checks every album's tracklist and pulls full
track details for ISRC matching. The search page shows a live progress bar
with the current stage while this runs in the background.

## Data & privacy

Everything runs locally on your machine. Your Spotify tokens are stored in
your Flask session cookie and a local `.cache-deepdive` file (created on
first login) — nothing is sent anywhere except directly to Spotify's API.
Delete `.cache-deepdive` to fully log out and clear cached tokens.

## Troubleshooting

- **`python3 -m venv venv` fails with something about `ensurepip`** — some
  Linux distros split the venv module into a separate package. On
  Debian/Ubuntu: `sudo apt install python3-venv`, then re-run `./run.sh`.
- **"INVALID_CLIENT: Invalid redirect URI"** — the Redirect URI in your
  Spotify app settings must match `SPOTIPY_REDIRECT_URI` in `.env` exactly,
  including the trailing path and using `127.0.0.1` (not `localhost` —
  Spotify treats these as different values).
- **Port 8888 already in use** — change `DEEPDIVE_PORT` in `.env` and
  update the Redirect URI in both `.env` and the Spotify dashboard to match.
- **Search finds the wrong artist** — DeepDive matches on exact name first,
  falling back to Spotify's most popular result for that query. For very
  common names, try adding a distinguishing word Spotify recognizes.
