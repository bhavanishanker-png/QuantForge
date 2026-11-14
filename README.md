# QuantForge

A local-first, self-hostable platform for **quantitative trading research**: market data, strategies, reproducible backtests, optimization, virtual trading and factor research, with an AI assistant that works only from real platform data.

> Research infrastructure, not a trading bot. **No live trading**, no return predictions, no fake numbers.

**Status:** Phase 1 (Foundation) complete. See [the roadmap](docs/DEVELOPMENT_ROADMAP.md).
What works today: accounts, workspaces with roles, database-enforced workspace isolation, and the background job pipeline with live updates.
Market data arrives in Phase 2.

## Quick start

Requirements: Docker (with Compose), Node 24+, and [uv](https://docs.astral.sh/uv/) (only for Python development).

```bash
./scripts/gen-secrets.sh                 # creates .env with random secrets (run before the first start)
docker compose up -d --build --wait      # the whole stack
open http://localhost:5173               # register, then try Job Monitor → "Run diagnostic job"
```

| Service | URL | Notes |
|---|---|---|
| Web app | http://localhost:5173 | Nginx serves the SPA and proxies `/api` and Socket.IO |
| API | http://localhost:3000/api/v1 | Swagger UI at `/api/docs` when not in production |
| Quant API | http://localhost:8000 | Internal only (service token), bound to 127.0.0.1 |

Stop with `docker compose down`. Add `-v` to also delete the database.

## Developing

Run the infrastructure in Docker and the apps on your machine with hot reload:

```bash
npm install
npm run infra:up                       # postgres, pgbouncer, redis-queue, redis-cache
npm run db:migrate                     # Prisma migrations (direct to Postgres as the owner role)
npm run db:generate -w @quantforge/api
npm run dev:api                        # NestJS on :3000
npm run dev:web                        # Vite on :5173 (proxies /api to :3000)

cd quant-engine && uv sync
uv run celery -A workers.celery_app worker -Q default -c 2   # worker
uv run python -m workers.outbox_dispatcher                    # dispatcher + reaper
```

After changing an API DTO, regenerate the typed client and commit it: `npm run openapi` (CI fails if it's stale).

## Tests

| Command | What it covers | Needs |
|---|---|---|
| `npm test` | API and web unit tests | nothing |
| `npm run lint` / `npm run typecheck` | oxlint and TypeScript, all workspaces | nothing |
| `cd quant-engine && uv run ruff check . && uv run mypy` | Python lint and strict types | nothing |
| `npm run test:e2e -w @quantforge/api` | auth, RBAC, **workspace isolation** (API and database level) | infra + migrations |
| `cd quant-engine && uv run pytest` | schema drift, worker RLS, job lifecycle and fencing | infra + migrations |
| `npm run test:pipeline -w @quantforge/api` | full job pipeline incl. killing the worker mid-job | full stack, short timings ¹ |
| `npm run test:e2e -w @quantforge/web` | browser: register → dashboard → live job | full stack |

¹ `HEARTBEAT_EVERY_S=1 STALE_AFTER_S=5 REAPER_EVERY_S=1 docker compose up -d --wait`

## Repository layout

```
apps/api            NestJS API: auth, workspaces, jobs, Socket.IO; Prisma schema and migrations
apps/web            React + Vite SPA (shadcn/ui, TanStack Query, Zustand)
quant-engine        Python: FastAPI internal API, Celery workers, outbox dispatcher and reaper
packages/api-client Typed client generated from apps/api/openapi.json
infrastructure      Docker configs (Postgres roles, PgBouncer, Nginx)
docs                PRD, architecture, database, API, roadmap, engineering decisions (ADRs)
spikes              Phase 0 validation code (throwaway)
```

## Design in one paragraph

NestJS owns authentication, authorization and business workflows. Python owns computation. Postgres is the source of truth, and **row-level security enforces workspace isolation inside the database**, so a missed check in application code still can't leak data. Long-running work goes through a transactional outbox: a dispatcher hands it to Celery, and workers claim jobs idempotently, send heartbeats and are fenced by attempt number. A reaper recovers jobs from dead workers. Workers publish updates over Redis, and the API relays them to the browser through Socket.IO. Details and the reasoning behind each choice are in [docs/ENGINEERING_DECISIONS.md](docs/ENGINEERING_DECISIONS.md).
