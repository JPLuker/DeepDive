#!/usr/bin/env bash
set -euo pipefail

TAG="v${BUILD_VERSION}-untested-android"
cat > /tmp/android-release-notes.md <<'NOTES'
UNTESTED Android build. Compiled by CI; on-device verification is still required.

Download and open the APK below directly. No ZIP extraction is needed.

This build registers the Spotify callback with the Android deep-link runtime so approving access can complete sign-in instead of returning to Connect Spotify.

Debug signed. If Android reports an incompatible signature, uninstall the previous test APK before installing this build. Export any existing app data before uninstalling.
NOTES
if ! gh release view "$TAG" --repo "$GITHUB_REPOSITORY" > /dev/null 2>&1; then
  gh release create "$TAG" --repo "$GITHUB_REPOSITORY" \
    --target "$GITHUB_SHA" --prerelease \
    --title "DeepDive ${BUILD_VERSION} — Android test build" \
    --notes-file /tmp/android-release-notes.md
fi
gh release upload "$TAG" dist/*.apk --clobber --repo "$GITHUB_REPOSITORY"
