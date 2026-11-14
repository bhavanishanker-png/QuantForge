# QuantForge — Database Design

PostgreSQL 17 is the source of truth. Prisma owns the schema and migrations (ADR-003), and RLS
policies, partitions and roles are added as handwritten SQL inside Prisma migrations.

## 1. Global rules

1. UUID primary keys (`gen_random_uuid()`); candles use a natural composite key.
2. `timestamptz` everywhere, stored and returned in UTC.
3. `NUMERIC(38,18)` for prices, quantities and money; `NUMERIC(38,8)` for quote-currency balances.
4. Every workspace-owned table has `workspace_id uuid NOT NULL` with an FK, an index and an RLS policy.
5. Foreign keys and unique constraints are always declared, never only implied.
6. Strategy versions, datasets and completed runs are **immutable**, enforced by a trigger that rejects `UPDATE` once a row is final.
7. Snake_case table and column names (Prisma `@@map`/`@map`).

## 2. RLS model (ADR-002)

| Session setting | Set by | Used by |
|---|---|---|
| `app.current_user_id` | NestJS after authentication | `users` (own row), `workspace_members` (own memberships), `workspaces` (where a member) |
| `app.current_workspace_id` | NestJS after the membership check; workers from the job payload | Every workspace-owned table |

Both settings are applied with `set_config(key, value, true)`, which lasts only for the current
transaction. If a setting is missing, the policy matches nothing. Auth flows that run before a user
ID exists (register, login, refresh) use narrow `SECURITY DEFINER` functions instead of granting
broad table access.

Roles: `qf_migrator` (owner, still subject to RLS because of FORCE), `qf_app` and `qf_worker` (both `NOBYPASSRLS`), `qf_dispatcher` (BYPASSRLS, outbox and jobs only), and `qf_definer` (NOLOGIN, owns the two SECURITY DEFINER functions). See ADR-021.

## 3. Phase 1 tables

### Identity
**users**: `id`, `email citext UNIQUE`, `password_hash`, `display_name`, `created_at`, `updated_at`, `disabled_at?`

**refresh_tokens**: `id`, `user_id → users`, `family_id uuid`, `token_hash bytea UNIQUE`, `created_at`, `expires_at`, `revoked_at?`, `replaced_by_id? → refresh_tokens`, `user_agent?`, `ip?`
- index `(family_id)`, index `(user_id, revoked_at)`

### Workspace
**workspaces**: `id`, `name`, `slug UNIQUE`, `created_by → users`, `created_at`, `updated_at`

**workspace_members**: `workspace_id → workspaces`, `user_id → users`, `role ENUM(OWNER, ADMIN, DEVELOPER, VIEWER)`, `created_at`
- PK `(workspace_id, user_id)`; index `(user_id)`
- Invariant: each workspace has at least one OWNER, enforced in a service transaction and backed by a deferred constraint trigger.

**workspace_invites** (Phase 1, optional): `id`, `workspace_id`, `email`, `role`, `token_hash`, `expires_at`, `accepted_at?`

### Jobs and events (ADR-005)
**background_jobs**
| column | type | notes |
|---|---|---|
| id | uuid | PK |
| workspace_id | uuid | FK, RLS |
| type | text | e.g. `system.ping`, `backtest.run` |
| status | enum | QUEUED, RUNNING, COMPLETED, FAILED, CANCELLED |
| resource_type / resource_id | text / uuid? | link to the domain row |
| payload | jsonb | validated against the event schema |
| result | jsonb? | small job output; large artifacts go to object storage (Phase 4) |
| progress | numeric(5,2) | 0–100 |
| attempt / max_attempts | int | default 0 / 3 |
| cancel_requested | bool | |
| heartbeat_at | timestamptz? | |
| error_code / error_message | text? | |
| created_by | uuid | FK users |
| created_at / started_at / finished_at | timestamptz | |
- index `(workspace_id, created_at DESC, id)` for cursor pagination; partial index `(heartbeat_at) WHERE status='RUNNING'` for the reaper.

**outbox_events**: `id uuid` (also used as the Celery task ID), `workspace_id`, `job_id → background_jobs`, `event_type`, `payload jsonb`, `status ENUM(PENDING, CLAIMED, PUBLISHED, DEAD)`, `attempts int`, `claimed_until?`, `last_error?`, `created_at`, `published_at?`
- partial index `(created_at) WHERE status IN ('PENDING','CLAIMED')`
- **No workspace RLS.** The dispatcher runs as a separate role (`qf_dispatcher`) that may only read and update this table.

### Security and operations
**audit_logs**: `id`, `workspace_id?`, `actor_user_id?`, `action text`, `resource_type`, `resource_id?`, `metadata jsonb`, `ip?`, `created_at`. Append-only: roles get INSERT and SELECT but no UPDATE or DELETE.

**feature_flags**: `key text PK`, `enabled bool`, `rules jsonb`, `updated_at`

## 4. Later-phase domains (outline)

| Phase | Tables |
|---|---|
| 2 | `exchanges`, `instruments`, `market_candles` (partitioned, PK `(instrument_id, timeframe, open_time)`), `data_sync_jobs`, `data_quality_reports` |
| 3 | `strategies`, `strategy_versions` (immutable; `definition jsonb`, `definition_hash`), `strategy_parameters` |
| 4 | `datasets` (checksum, uri), `backtest_runs` (all reproducibility fields; see §5), `backtest_trades`, `backtest_equity_points`, `backtest_metrics` |
| 5 | `virtual_accounts`, `virtual_orders`, `virtual_fills` (UNIQUE idempotency key), `virtual_positions`, `virtual_transactions`, `virtual_equity_snapshots` |
| 6 | `optimization_runs`, `optimization_trials`, `optimization_parameters` |
| 7 | `factor_definitions`, `factor_evaluations`, `factor_results`, `factor_correlations` |
| 8 | `ai_conversations`, `ai_messages`, `ai_tool_calls`, `ai_usage` |

`market_candles`, `exchanges` and `instruments` are **global** (shared reference data), so they have no `workspace_id`. They are read-only for `qf_app`, and only `qf_worker` can write them.

## 5. Backtest reproducibility record (Phase 4)

`backtest_runs` stores: `strategy_version_id`, `dataset_id` (which carries the checksum),
`instrument_id`, `timeframe`, `start_at`, `end_at`, `params jsonb`, `initial_capital`,
`commission_rate`, `slippage_rate`, `execution_model` (e.g. `next_open_v1`), `engine_version`,
`status` and timestamps. Once the status is COMPLETED, the row and all its children are immutable.

## 6. Entity relationships (Phase 1)

```
users 1─* refresh_tokens
users *─* workspaces           (via workspace_members.role)
workspaces 1─* background_jobs 1─* outbox_events
workspaces 1─* audit_logs
```
