#!/usr/bin/env bash
set -euo pipefail

TAG="v${BUILD_VERSION}-untested-android"
cat > /tmp/android-release-notes.md <<'NOTES'
UNTESTED Android build. Compiled by CI; on-device verification is still required.

Download and open the APK below directly. No ZIP extraction is needed.

Includes an Android in-app updater in Settings → Updates (Testing channel), a genre shelf and searchable genre browser, backup controls under Advanced, automatic playlist names, clearer notification percentages, and results/chooser layout fixes.

Install over the previous permanent-key release to keep app data. This is the manual install that adds the updater; later compatible releases can be downloaded from inside DeepDive. Installation still uses Android's confirmation screen.

CI verifies the permanent signing certificate, package and version before publishing. On-device layout, notification and updater installation checks are still required.
NOTES
if ! gh release view "$TAG" --repo "$GITHUB_REPOSITORY" > /dev/null 2>&1; then
  gh release create "$TAG" --repo "$GITHUB_REPOSITORY" \
    --target "$GITHUB_SHA" --prerelease \
    --title "DeepDive ${BUILD_VERSION} — Android test build" \
    --notes-file /tmp/android-release-notes.md
fi
gh release upload "$TAG" dist/*.apk --clobber --repo "$GITHUB_REPOSITORY"
