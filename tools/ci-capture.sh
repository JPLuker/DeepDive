#!/usr/bin/env bash
#
# Run a command and, if it fails, print the tail of its output as a
# GitHub Actions error annotation.
#
# Why this exists
# ---------------
# A failing build is only useful if someone can read why. Actions keeps
# step logs on separate storage hosts (productionresultssa*.blob.core
# .windows.net, results-receiver.actions.githubusercontent.com), and
# the environment this project is developed from cannot reach those —
# the request is refused before it leaves. `gh run view --log` returns
# Forbidden, so every CI failure arrives as "exit code 1" with no
# cause, and the only honest response is to guess.
#
# Annotations come back from api.github.com instead, which does work.
# So the build says what went wrong rather than leaving it in a log
# nobody developing it can open.
#
# This is not a substitute for reading the full log in the web UI —
# that is still the better view when it is available. It is a floor:
# the cause is always recoverable, from anywhere.
#
# Usage:
#   tools/ci-capture.sh <label> <command> [args...]
#
# Exits with the wrapped command's exit code, so the step still fails.

set -uo pipefail

LABEL="${1:?usage: ci-capture.sh <label> <command> [args...]}"
shift

# How much of the tail to report. A Rust or Gradle failure puts the
# real error within the last hundred lines or so; the rest is progress
# output. Annotations are size-capped by GitHub, so this stays modest
# deliberately rather than sending a whole log and being truncated at
# an arbitrary point.
TAIL_LINES="${CI_CAPTURE_TAIL:-150}"

LOG="$(mktemp 2>/dev/null || echo "./ci-capture-$$.log")"

# Unbuffered where possible so a killed step still has its output.
set +e
"$@" 2>&1 | tee "$LOG"
STATUS="${PIPESTATUS[0]}"
set -e

if [ "$STATUS" -eq 0 ]; then
  rm -f "$LOG"
  exit 0
fi

# Escape for a workflow command. Order matters: % first, or the escape
# sequences introduced below get escaped in turn.
#
# Carriage returns are stripped rather than escaped — Windows runners
# produce CRLF, and %0D%0A renders as a blank line between every real
# line, which doubles the size for nothing.
ESCAPED="$(
  tail -n "$TAIL_LINES" "$LOG" \
    | tr -d '\r' \
    | sed -e 's/%/%25/g' \
    | awk 'BEGIN { ORS="%0A" } { print }'
)"

# One annotation holding the whole tail, not one per line: GitHub caps
# how many annotations a step may produce, and a cap reached halfway
# through an error message is worse than a single long one.
printf '::error title=%s failed::%s\n' "$LABEL" "$ESCAPED"

# Also leave it in the step log proper, for whoever can read that.
echo "----- $LABEL failed with exit code $STATUS; last $TAIL_LINES lines above -----"

rm -f "$LOG"
exit "$STATUS"
