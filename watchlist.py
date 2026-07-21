"""
Persistent "to dive into" artist watchlist.

DeepDive is intentionally database-free (see PROJECT_CONTEXT.md) --
RESULTS_CACHE and progress.py's job tracker are plain in-memory dicts,
fine because nothing needs to survive a restart. This is the one
exception: a watchlist the user is building up over time genuinely does
need to survive the app being restarted, so it can't just be a dict.
A flat JSON file keeps the same "no real datastore" spirit as .env --
just a file DeepDive reads and writes, no server, no schema migrations.
"""

import json
import os
import threading
import uuid
from datetime import datetime, timezone

_lock = threading.Lock()


def _path(base_dir: str) -> str:
    return os.path.join(base_dir, "watchlist.json")


def _load(base_dir: str) -> list[dict]:
    path = _path(base_dir)
    if not os.path.exists(path):
        return []
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, list) else []
    except (json.JSONDecodeError, OSError):
        # A corrupted or unreadable file shouldn't take down the whole
        # home page -- treat it as an empty list rather than erroring.
        return []


def _save(base_dir: str, entries: list[dict]) -> None:
    path = _path(base_dir)
    tmp_path = path + ".tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(entries, f, indent=2)
    os.replace(tmp_path, path)  # atomic on POSIX -- avoids a half-written file on crash


def list_entries(base_dir: str) -> list[dict]:
    """Newest-added first."""
    with _lock:
        entries = _load(base_dir)
    return sorted(entries, key=lambda e: e.get("added_at", ""), reverse=True)


def add(base_dir: str, name: str, spotify_id: str | None = None, image_url: str | None = None) -> None:
    """Adds an artist to the watchlist. spotify_id/image_url are
    optional -- when the add comes from a suggestion pill's "+" button,
    we already have this data on hand and can save it immediately; a
    manually-typed name won't have it yet, and gets resolved lazily
    (see set_details) the next time the home page loads.
    """
    name = name.strip()
    if not name:
        return
    with _lock:
        entries = _load(base_dir)
        if any(e.get("name", "").strip().lower() == name.lower() for e in entries):
            return  # already on the list -- don't add a duplicate entry
        entries.append({
            "id": uuid.uuid4().hex,
            "name": name,
            "status": "pending",
            "added_at": datetime.now(timezone.utc).isoformat(),
            "spotify_id": spotify_id,
            "image_url": image_url,
        })
        _save(base_dir, entries)


def set_details(base_dir: str, entry_id: str, spotify_id: str | None, image_url: str | None) -> None:
    """Lazily fills in spotify_id/image_url once resolved for an entry
    that was added by free-typed name only (no matching Spotify artist
    was known at add-time). Persisted so the lookup only ever needs to
    happen once per entry.
    """
    with _lock:
        entries = _load(base_dir)
        for e in entries:
            if e.get("id") == entry_id:
                e["spotify_id"] = spotify_id
                e["image_url"] = image_url
                break
        _save(base_dir, entries)


def toggle_status(base_dir: str, entry_id: str) -> None:
    with _lock:
        entries = _load(base_dir)
        for e in entries:
            if e.get("id") == entry_id:
                e["status"] = "done" if e.get("status") == "pending" else "pending"
                break
        _save(base_dir, entries)


def remove(base_dir: str, entry_id: str) -> None:
    with _lock:
        entries = _load(base_dir)
        entries = [e for e in entries if e.get("id") != entry_id]
        _save(base_dir, entries)
