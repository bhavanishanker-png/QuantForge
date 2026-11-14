import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../database/prisma.service.js';
import { ApiError } from '../http/error.filter.js';
import { type AuthedRequest, WORKSPACE_SCOPE, type WorkspaceScopeOptions } from './metadata.js';
import { hasRole } from './roles.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolves the caller's membership of the requested workspace. A missing, malformed, unknown or
 * non-member workspace all return the same 403, so the response never reveals whether it exists.
 */
@Injectable()
export class WorkspaceGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly db: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const opts = this.reflector.get<WorkspaceScopeOptions>(WORKSPACE_SCOPE, ctx.getHandler()) ??
      this.reflector.get<WorkspaceScopeOptions>(WORKSPACE_SCOPE, ctx.getClass());
    if (!opts) return true;
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const raw =
      (opts.source ?? 'header') === 'header' ? req.header('x-workspace-id') : req.params?.workspaceId;
    const workspaceId = typeof raw === 'string' ? raw : undefined;
    const forbidden = new ApiError(403, 'WORKSPACE_FORBIDDEN', 'No access to this workspace');
    if (!workspaceId || !UUID_RE.test(workspaceId)) throw forbidden;

    const member = await this.db.withContext({ userId: req.user.userId }, (tx) =>
      tx.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId: req.user.userId } },
        select: { role: true },
      }),
    );
    if (!member) throw forbidden;
    if (!hasRole(member.role, opts.minRole)) {
      throw new ApiError(403, 'FORBIDDEN', `Requires role ${opts.minRole} or higher`);
    }
    req.workspace = { workspaceId, role: member.role };
    return true;
  }
}
