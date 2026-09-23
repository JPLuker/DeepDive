<div align="center">

# DeepDive

### Hear it all.

**[Open DeepDive →](https://jpluker.github.io/DeepDive/)**

*Free. No install. Runs entirely in your browser.*

</div>

---

## What it does

Name an artist and choose how far in to go.

**Dip** — their best hour, most played first. A short introduction, or a
refresher before a gig.

**Dive** — their whole catalogue, every album, single and EP, held up
against your Liked Songs. It matches recordings rather than titles, so
the album cut you saved still counts when the single turns up. You get
back what you already own under another release, and what you have never
heard. Review it, untick anything, then like the songs, build a
playlist, or both.

**Multi-Dip** — a whole bill in one playlist, in the order they play.
Add everyone on the lineup, drag them into running order, tag who you
are really there for as More and the opener as Less, and pick how long
the night runs.

**Mixes** — dozens of cuts of the library you already have: years,
albums you went deep on, songs you found a decade late, artists you
liked exactly one track by. Build your own from an era, a length and an
artist, or let Sampler pull a few songs each from artists you barely
touched. With a Last.fm key you also get similar-artist mixes,
recommendations, and genre mixes far past "rock".

**The Crate** — the artists you mean to get to, saved for later. Star a
few and they lead your home screen. Sort by who you have not dived yet,
or build a sampler from the whole crate.

Nothing reaches Spotify until you choose it. Build the same playlist
again later and DeepDive adds to it rather than making a second one.

## Why you'll like it

**It plays a discography properly.** New tracks come sorted in album
order — records in chronological sequence, tracks in their intended
running order. Press play and hear a catalogue the way it was meant to
be heard, not shuffled alphabetically.

**It knows the difference between a re-release and a remix.** A live
take, an acoustic version, a remaster — those are different recordings,
and DeepDive treats them that way. The same recording on a different
sleeve is what gets flagged.

**It gets out of your way.** Filter out live cuts, radio edits,
instrumentals, or a cappella versions. Pull in the artist's own
compilations, or go further and include records they only guest on —
separate choices, since one costs a handful of extra releases and the
other can cost hundreds. Your call, every time.

**Scan one artist or your entire library.** The full library scan crawls
every artist you've liked. It takes a while and you can stop it whenever
— it keeps everything it found.

**Every playlist gets a cover.** The artist's photo, the kind of mix it
is, and the DeepDive mark. A Multi-Dip splits it between everyone on
the bill.

**Take it back.** Your dive history lists what you dived and what
DeepDive built. Songs it added to your Liked Songs come off again with
one tap.

**Dark mode.** Obviously.

## Your library stays yours

There's no DeepDive server. No account to make. No data collected,
because there's nowhere to collect it to — everything happens inside
your browser, between you and Spotify.

## Put it on your home screen

DeepDive installs like a real app, without an app store:

- **iPhone / iPad** — Share → *Add to Home Screen*
- **Android** — menu → *Install app*
- **Desktop** — the install icon in your address bar

Opens fullscreen. Own icon. No one would know it's a website.

---

## Getting started

Spotify requires every app that touches your library to have its own
credentials — so there's a short one-time step before your first dive.
Two minutes, and you never do it again. The app walks you through it;
this is the same thing written down.

> **You'll need Spotify Premium.** Spotify only runs apps like this one
> for Premium accounts.

**1.** Head to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
and click **Create app**. Any name works.

**2.** In the app's settings, add this as a **Redirect URI**, then click
Add *and* Save:

```
https://jpluker.github.io/DeepDive/app/
```

> Copy it exactly — the `/app/` and the trailing slash both matter, and
> `https` isn't the same as `http`.

**3.** Copy the **Client ID** from your app's page, [open DeepDive](https://jpluker.github.io/DeepDive/app/),
and paste it in. (No client secret — DeepDive doesn't use one.)

**4.** Optionally add a [Last.fm API key](https://www.last.fm/api/account/create).
It's free, approved instantly, and turns on Dips, Multi-Dips,
recommendations and genre mixes. You can add it later in Settings.

**5.** Connect Spotify, approve access, and start digging.

---

## If something goes wrong

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
every release gets read track by track. Including records they only
guest on makes it much slower: a prolific session player can have
hundreds, at one request each. Compilations alone are cheap.

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
