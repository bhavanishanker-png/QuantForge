"""Outbox dispatcher + reaper (ADR-005). Safe to run several replicas (SKIP LOCKED)."""
import logging
import time

import psycopg
from psycopg.types.json import Jsonb

from .celery_app import app
from .config import (BACKOFF_BASE_S, DATABASE_URL, MAX_DISPATCH_ATTEMPTS, REAPER_EVERY_S,
                     STALE_AFTER_S)
from .events import publish_job_updated

logging.basicConfig(level=logging.INFO, format="%(asctime)s dispatcher %(levelname)s %(message)s")
log = logging.getLogger()

ROUTES: dict[str, tuple[str, str]] = {  # event_type -> (celery task, queue)
    "system.ping": ("qf.system.ping", "default"),
}

CLAIM_SQL = """
UPDATE outbox_events
   SET status = 'CLAIMED', claimed_until = now() + interval '60 seconds', attempts = attempts + 1
 WHERE id IN (
   SELECT id FROM outbox_events
    WHERE (status = 'PENDING' AND available_at <= now())
       OR (status = 'CLAIMED' AND claimed_until < now())
    ORDER BY created_at
    LIMIT 50
    FOR UPDATE SKIP LOCKED)
RETURNING id::text, workspace_id::text, job_id::text, event_type, payload, attempts
"""


def dispatch_batch(conn: psycopg.Connection) -> int:
    rows = conn.execute(CLAIM_SQL).fetchall()
    for ev_id, ws, job_id, ev_type, payload, attempts in rows:
        try:
            if ev_type not in ROUTES:
                raise ValueError(f"no route for event type {ev_type!r}")
            task, queue = ROUTES[ev_type]
            # task_id = event id -> a re-publish after a crash is a duplicate the worker absorbs.
            app.send_task(task, args=[payload], task_id=ev_id, queue=queue)
            conn.execute("UPDATE outbox_events SET status='PUBLISHED', published_at=now() WHERE id=%s", (ev_id,))
            log.info("published %s %s job=%s", ev_type, ev_id, job_id)
        except Exception as e:  # noqa: BLE001
            if attempts >= MAX_DISPATCH_ATTEMPTS:
                with conn.transaction():
                    conn.execute("UPDATE outbox_events SET status='DEAD', last_error=%s WHERE id=%s", (str(e), ev_id))
                    conn.execute(
                        """UPDATE background_jobs SET status='FAILED', finished_at=now(),
                                  error_code='DISPATCH_FAILED', error_message=%s
                            WHERE id=%s AND status IN ('QUEUED','RUNNING')""", (str(e), job_id))
                publish_job_updated(ws, job_id, "FAILED", 0)
                log.error("DEAD event %s after %s attempts: %s", ev_id, attempts, e)
            else:
                delay = BACKOFF_BASE_S * 2 ** (attempts - 1)
                conn.execute(
                    """UPDATE outbox_events SET status='PENDING', last_error=%s,
                              available_at = now() + make_interval(secs => %s) WHERE id=%s""",
                    (str(e), delay, ev_id))
                log.warning("dispatch failed %s attempt %s, retry in %.1fs: %s", ev_id, attempts, delay, e)
    return len(rows)


def reap(conn: psycopg.Connection) -> None:
    """RUNNING jobs with stale heartbeats: requeue (new outbox event) or fail. Never stuck RUNNING."""
    with conn.transaction():
        requeued = conn.execute(
            """UPDATE background_jobs SET status='QUEUED', heartbeat_at=NULL
                WHERE status='RUNNING' AND heartbeat_at < now() - make_interval(secs => %s)
                  AND attempt < max_attempts
            RETURNING id::text, workspace_id::text, type, payload""", (STALE_AFTER_S,)).fetchall()
        for job_id, ws, jtype, payload in requeued:
            conn.execute(
                """INSERT INTO outbox_events (workspace_id, job_id, event_type, payload)
                   VALUES (%s, %s, %s, %s)""", (ws, job_id, jtype, Jsonb({**payload, "jobId": job_id})))
        failed = conn.execute(
            """UPDATE background_jobs SET status='FAILED', finished_at=now(), error_code='WORKER_LOST',
                      error_message='heartbeat lost and max attempts reached'
                WHERE status='RUNNING' AND heartbeat_at < now() - make_interval(secs => %s)
                  AND attempt >= max_attempts
            RETURNING id::text, workspace_id::text""", (STALE_AFTER_S,)).fetchall()
    for job_id, ws, *_ in requeued:
        log.warning("reaper: requeued job %s", job_id)
        publish_job_updated(ws, job_id, "QUEUED", 0)
    for job_id, ws in failed:
        log.error("reaper: job %s FAILED (WORKER_LOST)", job_id)
        publish_job_updated(ws, job_id, "FAILED", 0)


def main() -> None:
    with psycopg.connect(DATABASE_URL, autocommit=True) as conn, \
         psycopg.connect(DATABASE_URL, autocommit=True) as listen_conn:
        listen_conn.execute("LISTEN outbox_new")
        log.info("dispatcher started")
        last_reap = 0.0
        while True:
            while dispatch_batch(conn) == 50:
                pass
            if time.monotonic() - last_reap >= REAPER_EVERY_S:
                reap(conn)
                last_reap = time.monotonic()
            # Wake immediately on NOTIFY, otherwise poll every 500 ms.
            for _ in listen_conn.notifies(timeout=0.5, stop_after=1):
                pass


if __name__ == "__main__":
    main()
