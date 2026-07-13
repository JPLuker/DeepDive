#!/usr/bin/env bash
# DeepDive launcher.
# First run: creates a virtual environment and installs dependencies.
# Every run after that: just activates the venv and starts the app.
set -e

# Always operate relative to this script's own location, so it works
# no matter what directory you launch it from.
cd "$(dirname "$0")"

if [ ! -d "venv" ]; then
    echo "First run — setting up a virtual environment (this only happens once)..."
    python3 -m venv venv
    # shellcheck disable=SC1091
    source venv/bin/activate
    pip install -q --upgrade pip
    pip install -q -r requirements.txt
    echo "Setup complete."
else
    # shellcheck disable=SC1091
    source venv/bin/activate
fi

# Open the browser shortly after the server comes up, in the background,
# so this script still works fine over SSH or without a desktop (the
# `|| true` means a missing xdg-open just gets silently skipped rather
# than crashing the launcher).
( sleep 2 && xdg-open "http://127.0.0.1:8888" >/dev/null 2>&1 || true ) &

echo "Starting DeepDive at http://127.0.0.1:8888 — press Ctrl+C to stop."
python3 app.py
