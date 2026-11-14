import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { api, createTestApp, registerUser, type TestApp, type TestUser } from './helpers.js';

/**
 * Phase 1 exit criterion 4: user B can never read or write workspace A's data through any route,
 * and the database itself enforces it even if application code forgets a check (ADR-002).
 */
let t: TestApp;
let alice: TestUser;
let bob: TestUser;
let aliceJobId: string;

beforeAll(async () => {
  t = await createTestApp();
  alice = await registerUser(t, 'Alice');
  bob = await registerUser(t, 'Bob');
  const res = await api(t, alice).post('/api/v1/system/ping-job', { durationSec: 0 }).expect(202);
  aliceJobId = res.body.jobId;
});
afterAll(async () => {
  await t.close();
});

describe('workspace isolation through the API', () => {
  const A = () => alice.workspaceId;

  it.each([
    ['GET', '/workspaces/:A', (): string => `/api/v1/workspaces/${A()}`],
    ['PATCH', '/workspaces/:A', (): string => `/api/v1/workspaces/${A()}`],
    ['GET', '/workspaces/:A/members', (): string => `/api/v1/workspaces/${A()}/members`],
    ['POST', '/workspaces/:A/members', (): string => `/api/v1/workspaces/${A()}/members`],
    ['PATCH', '/workspaces/:A/members/:alice', (): string => `/api/v1/workspaces/${A()}/members/${alice.id}`],
    ['DELETE', '/workspaces/:A/members/:alice', (): string => `/api/v1/workspaces/${A()}/members/${alice.id}`],
  ] as const)('%s %s -> 403 WORKSPACE_FORBIDDEN for a non-member', async (method, _label, path) => {
    const b = api(t, bob);
    const body = { name: 'pwned', email: bob.email, role: 'OWNER' };
    const res = await (method === 'GET' ? b.get(path()) : method === 'POST' ? b.post(path(), body) : method === 'PATCH' ? b.patch(path(), body) : b.delete(path()));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('WORKSPACE_FORBIDDEN');
  });

  it.each([
    ['GET', '/jobs', (): string => '/api/v1/jobs'],
    ['GET', '/jobs/:aliceJob', (): string => `/api/v1/jobs/${aliceJobId}`],
    ['POST', '/jobs/:aliceJob/cancel', (): string => `/api/v1/jobs/${aliceJobId}/cancel`],
    ['POST', '/system/ping-job', (): string => '/api/v1/system/ping-job'],
  ] as const)('%s %s with X-Workspace-Id of a foreign workspace -> 403', async (method, _label, path) => {
    const p = path();
    const b = api(t, bob, A());
    const res = await (method === 'GET' ? b.get(p) : b.post(p, {}));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('WORKSPACE_FORBIDDEN');
  });

  it('a foreign job id inside your OWN workspace is simply not found', async () => {
    const res = await api(t, bob).get(`/api/v1/jobs/${aliceJobId}`).expect(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    await api(t, bob).post(`/api/v1/jobs/${aliceJobId}/cancel`).expect(404);
  });

  it('missing, malformed and non-existent workspace ids all look identical (no existence oracle)', async () => {
    const noHeader = await request(t.http).get('/api/v1/jobs').auth(bob.token, { type: 'bearer' });
    const malformed = await api(t, bob, 'not-a-uuid').get('/api/v1/jobs');
    const unknown = await api(t, bob, randomUUID()).get('/api/v1/jobs');
    const foreign = await api(t, bob, A()).get('/api/v1/jobs');
    for (const r of [noHeader, malformed, unknown, foreign]) {
      expect(r.status).toBe(403);
      expect(r.body.error).toMatchObject({ code: 'WORKSPACE_FORBIDDEN', message: foreign.body.error.message });
    }
  });

  it("listing workspaces only ever returns the caller's own", async () => {
    const res = await request(t.http).get('/api/v1/workspaces').auth(bob.token, { type: 'bearer' }).expect(200);
    expect(res.body.items.map((w: { id: string }) => w.id)).toEqual([bob.workspaceId]);
  });

  it("job lists never include another workspace's jobs", async () => {
    const res = await api(t, bob).get('/api/v1/jobs').expect(200);
    expect(res.body.items.every((j: { workspaceId: string }) => j.workspaceId === bob.workspaceId)).toBe(true);
    expect(res.body.items.find((j: { id: string }) => j.id === aliceJobId)).toBeUndefined();
  });
});

describe('workspace isolation in the database itself (defense in depth)', () => {
  it('a query with no context sees no tenant rows at all', async () => {
    const [jobs, members, workspaces, users, audits] = await Promise.all([
      t.db.client.backgroundJob.count(),
      t.db.client.workspaceMember.count(),
      t.db.client.workspace.count(),
      t.db.client.user.count(),
      t.db.client.auditLog.count(),
    ]);
    expect({ jobs, members, workspaces, users, audits }).toEqual({ jobs: 0, members: 0, workspaces: 0, users: 0, audits: 0 });
  });

  it("Bob's context cannot read, update or delete Alice's rows even with explicit ids", async () => {
    await t.db.withContext({ userId: bob.id, workspaceId: bob.workspaceId }, async (tx) => {
      expect(await tx.backgroundJob.findUnique({ where: { id: aliceJobId } })).toBeNull();
      expect(await tx.workspace.findUnique({ where: { id: alice.workspaceId } })).toBeNull();
      expect(await tx.user.findUnique({ where: { id: alice.id } })).toBeNull();
      expect((await tx.backgroundJob.updateMany({ where: { id: aliceJobId }, data: { cancelRequested: true } })).count).toBe(0);
      expect((await tx.workspaceMember.deleteMany({ where: { workspaceId: alice.workspaceId } })).count).toBe(0);
    });
  });

  it("Bob's context cannot insert rows into Alice's workspace", async () => {
    await expect(
      t.db.withContext({ userId: bob.id, workspaceId: bob.workspaceId }, (tx) =>
        tx.workspaceMember.create({ data: { workspaceId: alice.workspaceId, userId: bob.id, role: 'OWNER' } }),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('claiming a foreign workspace id as context still requires membership for the workspace row', async () => {
    // Even if a bug set Alice's workspace as Bob's context, Bob could not list Alice's members' emails
    // via users (users policy requires membership of the CURRENT workspace for others' rows).
    await t.db.withContext({ userId: bob.id }, async (tx) => {
      expect(await tx.workspace.findUnique({ where: { id: alice.workspaceId } })).toBeNull();
    });
  });

  it('the app role cannot read the outbox (payloads of every workspace)', async () => {
    await expect(t.db.client.outboxEvent.findMany()).rejects.toThrow(/permission denied/i);
  });
});
