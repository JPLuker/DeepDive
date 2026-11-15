#!/usr/bin/env bash
# The Android test APK, through the shared untested publisher. The file
# name is what the in-app updater looks for; don't change it without the
# aliases in RELEASES.md 6.3.
set -euo pipefail
exec bash tools/publish-untested.sh Android android dist "DeepDive-${BUILD_VERSION}-Android-universal-UNTESTED.apk"
