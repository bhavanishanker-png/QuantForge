import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.ts";

export type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** App connection: qf_app role, THROUGH PgBouncer (transaction pooling). */
export function createAppClient(max = 20) {
  const adapter = new PrismaPg({
    connectionString: "postgresql://qf_app:app_pw@localhost:56432/quantforge",
    max,
  });
  return new PrismaClient({ adapter });
}

/** Admin connection: owner role, DIRECT to Postgres. Test setup only. */
export function createMigratorClient() {
  const adapter = new PrismaPg({
    connectionString: "postgresql://qf_migrator:migrator_pw@localhost:55432/quantforge",
  });
  return new PrismaClient({ adapter });
}

/**
 * The ONLY way application code touches workspace-owned tables.
 * set_config(..., is_local=true) == SET LOCAL: scoped to this transaction, so it is
 * safe under PgBouncer transaction pooling and can never leak to another tenant.
 */
export async function withWorkspace<T>(
  db: PrismaClient,
  workspaceId: string,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  if (!UUID_RE.test(workspaceId)) throw new Error("invalid workspace id");
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_workspace_id', ${workspaceId}, true)`;
    return fn(tx);
  });
}
