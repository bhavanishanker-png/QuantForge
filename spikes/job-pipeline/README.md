# Spike 2: Job pipeline (outbox → dispatcher → Celery → Postgres → Redis → Socket.IO)

Validates ADR-004 and ADR-005. Throwaway code: Phase 1 copies the *pattern*, not this code.
`api/src/server.ts` stands in for the NestJS side; `engine/` is the Python dispatcher, reaper and Celery worker.

```bash
docker compose up -d --build --wait
cd api && npm install && npm test        # about 80 s; kills and restarts the worker container
docker compose down -v
```
Timings are compressed through environment variables in `docker-compose.yml` (heartbeat 1 s, stale after 5 s, reaper every 1 s).

## Result: 10/10 passing, twice in a row (2026-11-14)

| Test | Result |
|---|---|
| Happy path: QUEUED→RUNNING→COMPLETED, progress events reach the workspace room over Socket.IO | ✔ |
| Events never reach another workspace's room | ✔ |
| Duplicate delivery (outbox re-published with the same task ID): no second attempt, no second effect | ✔ |
| 100 concurrent jobs: each completes exactly once (100 effects, 100 distinct) | ✔ |
| Cancellation: a running job ends CANCELLED with no effect | ✔ |
| Unroutable event: 5 attempts with exponential backoff, then DEAD, then job FAILED `DISPATCH_FAILED` | ✔ |
| Worker SIGKILLed mid-job: reaped about 4–6 s later with **zero workers alive**, completes on attempt 2 with exactly one effect | ✔ |
| Worker lost on every attempt: FAILED `WORKER_LOST` after `max_attempts`, no effect | ✔ |
| A task that raises: FAILED `TASK_ERROR` immediately, on attempt 1 | ✔ |
| Zombie worker (lost ownership): cannot complete or write its effect; only the fenced-in attempt does | ✔ |

## Findings (applied to ADR-005)

1. **The reaper must live in the dispatcher, not in Celery Beat.** A Beat-scheduled reaper is executed *by a worker*, so it stops exactly when it's needed (all workers dead). The kill test proves recovery while no worker is running.
2. **Fencing with `attempt` is required.** Every heartbeat and completion write is conditional on `status='RUNNING' AND attempt = <mine>`. Without it, a stalled worker could complete a job that a newer attempt now owns.
3. **All code after the claim must sit inside the error handler.** On the first run, a parse error outside the `try` meant jobs fell back to the slow reaper path: still correct, but each one took about 3 × the stale timeout to fail.
4. **Business effect and terminal status commit in one transaction**, so "completed without effect" and "effect without completed" can't happen.
5. **The outbox payload carries only `jobId`.** The worker reads the job payload from Postgres, which stays the single source of truth.
6. Redis `visibility_timeout` redeliveries are absorbed by the idempotent claim, so correctness doesn't depend on that setting. In production, set it above the longest `time_limit` to avoid pointless redeliveries.
7. psycopg cannot infer a parameter used as both an enum and text, so cast enums explicitly (`%(s)s::job_status`).

## Not covered here (Phase 1 must add)

- RLS context for workers (the pattern is proven in spike 1; apply `set_config` per unit of work).
- Running this path through PgBouncer.
- **A lost queued message** (e.g. Redis data loss): a job is QUEUED, its outbox event is PUBLISHED, but no worker ever claims it. Add a reaper rule: QUEUED with a PUBLISHED event older than N minutes → new outbox event.
- JWT authentication and the membership check on `workspace.join`.
