"""The job lifecycle every task runs inside (ADR-005, validated by spike 2).

    claim (idempotent) -> heartbeats (fenced, check cancel) -> complete + effects in ONE txn (fenced)

Fencing: every write after the claim is conditional on (status RUNNING, attempt = ours). If that
fails we lost ownership (the reaper requeued us and another attempt owns the job) and we abandon.
Any exception after the claim fails the job immediately with TASK_ERROR.
"""

import json
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

import structlog
from pydantic import BaseModel, ValidationError
from sqlalchemy import Connection, text

from app.core.config import get_settings
from app.core.events import publish_job_updated
from app.db.session import workspace_tx

log = structlog.get_logger()

CLAIM_SQL = text("""
UPDATE background_jobs
   SET status = 'RUNNING', attempt = attempt + 1, heartbeat_at = now(),
       started_at = coalesce(started_at, now())
 WHERE id = :id
   AND (status = 'QUEUED'
        OR (status = 'RUNNING' AND heartbeat_at < now() - make_interval(secs => :stale)))
RETURNING attempt, payload, type
""")

HEARTBEAT_SQL = text("""
UPDATE background_jobs SET heartbeat_at = now(), progress = :p
 WHERE id = :id AND status = 'RUNNING' AND attempt = :a
RETURNING cancel_requested
""")

FINISH_SQL = text("""
UPDATE background_jobs
   SET status = CAST(:s AS "JobStatus"), finished_at = now(), error_code = :c, error_message = :m,
       result = CAST(:r AS jsonb),
       progress = CASE WHEN CAST(:s AS "JobStatus") = 'COMPLETED' THEN 100 ELSE progress END
 WHERE id = :id AND status = 'RUNNING' AND attempt = :a
""")


class OutboxPayload(BaseModel):
    jobId: str
    workspaceId: str


class LostOwnershipError(Exception):
    pass


class CancelledError(Exception):
    pass


@dataclass
class JobResult:
    result: dict[str, Any] = field(default_factory=dict)
    # Business effects, written in the SAME transaction as COMPLETED (exactly-once effects).
    persist: Callable[[Connection], None] | None = None


@dataclass
class JobContext:
    job_id: str
    workspace_id: str
    attempt: int
    payload: dict[str, Any]
    _last_hb: float = field(default_factory=time.monotonic)

    def heartbeat(self, progress: float, *, force: bool = False) -> None:
        """Call often. Cheap: only writes every HEARTBEAT_EVERY_S. Raises on cancel / lost ownership."""
        now = time.monotonic()
        if not force and now - self._last_hb < get_settings().heartbeat_every_s:
            return
        self._last_hb = now
        p = round(max(0.0, min(progress, 100.0)), 2)
        with workspace_tx(self.workspace_id) as conn:
            row = conn.execute(HEARTBEAT_SQL, {"p": p, "id": self.job_id, "a": self.attempt}).first()
        if row is None:
            raise LostOwnershipError
        if row[0]:
            raise CancelledError
        publish_job_updated(self.workspace_id, self.job_id, "RUNNING", p)


def _finish(
    ctx: JobContext,
    status: str,
    *,
    code: str | None = None,
    msg: str | None = None,
    result: dict[str, Any] | None = None,
    persist: Callable[[Connection], None] | None = None,
) -> bool:
    """Fenced terminal write; effects (persist) commit atomically with it. False = lost ownership."""
    params = {
        "s": status,
        "c": code,
        "m": msg,
        "r": None if result is None else json.dumps(result),
        "id": ctx.job_id,
        "a": ctx.attempt,
    }
    with workspace_tx(ctx.workspace_id) as conn:
        if conn.execute(FINISH_SQL, params).rowcount != 1:
            return False  # nothing was written; the transaction commits an empty change
        if persist is not None:
            persist(conn)
    publish_job_updated(ctx.workspace_id, ctx.job_id, status, 100.0 if status == "COMPLETED" else 0.0)
    return True


def run_job(raw_payload: object, handler: Callable[[JobContext], JobResult]) -> None:
    try:
        msg = OutboxPayload.model_validate(raw_payload)
    except ValidationError:
        log.error("malformed task payload; dropping", payload=raw_payload)
        return
    structlog.contextvars.bind_contextvars(job_id=msg.jobId, workspace_id=msg.workspaceId)
    try:
        with workspace_tx(msg.workspaceId) as conn:
            row = conn.execute(CLAIM_SQL, {"id": msg.jobId, "stale": get_settings().stale_after_s}).first()
        if row is None:
            log.info("job not claimable (finished, cancelled, or owned by a live worker); skipping")
            return
        ctx = JobContext(msg.jobId, msg.workspaceId, int(row.attempt), dict(row.payload))
        structlog.contextvars.bind_contextvars(attempt=ctx.attempt, job_type=row.type)
        log.info("job claimed")
        publish_job_updated(ctx.workspace_id, ctx.job_id, "RUNNING", 0.0)

        try:
            out = handler(ctx)
            if not _finish(ctx, "COMPLETED", result=out.result, persist=out.persist):
                raise LostOwnershipError
            log.info("job completed")
        except LostOwnershipError:
            log.warning("lost ownership; abandoning attempt")
        except CancelledError:
            _finish(ctx, "CANCELLED")
            log.info("job cancelled")
        except Exception as e:
            log.exception("job failed")
            _finish(ctx, "FAILED", code="TASK_ERROR", msg=f"{type(e).__name__}: {e}"[:500])
    finally:
        structlog.contextvars.unbind_contextvars("job_id", "workspace_id", "attempt", "job_type")
