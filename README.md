<div align="center">

<img src="docs/assets/dd-logo.png" alt="" width="72">

# Hear it all.

DeepDive knows what's already in your Spotify library, finds the tracks
you missed, and turns the music you've saved into mixes built around how
you listen.

**[Open DeepDive →](https://jpluker.github.io/DeepDive/app/)** ·
[See how it works](https://jpluker.github.io/DeepDive/) ·
[Set it up](#start-with-one-artist)

[![Licence: MIT](https://img.shields.io/badge/licence-MIT-blue)](LICENSE)
![Installable PWA](https://img.shields.io/badge/PWA-installable-1DB954)
![No backend](https://img.shields.io/badge/server-none-lightgrey)

</div>

---

### Start with an artist

## How far in?

Dip gives you their best hour, most played first. Dive checks the whole
catalogue against your library. Multi-Dip takes a whole bill and builds
one playlist in the order they play.

| | |
|---|---|
| **Dip** | their best hour, most played first |
| **Dive** | their whole catalogue against your library |
| **Multi-Dip** | everyone on the bill, in the order they play |

### While DeepDive reads the catalogue

## See the Dive happen

DeepDive works through every release and shows its progress against the
artist image. You can see exactly what it is reading instead of waiting
on an unexplained loading screen.

### A real catalogue check

## Know what you missed

A Dive reads every album, single and EP, then checks the recordings
against your Liked Songs. It catches the same recording under another
release instead of trusting titles alone. Review the split, uncheck
anything you don't want, then like songs, make a playlist, or both.

### From what you've saved

## Mixes with a reason

Your library becomes dozens of useful cuts: years, albums you went deep
on, songs you found late, your regulars, and more. Build your own from
an era, a length and an artist, or use Sampler to revisit artists you
barely touched. Add Last.fm for similar-artist and genre mixes.

### Don't lose the next one

## Keep a crate

Put aside artists you mean to get to. Star a few for Up next so Home
keeps them in sight, then search, sort and sample everyone else when
you're ready.

### Going to a show?

## One playlist for the whole bill

Multi-Dip keeps the artists in show order and fits them to the length of
your night. Leave the split even, mark someone More or Less, or give an
artist an exact number of songs.

### Private by design

## DeepDive cannot collect your data

There is nowhere for it to go. DeepDive has no server, database or
account system. Your Spotify library stays in your browser and on your
device, and the only requests that leave it are the ones to Spotify and
Last.fm that fetch what you asked for.

### Wherever you listen

## Put it on your home screen

DeepDive installs like a real app, without an app store.

| iPhone / iPad | Android | Desktop |
|---|---|---|
| Share → *Add to Home Screen* | menu → *Install app* | the install icon in the address bar |

---

## Start with one artist

Pick someone you think you know well. That's usually where the surprise
is. Spotify requires every app that touches your library to have its own
credentials, so there is a one-time step first. Two minutes, and you
never do it again.

> [!IMPORTANT]
> You'll need **Spotify Premium**. Spotify only runs apps like this one
> for Premium accounts.

**1.** Open the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
and click **Create app**. Any name works.

**2.** In the app's settings, add this as a **Redirect URI**, then click
Add *and* Save:

```
https://jpluker.github.io/DeepDive/app/
```

> [!WARNING]
> Copy it exactly. The `/app/` and the trailing slash both matter, and
> `https` is not the same as `http`.

**3.** Copy the **Client ID** from your app's page,
[open DeepDive](https://jpluker.github.io/DeepDive/app/), and paste it
in. There is no client secret; DeepDive doesn't use one.

**4.** Optionally add a [Last.fm API key](https://www.last.fm/api/account/create).
Free, approved instantly, and it turns on Dips, Multi-Dips,
recommendations and genre mixes. You can add it later in Settings.

**5.** Connect Spotify, approve access, and start digging.

<details>
<summary><strong>If something goes wrong</strong></summary>

**"Invalid redirect URI"** — the address in your Spotify app settings
doesn't match exactly. Check the `/app/`, the trailing slash and
`https`, and make sure you hit Save at the bottom.

**"Missing or expired permissions"** — open Settings, Disconnect
Spotify, then connect again.

**Dip and Multi-Dip are greyed out** — they need a Last.fm key. Add one
in Settings.

**"Too many requests"** — Spotify throttled you for scanning a lot at
once. Wait a couple of minutes.

**A scan is taking forever** — big catalogues genuinely take time, since
every release is read track by track. Including records an artist only
guests on makes it much slower: a prolific session player can have
hundreds, at one request each. Compilations alone are cheap.

</details>

<details>
<summary><strong>Running it yourself</strong></summary>

DeepDive is a static site. `docs/` is the whole thing: `docs/index.html`
is the marketing page and `docs/app/` is the app. Serve that directory
however you like, and register your own copy's address as the Redirect
URI in place of the one above.

```bash
git clone https://github.com/JPLuker/DeepDive.git
cd DeepDive
python3 -m http.server -d docs 8000   # then open http://localhost:8000/app/
bash tests/run.sh                     # the test suite, no network needed
```

</details>

---

## Licence and credits

DeepDive's own source code is under the [MIT licence](LICENSE).

That covers the code and nothing else. Music metadata and artwork come
from Spotify; artist tags and popularity come from Last.fm. All of it
belongs to its owners, not to this project, and is subject to their
terms. DeepDive is not affiliated with Spotify AB or Last.fm.

---

<div align="center">

**[Start digging →](https://jpluker.github.io/DeepDive/)**

</div>
