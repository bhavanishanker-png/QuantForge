import { validateEnv } from '../config/env.js';
import { hasRole } from './auth/roles.js';
import { decodeCursor, encodeCursor } from './http/pagination.js';

describe('hasRole', () => {
  it('ranks VIEWER < DEVELOPER < ADMIN < OWNER', () => {
    expect(hasRole('OWNER', 'ADMIN')).toBe(true);
    expect(hasRole('ADMIN', 'ADMIN')).toBe(true);
    expect(hasRole('DEVELOPER', 'ADMIN')).toBe(false);
    expect(hasRole('VIEWER', 'DEVELOPER')).toBe(false);
  });
});

describe('cursor', () => {
  it('round-trips and rejects tampering', () => {
    const d = new Date('2026-11-14T10:00:00.123Z');
    const c = encodeCursor([d, 'abc']);
    expect(decodeCursor(c, 2)).toEqual([d.toISOString(), 'abc']);
    expect(decodeCursor(c, 3)).toBeUndefined();
    expect(decodeCursor('not-base64-json', 2)).toBeUndefined();
    expect(decodeCursor(Buffer.from('[1,2]').toString('base64url'), 2)).toBeUndefined();
  });
});

describe('validateEnv', () => {
  const valid = {
    APP_DATABASE_URL: 'postgresql://u:p@localhost:6432/db',
    REDIS_QUEUE_URL: 'redis://localhost:6379/0',
    REDIS_CACHE_URL: 'redis://localhost:6380/0',
    JWT_ACCESS_SECRET: 'x'.repeat(32),
    INTERNAL_SERVICE_TOKEN: 'y'.repeat(32),
  };
  it('applies safe defaults', () => {
    const env = validateEnv(valid);
    expect(env).toMatchObject({ JWT_ACCESS_TTL_SECONDS: 900, COOKIE_SECURE: false, PORT: 3000 });
  });
  it('refuses to start with a short JWT secret or a non-Postgres URL, listing every problem', () => {
    expect(() => validateEnv({ ...valid, JWT_ACCESS_SECRET: 'short', APP_DATABASE_URL: 'mysql://x' })).toThrow(
      /JWT_ACCESS_SECRET[\s\S]*APP_DATABASE_URL|APP_DATABASE_URL[\s\S]*JWT_ACCESS_SECRET/,
    );
  });
});
