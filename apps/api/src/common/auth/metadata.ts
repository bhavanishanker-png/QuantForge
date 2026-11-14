import type { Request } from 'express';
import type { WorkspaceRole } from '../../generated/prisma/enums.js';

export interface AuthUser {
  userId: string;
  sessionId: string;
}
export interface WorkspaceCtx {
  workspaceId: string;
  role: WorkspaceRole;
}
export type AuthedRequest = Request & { user: AuthUser; workspace?: WorkspaceCtx };

export const IS_PUBLIC = 'qf:isPublic';
export const WORKSPACE_SCOPE = 'qf:workspaceScope';

export interface WorkspaceScopeOptions {
  /** Minimum role. Ranks: VIEWER < DEVELOPER < ADMIN < OWNER. */
  minRole: WorkspaceRole;
  /** Where the workspace id comes from: the X-Workspace-Id header or the `:workspaceId` path param. */
  source?: 'header' | 'param';
}
