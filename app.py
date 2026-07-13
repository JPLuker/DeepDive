import os
import secrets
import threading
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

# In-memory cache of search results, keyed by a short-lived result id.
# Fine for a single-user, locally-run app; avoids stuffing large payloads
# into the session cookie.
RESULTS_CACHE: dict[str, dict] = {}

# Relative weight each search stage contributes to the overall progress bar.
# Must sum to 100.
STAGE_WEIGHTS = {
    "find_artist": 5,
    "liked_songs": 20,
    "list_releases": 10,
    "track_lists": 25,
    "track_details": 35,
    "classify": 5,
}


def credentials_configured() -> bool:
    return bool(CLIENT_ID) and bool(CLIENT_SECRET) and "your_client_id_here" not in CLIENT_ID


def get_oauth():
    return sc.make_oauth(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI)


def get_token():
    """Returns a valid token dict, refreshing if needed, or None if not authed."""
    oauth = get_oauth()
    token_info = session.get("token_info")
    if not token_info:
        return None
    if oauth.is_token_expired(token_info):
        token_info = oauth.refresh_access_token(token_info["refresh_token"])
        session["token_info"] = token_info
    return token_info


@app.route("/")
def index():
    if not credentials_configured():
        return redirect(url_for("setup"))
    token_info = get_token()
    return render_template("index.html", authed=bool(token_info))


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


def run_search_job(job_id, artist_name, token_info):
    """Runs entirely in a background thread. Never touches Flask's session
    or request context — everything it needs is passed in directly."""
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
        artist = sc.find_artist(sp, artist_name)
        completed += STAGE_WEIGHTS["find_artist"]
        if not artist:
            progress.fail(job_id, f'No Spotify artist found matching "{artist_name}".')
            return
        progress.update(job_id, percent=completed)

        liked_tracks = sc.get_all_liked_tracks(
            sp, on_progress=stage_callback("liked_songs", "Reading your Liked Songs…")
        )
        completed += STAGE_WEIGHTS["liked_songs"]
        liked_index = matching.build_liked_indexes(liked_tracks)
        progress.update(job_id, percent=completed)

        album_ids = sc.get_artist_album_ids(
            sp, artist["id"],
            on_progress=stage_callback("list_releases", f"Finding {artist['name']}'s releases…")
        )
        completed += STAGE_WEIGHTS["list_releases"]
        progress.update(job_id, percent=completed)

        artist_track_ids = sc.get_track_ids_from_albums(
            sp, album_ids,
            on_progress=stage_callback("track_lists", f"Reading {artist['name']}'s track lists…")
        )
        completed += STAGE_WEIGHTS["track_lists"]
        progress.update(job_id, percent=completed)

        artist_tracks = sc.get_full_tracks(
            sp, artist_track_ids,
            on_progress=stage_callback("track_details", "Fetching track details…")
        )
        completed += STAGE_WEIGHTS["track_details"]
        progress.update(job_id, stage="Comparing with your library…", percent=completed)

        result = matching.classify_tracks(artist_tracks, liked_index)

        result_id = uuid.uuid4().hex
        RESULTS_CACHE[result_id] = {
            "artist": artist,
            "duplicate_candidates": result["duplicate_candidates"],
            "new_tracks": result["new_tracks"],
            "already_liked_count": len(result["already_liked"]),
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

    job_id = progress.new_job()
    thread = threading.Thread(
        target=run_search_job, args=(job_id, artist_name, token_info), daemon=True
    )
    thread.start()

    return render_template("searching.html", job_id=job_id, artist_name=artist_name)


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
    if not cached:
        flash("That search has expired \u2014 please search again.")
        return redirect(url_for("index"))

    return render_template(
        "results.html",
        result_id=result_id,
        artist=cached["artist"],
        duplicates=cached["duplicate_candidates"],
        new_tracks=cached["new_tracks"],
        already_liked_count=cached["already_liked_count"],
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
    playlist_ids = request.form.getlist("playlist_track")
    playlist_name = request.form.get("playlist_name", "").strip() or cached["artist"]["name"]

    liked_now_count = 0
    if like_ids:
        sc.like_tracks(sp, like_ids)
        liked_now_count = len(like_ids)

    playlist_url = None
    playlist_reused = False
    already_present_count = 0
    added_count = 0
    if playlist_ids:
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

    RESULTS_CACHE.pop(result_id, None)

    return render_template(
        "done.html",
        artist=cached["artist"],
        liked_now_count=liked_now_count,
        playlist_url=playlist_url,
        playlist_reused=playlist_reused,
        added_count=added_count,
        already_present_count=already_present_count,
    )


if __name__ == "__main__":
    host = os.environ.get("DEEPDIVE_HOST", "127.0.0.1")
    port = int(os.environ.get("DEEPDIVE_PORT", "8888"))
    app.run(host=host, port=port, debug=False, threaded=True)
