/**
 * Stand-in for the NestJS side of ADR-004/005:
 *  - createJob(): job row + outbox row in ONE transaction, then NOTIFY.
 *  - Socket.IO relay: Redis psubscribe qf:events:* -> room workspace:{id}.
 */
import { createServer } from "node:http";
import { Redis } from "ioredis";
import pg from "pg";
import { Server } from "socket.io";

export const pool = new pg.Pool({ connectionString: "postgresql://qf_app:app_pw@localhost:55433/quantforge", max: 10 });

export async function createJob(workspaceId: string, type: string, payload: Record<string, unknown>) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: [job] } = await client.query(
      "INSERT INTO background_jobs (workspace_id, type, payload) VALUES ($1, $2, $3) RETURNING id",
      [workspaceId, type, payload],
    );
    await client.query(
      "INSERT INTO outbox_events (workspace_id, job_id, event_type, payload) VALUES ($1, $2, $3, $4)",
      [workspaceId, job.id, type, { jobId: job.id }],
    );
    await client.query("COMMIT");
    await client.query("NOTIFY outbox_new"); // after commit: just a wake-up hint
    return { jobId: job.id as string, status: "QUEUED" as const };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function requestCancel(jobId: string) {
  await pool.query("UPDATE background_jobs SET cancel_requested = true WHERE id = $1 AND status IN ('QUEUED','RUNNING')", [jobId]);
}

export async function startRelay(port: number) {
  const http = createServer();
  const io = new Server(http);
  io.on("connection", (socket) => {
    // Real implementation: verify the JWT in the handshake and check membership before joining.
    socket.on("workspace.join", (workspaceId: string, ack?: () => void) => {
      void socket.join(`workspace:${workspaceId}`);
      ack?.();
    });
  });
  const sub = new Redis("redis://localhost:56379/0");
  await sub.psubscribe("qf:events:*");
  sub.on("pmessage", (_pattern, channel, message) => {
    const workspaceId = channel.slice("qf:events:".length);
    const event = JSON.parse(message);
    io.to(`workspace:${workspaceId}`).emit(event.type, event);
  });
  await new Promise<void>((r) => http.listen(port, r));
  return {
    close: async () => {
      io.close();
      sub.disconnect();
    },
  };
}
