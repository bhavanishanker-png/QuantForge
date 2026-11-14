-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "WorkspaceRole" AS ENUM ('OWNER', 'ADMIN', 'DEVELOPER', 'VIEWER');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'CLAIMED', 'PUBLISHED', 'DEAD');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "disabled_at" TIMESTAMPTZ,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "token_hash" BYTEA NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "revoked_at" TIMESTAMPTZ,
    "replaced_by_id" UUID,
    "user_agent" TEXT,
    "ip" TEXT,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspaces" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_members" (
    "workspace_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "WorkspaceRole" NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_members_pkey" PRIMARY KEY ("workspace_id","user_id")
);

-- CreateTable
CREATE TABLE "background_jobs" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "resource_type" TEXT,
    "resource_id" UUID,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "result" JSONB,
    "progress" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 3,
    "cancel_requested" BOOLEAN NOT NULL DEFAULT false,
    "heartbeat_at" TIMESTAMPTZ,
    "error_code" TEXT,
    "error_message" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMPTZ,
    "finished_at" TIMESTAMPTZ,

    CONSTRAINT "background_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "event_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "available_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimed_until" TIMESTAMPTZ,
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMPTZ,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID,
    "actor_user_id" UUID,
    "action" TEXT NOT NULL,
    "resource_type" TEXT,
    "resource_id" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "ip" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feature_flags" (
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "rules" JSONB NOT NULL DEFAULT '{}',
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "feature_flags_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_replaced_by_id_key" ON "refresh_tokens"("replaced_by_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_family_id_idx" ON "refresh_tokens"("family_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_revoked_at_idx" ON "refresh_tokens"("user_id", "revoked_at");

-- CreateIndex
CREATE UNIQUE INDEX "workspaces_slug_key" ON "workspaces"("slug");

-- CreateIndex
CREATE INDEX "workspace_members_user_id_idx" ON "workspace_members"("user_id");

-- CreateIndex
CREATE INDEX "background_jobs_workspace_id_created_at_id_idx" ON "background_jobs"("workspace_id", "created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "outbox_events_job_id_idx" ON "outbox_events"("job_id");

-- CreateIndex
CREATE INDEX "audit_logs_workspace_id_created_at_idx" ON "audit_logs"("workspace_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_replaced_by_id_fkey" FOREIGN KEY ("replaced_by_id") REFERENCES "refresh_tokens"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "background_jobs" ADD CONSTRAINT "background_jobs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "background_jobs" ADD CONSTRAINT "background_jobs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "background_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- =====================================================================================
-- Handwritten: row-level security, grants, triggers (ADR-002, DATABASE_DESIGN.md §2)
-- =====================================================================================

-- Context accessors. Missing setting -> NULL -> policies match nothing (fail closed).
CREATE FUNCTION app_current_user_id() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('app.current_user_id', true), '')::uuid $$;
CREATE FUNCTION app_current_workspace_id() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('app.current_workspace_id', true), '')::uuid $$;

-- SECURITY DEFINER helpers, owned by qf_definer (BYPASSRLS, NOLOGIN). Keep these few and narrow.
CREATE FUNCTION app_is_member(ws uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT EXISTS (SELECT 1 FROM workspace_members
                   WHERE workspace_id = ws AND user_id = app_current_user_id()) $$;

-- Login/registration/add-member need to find a user by email before any user context exists.
CREATE FUNCTION auth_user_by_email(p_email text)
  RETURNS TABLE (id uuid, password_hash text, display_name text, disabled_at timestamptz)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT u.id, u.password_hash, u.display_name, u.disabled_at FROM users u WHERE u.email = lower(p_email) $$;

-- A function's new owner needs CREATE on the schema at the moment ownership changes. Grant it
-- only for the transfer, then take it back so qf_definer can never create objects.
GRANT USAGE, CREATE ON SCHEMA public TO qf_definer;
ALTER FUNCTION app_is_member(uuid) OWNER TO qf_definer;
ALTER FUNCTION auth_user_by_email(text) OWNER TO qf_definer;
REVOKE CREATE ON SCHEMA public FROM qf_definer;
GRANT SELECT ON users, workspace_members TO qf_definer;
REVOKE ALL ON FUNCTION app_is_member(uuid), auth_user_by_email(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_is_member(uuid), auth_user_by_email(text) TO qf_app;

-- Emails are stored lowercase.
ALTER TABLE users ADD CONSTRAINT users_email_lowercase CHECK (email = lower(email));

-- ---- users ----
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
CREATE POLICY users_select ON users FOR SELECT USING (
  id = app_current_user_id()
  OR EXISTS (SELECT 1 FROM workspace_members m
              WHERE m.user_id = users.id AND m.workspace_id = app_current_workspace_id()));
CREATE POLICY users_insert ON users FOR INSERT WITH CHECK (id = app_current_user_id());
CREATE POLICY users_update ON users FOR UPDATE USING (id = app_current_user_id());

-- ---- workspaces ----
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspaces FORCE ROW LEVEL SECURITY;
CREATE POLICY workspaces_select ON workspaces FOR SELECT
  USING (id = app_current_workspace_id() OR app_is_member(id));
CREATE POLICY workspaces_insert ON workspaces FOR INSERT
  WITH CHECK (created_by = app_current_user_id() AND id = app_current_workspace_id());
CREATE POLICY workspaces_update ON workspaces FOR UPDATE USING (id = app_current_workspace_id());
CREATE POLICY workspaces_delete ON workspaces FOR DELETE USING (id = app_current_workspace_id());

-- ---- workspace_members ----
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members FORCE ROW LEVEL SECURITY;
CREATE POLICY members_select ON workspace_members FOR SELECT
  USING (user_id = app_current_user_id() OR workspace_id = app_current_workspace_id());
CREATE POLICY members_write ON workspace_members FOR ALL
  USING (workspace_id = app_current_workspace_id())
  WITH CHECK (workspace_id = app_current_workspace_id());

-- ---- background_jobs ----
ALTER TABLE background_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE background_jobs FORCE ROW LEVEL SECURITY;
CREATE POLICY jobs_workspace ON background_jobs FOR ALL
  USING (workspace_id = app_current_workspace_id())
  WITH CHECK (workspace_id = app_current_workspace_id());

-- ---- audit_logs (append-only) ----
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_select ON audit_logs FOR SELECT USING (workspace_id = app_current_workspace_id());
CREATE POLICY audit_insert ON audit_logs FOR INSERT
  WITH CHECK (workspace_id IS NULL OR workspace_id = app_current_workspace_id());

-- refresh_tokens: not workspace data and looked up before a user context exists (refresh by
-- cookie). Protected by grants + hashing; only the auth service touches it.
-- outbox_events: written by the app (INSERT only, no reads), consumed by qf_dispatcher.

-- Terminal job states are final.
CREATE FUNCTION jobs_terminal_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IN ('COMPLETED','FAILED','CANCELLED') AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'job % is terminal (%)', OLD.id, OLD.status;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER jobs_terminal_guard BEFORE UPDATE ON background_jobs
  FOR EACH ROW EXECUTE FUNCTION jobs_terminal_guard();

-- Wake the dispatcher immediately when the app commits an outbox row (fires at COMMIT).
CREATE FUNCTION outbox_notify() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN PERFORM pg_notify('outbox_new', ''); RETURN NULL; END $$;
CREATE TRIGGER outbox_notify AFTER INSERT ON outbox_events
  FOR EACH STATEMENT EXECUTE FUNCTION outbox_notify();

-- Reaper index (DATABASE_DESIGN.md).
CREATE INDEX background_jobs_running_heartbeat ON background_jobs (heartbeat_at) WHERE status = 'RUNNING';
CREATE INDEX outbox_events_pending ON outbox_events (available_at) WHERE status IN ('PENDING','CLAIMED');

-- ---- grants ----
GRANT USAGE ON SCHEMA public TO qf_app, qf_worker, qf_dispatcher;
GRANT SELECT, INSERT, UPDATE         ON users, workspaces, background_jobs TO qf_app;
GRANT DELETE                         ON workspaces TO qf_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON workspace_members, refresh_tokens TO qf_app;
GRANT INSERT                         ON outbox_events TO qf_app;
GRANT SELECT, INSERT                 ON audit_logs TO qf_app;
GRANT SELECT                         ON feature_flags TO qf_app;

GRANT SELECT, UPDATE ON background_jobs TO qf_worker;
GRANT INSERT ON audit_logs TO qf_worker;

GRANT SELECT, INSERT, UPDATE ON outbox_events TO qf_dispatcher;
GRANT SELECT, UPDATE ON background_jobs TO qf_dispatcher;
