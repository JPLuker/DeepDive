#!/usr/bin/env bash
set -euo pipefail

TAG="v${BUILD_VERSION}-untested-android"
cat > /tmp/android-release-notes.md <<'NOTES'
UNTESTED Android build. Compiled by CI; on-device verification is still required.

Download and open the APK below directly. No ZIP extraction is needed.

This build uses the permanent Android signing key. CI verifies the APK certificate, package and version before publishing. Background execution from the previous build remains included.

Signed release APK. Switching from an older temporary debug key requires a one-time uninstall; export existing app data first. Future builds using this permanent key can update the installed app without clearing its data.
NOTES
if ! gh release view "$TAG" --repo "$GITHUB_REPOSITORY" > /dev/null 2>&1; then
  gh release create "$TAG" --repo "$GITHUB_REPOSITORY" \
    --target "$GITHUB_SHA" --prerelease \
    --title "DeepDive ${BUILD_VERSION} — Android test build" \
    --notes-file /tmp/android-release-notes.md
fi
gh release upload "$TAG" dist/*.apk --clobber --repo "$GITHUB_REPOSITORY"
