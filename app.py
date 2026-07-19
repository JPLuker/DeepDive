import os
import secrets
import threading
import time
import uuid
from datetime import datetime

from dotenv import load_dotenv, set_key
from flask import Flask, render_template, request, redirect, session, url_for, flash, jsonify

import spotify_client as sc
import matching
import progress

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DOTENV_PATH = os.path.join(BASE_DIR, ".env")

# Make sure a .env file exists so set_key() always has somewhere to write.
if not os.path.exists(DOTENV_PATH):
    open(DOTENV_PATH, "a").close()

load_dotenv(DOTENV_PATH)

app = Flask(__name__)

FLASK_SECRET_KEY = os.environ.get("FLASK_SECRET_KEY")
if not FLASK_SECRET_KEY or FLASK_SECRET_KEY == "change_this_to_something_random":
    FLASK_SECRET_KEY = secrets.token_hex(24)
    set_key(DOTENV_PATH, "FLASK_SECRET_KEY", FLASK_SECRET_KEY)
app.secret_key = FLASK_SECRET_KEY

CLIENT_ID = os.environ.get("SPOTIPY_CLIENT_ID")
CLIENT_SECRET = os.environ.get("SPOTIPY_CLIENT_SECRET")
REDIRECT_URI = os.environ.get("SPOTIPY_REDIRECT_URI", "http://127.0.0.1:8888/callback")

# In-memory cache of search/scan results, keyed by a short-lived result id.
# Fine for a single-user, locally-run app; avoids stuffing large payloads
# into the session cookie.
RESULTS_CACHE: dict[str, dict] = {}

# Relative weight each single-artist search stage contributes to its
# progress bar. Must sum to 100.
# Reweighted for the February 2026 API. Reading the artist's catalog is
# now the dominant cost: batch album fetches are gone, so it's one
# request per album. Confirming candidates costs one request per
# candidate, but candidates are few by design (see matching.py).
STAGE_WEIGHTS = {
    "find_artist": 5,
    "liked_songs": 20,
    "catalog": 50,
    "confirm": 20,
    "classify": 5,
}

# Hard ceiling on how long the full-library scrub will spend on any one
# artist before giving up and moving on. Without this, a single artist
# with a huge back-catalog (or one hitting persistent API slowness)
# could stall the entire scrub indefinitely with no way to tell "still
# working" apart from "actually stuck."
ARTIST_TIME_BUDGET_SECONDS = 300

# Same idea, applied to every individual network stage (not just the
# full-scrub's per-artist crawl) — a single Spotify API call getting
# stuck should never be able to hang a job forever, regardless of which
# job type or which stage it happens in.
#
# Deliberately generous: a *stage* here can be 100+ paginated requests
# (reading a large Liked Songs library), so a legitimately slow-but-
# working stage must not get killed. Genuine per-request hangs are
# already handled much tighter, at the request level, inside
# spotify_client._call() (HARD_CALL_TIMEOUT). This is only a last-
# resort backstop against a pathological stage that never ends.
STAGE_TIMEOUT_SECONDS = 1800

# The home page's listening-based suggestions load synchronously as
# part of a normal page request — no progress bar, no background job.
# They're a nice-to-have, not core functionality, so they get a much
# shorter timeout: the page should never sit there for minutes just to
# render "Connect Spotify" or the search box. If this trips, suggestions
# are silently skipped rather than blocking the page.
SUGGESTIONS_TIMEOUT_SECONDS = 8


def run_with_timeout(fn, timeout_seconds, *args, **kwargs):
    """
    Runs fn(*args, **kwargs) with a hard wall-clock deadline, regardless
    of what's actually happening inside — unlike a cooperative check
    (which does nothing if the stuck call never calls back at all), this
    genuinely stops waiting after timeout_seconds no matter the cause.

    Uses a daemon thread specifically (not concurrent.futures.
    ThreadPoolExecutor): Python registers a global atexit hook that
    joins every thread a ThreadPoolExecutor ever created, so an
    abandoned/hung call made that way would eventually block the whole
    Flask process from exiting cleanly. A plain daemon thread has no
    such problem — Python can just let it go at process exit.

    Raises TimeoutError if fn doesn't finish in time. The abandoned
    thread (if any) keeps running harmlessly in the background and
    can no longer block anything else.
    """
    result_holder = {}

    def _run():
        try:
            result_holder["result"] = fn(*args, **kwargs)
        except Exception as inner_err:
            result_holder["error"] = inner_err

    worker = threading.Thread(target=_run, daemon=True)
    worker.start()
    worker.join(timeout=timeout_seconds)

    if worker.is_alive():
        raise TimeoutError(
            f"This step took longer than {timeout_seconds // 60} minute(s) and was abandoned."
        )
    if "error" in result_holder:
        raise result_holder["error"]
    return result_holder["result"]


