"""
Minimal in-memory progress tracker for background search jobs.
Fine for a single-user, locally-run app — no need for a real task queue.
"""

import threading
import uuid

JOBS = {}
_lock = threading.Lock()


def new_job():
    job_id = uuid.uuid4().hex
    with _lock:
        JOBS[job_id] = {
            "status": "running",   # running | done | error | cancelled
            "stage": "Starting…",
            "percent": 0,
            "result_id": None,
            "error": None,
            "cancel_requested": False,
        }
    return job_id


def update(job_id, stage=None, percent=None):
    with _lock:
        job = JOBS.get(job_id)
        if not job:
            return
        if stage is not None:
            job["stage"] = stage
        if percent is not None:
            job["percent"] = max(0, min(100, round(percent)))


def request_cancel(job_id):
    with _lock:
        job = JOBS.get(job_id)
        if job:
            job["cancel_requested"] = True


def is_cancel_requested(job_id) -> bool:
    with _lock:
        job = JOBS.get(job_id)
        return bool(job and job["cancel_requested"])


def cancel(job_id, result_id=None):
    """Marks a job as cancelled. If result_id is given (partial results
    were salvaged before stopping), the caller can still view them."""
    with _lock:
        job = JOBS.get(job_id)
        if job:
            job["status"] = "cancelled"
            job["stage"] = "Cancelled"
            job["result_id"] = result_id


def finish(job_id, result_id):
    with _lock:
        job = JOBS.get(job_id)
        if job:
            job["status"] = "done"
            job["percent"] = 100
            job["stage"] = "Done"
            job["result_id"] = result_id


def fail(job_id, error_message):
    with _lock:
        job = JOBS.get(job_id)
        if job:
            job["status"] = "error"
            job["error"] = error_message


def get(job_id):
    with _lock:
        job = JOBS.get(job_id)
        return dict(job) if job else None
