import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { io, type Socket } from 'socket.io-client';

/** Phase 1 exit criteria 5 and 6, against the real containers (no in-process shortcuts). */
const BASE = process.env.API_URL ?? 'http://localhost:3000';
const COMPOSE = 'docker compose -f ../../docker-compose.yml';

interface Session {
  token: string;
  workspaceId: string;
}
interface JobEvent {
  jobId: string;
  status: string;
  progress: number;
}

async function call<T>(method: string, path: string, s?: Session, body?: object): Promise<{ status: number; body: T }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(s && { authorization: `Bearer ${s.token}`, 'x-workspace-id': s.workspaceId }),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: (await res.json().catch(() => null)) as T };
}

async function register(): Promise<Session> {
  const r = await call<{ accessToken: string }>('POST', '/api/v1/auth/register', undefined, {
    email: `pipe-${randomUUID().slice(0, 8)}@example.test`,
    password: 'correct-horse-battery-staple',
    displayName: 'Pipeline',
  });
  expect(r.status).toBe(201);
  const ws = await fetch(`${BASE}/api/v1/workspaces`, { headers: { authorization: `Bearer ${r.body.accessToken}` } });
  const { items } = (await ws.json()) as { items: { id: string }[] };
  return { token: r.body.accessToken, workspaceId: items[0].id };
}

function connect(s: Session): Promise<{ socket: Socket; events: JobEvent[] }> {
  return new Promise((resolve, reject) => {
    const socket = io(`${BASE}/ws`, { auth: { token: s.token }, transports: ['websocket'] });
    const events: JobEvent[] = [];
    socket.on('job.updated', (e: JobEvent) => events.push(e));
    socket.on('connect', () => {
      socket.emit('workspace.join', { workspaceId: s.workspaceId }, (ack: { ok: boolean }) =>
        ack.ok ? resolve({ socket, events }) : reject(new Error('join refused')),
      );
    });
    socket.on('connect_error', reject);
  });
}

async function waitFor<T>(fn: () => Promise<T | undefined>, ms: number, what: string): Promise<T> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await fn();
    if (v !== undefined) return v;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`timed out: ${what}`);
}

const getJob = (s: Session, id: string) =>
  call<{ status: string; attempt: number; result: { pong?: boolean } | null; errorCode: string | null }>('GET', `/api/v1/jobs/${id}`, s).then((r) => r.body);
const waitStatus = (s: Session, id: string, statuses: string[], ms = 30_000) =>
  waitFor(async () => {
    const j = await getJob(s, id);
    return statuses.includes(j.status) ? j : undefined;
  }, ms, `job ${id} -> ${statuses.join('|')}`);

let me: Session;
let live: { socket: Socket; events: JobEvent[] };

beforeAll(async () => {
  me = await register();
  live = await connect(me);
});
afterAll(() => {
  live?.socket.close();
});

describe('job pipeline (full stack)', () => {
  it('a ping job runs QUEUED -> RUNNING -> COMPLETED and the UI channel sees it live', async () => {
    const { status, body } = await call<{ jobId: string }>('POST', '/api/v1/system/ping-job', me, { durationSec: 3 });
    expect(status).toBe(202);
    const job = await waitStatus(me, body.jobId, ['COMPLETED']);
    expect(job.result?.pong).toBe(true);
    expect(job.attempt).toBe(1);
    await waitFor(async () => (live.events.some((e) => e.jobId === body.jobId && e.status === 'COMPLETED') ? true : undefined), 3000, 'socket COMPLETED');
    const seen = live.events.filter((e) => e.jobId === body.jobId);
    expect(seen[0].status).toBe('RUNNING');
    expect(seen.some((e) => e.status === 'RUNNING' && e.progress > 0 && e.progress < 100)).toBe(true);
  });

  it("never delivers another workspace's events", async () => {
    const other = await register();
    const { body } = await call<{ jobId: string }>('POST', '/api/v1/system/ping-job', other, { durationSec: 0 });
    await waitStatus(other, body.jobId, ['COMPLETED']);
    await new Promise((r) => setTimeout(r, 500));
    expect(live.events.find((e) => e.jobId === body.jobId)).toBeUndefined();
  });

  it('refuses sockets without a valid token and joins of foreign workspaces', async () => {
    const anon = io(`${BASE}/ws`, { auth: { token: 'nope' }, transports: ['websocket'] });
    await waitFor(async () => (anon.disconnected && !anon.active ? true : undefined), 5000, 'anon disconnected');
    anon.close();
    const ack = await new Promise<{ ok: boolean }>((r) => live.socket.emit('workspace.join', { workspaceId: randomUUID() }, r));
    expect(ack.ok).toBe(false);
    // Re-join our own workspace for the remaining tests.
    await new Promise((r) => live.socket.emit('workspace.join', { workspaceId: me.workspaceId }, r));
  });

  it('cancelling a running job ends it CANCELLED', async () => {
    const { body } = await call<{ jobId: string }>('POST', '/api/v1/system/ping-job', me, { durationSec: 30 });
    await waitStatus(me, body.jobId, ['RUNNING']);
    const c = await call<{ status: string }>('POST', `/api/v1/jobs/${body.jobId}/cancel`, me);
    expect(c.status).toBe(200);
    await waitStatus(me, body.jobId, ['CANCELLED'], 10_000);
  });

  it('killing the worker mid-job: recovered by the reaper and completed, never stuck RUNNING', async () => {
    const { body } = await call<{ jobId: string }>('POST', '/api/v1/system/ping-job', me, { durationSec: 6 });
    await waitStatus(me, body.jobId, ['RUNNING']);
    await new Promise((r) => setTimeout(r, 1500));
    execSync(`${COMPOSE} kill -s SIGKILL worker`, { stdio: 'ignore' });
    try {
      // With no worker alive, the reaper (inside the dispatcher) must still notice.
      await waitStatus(me, body.jobId, ['QUEUED'], 20_000);
    } finally {
      execSync(`${COMPOSE} start worker`, { stdio: 'ignore' });
    }
    const job = await waitStatus(me, body.jobId, ['COMPLETED'], 60_000);
    expect(job.attempt).toBe(2);
  });
});