def credentials_configured() -> bool:
    return bool(CLIENT_ID) and bool(CLIENT_SECRET) and "your_client_id_here" not in CLIENT_ID


def get_oauth():
    return sc.make_oauth(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI)


def _token_has_required_scope(token_info) -> bool:
    granted = set((token_info.get("scope") or "").split())
    required = set(sc.SCOPE.split())
    return required.issubset(granted)


def get_token():
    """Returns a valid token dict, refreshing if needed, or None if not
    authed. Also treats a token granted under an older/narrower scope
    (e.g. before the top-artists/recently-played permissions were added)
    as not authed, so the user gets prompted to reconnect and grant the
    new permissions rather than hitting confusing 403s later."""
    oauth = get_oauth()
    token_info = session.get("token_info")
    if not token_info:
        return None
    if not _token_has_required_scope(token_info):
        session.pop("token_info", None)
        return None
    if oauth.is_token_expired(token_info):
        try:
            token_info = run_with_timeout(
                oauth.refresh_access_token, SUGGESTIONS_TIMEOUT_SECONDS, token_info["refresh_token"]
            )
        except Exception:
            # Can't refresh right now (hung/failed network call) — treat
            # as not authed rather than hanging every single page load
            # indefinitely. The user just has to reconnect; that's a far
            # better failure mode than the whole app becoming unusable.
            session.pop("token_info", None)
            return None
        session["token_info"] = token_info
    return token_info


@app.route("/")
def index():
    if not credentials_configured():
        return redirect(url_for("setup"))

    token_info = get_token()
    suggestions = []
    suggestions_error = None

    if token_info:
        try:
            sp = sc.get_client(token_info)
            top = run_with_timeout(sc.get_top_artists, SUGGESTIONS_TIMEOUT_SECONDS, sp, time_range="medium_term", limit=10)
            recent = run_with_timeout(sc.get_recently_played_artists, SUGGESTIONS_TIMEOUT_SECONDS, sp, limit=50)

            def smallest_image(images):
                # Spotify returns images largest-first; the smallest is
                # plenty for a little avatar and keeps the page light.
                return images[-1]["url"] if images else None

            seen = {}
            for a in top:
                # /me/top/artists already returns full artist objects,
                # images included — no extra call needed for these.
                seen.setdefault(a["id"], {"id": a["id"], "name": a["name"], "image_url": smallest_image(a.get("images"))})
            for a in recent:
                # Recently-played tracks only carry simplified artist
                # objects (id/name, no images) — flagged for a follow-up
                # batch fetch below.
                seen.setdefault(a["id"], {"id": a["id"], "name": a["name"], "image_url": None})

            suggestions = list(seen.values())[:12]

            missing_image_ids = [s["id"] for s in suggestions if s["image_url"] is None]
            if missing_image_ids:
                try:
                    details = run_with_timeout(sc.get_artists_by_ids, SUGGESTIONS_TIMEOUT_SECONDS, sp, missing_image_ids)
                    image_by_id = {a["id"]: smallest_image(a.get("images")) for a in details}
                    for s in suggestions:
                        if s["image_url"] is None:
                            s["image_url"] = image_by_id.get(s["id"])
                except Exception:
                    # Photos are a nice-to-have — if this particular call
                    # fails, fall back to text-only pills rather than
                    # losing the suggestions entirely.
                    pass
        except Exception as e:
            suggestions_error = str(e)

    return render_template(
        "index.html",
        authed=bool(token_info),
        suggestions=suggestions,
        suggestions_error=suggestions_error,
    )


