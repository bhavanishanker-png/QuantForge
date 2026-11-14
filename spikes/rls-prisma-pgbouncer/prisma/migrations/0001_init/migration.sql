-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "workspaces" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "body" TEXT NOT NULL,

    CONSTRAINT "notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notes_workspace_id_idx" ON "notes"("workspace_id");

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ===== Handwritten: RLS + grants (ADR-002) =====
GRANT USAGE ON SCHEMA public TO qf_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON workspaces, notes TO qf_app;

ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes FORCE ROW LEVEL SECURITY;

-- Fail closed: missing setting -> NULL -> no rows match.
CREATE POLICY notes_workspace_isolation ON notes
  USING      (workspace_id = nullif(current_setting('app.current_workspace_id', true), '')::uuid)
  WITH CHECK (workspace_id = nullif(current_setting('app.current_workspace_id', true), '')::uuid);
