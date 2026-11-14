"""Outbox dispatcher + reaper (ADR-005). Run: python -m workers.outbox_dispatcher

Connects DIRECTLY to Postgres as qf_dispatcher (LISTEN/NOTIFY doesn't work through PgBouncer
transaction pooling). Safe to run several replicas: claims use FOR UPDATE SKIP LOCKED.
The reaper lives here, not in Celery Beat, so it keeps working when every worker is dead (spike 2).
"""

import signal
import time
import uuid
from types import FrameType

import psycopg
import structlog
from psycopg.types.json import Jsonb

from app.core.config import get_settings
from app.core.events import publish_job_updated
from app.core.logging import configure_logging
from workers.celery_app import app as celery

configure_logging("dispatcher")
log = structlog.get_logger()

# event_type -> (Celery task name, queue). Must match JOB_TYPES in apps/api/src/jobs/jobs.service.ts.
ROUTES: dict[str, tuple[str, str]] = {
    "system.ping": ("qf.system.ping", "default"),
}

BATCH = 50
CLAIM_SQL = """
UPDATE outbox_events
   SET status = 'CLAIMED', claimed_until = now() + interval '60 seconds', attempts = attempts + 1
 WHERE id IN (
   SELECT id FROM outbox_events
    WHERE (status = 'PENDING' AND available_at <= now())
       OR (status = 'CLAIMED' AND claimed_until < now())
    ORDER BY created_at
    LIMIT %(batch)s
    FOR UPDATE SKIP LOCKED)
RETURNING id::text, workspace_id::text, job_id::text, event_type, payload, attempts
"""

_running = True


def _stop(signum: int, _frame: FrameType | None) -> None:
    global _running
    log.info("shutdown signal received", signal=signum)
    _running = False


def dispatch_batch(conn: psycopg.Connection) -> int:
    s = get_settings()
    rows = conn.execute(CLAIM_SQL, {"batch": BATCH}).fetchall()
    for ev_id, ws, job_id, ev_type, payload, attempts in rows:
        try:
            if ev_type not in ROUTES:
                raise ValueError(f"no route for event type {ev_type!r}")
            task, queue = ROUTES[ev_type]
            # task_id = event id: a re-publish after a crash is a duplicate the worker absorbs.
            celery.send_task(task, args=[payload], task_id=ev_id, queue=queue)
            conn.execute(
                "UPDATE outbox_events SET status='PUBLISHED', published_at=now() WHERE id=%s", (ev_id,)
            )
            log.info("event published", event_id=ev_id, event_type=ev_type, job_id=job_id)
        except Exception as e:  # noqa: BLE001 - one bad event must not stop the dispatcher
            if attempts >= s.max_dispatch_attempts:
                with conn.transaction():
                    conn.execute(
                        "UPDATE outbox_events SET status='DEAD', last_error=%s WHERE id=%s", (str(e), ev_id)
                    )
                    conn.execute(
                        """UPDATE background_jobs SET status='FAILED', finished_at=now(),
                                  error_code='DISPATCH_FAILED', error_message=%s
                            WHERE id=%s AND status IN ('QUEUED','RUNNING')""",
                        (str(e)[:500], job_id),
                    )
                publish_job_updated(ws, job_id, "FAILED", 0)
                log.error("event dead-lettered", event_id=ev_id, attempts=attempts, error=str(e))
            else:
                delay = s.dispatch_backoff_base_s * 2 ** (attempts - 1)
                conn.execute(
                    """UPDATE outbox_events SET status='PENDING', last_error=%s,
                              available_at = now() + make_interval(secs => %s) WHERE id=%s""",
                    (str(e)[:500], delay, ev_id),
                )
                log.warning("dispatch failed; retrying", event_id=ev_id, attempts=attempts, retry_in_s=delay)
    return len(rows)


