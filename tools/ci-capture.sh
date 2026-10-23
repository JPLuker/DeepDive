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

# How much of the tail to report.
#
# GitHub caps an annotation message and truncates it FROM THE END,
# which is the opposite of what is wanted: the first attempt sent 150
# lines, the cap cut it mid-word, and what survived was the cargo
# download list while the actual error — the last thing printed — was
# the part thrown away. So the budget is enforced here instead, and
# what gets spent on it is chosen rather than taken in log order.
TAIL_LINES="${CI_CAPTURE_TAIL:-40}"

# Characters of escaped message to send, kept under GitHub's cap with
# room to spare. Measured after escaping, since %0A costs three.
MAX_CHARS="${CI_CAPTURE_MAX_CHARS:-2600}"

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
#
# Three passes before escaping, each paying for itself in budget:
#
#   1. ANSI colour codes stripped. Cargo wraps every line in them and
#      they are pure cost — roughly a fifth of the message was escape
#      sequences on the first attempt.
#   2. Cargo and Gradle progress chatter dropped. "Downloaded x v1.2"
#      and "Compiling y" repeated for 400 crates says only that the
#      build got as far as it got, which the step name already says.
#      An error line mentioning one of those crates still survives,
#      because the filter is anchored to the progress verbs.
#   3. Whatever is left, tail-limited, then hard-capped by character
#      count keeping the END — because the end is where the error is.
CLEANED="$(
  tr -d '\r' < "$LOG" \
    | sed -e 's/\x1b\[[0-9;]*[A-Za-z]//g' \
    | grep -vE '^\s*(Downloaded|Downloading|Compiling|Checking|Fresh|Updating|Installing|Removing|Unpacking|Selecting|Preparing|Get:|Hit:|Ign:|Reading|Building dependency|> Task)\b' \
    | tail -n "$TAIL_LINES"
)"

ESCAPED="$(
  printf '%s\n' "$CLEANED" \
    | sed -e 's/%/%25/g' \
    | awk 'BEGIN { ORS="%0A" } { print }'
)"

# Keep the tail, not the head: GitHub would otherwise cut exactly the
# part worth reading.
if [ "${#ESCAPED}" -gt "$MAX_CHARS" ]; then
  ESCAPED="...(earlier output trimmed)%0A${ESCAPED: -$MAX_CHARS}"
fi

# One annotation holding the whole tail, not one per line: GitHub caps
# how many annotations a step may produce, and a cap reached halfway
# through an error message is worse than a single long one.
printf '::error title=%s failed::%s\n' "$LABEL" "$ESCAPED"

# Also leave it in the step log proper, for whoever can read that.
echo "----- $LABEL failed with exit code $STATUS; last $TAIL_LINES lines above -----"

rm -f "$LOG"
exit "$STATUS"
