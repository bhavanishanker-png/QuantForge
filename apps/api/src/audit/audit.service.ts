import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import type { Tx } from '../common/database/prisma.service.js';

export interface AuditEvent {
  workspaceId?: string | null;
  actorUserId?: string | null;
  action: string;
  resourceType?: string;
  resourceId?: string;
  metadata?: Prisma.InputJsonValue;
  ip?: string;
}

/** Append-only business events (audit_logs has no UPDATE/DELETE grant). Always written inside the caller's transaction. */
@Injectable()
export class AuditService {
  async record(tx: Tx, e: AuditEvent) {
    await tx.auditLog.createMany({
      data: [
        {
          workspaceId: e.workspaceId ?? null,
          actorUserId: e.actorUserId ?? null,
          action: e.action,
          resourceType: e.resourceType,
          resourceId: e.resourceId,
          metadata: e.metadata ?? {},
          ip: e.ip,
        },
      ],
    });
  }
}
