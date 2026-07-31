<div align="center">

# DeepDive

### You've liked the album version. You missed the single.

**[Open DeepDive →](https://jpluker.github.io/DeepDive/)**

*Free. No install. Runs entirely in your browser.*

</div>

---

## The problem

You liked a song off an album three years ago. Last month the band put
the same recording on an EP. Spotify shows it to you as a brand-new
track you've never heard — because to Spotify, it's a different entry.
Your library is quietly full of these near-misses, and there's no way to
see them.

Multiply that across a favorite artist's whole catalog: album cuts,
standalone singles, EP versions, reissues, deluxe editions. Songs you
already love, sitting one release over from where you liked them.

**DeepDive finds them.**

## What it does

Type an artist. DeepDive reads their entire catalog — every album, every
single, every EP — and holds it up against your Liked Songs.

**Already yours, elsewhere.** The same recording you've already liked,
found under a different release. One click adds it where it belongs.

**New to you.** Everything by that artist that genuinely isn't in your
library — turned into a playlist, in proper album order, ready to play.

Nothing is added to your library until you say so. You see every match
first.

## Why you'll like it

**It plays a discography properly.** New tracks come sorted in album
order — records in chronological sequence, tracks in their intended
running order. Press play and hear a catalog the way it was meant to be
heard, not shuffled alphabetically.

**It knows the difference between a re-release and a remix.** A live
take, an acoustic version, a remaster — those are different recordings,
and DeepDive treats them that way. The same recording on a different
sleeve is what gets flagged.

**It gets out of your way.** Filter out live cuts, radio edits,
instrumentals, or a cappella versions. Include compilations and guest
appearances if you want the deep cuts. Your call, every time.

**Scan one artist or your entire library.** The full library scan crawls
every artist you've liked. It takes a while and you can stop it whenever
— it keeps everything it found.

**Keep a list.** Bands you mean to get into, saved for later, one tap
from a full dive.

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
Two minutes, and you never do it again.

**1.** Head to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
and click **Create app**. Any name works.

**2.** In the app's settings, add this as a **Redirect URI**, then click
Add *and* Save:

```
https://jpluker.github.io/DeepDive/
```

> Copy it exactly — the trailing slash matters, and `https` isn't the
> same as `http`.

**3.** Copy the **Client ID** from your app's page, [open DeepDive](https://jpluker.github.io/DeepDive/),
and paste it in. (No client secret — DeepDive doesn't use one.)

**4.** Connect Spotify, approve access, and start digging.

> **Note:** Spotify requires the account to have Premium for this to work.

---

## If something goes wrong

**"Invalid redirect URI"** — the address in your Spotify app settings
doesn't match exactly. Check the trailing slash and `https`, and make
sure you hit Save at the bottom.

**"Missing or expired permissions"** — open the menu, Disconnect Spotify,
then connect again.

**"Too many requests"** — Spotify throttled you for scanning a lot at
once. Wait a couple of minutes.

**A scan is taking forever** — big catalogs genuinely take time, since
every release gets read track by track. Including compilations and guest
appearances makes it slower still.

---

<div align="center">

**[Start digging →](https://jpluker.github.io/DeepDive/)**

</div>
