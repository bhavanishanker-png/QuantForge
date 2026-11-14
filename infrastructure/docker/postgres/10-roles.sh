#!/usr/bin/env bash
# Runs once, on first start of an empty data volume (ADR-002 roles).
set -euo pipefail
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<SQL
CREATE ROLE qf_migrator   LOGIN PASSWORD '${QF_MIGRATOR_PASSWORD}'   NOBYPASSRLS;
CREATE ROLE qf_app        LOGIN PASSWORD '${QF_APP_PASSWORD}'        NOBYPASSRLS;
CREATE ROLE qf_worker     LOGIN PASSWORD '${QF_WORKER_PASSWORD}'     NOBYPASSRLS;
-- The dispatcher/reaper is a system component that manages jobs across workspaces.
-- It may BYPASS RLS, but is granted access to outbox_events and background_jobs only.
CREATE ROLE qf_dispatcher LOGIN PASSWORD '${QF_DISPATCHER_PASSWORD}' BYPASSRLS;
-- Owns the few SECURITY DEFINER functions that must see across RLS (login lookup by email,
-- membership check). NOLOGIN: nobody can connect as it. The migrator may assign it as owner.
CREATE ROLE qf_definer NOLOGIN BYPASSRLS;
GRANT qf_definer TO qf_migrator;
CREATE DATABASE quantforge OWNER qf_migrator;
-- Prisma Migrate needs a throwaway shadow database for `migrate dev`.
CREATE DATABASE quantforge_shadow OWNER qf_migrator;
SQL
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" -d quantforge <<SQL
REVOKE ALL ON DATABASE quantforge FROM PUBLIC;
GRANT CONNECT ON DATABASE quantforge TO qf_migrator, qf_app, qf_worker, qf_dispatcher;
SQL
