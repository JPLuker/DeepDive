#!/usr/bin/env bash
# Publish one platform's UNTESTED builds as their own pre-release
# (RELEASES.md Part 2 and Part 6). Fails closed: a missing or empty
# required file, a version without changelog notes, or a release that
# doesn't match what was uploaded stops it.
#
#   publish-untested.sh <Platform> <tag-suffix> <dir> <required file>...
#   publish-untested.sh Android android dist DeepDive-2.9.149-Android-universal-UNTESTED.apk
#
# Needs BUILD_VERSION, GITHUB_REPOSITORY, GITHUB_SHA and GH_TOKEN.
set -euo pipefail
PLATFORM="${1:?platform}"; SUFFIX="${2:?tag suffix}"; DIR="${3:?dir}"; shift 3
[ "$#" -gt 0 ] || { echo "::error::No required assets listed for $PLATFORM."; exit 1; }
V="${BUILD_VERSION:?BUILD_VERSION}"
TAG="v${V}-untested-${SUFFIX}"

# 6.1.1: every required file exists and isn't empty.
for name in "$@"; do
  if [ ! -s "$DIR/$name" ]; then
    echo "::error::Required asset missing or empty: $name"; ls -la "$DIR" || true; exit 1
  fi
done
# Nothing unexpected rides along.
for f in "$DIR"/*; do
  base="$(basename "$f")"
  case " $* " in *" $base "*) ;; *) echo "::error::Unlisted file in $DIR: $base"; exit 1 ;; esac
done

# 6.1.4: checksums last, from exactly the files being uploaded.
( cd "$DIR" && sha256sum -- "$@" > SHA256SUMS.txt )

CHANGES="$(node tools/release-notes.mjs "$V")"
{
  echo "> ⚠️ **UNTESTED BUILD.** These ${PLATFORM} builds were produced automatically and have not been run by a person. They may not install, launch, or work correctly. For the tested web app, use [jpluker.github.io/DeepDive/app](https://jpluker.github.io/DeepDive/app/)."
  echo
  case "$SUFFIX" in
    android) echo "Install over the previous release to keep your data, or update from Settings → Updates (Testing channel)." ;;
    windows) echo "Not code-signed: Windows SmartScreen will say the publisher is unknown. Choose More info → Run anyway." ;;
    linux)   echo "Not signed. The AppImage needs \`chmod +x\` before it runs." ;;
  esac
  echo
  echo "## What changed"
  echo
  echo "$CHANGES"
} > /tmp/untested-notes.md

if gh api "repos/${GITHUB_REPOSITORY}/releases/tags/${TAG}" > /dev/null 2>&1; then
  echo "::error::$TAG already exists. A published number is never rebuilt; bump the version."; exit 1
fi
# Created first and uploaded to after, the sequence that published every
# APK up to 2.9.148. 2.9.149 passed the files and --latest=false to
# create in one call and CI's token got "HTTP 403: Resource not
# accessible by integration". A pre-release is never Latest anyway.
gh release create "$TAG" --repo "$GITHUB_REPOSITORY" \
  --target "$GITHUB_SHA" --prerelease \
  --title "UNTESTED — ${PLATFORM} build for DeepDive ${V}" \
  --notes-file /tmp/untested-notes.md
gh release upload "$TAG" --repo "$GITHUB_REPOSITORY" "$DIR"/*

# 6.2: fetch what was published and check it against what was built.
PUBLISHED="$(gh api "repos/${GITHUB_REPOSITORY}/releases/tags/${TAG}" \
  --jq '"prerelease=\(.prerelease)", (.assets[] | "\(.name) \(.size) \(.state)")')"
echo "$PUBLISHED"
printf '%s\n' "$PUBLISHED" | grep -qx 'prerelease=true' || { echo "::error::$TAG is not marked pre-release."; exit 1; }
for name in "$@" SHA256SUMS.txt; do
  size="$(stat -c %s "$DIR/$name")"
  printf '%s\n' "$PUBLISHED" | grep -qx "$name $size uploaded" \
    || { echo "::error::$name is missing, incomplete or a different size on $TAG."; exit 1; }
done
echo "Published $TAG with $# file(s) and checksums."
