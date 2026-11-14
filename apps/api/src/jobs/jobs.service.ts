import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser, WorkspaceCtx } from '../common/auth/metadata.js';
import { PrismaService, type Tx } from '../common/database/prisma.service.js';
import { ApiError } from '../common/http/error.filter.js';
import { decodeCursor, encodeCursor } from '../common/http/pagination.js';
import { REDIS_QUEUE } from '../common/redis/redis.module.js';
import type { BackgroundJob, Prisma } from '../generated/prisma/client.js';
import type { JobDto, JobPageDto, JobRefDto, ListJobsQuery } from './dto.js';

/** Job types the dispatcher knows how to route (quant-engine/workers/outbox_dispatcher). */
export const JOB_TYPES = ['system.ping'] as const;
export type JobType = (typeof JOB_TYPES)[number];

export interface EnqueueInput {
  type: JobType;
  payload: Prisma.InputJsonObject;
  resourceType?: string;
  resourceId?: string;
  maxAttempts?: number;
}

export function toJobDto(j: BackgroundJob): JobDto {
  return {
    id: j.id,
    workspaceId: j.workspaceId,
    type: j.type,
    status: j.status,
    progress: Number(j.progress),
    attempt: j.attempt,
    maxAttempts: j.maxAttempts,
    cancelRequested: j.cancelRequested,
    resourceType: j.resourceType,
    resourceId: j.resourceId,
    errorCode: j.errorCode,
    errorMessage: j.errorMessage,
    result: j.result,
    createdBy: j.createdBy,
    createdAt: j.createdAt,
    startedAt: j.startedAt,
    finishedAt: j.finishedAt,
  };
}

@Injectable()
export class JobsService {
  constructor(
    private readonly db: PrismaService,
    private readonly audit: AuditService,
    @Inject(REDIS_QUEUE) private readonly redis: Redis,
  ) {}

  /**
   * ADR-005: job row + outbox event in the SAME transaction as the caller's domain writes.
   * Pass `tx` to join an existing transaction (e.g. creating a backtest_runs row in Phase 4).
   */
  async enqueueInTx(tx: Tx, user: AuthUser, ws: WorkspaceCtx, input: EnqueueInput): Promise<JobRefDto> {
    const jobId = randomUUID();
    await tx.backgroundJob.create({
      data: {
        id: jobId,
        workspaceId: ws.workspaceId,
        type: input.type,
        payload: input.payload,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        maxAttempts: input.maxAttempts ?? 3,
        createdBy: user.userId,
      },
    });
    // The outbox payload carries only ids; the worker reads the job payload from Postgres.
    await tx.outboxEvent.createMany({
      data: [
        {
          id: randomUUID(),
          workspaceId: ws.workspaceId,
          jobId,
          eventType: input.type,
          payload: { jobId, workspaceId: ws.workspaceId },
        },
      ],
    });
    await this.audit.record(tx, {
      workspaceId: ws.workspaceId,
      actorUserId: user.userId,
      action: 'job.enqueued',
      resourceType: 'job',
      resourceId: jobId,
      metadata: { type: input.type },
    });
    return { jobId, status: 'QUEUED', resourceType: input.resourceType ?? null, resourceId: input.resourceId ?? null };
  }

  enqueue(user: AuthUser, ws: WorkspaceCtx, input: EnqueueInput): Promise<JobRefDto> {
    return this.db.withContext({ userId: user.userId, workspaceId: ws.workspaceId }, (tx) =>
      this.enqueueInTx(tx, user, ws, input),
    );
  }

  async list(user: AuthUser, ws: WorkspaceCtx, q: ListJobsQuery): Promise<JobPageDto> {
    let after: { createdAt: Date; id: string } | undefined;
    if (q.cursor) {
      const parts = decodeCursor(q.cursor, 2);
      if (!parts) throw new ApiError(400, 'VALIDATION_FAILED', 'Invalid cursor');
      after = { createdAt: new Date(parts[0]), id: parts[1] };
    }
    const rows = await this.db.withContext({ userId: user.userId, workspaceId: ws.workspaceId }, (tx) =>
      tx.backgroundJob.findMany({
        where: {
          workspaceId: ws.workspaceId,
          ...(q.status && { status: q.status }),
          ...(q.type && { type: q.type }),
          ...(after && {
            OR: [{ createdAt: { lt: after.createdAt } }, { createdAt: after.createdAt, id: { lt: after.id } }],
          }),
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: q.limit + 1,
      }),
    );
    const hasMore = rows.length > q.limit;
    const items = rows.slice(0, q.limit);
    const last = items.at(-1);
    return { items: items.map(toJobDto), nextCursor: hasMore && last ? encodeCursor([last.createdAt, last.id]) : null };
  }

  async get(user: AuthUser, ws: WorkspaceCtx, jobId: string): Promise<JobDto> {
    const job = await this.db.withContext({ userId: user.userId, workspaceId: ws.workspaceId }, (tx) =>
      tx.backgroundJob.findUnique({ where: { id: jobId } }),
    );
    if (!job) throw new ApiError(404, 'NOT_FOUND', 'Job not found');
    return toJobDto(job);
  }

  /** QUEUED jobs are cancelled at once (a worker's claim then fails); RUNNING jobs are asked to stop. */
  async cancel(user: AuthUser, ws: WorkspaceCtx, jobId: string): Promise<JobDto> {
    const job = await this.db.withContext({ userId: user.userId, workspaceId: ws.workspaceId }, async (tx) => {
      const [row] = await tx.$queryRaw<{ status: string }[]>`
        SELECT status FROM background_jobs WHERE id = ${jobId}::uuid FOR UPDATE`;
      if (!row) throw new ApiError(404, 'NOT_FOUND', 'Job not found');
      if (row.status === 'QUEUED') {
        await tx.backgroundJob.update({
          where: { id: jobId },
          data: { status: 'CANCELLED', cancelRequested: true, finishedAt: new Date() },
        });
      } else if (row.status === 'RUNNING') {
        await tx.backgroundJob.update({ where: { id: jobId }, data: { cancelRequested: true } });
      } else {
        throw new ApiError(409, 'JOB_FINISHED', `Job is already ${row.status}`);
      }
      await this.audit.record(tx, {
        workspaceId: ws.workspaceId,
        actorUserId: user.userId,
        action: 'job.cancel_requested',
        resourceType: 'job',
        resourceId: jobId,
      });
      return tx.backgroundJob.findUniqueOrThrow({ where: { id: jobId } });
    });
    await this.publish(ws.workspaceId, job);
    return toJobDto(job);
  }

  /** Same event shape the Python workers publish (ADR-004). Call only after commit. */
  async publish(workspaceId: string, job: BackgroundJob) {
    await this.redis.publish(
      `qf:events:${workspaceId}`,
      JSON.stringify({ type: 'job.updated', jobId: job.id, status: job.status, progress: Number(job.progress), ts: Date.now() / 1000 }),
    );
  }
}
