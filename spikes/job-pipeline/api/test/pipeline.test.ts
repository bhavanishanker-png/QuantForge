import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { io as connect, type Socket } from "socket.io-client";
import { createJob, pool, requestCancel, startRelay } from "../src/server.ts";

const PORT = 39123;
const COMPOSE = "docker compose -f ../docker-compose.yml";
let relay: Awaited<ReturnType<typeof startRelay>>;
let socket: Socket;
const ws = randomUUID();
const otherWs = randomUUID();
const seen = new Map<string, string[]>(); // jobId -> statuses received over Socket.IO

const job = async (id: string) =>
  (await pool.query("SELECT * FROM background_jobs WHERE id = $1", [id])).rows[0];
const effects = async (id: string) =>
  Number((await pool.query("SELECT count(*) FROM ping_results WHERE job_id = $1", [id])).rows[0].count);

async function waitFor<T>(fn: () => Promise<T | undefined | false>, timeoutMs: number, what: string): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`timed out waiting for ${what}`);
}
const waitStatus = (id: string, statuses: string[], ms = 20_000) =>
  waitFor(async () => {
    const j = await job(id);
    return statuses.includes(j.status) && j;
  }, ms, `job ${id} -> ${statuses.join("|")}`);

before(async () => {
  relay = await startRelay(PORT);
  socket = connect(`http://localhost:${PORT}`, { transports: ["websocket"] });
  await new Promise<void>((r) => socket.on("connect", () => r()));
  await new Promise<void>((r) => socket.emit("workspace.join", ws, r));
  socket.on("job.updated", (e: { jobId: string; status: string }) => {
    seen.set(e.jobId, [...(seen.get(e.jobId) ?? []), e.status]);
  });
});

after(async () => {
  socket.close();
  await relay.close();
  await pool.end();
});

