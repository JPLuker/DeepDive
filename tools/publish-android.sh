#!/usr/bin/env bash
set -euo pipefail

TAG="v${BUILD_VERSION}-untested-android"
# The fixed header is the RELEASES.md Part 2 warning. What changed comes
# from CHANGELOG.md, so the notes describe this build and not the one
# the script was last edited for.
CHANGES="$(node tools/release-notes.mjs "$BUILD_VERSION")"
{
  echo "UNTESTED Android build. Compiled by CI; on-device verification is still required."
  echo
  echo "Install over the previous release to keep your data, or update from Settings → Updates (Testing channel)."
  echo
  echo "## What changed"
  echo
  echo "$CHANGES"
} > /tmp/android-release-notes.md
if ! gh release view "$TAG" --repo "$GITHUB_REPOSITORY" > /dev/null 2>&1; then
  gh release create "$TAG" --repo "$GITHUB_REPOSITORY" \
    --target "$GITHUB_SHA" --prerelease \
    --title "DeepDive ${BUILD_VERSION} — Android test build" \
    --notes-file /tmp/android-release-notes.md
fi
gh release upload "$TAG" dist/*.apk --repo "$GITHUB_REPOSITORY"
