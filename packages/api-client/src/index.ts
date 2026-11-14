import createClient, { type Client } from 'openapi-fetch';
import type { components, paths } from './schema.js';

export type { components, paths };
export type Schemas = components['schemas'];

export type User = Schemas['UserDto'];
export type AuthResponse = Schemas['AuthResponseDto'];
export type Workspace = Schemas['WorkspaceDto'];
export type Member = Schemas['MemberDto'];
export type Job = Schemas['JobDto'];
export type JobRef = Schemas['JobRefDto'];
export type JobStatus = Schemas['JobStatus'];
export type WorkspaceRole = Schemas['WorkspaceRole'];

/** Error envelope returned by every failing endpoint (API_DESIGN.md §3). */
export interface ApiErrorBody {
  error: { code: string; message: string; details?: { path: string; issue: string; message?: string }[]; requestId?: string };
}

export type ApiClient = Client<paths>;

export function createApiClient(opts: { baseUrl: string; fetch?: typeof fetch }): ApiClient {
  return createClient<paths>({ baseUrl: opts.baseUrl, fetch: opts.fetch, credentials: 'include' });
}
