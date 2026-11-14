"""Job lifecycle against the real database, through PgBouncer as qf_worker (RLS enforced)."""

import json
import uuid
from collections.abc import Iterator
from typing import Any

import psycopg
import pytest
from sqlalchemy import text

from app.db.session import workspace_tx
from workers.jobs import JobContext, JobResult, LostOwnershipError, run_job


@pytest.fixture
def seeded(admin_conn: psycopg.Connection) -> Iterator[dict[str, str]]:
    """Two users, each with a workspace and one QUEUED job, created as superuser."""
    ids: dict[str, str] = {}
    for side in ("a", "b"):
        user, ws = str(uuid.uuid4()), str(uuid.uuid4())
        admin_conn.execute(
            "INSERT INTO users (id, email, password_hash, display_name, updated_at)"
            " VALUES (%s, %s, 'x', 'T', now())",
            (user, f"pytest-{user}@example.test"),
        )
        admin_conn.execute(
            "INSERT INTO workspaces (id, name, slug, created_by, updated_at) VALUES (%s, 'T', %s, %s, now())",
            (ws, f"pytest-{ws}", user),
        )
        ids[f"ws_{side}"], ids[f"user_{side}"] = ws, user
    for key, ws, user in (("job_a", ids["ws_a"], ids["user_a"]), ("job_b", ids["ws_b"], ids["user_b"])):
        jid = str(uuid.uuid4())
        admin_conn.execute(
            """INSERT INTO background_jobs (id, workspace_id, type, payload, created_by)
               VALUES (%s, %s, 'system.ping', %s, %s)""",
            (jid, ws, json.dumps({"durationSec": 0}), user),
        )
        ids[key] = jid
    yield ids


def job(admin_conn: psycopg.Connection, jid: str) -> dict[str, Any]:
    cur = admin_conn.execute("SELECT * FROM background_jobs WHERE id = %s", (jid,))
    cols = [d.name for d in cur.description or []]
    row = cur.fetchone()
    assert row is not None
    return dict(zip(cols, row, strict=True))


def test_worker_cannot_see_or_claim_a_job_from_another_workspace(seeded: dict[str, str]) -> None:
    with workspace_tx(seeded["ws_b"]) as conn:
        assert (
            conn.execute(
                text("SELECT 1 FROM background_jobs WHERE id = :id"), {"id": seeded["job_a"]}
            ).first()
            is None
        )
        res = conn.execute(
            text("UPDATE background_jobs SET status='RUNNING' WHERE id = :id"), {"id": seeded["job_a"]}
        )
        assert res.rowcount == 0


def test_forged_payload_with_wrong_workspace_does_nothing(
    admin_conn: psycopg.Connection, seeded: dict[str, str]
) -> None:
    calls: list[str] = []
    run_job(
        {"jobId": seeded["job_a"], "workspaceId": seeded["ws_b"]},
        lambda c: calls.append("ran") or JobResult(),
    )
    assert calls == []
    assert job(admin_conn, seeded["job_a"])["status"] == "QUEUED"


def test_completes_once_with_result_and_effects_in_one_transaction(
    admin_conn: psycopg.Connection, seeded: dict[str, str]
) -> None:
    effects: list[str] = []

    def handler(ctx: JobContext) -> JobResult:
        return JobResult(result={"ok": 1}, persist=lambda conn: effects.append(ctx.job_id))

    payload = {"jobId": seeded["job_a"], "workspaceId": seeded["ws_a"]}
    run_job(payload, handler)
    run_job(payload, handler)  # duplicate delivery
    j = job(admin_conn, seeded["job_a"])
    assert (j["status"], j["attempt"], j["result"], float(j["progress"])) == (
        "COMPLETED",
        1,
        {"ok": 1},
        100.0,
    )
    assert effects == [seeded["job_a"]]


def test_handler_exception_fails_immediately_with_task_error(
    admin_conn: psycopg.Connection, seeded: dict[str, str]
) -> None:
    def boom(_: JobContext) -> JobResult:
        raise RuntimeError("kaboom")

    run_job({"jobId": seeded["job_a"], "workspaceId": seeded["ws_a"]}, boom)
    j = job(admin_conn, seeded["job_a"])
    assert (j["status"], j["error_code"]) == ("FAILED", "TASK_ERROR")
    assert "kaboom" in j["error_message"]


def test_cancel_request_is_honoured_at_the_next_heartbeat(
    admin_conn: psycopg.Connection, seeded: dict[str, str]
) -> None:
    def handler(ctx: JobContext) -> JobResult:
        admin_conn.execute("UPDATE background_jobs SET cancel_requested = true WHERE id = %s", (ctx.job_id,))
        ctx.heartbeat(50, force=True)
        raise AssertionError("heartbeat should have raised")

    run_job({"jobId": seeded["job_a"], "workspaceId": seeded["ws_a"]}, handler)
    assert job(admin_conn, seeded["job_a"])["status"] == "CANCELLED"


def test_zombie_attempt_is_fenced_out(admin_conn: psycopg.Connection, seeded: dict[str, str]) -> None:
    effects: list[int] = []

    def handler(ctx: JobContext) -> JobResult:
        # Simulate: reaper requeued us and attempt 2 claimed the job while we were stalled.
        admin_conn.execute("UPDATE background_jobs SET attempt = attempt + 1 WHERE id = %s", (ctx.job_id,))
        with pytest.raises(LostOwnershipError):
            ctx.heartbeat(10, force=True)
        return JobResult(result={"zombie": True}, persist=lambda _c: effects.append(ctx.attempt))

    run_job({"jobId": seeded["job_a"], "workspaceId": seeded["ws_a"]}, handler)
    j = job(admin_conn, seeded["job_a"])
    assert j["status"] == "RUNNING" and j["result"] is None, "zombie must not complete the job"
    assert effects == [], "zombie must not write effects"


def test_malformed_payload_is_dropped_without_crashing() -> None:
    run_job({"nope": 1}, lambda _c: JobResult())
    run_job("garbage", lambda _c: JobResult())