@app.route("/setup", methods=["GET", "POST"])
def setup():
    global CLIENT_ID, CLIENT_SECRET

    if request.method == "POST":
        client_id = request.form.get("client_id", "").strip()
        client_secret = request.form.get("client_secret", "").strip()
        if not client_id or not client_secret:
            flash("Both fields are required.")
            return redirect(url_for("setup"))

        set_key(DOTENV_PATH, "SPOTIPY_CLIENT_ID", client_id)
        set_key(DOTENV_PATH, "SPOTIPY_CLIENT_SECRET", client_secret)
        CLIENT_ID = client_id
        CLIENT_SECRET = client_secret

        flash("Spotify credentials saved.")
        return redirect(url_for("index"))

    return render_template(
        "setup.html",
        redirect_uri=REDIRECT_URI,
        already_configured=credentials_configured(),
        current_client_id=CLIENT_ID if credentials_configured() else "",
    )


@app.route("/login")
def login():
    oauth = get_oauth()
    return redirect(oauth.get_authorize_url())


@app.route("/callback")
def callback():
    oauth = get_oauth()
    code = request.args.get("code")
    error = request.args.get("error")

    if error or not code:
        return render_template("auth_result.html", ok=False,
                                message="Spotify login was cancelled or failed.")

    token_info = oauth.get_access_token(code, as_dict=True)
    session["token_info"] = token_info
    return render_template("auth_result.html", ok=True, message="Connected.")


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("index"))


# ---------------------------------------------------------------------
# Single-artist search (original flow)
# ---------------------------------------------------------------------

def run_search_job(job_id, artist_name, token_info, exclude_live=False, exclude_censored=False,
                    exclude_instrumental=False, exclude_acappella=False, match_remasters=False):
    """Runs entirely in a background thread. Never touches Flask's session
    or request context — everything it needs is passed in directly.

    Two-phase since the February 2026 API changes removed batch track
    fetches: the catalog is read cheaply without ISRCs, narrowed to
    plausible duplicates, and only those few tracks are re-fetched
    individually to get real ISRCs. See matching.py for the reasoning.
    """
    try:
        sp = sc.get_client(token_info)
        completed = 0

        def stage_callback(stage_key, label):
            weight = STAGE_WEIGHTS[stage_key]
            def cb(current, total):
                total = max(total, 1)
                frac = min(1.0, current / total)
                progress.update(job_id, stage=label, percent=completed + weight * frac)
            return cb

        progress.update(job_id, stage=f'Finding "{artist_name}" on Spotify…', percent=completed)
        artist = run_with_timeout(sc.find_artist, STAGE_TIMEOUT_SECONDS, sp, artist_name)
        completed += STAGE_WEIGHTS["find_artist"]
        if not artist:
            progress.fail(job_id, f'No Spotify artist found matching "{artist_name}".')
            return
        progress.update(job_id, percent=completed)

        progress.update(job_id, stage="Reading your Liked Songs…")
        liked_tracks = run_with_timeout(
            sc.get_all_liked_tracks, STAGE_TIMEOUT_SECONDS, sp,
            on_progress=stage_callback("liked_songs", "Reading your Liked Songs…")
        )
        completed += STAGE_WEIGHTS["liked_songs"]
        liked_index = matching.build_liked_indexes(liked_tracks)
        progress.update(job_id, percent=completed)

        # Phase 0: read the catalog. One request per release — the
        # expensive part now, hence the biggest slice of the bar.
        progress.update(job_id, stage=f"Reading {artist['name']}'s releases…")
        catalog_tracks = run_with_timeout(
            sc.get_artist_catalog_tracks, STAGE_TIMEOUT_SECONDS, sp, artist["id"],
            on_progress=stage_callback("catalog", f"Reading {artist['name']}'s releases…")
        )
        completed += STAGE_WEIGHTS["catalog"]
        progress.update(job_id, percent=completed)

        # Phase 1: narrow to plausible duplicates. Free — no API calls.
        progress.update(job_id, stage="Comparing with your library…")
        phase1 = matching.find_candidates(
            catalog_tracks, liked_index,
            exclude_live=exclude_live, exclude_censored=exclude_censored,
            exclude_instrumental=exclude_instrumental, exclude_acappella=exclude_acappella,
        )

        # Phase 2: only candidates get an individual ISRC lookup.
        candidate_ids = [c["track"]["id"] for c in phase1["candidates"]]
        if candidate_ids:
            progress.update(
                job_id,
                stage=f"Checking {len(candidate_ids)} possible match{'' if len(candidate_ids) == 1 else 'es'}…",
            )
            full_tracks = run_with_timeout(
                sc.get_tracks_with_isrc, STAGE_TIMEOUT_SECONDS, sp, candidate_ids,
                on_progress=stage_callback("confirm", f"Checking {len(candidate_ids)} possible matches…")
            )
        else:
            full_tracks = []
        completed += STAGE_WEIGHTS["confirm"]

        phase2 = matching.confirm_candidates(
            full_tracks, phase1["candidates"], liked_index, match_remasters=match_remasters,
        )

        # Tracks that resembled nothing liked, plus ones whose ISRC
        # proved they're a different recording after all.
        new_tracks = phase1["new_tracks"] + phase2["new_tracks"]
        progress.update(job_id, percent=100, stage="Done")

        result_id = uuid.uuid4().hex
        RESULTS_CACHE[result_id] = {
            "mode": "search",
            "artist": artist,
            "duplicate_candidates": phase2["duplicate_candidates"],
            "new_tracks": new_tracks,
            "already_liked_count": len(phase1["already_liked"]),
            "excluded_count": phase1["excluded_count"],
            "exclude_live": exclude_live,
            "exclude_censored": exclude_censored,
            "exclude_instrumental": exclude_instrumental,
            "exclude_acappella": exclude_acappella,
            "match_remasters": match_remasters,
        }
        progress.finish(job_id, result_id)

    except Exception as e:
        progress.fail(job_id, f"Something went wrong: {e}")


