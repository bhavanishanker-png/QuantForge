# QuantForge — Architecture

QuantForge is a local-first, self-hostable quantitative research platform. It is a **modular
monolith** (NestJS) plus a **separate Python quantitative engine** and workers. Decisions are cited
as ADR-xxx from `ENGINEERING_DECISIONS.md`.

## 1. Layers

```
┌──────────────────────── Presentation ────────────────────────┐
│ apps/web  React + Vite + TS · TanStack Query · Zustand       │
│           shadcn/ui · Lightweight Charts · ECharts           │
└───────────────┬──────────────────────────────▲───────────────┘
           REST /api/v1                    Socket.IO
┌───────────────▼──────────────────────────────┴───────────────┐
│ apps/api  NestJS modular monolith                            │
│  auth · users · workspaces · markets · strategies · backtests│
│  optimizations · factors · virtual-trading · jobs · audit    │
│  feature-flags · notifications · ai · (mcp: separate app)    │
└──┬──────────────┬────────────────────┬───────────────▲───────┘
   │ Prisma       │ internal REST      │ outbox rows   │ Redis pub/sub
   │ (qf_app)     │                    │               │ qf:events:*
┌──▼──────┐  ┌────▼─────────────┐  ┌───▼───────────────┴──────────┐
│PgBouncer│  │ quant-api FastAPI│  │ dispatcher → redis-queue →   │
│   ↓     │  │ validate·compute │  │ Celery workers (qf_worker)   │
│Postgres │◄─┤ (stateless, sync)│  │ market · backtest · optimize │
│ + RLS   │  └──────────────────┘  │ factor · maintenance · beat  │
└─────────┘◄───────────────────────┴──────────────────────────────┘
   redis-cache: cache · rate limits · Socket.IO adapter (ADR-006)
   MinIO/S3: Parquet datasets · large artifacts (Phase 4+)
```

The boxes are logical. In Phase 1 the deployed processes are: `web`, `api`, `quant-api`, `worker`,
`beat`, `dispatcher`, `postgres`, `pgbouncer`, `redis-queue` and `redis-cache`.

## 2. Responsibilities and boundaries

| Component | Owns | Must not |
|---|---|---|
| **web** | UI and client state | Hold secrets; compute financial metrics; show fake data |
| **api (NestJS)** | Authentication, authorization, business workflows, schema and migrations (Prisma), job creation, outbox writes, Socket.IO | Run heavy computation in request handlers; publish Celery messages directly |
| **quant-api (FastAPI)** | Short synchronous computations: strategy validation, indicator previews | Be reachable from the public network; make authorization decisions; run DDL |
| **dispatcher** | Moving outbox events to Celery tasks (ADR-005) | Hold business logic |
| **workers (Celery)** | Long computations; writing results and job status (ADR-003) | Bypass RLS; run user code outside a sandbox |
| **Postgres** | The source of truth for everything durable | — |
| **Redis** | Broker, pub/sub, cache, rate limits | Hold authoritative balances or results |

**Authorization rule:** NestJS is the only component that decides whether a user may do something.
Python receives a `workspace_id` that NestJS has already authorized, inside a job payload or an
internal request, and enforces it through RLS context. Python never decides permissions.

## 3. Key flows

### 3.1 Request in a workspace context
1. The SPA sends `Authorization: Bearer <access>` and `X-Workspace-Id: <uuid>`.
2. `JwtAuthGuard` verifies the token. `WorkspaceGuard` loads the membership and role and checks the `@Roles()` metadata.
3. The handler calls `db.withWorkspace(id, tx => …)`. Inside that transaction, `set_config('app.current_workspace_id', id, true)` runs first (ADR-002).

### 3.2 Long-running job (backtest; the ping job in Phase 1)
1. `POST /api/v1/backtests` → inside one transaction: insert `backtest_runs` (QUEUED), `background_jobs` (QUEUED) and `outbox_events` (PENDING) → `NOTIFY outbox_new` → `202 {jobId}`.
2. The dispatcher claims the event with `SKIP LOCKED` and calls `send_task(task_id = event.id)`.
3. The worker does an idempotent claim to RUNNING, sends heartbeats, computes, writes results and COMPLETED in one transaction, then publishes `qf:events:{ws}`.
4. NestJS relays the event to the Socket.IO room `workspace:{ws}`. The SPA invalidates its query and refetches.
5. The reaper requeues or fails jobs with stale heartbeats (ADR-005).

### 3.3 Market data (Phase 2)
Binance REST (CCXT) → normalize and validate → `market_candles` (partitioned).
Binance kline WebSocket → ingester → `qf:market:*` pub/sub → Socket.IO.

## 4. Repository layout (target)

```
apps/web            React SPA
apps/api            NestJS; prisma/ holds the schema and migrations (the single migration history)
quant-engine/       Python (uv): app/ (FastAPI, engine modules), workers/ (celery, dispatcher), tests/
mcp-server/         TypeScript MCP server (Phase 8)
packages/api-client generated OpenAPI types and client (ADR-001)
packages/contracts  event JSON Schemas
infrastructure/     docker/, monitoring/, later helm/, terraform/
docs/               these documents
spikes/             Phase 0 throwaway validation code
```

## 5. Cross-cutting concerns

- **Config:** NestJS `ConfigModule` with a Zod-validated env schema; Pydantic Settings in Python. Each service fails fast on invalid config.
- **Logging:** Pino (JSON) and structlog (JSON), with `requestId`, `jobId` and `workspaceId` on every line.
- **Errors:** a single error envelope (see `API_DESIGN.md`).
- **Time:** UTC everywhere (`timestamptz`). ISO-8601 with `Z` in the API.
- **Numbers:** NUMERIC/Decimal for money; float64 for research; explicit conversion at the boundary.
- **Health:** `/health` (liveness) and `/ready` (dependencies) on every service. Compose healthchecks use them.

## 6. Non-negotiable rules

No live trading. No credentials in the frontend. No arbitrary SQL or code execution through MCP.
No unsandboxed user Python. No fabricated data or metrics. No backtest without recorded
assumptions. No random splits on time series. No balances held only in Redis. No cross-workspace
access from any path, including workers.
