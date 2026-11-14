import request from 'supertest';
import { createTestApp, nextIp, refreshCookie, registerUser, type TestApp } from './helpers.js';

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.close();
});

describe('auth', () => {
  it('registers, returns a token and a hardened refresh cookie, and creates a personal workspace', async () => {
    const res = await request(t.http)
      .post('/api/v1/auth/register')
      .set('x-forwarded-for', nextIp())
      .send({ email: `  New-${Date.now()}@Example.TEST `, password: 'correct-horse-battery-staple', displayName: 'New' })
      .expect(201);
    expect(res.body.accessToken).toBeTypeOf('string');
    expect(res.body.user.email).toMatch(/^new-\d+@example\.test$/); // trimmed + lowercased
    const cookie = (res.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('qf_refresh='))!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(cookie).toMatch(/Path=\/api\/v1\/auth/);
    const ws = await request(t.http).get('/api/v1/workspaces').auth(res.body.accessToken, { type: 'bearer' }).expect(200);
    expect(ws.body.items).toHaveLength(1);
    expect(ws.body.items[0].role).toBe('OWNER');
  });

  it('rejects a duplicate email with 409 EMAIL_TAKEN', async () => {
    const u = await registerUser(t);
    const res = await request(t.http)
      .post('/api/v1/auth/register')
      .set('x-forwarded-for', nextIp())
      .send({ email: u.email.toUpperCase(), password: 'another-long-password', displayName: 'Dup' })
      .expect(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('rejects weak passwords and unknown fields with VALIDATION_FAILED', async () => {
    const res = await request(t.http)
      .post('/api/v1/auth/register')
      .set('x-forwarded-for', nextIp())
      .send({ email: 'a@b.test', password: 'short', displayName: 'X', isAdmin: true })
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    const paths = (res.body.error.details as { path: string }[]).map((d) => d.path);
    expect(paths).toEqual(expect.arrayContaining(['password', 'isAdmin']));
  });

  it('logs in with the right password and gives the same error for a wrong password or unknown email', async () => {
    const u = await registerUser(t);
    await request(t.http).post('/api/v1/auth/login').set('x-forwarded-for', u.ip).send({ email: u.email, password: u.password }).expect(200);
    const wrong = await request(t.http).post('/api/v1/auth/login').set('x-forwarded-for', u.ip).send({ email: u.email, password: 'wrong-password-123' }).expect(401);
    const unknown = await request(t.http).post('/api/v1/auth/login').set('x-forwarded-for', u.ip).send({ email: 'nobody@example.test', password: 'wrong-password-123' }).expect(401);
    expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(unknown.body.error).toMatchObject({ code: wrong.body.error.code, message: wrong.body.error.message });
  });

  it('rejects missing, malformed and tampered access tokens', async () => {
    const u = await registerUser(t);
    await request(t.http).get('/api/v1/users/me').expect(401);
    await request(t.http).get('/api/v1/users/me').auth('not-a-jwt', { type: 'bearer' }).expect(401);
    const [h, p] = u.token.split('.');
    await request(t.http).get('/api/v1/users/me').auth(`${h}.${p}.forged-signature`, { type: 'bearer' }).expect(401);
    await request(t.http).get('/api/v1/users/me').auth(u.token, { type: 'bearer' }).expect(200);
  });

  it('rotates refresh tokens; reusing an old one revokes the whole session family', async () => {
    const u = await registerUser(t);
    const r1 = await request(t.http).post('/api/v1/auth/refresh').set('cookie', u.cookie).expect(200);
    const c1 = refreshCookie(r1);
    expect(c1).not.toBe(u.cookie);
    const r2 = await request(t.http).post('/api/v1/auth/refresh').set('cookie', c1).expect(200);
    const c2 = refreshCookie(r2);

    // Attacker replays the first (already rotated) token -> reuse detected.
    const replay = await request(t.http).post('/api/v1/auth/refresh').set('cookie', u.cookie).expect(401);
    expect(replay.body.error.code).toBe('INVALID_REFRESH_TOKEN');
    // ...and the legitimate latest token is now dead too.
    await request(t.http).post('/api/v1/auth/refresh').set('cookie', c2).expect(401);
  });

  it('logout revokes the session', async () => {
    const u = await registerUser(t);
    await request(t.http).post('/api/v1/auth/logout').set('cookie', u.cookie).expect(204);
    await request(t.http).post('/api/v1/auth/refresh').set('cookie', u.cookie).expect(401);
  });

  it('rate-limits credential endpoints per client IP (10/min)', async () => {
    const ip = nextIp();
    const codes: number[] = [];
    for (let i = 0; i < 12; i++) {
      const r = await request(t.http).post('/api/v1/auth/login').set('x-forwarded-for', ip).send({ email: 'x@example.test', password: 'whatever-123' });
      codes.push(r.status);
    }
    expect(codes.slice(0, 10).every((c) => c === 401)).toBe(true);
    expect(codes.slice(10)).toEqual([429, 429]);
  });

  it('PATCH /users/me updates the display name', async () => {
    const u = await registerUser(t);
    const res = await request(t.http).patch('/api/v1/users/me').auth(u.token, { type: 'bearer' }).send({ displayName: '  Renamed ' }).expect(200);
    expect(res.body.displayName).toBe('Renamed');
  });
});