@app.route("/search", methods=["POST"])
def search():
    token_info = get_token()
    if not token_info:
        return redirect(url_for("login"))

    artist_name = request.form.get("artist", "").strip()
    if not artist_name:
        flash("Type an artist name first.")
        return redirect(url_for("index"))

    exclude_live = request.form.get("exclude_live") == "on"
    exclude_censored = request.form.get("exclude_censored") == "on"
    exclude_instrumental = request.form.get("exclude_instrumental") == "on"
    exclude_acappella = request.form.get("exclude_acappella") == "on"
    match_remasters = request.form.get("match_remasters") == "on"

    job_id = progress.new_job()
    threading.Thread(
        target=run_search_job,
        args=(job_id, artist_name, token_info),
        kwargs={
            "exclude_live": exclude_live, "exclude_censored": exclude_censored,
            "exclude_instrumental": exclude_instrumental, "exclude_acappella": exclude_acappella,
            "match_remasters": match_remasters,
        },
        daemon=True,
    ).start()

    return render_template(
        "searching.html",
        job_id=job_id,
        heading=f"Digging through {artist_name}…",
        subheading="This can take a while for artists with large catalogs — DeepDive is reading every release track by track.",
        progress_url=url_for("search_progress", job_id=job_id),
        results_url_prefix="/search/results/",
        show_cancel=False,
    )


@app.route("/search/progress/<job_id>")
def search_progress(job_id):
    job = progress.get(job_id)
    if not job:
        return jsonify({"status": "error", "error": "Unknown or expired search."}), 404
    return jsonify(job)


@app.route("/search/results/<result_id>")
def search_results(result_id):
    token_info = get_token()
    if not token_info:
        return redirect(url_for("login"))

    cached = RESULTS_CACHE.get(result_id)
    if not cached or cached.get("mode") != "search":
        flash("That search has expired \u2014 please search again.")
        return redirect(url_for("index"))

    return render_template(
        "results.html",
        result_id=result_id,
        artist=cached["artist"],
        duplicates=cached["duplicate_candidates"],
        new_tracks=cached["new_tracks"],
        already_liked_count=cached["already_liked_count"],
        excluded_count=cached.get("excluded_count", 0),
        exclude_live=cached.get("exclude_live", False),
        exclude_censored=cached.get("exclude_censored", False),
        exclude_instrumental=cached.get("exclude_instrumental", False),
        exclude_acappella=cached.get("exclude_acappella", False),
        match_remasters=cached.get("match_remasters", False),
        default_playlist_name=f"DeepDive: {cached['artist']['name']}",
    )


