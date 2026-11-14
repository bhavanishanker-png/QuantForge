import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/bootstrap.js';
import { PrismaService } from '../src/common/database/prisma.service.js';

export interface TestApp {
  app: NestExpressApplication;
  http: App;
  db: PrismaService;
  close: () => Promise<void>;
}

export async function createTestApp(): Promise<TestApp> {
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = mod.createNestApplication<NestExpressApplication>({ logger: false });
  configureApp(app);
  await app.init();
  return { app, http: app.getHttpServer() as App, db: app.get(PrismaService), close: () => app.close() };
}

export interface TestUser {
  id: string;
  email: string;
  password: string;
  token: string;
  cookie: string;
  workspaceId: string;
  /** Distinct client IP per user so the per-IP auth rate limit doesn't interfere between tests. */
  ip: string;
}

// Rate-limit counters live in Redis and outlive a test run, so each run uses a fresh random range.
let ipCounter = Math.floor(Math.random() * 2 ** 22) * 4;
export const nextIp = () => {
  const n = ipCounter++;
  return `10.${(n >> 16) & 255}.${(n >> 8) & 255}.${n & 255}`;
};

export function refreshCookie(res: request.Response): string {
  const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
  const c = raw?.find((h) => h.startsWith('qf_refresh='));
  if (!c) throw new Error('no refresh cookie set');
  return c.split(';')[0];
}

export async function registerUser(t: TestApp, name = 'User'): Promise<TestUser> {
  const email = `${name.toLowerCase()}-${randomUUID().slice(0, 8)}@example.test`;
  const password = 'correct-horse-battery-staple';
  const ip = nextIp();
  const res = await request(t.http)
    .post('/api/v1/auth/register')
    .set('x-forwarded-for', ip)
    .send({ email, password, displayName: name })
    .expect(201);
  const token = res.body.accessToken as string;
  const ws = await request(t.http).get('/api/v1/workspaces').auth(token, { type: 'bearer' }).expect(200);
  return { id: res.body.user.id, email, password, token, cookie: refreshCookie(res), workspaceId: ws.body.items[0].id, ip };
}

export const api = (t: TestApp, u: TestUser, workspaceId = u.workspaceId) => ({
  get: (path: string) => request(t.http).get(path).auth(u.token, { type: 'bearer' }).set('x-workspace-id', workspaceId),
  post: (path: string, body?: object) =>
    request(t.http).post(path).auth(u.token, { type: 'bearer' }).set('x-workspace-id', workspaceId).send(body ?? {}),
  patch: (path: string, body?: object) =>
    request(t.http).patch(path).auth(u.token, { type: 'bearer' }).set('x-workspace-id', workspaceId).send(body ?? {}),
  delete: (path: string) => request(t.http).delete(path).auth(u.token, { type: 'bearer' }).set('x-workspace-id', workspaceId),
});
