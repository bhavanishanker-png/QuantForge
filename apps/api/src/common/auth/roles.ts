import { WorkspaceRole } from '../../generated/prisma/enums.js';

export const ROLE_RANK: Record<WorkspaceRole, number> = {
  VIEWER: 0,
  DEVELOPER: 1,
  ADMIN: 2,
  OWNER: 3,
};

export const hasRole = (actual: WorkspaceRole, min: WorkspaceRole) => ROLE_RANK[actual] >= ROLE_RANK[min];
