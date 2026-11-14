import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSession } from '@/stores/session';
import { refreshSession } from './api';

const session = { accessToken: 'new-token', expiresIn: 900, user: { id: 'u1', email: 'a@b.test', displayName: 'A' } };

describe('refreshSession', () => {
  beforeEach(() => useSession.setState({ accessToken: null, user: null, status: 'booting' }));
  afterEach(() => vi.unstubAllGlobals());

  it('makes exactly ONE network call for concurrent callers (reuse detection would otherwise log the user out)', async () => {
    let resolve!: (r: Response) => void;
    const fetchMock = vi.fn<() => Promise<Response>>(() => new Promise<Response>((r) => (resolve = r)));
    vi.stubGlobal('fetch', fetchMock);

    const calls = [refreshSession(), refreshSession(), refreshSession()];
    resolve(new Response(JSON.stringify(session), { status: 200 }));
    const results = await Promise.all(calls);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(results.every((r) => r?.accessToken === 'new-token')).toBe(true);
    expect(useSession.getState()).toMatchObject({ accessToken: 'new-token', status: 'authenticated' });
  });

  it('returns null (no session) when the refresh cookie is rejected, and allows a later retry', async () => {
    const fetchMock = vi.fn<() => Promise<Response>>(async () => new Response('{}', { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await refreshSession()).toBeNull();
    expect(await refreshSession()).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(useSession.getState().accessToken).toBeNull();
  });
});