@app.route("/confirm", methods=["POST"])
def confirm():
    token_info = get_token()
    if not token_info:
        return redirect(url_for("login"))

    result_id = request.form.get("result_id")
    cached = RESULTS_CACHE.get(result_id)
    if not cached:
        flash("That search has expired \u2014 please search again.")
        return redirect(url_for("index"))

    sp = sc.get_client(token_info)

    like_ids = request.form.getlist("like_track")
    create_playlist = request.form.get("create_playlist") == "on"
    playlist_ids = request.form.getlist("playlist_track") if create_playlist else []
    playlist_name = request.form.get("playlist_name", "").strip() or cached["artist"]["name"]

    liked_now_count = 0
    playlist_url = None
    playlist_reused = False
    already_present_count = 0
    added_count = 0

    # Liking and playlist-building are handled separately and never
    # allowed to raise: if one half fails, the other half's result is
    # still reported rather than the whole page becoming a 500 and
    # throwing away results that took minutes to produce.
    like_error = None
    playlist_error = None

    if like_ids:
        try:
            sc.like_tracks(sp, like_ids)
            liked_now_count = len(like_ids)
        except Exception as e:
            like_error = str(e)

    if playlist_ids:
        try:
            pl = sc.add_tracks_to_playlist_deduped(
                sp,
                playlist_name,
                f"Auto-built by DeepDive from {cached['artist']['name']}'s catalog on "
                f"{datetime.now().strftime('%Y-%m-%d')}.",
                playlist_ids,
            )
            playlist_url = pl["url"]
            playlist_reused = pl["reused"]
            already_present_count = pl["already_present_count"]
            added_count = pl["added_count"]
        except Exception as e:
            playlist_error = str(e)

    # Only discard the cached results if everything actually worked —
    # otherwise the user can go back and retry instead of re-running the
    # whole search.
    if not like_error and not playlist_error:
        RESULTS_CACHE.pop(result_id, None)

    return render_template(
        "done.html",
        artist=cached["artist"],
        liked_now_count=liked_now_count,
        playlist_url=playlist_url,
        playlist_reused=playlist_reused,
        added_count=added_count,
        already_present_count=already_present_count,
        like_error=like_error,
        playlist_error=playlist_error,
    )


# ---------------------------------------------------------------------
# Full library scrub: crawls every distinct artist in your Liked Songs.
# Slow (potentially 30-60+ min for a large, diverse library) since it's
# equivalent to running the single-artist search once per artist — but
# genuinely comprehensive. Cancellable; keeps whatever it found so far.
# ---------------------------------------------------------------------

