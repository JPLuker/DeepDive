# The Last.fm surface DeepDive uses

Read from the API documentation on **7 September 2026**. Derived
reference, not a copy of their docs — fetch the originals at
`last.fm/api` when you need the full picture.

Last.fm exists here because Spotify removed or deprecated the data
three features need. It is **optional**: every user supplies their own
key, and without one the features built on it are simply absent.

---

## What we call

| Method | Gives us | Used for |
|---|---|---|
| `artist.getTopTracks` | tracks by listeners, with playcount and rank | dips — an artist's best hour |
| `artist.getSimilar` | similar artists with a 0–1 match score | suggestions, replacing Spotify's deprecated related-artists |
| `artist.getTopTags` | tags with a 0–100 weight | genre and subgenre mixes |

All three are public artist data. They need only `api_key` — no
signature, no session, no user auth. That is why the callback URL on
the application registration is unused.

## Rate limits

**5 requests per second per originating IP**, averaged over five
minutes, per their terms. We pace at 250ms.

Unlike Spotify there is no per-account quota to exhaust — only a rate
to respect. That difference matters: a Spotify quota runs out and only
time refills it, whereas here slowing down is always a sufficient
answer.

## Errors, which are not where you expect

Last.fm answers with **HTTP 200 and an error code in the body** as
often as it uses a status code, so both must be checked on every call.

| Code | Meaning | Response |
|---|---|---|
| 29 | rate limit exceeded | back off; retrying sooner makes it worse |
| 26 | key suspended | terminal — say so, don't retry |
| 10 | invalid key | terminal — the key is wrong, not the request |

Repeated rate-limit violations get keys revoked, which is why pacing is
not optional.

## Tags need cleaning before use

Tags are user-applied, which is what makes them far more granular than
Spotify's artist-level genres — and also what makes them messy.

- **The same genre arrives spelled several ways.** "hip-hop", "hip hop"
  and "HipHop" would otherwise become three mixes of identical music.
  Normalised, with an alias list for the concatenations that spacing
  rules cannot split.
- **Many top tags aren't genres.** "seen live", "favourites", "albums i
  own" describe the listener's relationship to the music and rank
  highly on well-known artists. Dropped.
- **Decade tags are dropped too.** DeepDive derives era from release
  dates, which is more reliable than a crowd.
- **Weight is the real filter.** The 0–100 count separates a defining
  tag from one person's joke. Use a floor.

## Key handling

Each user supplies their own. A key shipped in the bundle would be
readable by anyone opening devtools, its rate limit pooled across every
user, and revocable because of one person's behaviour — and DeepDive
already asks for a Spotify Client ID, so this is the same kind of ask
rather than a new one.

Entered on the setup screen, marked optional, and changeable later in
Settings. Only the key is needed; the shared secret is for signed calls
and user sessions, neither of which we make.

## Not used, and why

- **Anything under `auth`, `user`, `track.scrobble`, `track.love`** —
  these need user authentication and write to someone's account.
  DeepDive reads public data only.
- **`*.addTags` / `*.removeTag`** — writes.
- **`user.getRecentTracks`** — genuinely interesting, since it goes far
  further back than Spotify's 50-track recently-played. Needs the auth
  flow. Worth revisiting if listening history ever becomes a feature.
