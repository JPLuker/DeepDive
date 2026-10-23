#!/usr/bin/env bash
set -euo pipefail

TAG="v${BUILD_VERSION}-untested-android"
cat > /tmp/android-release-notes.md <<'NOTES'
UNTESTED Android build. Compiled by CI; on-device verification is still required.

Download and open the APK below directly. No ZIP extraction is needed.

This build adds Android background execution for library reads, scans, dives and mixes, with an ongoing notification while work is active. It also fixes the Backup row layout. Switching apps and locking the screen require device testing. Force-closing the app still stops work.

Debug signed. If Android reports an incompatible signature, uninstall the previous test APK before installing this build. Export any existing app data before uninstalling.
NOTES
if ! gh release view "$TAG" --repo "$GITHUB_REPOSITORY" > /dev/null 2>&1; then
  gh release create "$TAG" --repo "$GITHUB_REPOSITORY" \
    --target "$GITHUB_SHA" --prerelease \
    --title "DeepDive ${BUILD_VERSION} — Android test build" \
    --notes-file /tmp/android-release-notes.md
fi
gh release upload "$TAG" dist/*.apk --clobber --repo "$GITHUB_REPOSITORY"
