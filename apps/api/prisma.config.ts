import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// Migrations connect DIRECTLY to Postgres as the owner role, never through PgBouncer (ADR-002).
const pass = process.env.QF_MIGRATOR_PASSWORD;
const host = process.env.DB_DIRECT_HOST ?? 'localhost';
const port = process.env.DB_DIRECT_PORT ?? process.env.POSTGRES_HOST_PORT ?? '5432';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    url: `postgresql://qf_migrator:${pass}@${host}:${port}/quantforge`,
    shadowDatabaseUrl: `postgresql://qf_migrator:${pass}@${host}:${port}/quantforge_shadow`,
  },
});
