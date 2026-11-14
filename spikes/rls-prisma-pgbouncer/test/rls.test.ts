import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { createAppClient, createMigratorClient, withWorkspace } from "../src/db.ts";

const app = createAppClient();
let wsA: string;
let wsB: string;

before(async () => {
  // Seed with app role: workspaces has no RLS; notes are inserted under each context.
  await app.$executeRawUnsafe("TRUNCATE notes, workspaces").catch(async () => {
    const m = createMigratorClient();
    await m.$executeRawUnsafe("TRUNCATE notes, workspaces");
    await m.$disconnect();
  });
  wsA = (await app.workspace.create({ data: { name: "A" } })).id;
  wsB = (await app.workspace.create({ data: { name: "B" } })).id;
  await withWorkspace(app, wsA, (tx) =>
    tx.note.createMany({ data: [{ workspaceId: wsA, body: "a1" }, { workspaceId: wsA, body: "a2" }] }),
  );
  await withWorkspace(app, wsB, (tx) => tx.note.create({ data: { workspaceId: wsB, body: "b1" } }));
});

after(async () => {
  await app.$disconnect();
});

describe("RLS via Prisma + PgBouncer (transaction pooling)", () => {
  test("a workspace context sees only its own rows", async () => {
    const a = await withWorkspace(app, wsA, (tx) => tx.note.findMany());
    const b = await withWorkspace(app, wsB, (tx) => tx.note.findMany());
    assert.deepEqual(a.map((n) => n.body).sort(), ["a1", "a2"]);
    assert.deepEqual(b.map((n) => n.body), ["b1"]);
  });

  test("no context -> zero rows (fail closed)", async () => {
    assert.equal((await app.note.findMany()).length, 0);
    assert.equal(await app.note.count(), 0);
  });

  test("cannot insert into another workspace (WITH CHECK)", async () => {
    await assert.rejects(
      withWorkspace(app, wsA, (tx) => tx.note.create({ data: { workspaceId: wsB, body: "evil" } })),
      /row-level security|violates/i,
    );
  });

  test("cannot update or delete another workspace's rows", async () => {
    const upd = await withWorkspace(app, wsA, (tx) =>
      tx.note.updateMany({ where: { workspaceId: wsB }, data: { body: "pwned" } }),
    );
    const del = await withWorkspace(app, wsA, (tx) => tx.note.deleteMany({ where: { workspaceId: wsB } }));
    assert.equal(upd.count, 0);
    assert.equal(del.count, 0);
    const b = await withWorkspace(app, wsB, (tx) => tx.note.findMany());
    assert.deepEqual(b.map((n) => n.body), ["b1"]);
  });

  test("context does not leak after the transaction ends", async () => {
    await withWorkspace(app, wsA, (tx) => tx.note.findMany());
    // Many follow-up non-transactional queries land on the same 3 pooled server connections.
    for (let i = 0; i < 20; i++) {
      const rows = await app.$queryRaw<{ v: string | null }[]>`
        SELECT nullif(current_setting('app.current_workspace_id', true), '') AS v`;
      assert.equal(rows[0].v, null);
    }
  });

  test("400 concurrent mixed-tenant transactions through a 3-connection pool never cross", async () => {
    const ops = Array.from({ length: 400 }, (_, i) => {
      const ws = i % 2 === 0 ? wsA : wsB;
      return withWorkspace(app, ws, async (tx) => {
        // Interleave: setting, a delay inside the transaction, then the read.
        const [{ v }] = await tx.$queryRaw<{ v: string }[]>`
          SELECT current_setting('app.current_workspace_id', true) AS v, pg_sleep(0.002)::text AS s`;
        const notes = await tx.note.findMany();
        return { ws, v, owners: new Set(notes.map((n) => n.workspaceId)) };
      });
    });
    const results = await Promise.all(ops);
    for (const r of results) {
      assert.equal(r.v, r.ws, "transaction saw another tenant's setting");
      assert.deepEqual([...r.owners], [r.ws], "transaction saw another tenant's rows");
    }
  });

  test("defense in depth: a stray session-level SET does not leak to other clients", async () => {
    // Without `server_reset_query_always = 1` in pgbouncer.ini, a plain SET persists on the
    // pooled server connection and later NO-CONTEXT queries from other clients inherit it,
    // i.e. RLS fails OPEN. (Observed in spike 1 before the setting was added.)
    const other = createAppClient(5);
    try {
      await app.$executeRawUnsafe(`SET app.current_workspace_id = '${wsA}'`);
      let leaked = 0;
      for (let i = 0; i < 30; i++) {
        const [{ c }] = await other.$queryRaw<{ c: bigint }[]>`SELECT count(*) AS c FROM notes`;
        if (Number(c) > 0) leaked++;
      }
      assert.equal(leaked, 0, "session SET leaked across PgBouncer clients: is server_reset_query_always=1 set?");
    } finally {
      // Reset every pooled server connection.
      for (let i = 0; i < 10; i++) await app.$executeRawUnsafe("RESET app.current_workspace_id");
      await other.$disconnect();
    }
  });
});
