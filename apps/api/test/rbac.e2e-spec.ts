import { api, createTestApp, registerUser, type TestApp, type TestUser } from './helpers.js';

let t: TestApp;
let owner: TestUser;
let member: TestUser;
let ws: string;

const as = (u: TestUser) => api(t, u, ws);

beforeAll(async () => {
  t = await createTestApp();
  owner = await registerUser(t, 'Owner');
  member = await registerUser(t, 'Member');
  ws = owner.workspaceId;
  await as(owner).post(`/api/v1/workspaces/${ws}/members`, { email: member.email, role: 'VIEWER' }).expect(201);
});
afterAll(async () => {
  await t.close();
});

const setRole = (role: string) => as(owner).patch(`/api/v1/workspaces/${ws}/members/${member.id}`, { role }).expect(200);

describe('role-based access', () => {
  it('VIEWER can read but not write', async () => {
    await setRole('VIEWER');
    await as(member).get(`/api/v1/workspaces/${ws}`).expect(200);
    await as(member).get(`/api/v1/workspaces/${ws}/members`).expect(200);
    await as(member).get('/api/v1/jobs').expect(200);
    for (const res of [
      await as(member).post('/api/v1/system/ping-job', { durationSec: 0 }),
      await as(member).patch(`/api/v1/workspaces/${ws}`, { name: 'x' }),
      await as(member).post(`/api/v1/workspaces/${ws}/members`, { email: 'x@example.test', role: 'VIEWER' }),
    ]) {
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    }
  });

  it('DEVELOPER can run jobs but not manage the workspace', async () => {
    await setRole('DEVELOPER');
    const job = await as(member).post('/api/v1/system/ping-job', { durationSec: 0 }).expect(202);
    expect(job.body).toMatchObject({ status: 'QUEUED', jobId: expect.any(String) });
    await as(member).patch(`/api/v1/workspaces/${ws}`, { name: 'x' }).expect(403);
  });

  it('ADMIN can manage members but cannot touch owners', async () => {
    await setRole('ADMIN');
    await as(member).patch(`/api/v1/workspaces/${ws}`, { name: 'Renamed by admin' }).expect(200);
    const promote = await as(member).patch(`/api/v1/workspaces/${ws}/members/${member.id}`, { role: 'OWNER' });
    expect(promote.status).toBe(403);
    await as(member).delete(`/api/v1/workspaces/${ws}/members/${owner.id}`).expect(403);
    await as(member).patch(`/api/v1/workspaces/${ws}/members/${owner.id}`, { role: 'VIEWER' }).expect(403);
  });

  it('the last owner can be neither demoted nor removed', async () => {
    const demote = await as(owner).patch(`/api/v1/workspaces/${ws}/members/${owner.id}`, { role: 'ADMIN' }).expect(409);
    expect(demote.body.error.code).toBe('LAST_OWNER');
    await as(owner).delete(`/api/v1/workspaces/${ws}/members/${owner.id}`).expect(409);
  });

  it('with two owners, one may step down', async () => {
    await setRole('OWNER');
    await as(owner).patch(`/api/v1/workspaces/${ws}/members/${owner.id}`, { role: 'ADMIN' }).expect(200);
    // The remaining owner is now the last one.
    await as(member).patch(`/api/v1/workspaces/${ws}/members/${member.id}`, { role: 'VIEWER' }).expect(409);
  });

  it('removed members lose access immediately (roles are not cached in the token)', async () => {
    const extra = await registerUser(t, 'Extra');
    await as(member).post(`/api/v1/workspaces/${ws}/members`, { email: extra.email, role: 'VIEWER' }).expect(201);
    await api(t, extra, ws).get('/api/v1/jobs').expect(200);
    await as(member).delete(`/api/v1/workspaces/${ws}/members/${extra.id}`).expect(204);
    const res = await api(t, extra, ws).get('/api/v1/jobs').expect(403);
    expect(res.body.error.code).toBe('WORKSPACE_FORBIDDEN');
  });

  it('adding an unknown email or an existing member fails cleanly', async () => {
    const unknown = await as(member).post(`/api/v1/workspaces/${ws}/members`, { email: 'ghost@example.test', role: 'VIEWER' }).expect(404);
    expect(unknown.body.error.code).toBe('USER_NOT_FOUND');
    const dup = await as(member).post(`/api/v1/workspaces/${ws}/members`, { email: owner.email, role: 'VIEWER' }).expect(409);
    expect(dup.body.error.code).toBe('ALREADY_MEMBER');
  });
});
