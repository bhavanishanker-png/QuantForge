import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client.js';
import type { Env } from '../../config/env.js';

export type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

export interface DbContext {
  userId?: string;
  workspaceId?: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * ADR-002. All access to RLS-protected tables goes through `withContext`, which sets the
 * transaction-local context. NEVER use session-level SET (spike 1: fails open via PgBouncer).
 * The raw client is exposed only for tables without RLS (refresh_tokens) and health checks.
 */
@Injectable()
export class PrismaService implements OnModuleDestroy {
  readonly client: PrismaClient;

  constructor(config: ConfigService<Env, true>) {
    const adapter = new PrismaPg({ connectionString: config.get('APP_DATABASE_URL'), max: 20 });
    this.client = new PrismaClient({ adapter });
  }

  async withContext<T>(ctx: DbContext, fn: (tx: Tx) => Promise<T>): Promise<T> {
    for (const v of [ctx.userId, ctx.workspaceId]) {
      if (v !== undefined && !UUID_RE.test(v)) throw new Error('invalid context id');
    }
    return this.client.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_user_id', ${ctx.userId ?? ''}, true),
                                  set_config('app.current_workspace_id', ${ctx.workspaceId ?? ''}, true)`;
      return fn(tx);
    });
  }

  async onModuleDestroy() {
    await this.client.$disconnect();
  }
}
