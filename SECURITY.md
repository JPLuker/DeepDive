# Security

## Supported versions

The latest release only. DeepDive is a single-page app served from
GitHub Pages; older builds are not patched, and reloading the page gets
you the current one.

## Reporting a vulnerability

Please report security problems **privately**, through GitHub's private
vulnerability reporting:

**https://github.com/JPLuker/DeepDive/security/advisories/new**

Not in a public issue. A public report tells everyone about the problem
before there is a fix.

You can expect an acknowledgement within 7 days.

## What is worth reporting

DeepDive has no server and no accounts. It runs entirely in your
browser, and the things that could go wrong are mostly about *your*
credentials leaking out of it:

- Anything that could expose a Spotify access token, Client ID, or
  Last.fm API key to another site or another person.
- Anything that lets a page outside DeepDive read its stored data
  (IndexedDB or `localStorage`).
- A way to make DeepDive contact a host that is not in the network
  table in the README.
- Cross-site scripting: artist, album and playlist names come from the
  Spotify API and are rendered in the page.

## What is not a vulnerability

- Spotify rate-limiting your own app. That is Spotify's quota, not a
  flaw; see the README.
- Your Client ID appearing in the page. It is not a secret — it
  identifies your Spotify app, and PKCE exists precisely so that a
  public client needs no secret. DeepDive never asks for, and cannot
  use, a Spotify client *secret*.
- Data left in your own browser after you stop using DeepDive.
  Settings → Data and storage clears it.
