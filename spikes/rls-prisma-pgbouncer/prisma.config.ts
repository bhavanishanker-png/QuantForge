import { defineConfig } from "prisma/config";

// Migrations connect DIRECTLY to Postgres as the owner role (never through PgBouncer).
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: {
    url: "postgresql://qf_migrator:migrator_pw@localhost:55432/quantforge",
  },
});
