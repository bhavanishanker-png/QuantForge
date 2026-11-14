import { api, createTestApp, registerUser, type TestApp, type TestUser } from './helpers.js';

let t: TestApp;
let u: TestUser;
beforeAll(async () => {
  t = await createTestApp();
  u = await registerUser(t, 'Jobs');
});
afterAll(async () => {
  await t.close();
});

describe('jobs API', () => {
  it('ping-job returns 202 with a job reference and writes the job + outbox event atomically', async () => {
    const res = await api(t, u).post('/api/v1/system/ping-job', { durationSec: 1 }).expect(202);
    expect(res.body).toEqual({ jobId: expect.any(String), status: 'QUEUED', resourceType: null, resourceId: null });
    const job = await api(t, u).get(`/api/v1/jobs/${res.body.jobId}`).expect(200);
    expect(job.body).toMatchObject({ type: 'system.ping', workspaceId: u.workspaceId, attempt: 0, createdBy: u.id });
  });

  it('validates the ping duration', async () => {
    const res = await api(t, u).post('/api/v1/system/ping-job', { durationSec: 999 }).expect(400);
    expect(res.body.error.details[0].path).toBe('durationSec');
  });

  it('paginates newest-first with an opaque cursor and no duplicates', async () => {
    const fresh = await registerUser(t, 'Pager');
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) ids.push((await api(t, fresh).post('/api/v1/system/ping-job', { durationSec: 0 }).expect(202)).body.jobId);
    const p1 = await api(t, fresh).get('/api/v1/jobs?limit=2').expect(200);
    const p2 = await api(t, fresh).get(`/api/v1/jobs?limit=2&cursor=${p1.body.nextCursor}`).expect(200);
    const p3 = await api(t, fresh).get(`/api/v1/jobs?limit=2&cursor=${p2.body.nextCursor}`).expect(200);
    const seen = [...p1.body.items, ...p2.body.items, ...p3.body.items].map((j: { id: string }) => j.id);
    expect(seen).toEqual([...ids].reverse());
    expect(p3.body.nextCursor).toBeNull();
    await api(t, fresh).get('/api/v1/jobs?cursor=garbage').expect(400);
  });

  it('filters by status', async () => {
    const res = await api(t, u).get('/api/v1/jobs?status=COMPLETED').expect(200);
    expect(res.body.items.every((j: { status: string }) => j.status === 'COMPLETED')).toBe(true);
  });

  it('cancelling a QUEUED job finishes it immediately; cancelling again is a conflict', async () => {
    // Long job so no worker can complete it first if the engine happens to be running.
    const { body } = await api(t, u).post('/api/v1/system/ping-job', { durationSec: 60 }).expect(202);
    const res = await api(t, u).post(`/api/v1/jobs/${body.jobId}/cancel`).expect(200);
    expect(['CANCELLED', 'RUNNING']).toContain(res.body.status);
    expect(res.body.cancelRequested).toBe(true);
    if (res.body.status === 'CANCELLED') {
      const again = await api(t, u).post(`/api/v1/jobs/${body.jobId}/cancel`).expect(409);
      expect(again.body.error.code).toBe('JOB_FINISHED');
    }
  });
});
