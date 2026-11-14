"""Worker side of ADR-005: idempotent claim, heartbeats, cancellation, fenced completion."""
import time

import psycopg
from celery.utils.log import get_task_logger

from .celery_app import app
from .config import DATABASE_URL, HEARTBEAT_EVERY_S, STALE_AFTER_S
from .events import publish_job_updated

log = get_task_logger(__name__)

CLAIM_SQL = """
UPDATE background_jobs
   SET status = 'RUNNING', attempt = attempt + 1, heartbeat_at = now(),
       started_at = coalesce(started_at, now())
 WHERE id = %(id)s
   AND (status = 'QUEUED'
        OR (status = 'RUNNING' AND heartbeat_at < now() - make_interval(secs => %(stale)s)))
RETURNING workspace_id::text, attempt, payload
"""

# Fencing: every write after the claim is conditional on (status RUNNING, our attempt).
# A zombie worker whose job was reaped and re-run cannot overwrite the newer attempt.
HEARTBEAT_SQL = """
UPDATE background_jobs SET heartbeat_at = now(), progress = %(p)s
 WHERE id = %(id)s AND status = 'RUNNING' AND attempt = %(a)s
RETURNING cancel_requested
"""


class LostOwnership(Exception):
    pass


def _finish(conn: psycopg.Connection, job_id: str, attempt: int, status: str,
            code: str | None = None, msg: str | None = None) -> bool:
    cur = conn.execute(
        """UPDATE background_jobs
              SET status = %(s)s::job_status, finished_at = now(), error_code = %(c)s, error_message = %(m)s,
                  progress = CASE WHEN %(s)s::job_status = 'COMPLETED' THEN 100 ELSE progress END
            WHERE id = %(id)s AND status = 'RUNNING' AND attempt = %(a)s""",
        {"s": status, "c": code, "m": msg, "id": job_id, "a": attempt},
    )
    return cur.rowcount == 1


@app.task(name="qf.system.ping", bind=True)
def ping(self, payload: dict) -> None:
    job_id = payload["jobId"]
    with psycopg.connect(DATABASE_URL, autocommit=True) as conn:
        row = conn.execute(CLAIM_SQL, {"id": job_id, "stale": STALE_AFTER_S}).fetchone()
        if row is None:
            log.info("job %s not claimable (done, or owned by a live worker): skipping", job_id)
            return
        ws, attempt, job_payload = row
        log.info("claimed job %s attempt %s (task %s)", job_id, attempt, self.request.id)
        publish_job_updated(ws, job_id, "RUNNING", 0)

        # Everything after the claim runs inside the handler, so ANY error fails the job fast.
        try:
            duration = float(job_payload.get("durationSec", 1))
            started, last_hb = time.monotonic(), 0.0
            while (elapsed := time.monotonic() - started) < duration:
                if elapsed - last_hb >= HEARTBEAT_EVERY_S:
                    last_hb = elapsed
                    progress = round(100 * elapsed / duration, 2)
                    hb = conn.execute(HEARTBEAT_SQL, {"p": progress, "id": job_id, "a": attempt}).fetchone()
                    if hb is None:
                        raise LostOwnership()
                    if hb[0]:
                        if _finish(conn, job_id, attempt, "CANCELLED"):
                            publish_job_updated(ws, job_id, "CANCELLED", progress)
                        return
                    publish_job_updated(ws, job_id, "RUNNING", progress)
                time.sleep(0.1)

            # Business effect + terminal status in ONE transaction, fenced by attempt.
            with conn.transaction():
                if not _finish(conn, job_id, attempt, "COMPLETED"):
                    raise LostOwnership()
                conn.execute("INSERT INTO ping_results (job_id, attempt) VALUES (%s, %s)", (job_id, attempt))
            publish_job_updated(ws, job_id, "COMPLETED", 100)
        except LostOwnership:
            log.warning("lost ownership of job %s attempt %s: abandoning", job_id, attempt)
        except Exception as e:
            # Deterministic task error: fail now (fenced) instead of waiting for heartbeat staleness.
            log.exception("job %s attempt %s failed", job_id, attempt)
            if _finish(conn, job_id, attempt, "FAILED", "TASK_ERROR", f"{type(e).__name__}: {e}"[:500]):
                publish_job_updated(ws, job_id, "FAILED", 0)
