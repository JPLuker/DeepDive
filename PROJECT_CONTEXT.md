# DeepDive — context for a new chat

Replaces the v1.5.0 Flask-era version of this file, which described an
app that no longer exists. Paste this into the Claude project's
knowledge, or start a chat with it.

**The repo is the source of truth.** Read `CLAUDE.md` first, then the
"Stopping point" at the top of `ROADMAP.md`. This file only orients.

## What it is

A client-side Spotify PWA for one person: Joseph (GitHub `JPLuker`).
No backend, by choice. Each user brings their own Spotify Client ID.

- Repo: `github.com/JPLuker/DeepDive`
- App: `jpluker.github.io/DeepDive/app/`
- Landing page: `jpluker.github.io/DeepDive/`

## State at handover

- **Build 2.9.58**, pushed, clean tree.
- **Tests:** 1,508 assertions across 57 suites, all green.
  `bash tests/run.sh` from the repo root.
- **3.0 is the final release.** Its number is Joseph's to take, and so
  is every version bump beyond a patch.

## Workflow

1. Clone fresh into `/home/claude/dd/` (the container resets).
2. Run the suite to confirm the baseline.
3. Change the code; add tests; **prove each new check fails** against
   the previous version of the file.
4. Bump `BUILD` in `docs/js/app.js`; update `CHANGELOG.md`, `CLAUDE.md`
   ("Last updated at build"), `ROADMAP.md` ("Shipped since") and
   `TESTING.md`, all in the same commit.
5. Commit as `JPLuker <jpluker@users.noreply.github.com>`, explaining why.
6. Push with the token Joseph pastes, **gated on the suite's result**
   (see "Before you push" in `CLAUDE.md`), redacting the token.

## Next up

From the `ROADMAP.md` stopping point:

- **Landing page screenshots**, one at a time: 1 Home, 2 dive in
  progress (hero centre), 3 Mixes top, 4 Mixes "From your library",
  5 dive results (Houseghost), 6 dive in progress (VIAL), 7 Crate with
  Up next, 8 Multi-Dip with three or four artists.
- **A Multi-Dip section on the landing page**, once shot 8 exists.
- **Joseph's idea for the landing page's Mixes section.** Ask him.
- **Unchecked on a phone:** the Multi-Dip overhaul (2.9.53), onboarding
  (2.9.56 to 2.9.58), Last.fm gating (2.9.58). `TESTING.md` 32 to 34.

## Working with Joseph

Short messages, often a screenshot and a sentence. Fix bugs straight
away; ideas go in `ROADMAP.md` unless he says build. One step at a time.
Ask when a request is genuinely ambiguous. Correct him kindly when he's
wrong, and own your own mistakes plainly. Releases are named after songs.

## Security

Personal access tokens were pasted into the last chat. Revoke them.
