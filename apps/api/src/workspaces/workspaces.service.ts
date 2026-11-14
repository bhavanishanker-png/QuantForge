import { randomBytes, randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser, WorkspaceCtx } from '../common/auth/decorators.js';
import { PrismaService, type Tx } from '../common/database/prisma.service.js';
import { ApiError } from '../common/http/error.filter.js';
import { WorkspaceRole } from '../generated/prisma/enums.js';
import type { AddMemberDto, MemberDto, WorkspaceDto, WorkspacePageDto } from './dto.js';

function slugify(name: string) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'workspace';
  return `${base}-${randomBytes(3).toString('hex')}`;
}

@Injectable()
export class WorkspacesService {
  constructor(
    private readonly db: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Caller must have set context { userId, workspaceId: id } on this transaction. */
  async createInTx(tx: Tx, input: { id: string; userId: string; name: string }) {
    const ws = await tx.workspace.create({
      data: { id: input.id, name: input.name, slug: slugify(input.name), createdBy: input.userId },
    });
    await tx.workspaceMember.create({ data: { workspaceId: ws.id, userId: input.userId, role: 'OWNER' } });
    await this.audit.record(tx, {
      workspaceId: ws.id,
      actorUserId: input.userId,
      action: 'workspace.created',
      resourceType: 'workspace',
      resourceId: ws.id,
    });
    return ws;
  }

  async create(user: AuthUser, name: string): Promise<WorkspaceDto> {
    const id = randomUUID();
    const ws = await this.db.withContext({ userId: user.userId, workspaceId: id }, (tx) =>
      this.createInTx(tx, { id, userId: user.userId, name }),
    );
    return { id: ws.id, name: ws.name, slug: ws.slug, role: 'OWNER', createdAt: ws.createdAt };
  }

  async listMine(user: AuthUser, page: number, pageSize: number): Promise<WorkspacePageDto> {
    return this.db.withContext({ userId: user.userId }, async (tx) => {
      const where = { userId: user.userId };
      const [total, rows] = await Promise.all([
        tx.workspaceMember.count({ where }),
        tx.workspaceMember.findMany({
          where,
          include: { workspace: true },
          orderBy: [{ workspace: { name: 'asc' } }, { workspaceId: 'asc' }],
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
      ]);
      return {
        page,
        pageSize,
        total,
        items: rows.map((m) => ({
          id: m.workspace.id,
          name: m.workspace.name,
          slug: m.workspace.slug,
          role: m.role,
          createdAt: m.workspace.createdAt,
        })),
      };
    });
  }

  async get(user: AuthUser, ws: WorkspaceCtx): Promise<WorkspaceDto> {
    const w = await this.db.withContext({ userId: user.userId, workspaceId: ws.workspaceId }, (tx) =>
      tx.workspace.findUniqueOrThrow({ where: { id: ws.workspaceId } }),
    );
    return { id: w.id, name: w.name, slug: w.slug, role: ws.role, createdAt: w.createdAt };
  }

  async rename(user: AuthUser, ws: WorkspaceCtx, name: string): Promise<WorkspaceDto> {
    return this.db.withContext({ userId: user.userId, workspaceId: ws.workspaceId }, async (tx) => {
      const w = await tx.workspace.update({ where: { id: ws.workspaceId }, data: { name } });
      await this.audit.record(tx, {
        workspaceId: ws.workspaceId,
        actorUserId: user.userId,
        action: 'workspace.renamed',
        resourceType: 'workspace',
        resourceId: ws.workspaceId,
        metadata: { name },
      });
      return { id: w.id, name: w.name, slug: w.slug, role: ws.role, createdAt: w.createdAt };
    });
  }

  async listMembers(user: AuthUser, ws: WorkspaceCtx): Promise<MemberDto[]> {
    const rows = await this.db.withContext({ userId: user.userId, workspaceId: ws.workspaceId }, (tx) =>
      tx.workspaceMember.findMany({
        where: { workspaceId: ws.workspaceId },
        include: { user: { select: { email: true, displayName: true } } },
        orderBy: { createdAt: 'asc' },
      }),
    );
    return rows.map((m) => ({
      userId: m.userId,
      email: m.user.email,
      displayName: m.user.displayName,
      role: m.role,
      createdAt: m.createdAt,
    }));
  }

  async addMember(user: AuthUser, ws: WorkspaceCtx, dto: AddMemberDto): Promise<MemberDto> {
    if (dto.role === 'OWNER' && ws.role !== 'OWNER') {
      throw new ApiError(403, 'FORBIDDEN', 'Only an owner can add another owner');
    }
    return this.db.withContext({ userId: user.userId, workspaceId: ws.workspaceId }, async (tx) => {
      const [target] = await tx.$queryRaw<{ id: string; display_name: string }[]>`
        SELECT id, display_name FROM auth_user_by_email(${dto.email})`;
      // Same response whether the email is unknown or simply not registered: no account enumeration
      // beyond what registration already reveals.
      if (!target) throw new ApiError(404, 'USER_NOT_FOUND', 'No QuantForge account with this email');
      const existing = await tx.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId: ws.workspaceId, userId: target.id } },
      });
      if (existing) throw new ApiError(409, 'ALREADY_MEMBER', 'This user is already a member');
      const m = await tx.workspaceMember.create({
        data: { workspaceId: ws.workspaceId, userId: target.id, role: dto.role },
      });
      await this.audit.record(tx, {
        workspaceId: ws.workspaceId,
        actorUserId: user.userId,
        action: 'workspace.member_added',
        resourceType: 'user',
        resourceId: target.id,
        metadata: { role: dto.role },
      });
      return { userId: target.id, email: dto.email, displayName: target.display_name, role: m.role, createdAt: m.createdAt };
    });
  }

  async updateMemberRole(user: AuthUser, ws: WorkspaceCtx, targetUserId: string, role: WorkspaceRole): Promise<MemberDto> {
    return this.db.withContext({ userId: user.userId, workspaceId: ws.workspaceId }, async (tx) => {
      const current = await this.lockMember(tx, ws.workspaceId, targetUserId);
      if ((current.role === 'OWNER' || role === 'OWNER') && ws.role !== 'OWNER') {
        throw new ApiError(403, 'FORBIDDEN', 'Only an owner can grant or change the owner role');
      }
      if (current.role === 'OWNER' && role !== 'OWNER') await this.assertNotLastOwner(tx, ws.workspaceId);
      const m = await tx.workspaceMember.update({
        where: { workspaceId_userId: { workspaceId: ws.workspaceId, userId: targetUserId } },
        data: { role },
        include: { user: { select: { email: true, displayName: true } } },
      });
      await this.audit.record(tx, {
        workspaceId: ws.workspaceId,
        actorUserId: user.userId,
        action: 'workspace.member_role_changed',
        resourceType: 'user',
        resourceId: targetUserId,
        metadata: { from: current.role, to: role },
      });
      return { userId: m.userId, email: m.user.email, displayName: m.user.displayName, role: m.role, createdAt: m.createdAt };
    });
  }

  async removeMember(user: AuthUser, ws: WorkspaceCtx, targetUserId: string): Promise<void> {
    await this.db.withContext({ userId: user.userId, workspaceId: ws.workspaceId }, async (tx) => {
      const current = await this.lockMember(tx, ws.workspaceId, targetUserId);
      if (current.role === 'OWNER') {
        if (ws.role !== 'OWNER') throw new ApiError(403, 'FORBIDDEN', 'Only an owner can remove an owner');
        await this.assertNotLastOwner(tx, ws.workspaceId);
      }
      await tx.workspaceMember.delete({
        where: { workspaceId_userId: { workspaceId: ws.workspaceId, userId: targetUserId } },
      });
      await this.audit.record(tx, {
        workspaceId: ws.workspaceId,
        actorUserId: user.userId,
        action: 'workspace.member_removed',
        resourceType: 'user',
        resourceId: targetUserId,
      });
    });
  }

  /** Locks every OWNER row of the workspace, so concurrent demotions can't both pass the check. */
  private async lockMember(tx: Tx, workspaceId: string, userId: string) {
    await tx.$queryRaw`SELECT 1 FROM workspace_members WHERE workspace_id = ${workspaceId}::uuid
                        AND (role = 'OWNER' OR user_id = ${userId}::uuid) FOR UPDATE`;
    const m = await tx.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId } } });
    if (!m) throw new ApiError(404, 'NOT_FOUND', 'Member not found');
    return m;
  }

  private async assertNotLastOwner(tx: Tx, workspaceId: string) {
    const owners = await tx.workspaceMember.count({ where: { workspaceId, role: 'OWNER' } });
    if (owners <= 1) throw new ApiError(409, 'LAST_OWNER', 'A workspace must keep at least one owner');
  }
}
