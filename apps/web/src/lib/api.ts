import { type ApiErrorBody, type AuthResponse, createApiClient } from '@quantforge/api-client';
import type { Middleware } from 'openapi-fetch';
import { useSession } from '@/stores/session';

/** Same-origin in dev (Vite proxy) and prod (Nginx), so the SameSite=Strict refresh cookie works. */
export const api = createApiClient({
  baseUrl: typeof location === 'undefined' ? '' : location.origin,
  // Bind late so fetch can be swapped (tests, instrumentation) after the client is created.
  fetch: (input) => globalThis.fetch(input),
});

export class ApiRequestError extends Error {
  readonly status: number;
  readonly body: ApiErrorBody | undefined;

  constructor(status: number, body: ApiErrorBody | undefined) {
    super(body?.error.message ?? `Request failed (${status})`);
    this.status = status;
    this.body = body;
  }
  get code() {
    return this.body?.error.code;
  }
}

let refreshing: Promise<AuthResponse | null> | null = null;

/**
 * Single-flight refresh: concurrent 401s share ONE refresh call. Two parallel refreshes would
 * present the same token twice, which the server treats as reuse and revokes the session (ADR-007).
 */
export function refreshSession(): Promise<AuthResponse | null> {
  refreshing ??= fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'include' })
    .then(async (r) => {
      if (!r.ok) return null;
      const body = (await r.json()) as AuthResponse;
      useSession.getState().setSession(body.accessToken, body.user);
      return body;
    })
    .catch(() => null)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

const RETRIED = new WeakSet<Request>();
// A request body can be read only once, so keep a pristine copy to replay after a refresh.
const PRISTINE = new WeakMap<Request, Request>();
const AUTH_PATHS = ['/api/v1/auth/'];

const authMiddleware: Middleware = {
  onRequest({ request }) {
    const { accessToken, workspaceId } = useSession.getState();
    if (accessToken && !request.headers.has('authorization')) request.headers.set('authorization', `Bearer ${accessToken}`);
    if (workspaceId && !request.headers.has('x-workspace-id')) request.headers.set('x-workspace-id', workspaceId);
    PRISTINE.set(request, request.clone());
    return request;
  },
  async onResponse({ request, response }) {
    const isAuthCall = AUTH_PATHS.some((p) => new URL(request.url, location.origin).pathname.startsWith(p));
    if (response.status !== 401 || isAuthCall || RETRIED.has(request)) return response;
    const session = await refreshSession();
    if (!session) {
      useSession.getState().clear();
      return response;
    }
    const retry = PRISTINE.get(request) ?? request;
    retry.headers.set('authorization', `Bearer ${session.accessToken}`);
    RETRIED.add(retry);
    return fetch(retry);
  },
};
api.use(authMiddleware);

/** Unwraps an openapi-fetch result: returns data or throws ApiRequestError (for TanStack Query). */
export async function unwrap<T>(p: Promise<{ data?: T; error?: unknown; response: Response }>): Promise<T> {
  const { data, error, response } = await p;
  if (error !== undefined || !response.ok) throw new ApiRequestError(response.status, error as ApiErrorBody | undefined);
  return data as T;
}

export function errorMessage(e: unknown): string {
  if (e instanceof ApiRequestError) return e.message;
  if (e instanceof Error) return e.message;
  return 'Something went wrong';
}
