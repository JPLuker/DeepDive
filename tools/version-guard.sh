#!/usr/bin/env bash
# Before compiling: refuse a version whose APK is already published, and
# a version with no CHANGELOG section (VERSIONING.md 4.2). A withheld or
# published number is never reused; the fix ships as the next patch.
#
# "No such release" must be a 404, not any failure: a lookup that fails
# for another reason (auth, network) is not evidence the number is free.
set -euo pipefail
V="${1:?version required}"
TAG="v${V}-untested-android"
ASSET="DeepDive-${V}-Android-universal-UNTESTED.apk"
if OUT="$(gh api "repos/${GITHUB_REPOSITORY}/releases/tags/${TAG}" --jq '.assets[].name' 2>&1)"; then
  if printf '%s\n' "$OUT" | grep -qx "$ASSET"; then
    echo "::error::$ASSET is already published on $TAG. Bump BUILD in docs/js/app.js; a published number is never rebuilt."
    exit 1
  fi
elif ! printf '%s' "$OUT" | grep -q "HTTP 404"; then
  echo "::error::Couldn't check whether $TAG exists: $OUT"
  exit 1
fi
node tools/release-notes.mjs "$V" > /dev/null
echo "Version $V is unpublished and has changelog notes."
