-- Roles per ADR-002. Runs once as superuser on first container start.
CREATE ROLE qf_migrator LOGIN PASSWORD 'migrator_pw' NOBYPASSRLS;
CREATE ROLE qf_app      LOGIN PASSWORD 'app_pw'      NOBYPASSRLS;
CREATE DATABASE quantforge OWNER qf_migrator;
\connect quantforge
CREATE EXTENSION IF NOT EXISTS pgcrypto;