def run_full_scrub_job(job_id, token_info, exclude_live=False, exclude_censored=False,
                        exclude_instrumental=False, exclude_acappella=False, match_remasters=False):
    try:
        sp = sc.get_client(token_info)

        progress.update(job_id, stage="Reading your Liked Songs…", percent=1)
        liked_tracks = run_with_timeout(sc.get_all_liked_tracks, STAGE_TIMEOUT_SECONDS, sp)
        liked_index = matching.build_liked_indexes(liked_tracks)

        artists = sc.get_distinct_liked_artists(liked_tracks)
        total_artists = len(artists) or 1

        all_duplicates = []
        all_new_tracks = []
        per_artist_summary = []
        artists_scanned = 0
        cancelled = False

        for i, artist in enumerate(artists, start=1):
            if progress.is_cancel_requested(job_id):
                cancelled = True
                break

            base_percent = (i - 1) / total_artists * 100
            progress.update(
                job_id,
                stage=f"[{i}/{total_artists}] {artist['name']}: finding releases\u2026",
                percent=base_percent,
            )

            def crawl_this_artist():
                # Same two-phase flow as single-artist search — see
                # run_search_job() and matching.py for why.
                progress.update(
                    job_id,
                    stage=f"[{i}/{total_artists}] {artist['name']}: reading releases\u2026",
                )
                catalog_tracks = sc.get_artist_catalog_tracks(sp, artist["id"])

                phase1 = matching.find_candidates(
                    catalog_tracks, liked_index,
                    exclude_live=exclude_live, exclude_censored=exclude_censored,
                    exclude_instrumental=exclude_instrumental, exclude_acappella=exclude_acappella,
                )

                candidate_ids = [c["track"]["id"] for c in phase1["candidates"]]
                if candidate_ids:
                    progress.update(
                        job_id,
                        stage=f"[{i}/{total_artists}] {artist['name']}: checking {len(candidate_ids)} possible matches\u2026",
                    )
                    full_tracks = sc.get_tracks_with_isrc(sp, candidate_ids)
                else:
                    full_tracks = []

                phase2 = matching.confirm_candidates(
                    full_tracks, phase1["candidates"], liked_index,
                    match_remasters=match_remasters,
                )
                return {
                    "duplicate_candidates": phase2["duplicate_candidates"],
                    "new_tracks": phase1["new_tracks"] + phase2["new_tracks"],
                }

            try:
                # A fresh daemon thread per artist — daemon=True specifically
                # so an abandoned/hung thread can never block the Flask
                # process from exiting cleanly later (a plain
                # ThreadPoolExecutor doesn't have this property: it
                # registers a global atexit hook that joins every thread
                # it ever created, so an abandoned worker would eventually
                # hang process shutdown even with shutdown(wait=False)).
                # thread.join(timeout=...) enforces a real wall-clock
                # deadline regardless of what's happening inside the stuck
                # call — unlike a cooperative check, this doesn't depend on
                # the stuck code ever returning control to check in.
                result_holder = {}

                def _run():
                    try:
                        result_holder["result"] = crawl_this_artist()
                    except Exception as inner_err:
                        result_holder["error"] = inner_err

                worker = threading.Thread(target=_run, daemon=True)
                worker.start()
                worker.join(timeout=ARTIST_TIME_BUDGET_SECONDS)

                if worker.is_alive():
                    raise TimeoutError(
                        f"Still going after {ARTIST_TIME_BUDGET_SECONDS // 60} minutes on this artist — skipped so the rest of the scrub isn't blocked."
                    )
                if "error" in result_holder:
                    raise result_holder["error"]
                result = result_holder["result"]

                for d in result["duplicate_candidates"]:
                    d["artist_name"] = artist["name"]
                    all_duplicates.append(d)
                all_new_tracks.extend(result["new_tracks"])

                if result["duplicate_candidates"] or result["new_tracks"]:
                    per_artist_summary.append({
                        "name": artist["name"],
                        "matches": len(result["duplicate_candidates"]),
                        "new": len(result["new_tracks"]),
                    })
            except Exception as artist_err:
                # One artist failing shouldn't kill the whole scrub.
                per_artist_summary.append({
                    "name": artist["name"], "matches": 0, "new": 0, "error": str(artist_err)
                })

            artists_scanned += 1
            progress.update(job_id, percent=i / total_artists * 100)

        result_id = uuid.uuid4().hex
        RESULTS_CACHE[result_id] = {
            "mode": "full_scrub",
            "duplicate_candidates": all_duplicates,
            "new_tracks": all_new_tracks,
            "per_artist_summary": per_artist_summary,
            "artists_scanned": artists_scanned,
            "artists_total": total_artists,
            "exclude_live": exclude_live,
            "exclude_censored": exclude_censored,
            "exclude_instrumental": exclude_instrumental,
            "exclude_acappella": exclude_acappella,
            "match_remasters": match_remasters,
        }

        if cancelled:
            progress.cancel(job_id, result_id=result_id)
        else:
            progress.finish(job_id, result_id)

    except Exception as e:
        progress.fail(job_id, f"Something went wrong: {e}")


@app.route("/full-scrub/start", methods=["POST"])
def full_scrub_start():
    token_info = get_token()
    if not token_info:
        return redirect(url_for("login"))

    exclude_live = request.form.get("exclude_live") == "on"
    exclude_censored = request.form.get("exclude_censored") == "on"
    exclude_instrumental = request.form.get("exclude_instrumental") == "on"
    exclude_acappella = request.form.get("exclude_acappella") == "on"
    match_remasters = request.form.get("match_remasters") == "on"

    job_id = progress.new_job()
    threading.Thread(
        target=run_full_scrub_job,
        args=(job_id, token_info),
        kwargs={
            "exclude_live": exclude_live, "exclude_censored": exclude_censored,
            "exclude_instrumental": exclude_instrumental, "exclude_acappella": exclude_acappella,
            "match_remasters": match_remasters,
        },
        daemon=True,
    ).start()

    return render_template(
        "searching.html",
        job_id=job_id,
        heading="Scrubbing your full library\u2026",
        subheading="Crawling every artist in your Liked Songs \u2014 for a large, diverse library this can genuinely take a while. Any single artist that's still going after 5 minutes gets skipped so it can't block the rest. You can cancel any time and keep whatever's been found so far.",
        progress_url=url_for("full_scrub_progress", job_id=job_id),
        results_url_prefix="/full-scrub/results/",
        show_cancel=True,
        cancel_url=url_for("full_scrub_cancel", job_id=job_id),
    )