describe("outbox -> dispatcher -> Celery -> Postgres -> Redis -> Socket.IO", () => {
  test("happy path: job completes and live updates reach the workspace room", async () => {
    const { jobId } = await createJob(ws, "system.ping", { durationSec: 2 });
    const j = await waitStatus(jobId, ["COMPLETED"]);
    assert.equal(j.attempt, 1);
    assert.equal(Number(j.progress), 100);
    assert.equal(await effects(jobId), 1);
    const ob = (await pool.query("SELECT status FROM outbox_events WHERE job_id = $1", [jobId])).rows;
    assert.deepEqual(ob.map((r) => r.status), ["PUBLISHED"]);
    await waitFor(async () => seen.get(jobId)?.includes("COMPLETED"), 3000, "socket COMPLETED");
    const statuses = seen.get(jobId)!;
    assert.equal(statuses[0], "RUNNING");
    assert.equal(statuses.at(-1), "COMPLETED");
  });

  test("events never reach another workspace's room", async () => {
    const { jobId } = await createJob(otherWs, "system.ping", { durationSec: 0.5 });
    await waitStatus(jobId, ["COMPLETED"]);
    await new Promise((r) => setTimeout(r, 500));
    assert.equal(seen.get(jobId), undefined);
  });

  test("duplicate delivery (outbox re-published with same task id) has no second effect", async () => {
    const { jobId } = await createJob(ws, "system.ping", { durationSec: 0.5 });
    await waitStatus(jobId, ["COMPLETED"]);
    // Simulate the dispatcher crashing after send_task but before marking PUBLISHED.
    await pool.query("UPDATE outbox_events SET status='PENDING' WHERE job_id = $1", [jobId]);
    await pool.query("NOTIFY outbox_new");
    await waitFor(async () =>
      (await pool.query("SELECT 1 FROM outbox_events WHERE job_id=$1 AND status='PUBLISHED' AND attempts=2", [jobId])).rowCount,
      5000, "re-publish");
    await new Promise((r) => setTimeout(r, 1500));
    const j = await job(jobId);
    assert.equal(j.status, "COMPLETED");
    assert.equal(j.attempt, 1, "duplicate message must not start a second attempt");
    assert.equal(await effects(jobId), 1);
  });

  test("100 concurrent jobs: every one completes exactly once", async () => {
    const ids = await Promise.all(
      Array.from({ length: 100 }, () => createJob(ws, "system.ping", { durationSec: 0.05 }).then((r) => r.jobId)),
    );
    await waitFor(async () => {
      const { rows } = await pool.query(
        "SELECT count(*) FILTER (WHERE status='COMPLETED') c FROM background_jobs WHERE id = ANY($1)", [ids]);
      return Number(rows[0].c) === 100;
    }, 60_000, "100 jobs completed");
    const { rows } = await pool.query("SELECT count(*) c, count(DISTINCT job_id) d FROM ping_results WHERE job_id = ANY($1)", [ids]);
    assert.equal(Number(rows[0].c), 100);
    assert.equal(Number(rows[0].d), 100);
  });

  test("cancellation: a running job ends CANCELLED and produces no effect", async () => {
    const { jobId } = await createJob(ws, "system.ping", { durationSec: 30 });
    await waitStatus(jobId, ["RUNNING"]);
    await requestCancel(jobId);
    const j = await waitStatus(jobId, ["CANCELLED"], 10_000);
    assert.ok(j.finished_at);
    assert.equal(await effects(jobId), 0);
  });

  test("unroutable event: retried with backoff, then DEAD and job FAILED (DISPATCH_FAILED)", async () => {
    const { jobId } = await createJob(ws, "system.does_not_exist", {});
    const j = await waitStatus(jobId, ["FAILED"], 30_000);
    assert.equal(j.error_code, "DISPATCH_FAILED");
    const ob = (await pool.query("SELECT status, attempts FROM outbox_events WHERE job_id=$1", [jobId])).rows[0];
    assert.equal(ob.status, "DEAD");
    assert.equal(ob.attempts, 5);
  });

  test("worker killed mid-job: job is recovered and completes exactly once, never stuck RUNNING", async () => {
    const { jobId } = await createJob(ws, "system.ping", { durationSec: 6 });
    await waitStatus(jobId, ["RUNNING"]);
    await new Promise((r) => setTimeout(r, 1500));
    execSync(`${COMPOSE} kill -s SIGKILL worker`, { stdio: "ignore" });
    const t0 = Date.now();
    // While no worker exists, the reaper must still notice (it lives in the dispatcher).
    await waitStatus(jobId, ["QUEUED"], 15_000);
    const reapedAfterMs = Date.now() - t0;
    execSync(`${COMPOSE} start worker`, { stdio: "ignore" });
    const j = await waitStatus(jobId, ["COMPLETED"], 60_000);
    assert.equal(j.attempt, 2);
    assert.equal(await effects(jobId), 1);
    console.log(`  reaped after ${reapedAfterMs} ms; completed on attempt ${j.attempt}`);
  });

  test("worker lost on every attempt: job ends FAILED (WORKER_LOST) after max_attempts", async () => {
    const { jobId } = await createJob(ws, "system.ping", { durationSec: 60 });
    await pool.query("UPDATE background_jobs SET max_attempts = 2 WHERE id = $1", [jobId]);
    for (let attempt = 1; attempt <= 2; attempt++) {
      await waitFor(async () => {
        const j = await job(jobId);
        return j.status === "RUNNING" && j.attempt === attempt;
      }, 30_000, `attempt ${attempt} running`);
      execSync(`${COMPOSE} kill -s SIGKILL worker`, { stdio: "ignore" });
      if (attempt === 1) {
        await waitStatus(jobId, ["QUEUED"], 15_000);
        execSync(`${COMPOSE} start worker`, { stdio: "ignore" });
      }
    }
    const j = await waitStatus(jobId, ["FAILED"], 15_000);
    assert.equal(j.error_code, "WORKER_LOST");
    assert.equal(await effects(jobId), 0);
    execSync(`${COMPOSE} start worker`, { stdio: "ignore" });
  });
});

describe("task errors", () => {
  test("a task that raises fails immediately with TASK_ERROR (no waiting for the reaper)", async () => {
    const { jobId } = await createJob(ws, "system.ping", { durationSec: "not-a-number" });
    const j = await waitStatus(jobId, ["FAILED"], 5_000);
    assert.equal(j.error_code, "TASK_ERROR");
    assert.equal(j.attempt, 1);
  });
});

describe("fencing", () => {
  test("a zombie worker that lost ownership cannot complete the job or write its effect", async () => {
    const { jobId } = await createJob(ws, "system.ping", { durationSec: 4 });
    await waitStatus(jobId, ["RUNNING"]);
    // Simulate: reaper requeued it and another worker claimed attempt 2 while this one was stalled.
    await pool.query("UPDATE background_jobs SET attempt = attempt + 1 WHERE id = $1", [jobId]);
    // The original worker's next heartbeat fails the fence -> it abandons. Nobody heartbeats
    // attempt 2, so the reaper requeues it and attempt 3 completes.
    const j = await waitStatus(jobId, ["COMPLETED"], 30_000);
    assert.equal(j.attempt, 3);
    const r = (await pool.query("SELECT attempt FROM ping_results WHERE job_id = $1", [jobId])).rows;
    assert.deepEqual(r.map((x) => x.attempt), [3], "only the fenced-in attempt may write the effect");
  });
});
