# Spike 1: RLS through Prisma 7 and PgBouncer (transaction pooling)

Validates ADR-002. Throwaway code: Phase 1 copies the *pattern*, not this code.

```bash
docker compose up -d --wait
npm install && npx prisma generate && npm run migrate
npm test
docker compose down -v
```

## Result: 7/7 passing (2026-11-14)

| Test | Result |
|---|---|
| A workspace context sees only its own rows | ✔ |
| No context returns zero rows (fails closed) | ✔ |
| Cannot insert into another workspace (`WITH CHECK`) | ✔ |
| Cannot update or delete another workspace's rows (0 affected) | ✔ |
| Context does not leak after the transaction ends | ✔ |
| 400 concurrent mixed-tenant transactions through 3 server connections never cross | ✔ |
| A stray session-level `SET` does not leak to other clients | ✔ (only with the reset setting) |

## Findings

1. **`set_config(..., true)` inside `prisma.$transaction` is safe** under transaction pooling, including under heavy interleaving.
2. **Session-level `SET` makes RLS fail open.** Without a reset, a plain `SET` stays on the pooled server connection, and *other clients'* queries without a context inherit it. Fix: `server_reset_query = RESET ALL` plus `server_reset_query_always = 1` in PgBouncer. The overhead was not measurable.
3. **With `FORCE ROW LEVEL SECURITY`, the table owner is also restricted.** `qf_migrator` sees 0 rows; only the superuser bypasses RLS.
4. Prisma 7 needs the `@prisma/adapter-pg` driver adapter and `prisma.config.ts`. `prisma migrate diff --from-empty` plus appended handwritten SQL, applied with `migrate deploy`, works as the migration workflow.
5. `$queryRaw` cannot deserialize `void` columns (e.g. `pg_sleep()`), so cast to `::text`.