@app.route("/full-scrub/progress/<job_id>")
def full_scrub_progress(job_id):
    job = progress.get(job_id)
    if not job:
        return jsonify({"status": "error", "error": "Unknown or expired scan."}), 404
    return jsonify(job)


@app.route("/full-scrub/cancel/<job_id>", methods=["POST"])
def full_scrub_cancel(job_id):
    progress.request_cancel(job_id)
    return jsonify({"ok": True})


@app.route("/full-scrub/results/<result_id>")
def full_scrub_results(result_id):
    token_info = get_token()
    if not token_info:
        return redirect(url_for("login"))

    cached = RESULTS_CACHE.get(result_id)
    if not cached or cached.get("mode") != "full_scrub":
        flash("That scan has expired \u2014 please run it again.")
        return redirect(url_for("index"))

    return render_template(
        "full_scrub_results.html",
        result_id=result_id,
        duplicates=cached["duplicate_candidates"],
        new_tracks=cached["new_tracks"],
        per_artist_summary=cached["per_artist_summary"],
        artists_scanned=cached["artists_scanned"],
        artists_total=cached["artists_total"],
        exclude_live=cached.get("exclude_live", False),
        exclude_censored=cached.get("exclude_censored", False),
        exclude_instrumental=cached.get("exclude_instrumental", False),
        exclude_acappella=cached.get("exclude_acappella", False),
        match_remasters=cached.get("match_remasters", False),
        default_playlist_name="DeepDive: Full Library Scrub",
    )


@app.route("/full-scrub/confirm", methods=["POST"])
def full_scrub_confirm():
    token_info = get_token()
    if not token_info:
        return redirect(url_for("login"))

    result_id = request.form.get("result_id")
    cached = RESULTS_CACHE.get(result_id)
    if not cached:
        flash("That scan has expired \u2014 please run it again.")
        return redirect(url_for("index"))

    sp = sc.get_client(token_info)

    like_ids = request.form.getlist("like_track")
    create_playlist = request.form.get("create_playlist") == "on"
    playlist_ids = request.form.getlist("playlist_track") if create_playlist else []
    playlist_name = request.form.get("playlist_name", "").strip() or "DeepDive: Full Library Scrub"

    liked_now_count = 0
    playlist_url = None
    playlist_reused = False
    already_present_count = 0
    added_count = 0
    like_error = None
    playlist_error = None

    if like_ids:
        try:
            sc.like_tracks(sp, like_ids)
            liked_now_count = len(like_ids)
        except Exception as e:
            like_error = str(e)

    if playlist_ids:
        try:
            pl = sc.add_tracks_to_playlist_deduped(
                sp,
                playlist_name,
                f"Auto-built by DeepDive's full library scrub on {datetime.now().strftime('%Y-%m-%d')}.",
                playlist_ids,
            )
            playlist_url = pl["url"]
            playlist_reused = pl["reused"]
            already_present_count = pl["already_present_count"]
            added_count = pl["added_count"]
        except Exception as e:
            playlist_error = str(e)

    if not like_error and not playlist_error:
        RESULTS_CACHE.pop(result_id, None)

    return render_template(
        "done.html",
        artist={"name": "your library"},
        liked_now_count=liked_now_count,
        playlist_url=playlist_url,
        playlist_reused=playlist_reused,
        added_count=added_count,
        already_present_count=already_present_count,
        like_error=like_error,
        playlist_error=playlist_error,
    )


if __name__ == "__main__":
    host = os.environ.get("DEEPDIVE_HOST", "127.0.0.1")
    port = int(os.environ.get("DEEPDIVE_PORT", "8888"))
    app.run(host=host, port=port, debug=False, threaded=True)