def _new_event(conn: psycopg.Connection, job_id: str, ws: str, job_type: str) -> None:
    conn.execute(
        """INSERT INTO outbox_events (id, workspace_id, job_id, event_type, payload)
           VALUES (%s, %s, %s, %s, %s)""",
        (str(uuid.uuid4()), ws, job_id, job_type, Jsonb({"jobId": job_id, "workspaceId": ws})),
    )


def reap(conn: psycopg.Connection) -> None:
    """No job may stay RUNNING forever, and no QUEUED job may be silently forgotten."""
    s = get_settings()
    with conn.transaction():
        # 1. Worker lost (stale heartbeat), attempts left -> requeue with a fresh outbox event.
        requeued = conn.execute(
            """UPDATE background_jobs SET status='QUEUED', heartbeat_at=NULL
                WHERE status='RUNNING' AND heartbeat_at < now() - make_interval(secs => %s)
                  AND attempt < max_attempts
            RETURNING id::text, workspace_id::text, type""",
            (s.stale_after_s,),
        ).fetchall()
        for job_id, ws, jtype in requeued:
            _new_event(conn, job_id, ws, jtype)
        # 2. Worker lost on the final attempt -> FAILED.
        failed = conn.execute(
            """UPDATE background_jobs SET status='FAILED', finished_at=now(), error_code='WORKER_LOST',
                      error_message='Worker stopped responding and no attempts remain'
                WHERE status='RUNNING' AND heartbeat_at < now() - make_interval(secs => %s)
                  AND attempt >= max_attempts
            RETURNING id::text, workspace_id::text""",
            (s.stale_after_s,),
        ).fetchall()
        # 3. Message lost (e.g. broker data loss): QUEUED, event PUBLISHED long ago, never claimed.
        lost = conn.execute(
            """SELECT j.id::text, j.workspace_id::text, j.type FROM background_jobs j
                WHERE j.status = 'QUEUED'
                  AND NOT EXISTS (SELECT 1 FROM outbox_events e WHERE e.job_id = j.id
                                   AND (e.status IN ('PENDING','CLAIMED')
                                        OR e.published_at > now() - make_interval(secs => %s)))
                  AND EXISTS (SELECT 1 FROM outbox_events e WHERE e.job_id = j.id AND e.status = 'PUBLISHED')
                FOR UPDATE OF j SKIP LOCKED""",
            (s.lost_message_after_s,),
        ).fetchall()
        for job_id, ws, jtype in lost:
            _new_event(conn, job_id, ws, jtype)
    for job_id, ws, _ in requeued:
        log.warning("reaper requeued job (worker lost)", job_id=job_id)
        publish_job_updated(ws, job_id, "QUEUED", 0)
    for job_id, ws in failed:
        log.error("reaper failed job (WORKER_LOST)", job_id=job_id)
        publish_job_updated(ws, job_id, "FAILED", 0)
    for job_id, _, _ in lost:
        log.warning("reaper re-dispatched job (message lost)", job_id=job_id)


def main() -> None:
    s = get_settings()
    if s.dispatcher_database_url is None:
        raise SystemExit("DISPATCHER_DATABASE_URL is required")
    signal.signal(signal.SIGTERM, _stop)
    signal.signal(signal.SIGINT, _stop)
    dsn = str(s.dispatcher_database_url)
    with psycopg.connect(dsn, autocommit=True) as conn, psycopg.connect(dsn, autocommit=True) as listen:
        listen.execute("LISTEN outbox_new")
        log.info("dispatcher started", routes=sorted(ROUTES))
        last_reap = 0.0
        while _running:
            while dispatch_batch(conn) == BATCH:
                pass
            if time.monotonic() - last_reap >= s.reaper_every_s:
                reap(conn)
                last_reap = time.monotonic()
            for _ in listen.notifies(timeout=0.5, stop_after=1):  # wake on NOTIFY or poll every 500 ms
                pass
    log.info("dispatcher stopped")


if __name__ == "__main__":
    main()
