# QuantForge — Development Roadmap

Principle: **correctness before features.** Each phase ends with explicit exit criteria. Every
criterion is backed by an automated test or a scripted demo, and the next phase starts only after
the current phase's criteria are met and reviewed.

Each phase also includes its own tests, audit events, doc updates, and loading, empty and error
states in the UI. Structured logs and health checks exist from Phase 1 onward.

---

## Phase 0 — Decisions and spikes

- [x] Six foundation docs (this folder)
- [x] ADRs 000–009 written; Phase 1 blockers accepted or proposed with a spike
- [x] **Spike 1** `spikes/rls-prisma-pgbouncer`: validates ADR-002. 7/7 passing; found and fixed the session-`SET` fail-open risk
- [x] **Spike 2** `spikes/job-pipeline`: validates ADR-004 and ADR-005. 10/10 passing; moved the reaper into the dispatcher and added fencing

**Exit:** both spikes pass, and ADR-002/004/005 move to Accepted (or are revised based on the findings). ✅ Done 2026-11-14.

## Phase 1 — Foundation

Scope:
- npm workspaces monorepo: `apps/web`, `apps/api`, `quant-engine` (uv), `packages/api-client`, `packages/contracts`
- Docker Compose with Postgres, PgBouncer, redis-queue, redis-cache, api, quant-api, worker, beat, dispatcher, web
- Prisma schema for identity, workspaces, jobs, outbox and audit; RLS policies; three DB roles
- Auth (register, login, refresh rotation, logout), workspaces, membership, invites, RBAC (Owner/Admin/Developer/Viewer)
- Job Monitor page and a `system.ping` job that exercises the full pipeline
- App shell: sidebar navigation, dark theme, the Overview page with real empty states
- CI: ESLint, Prettier, `tsc --strict`, Ruff, mypy, Vitest/Jest, Pytest, an RLS isolation suite and a check for stale generated contracts

**Status (2026-11-14): implemented.** Criteria 1–6 are verified by automated tests (below). Criterion 7 needs the first push to GitHub.

| # | Verified by |
|---|---|
| 1 | `./scripts/gen-secrets.sh && docker compose up -d --build --wait`: 9 services healthy, migrations applied |
| 2 | `apps/api/test/auth.e2e-spec.ts` (9 tests) + Playwright `foundation.spec.ts` (reload keeps the session; sign-out ends it) |
| 3 | `apps/api/test/rbac.e2e-spec.ts` (7 tests) |
| 4 | `apps/api/test/isolation.e2e-spec.ts` (19 tests, incl. DB-level checks; a deliberately broken policy makes 3 fail) + `quant-engine/tests/test_jobs.py` (worker RLS, forged payloads) |
| 5 | `apps/api/test/pipeline.pipeline-spec.ts` + Playwright (job completes live with no reload) |
| 6 | `pipeline.pipeline-spec.ts`: SIGKILL the worker container mid-job, reaped with zero workers alive, completes on attempt 2 |
| 7 | `.github/workflows/ci.yml`: **pending the first push** |

**Exit criteria**
1. `./scripts/gen-secrets.sh && docker compose up` on a clean clone brings every service to healthy.
2. A user can register, log in, refresh the session after the access token expires, and log out. A refresh token presented twice revokes its whole family.
3. A user can create a workspace and add a member with a role. A Viewer cannot perform a write.
4. The isolation suite proves that user B cannot read or write workspace A's data through any API route, and that a worker cannot do so without the correct job context.
5. A ping job goes QUEUED → RUNNING → COMPLETED and the Job Monitor updates live without a page reload.
6. Killing the worker partway through a job ends in FAILED (WORKER_LOST), or in a retry followed by COMPLETED. The job never stays RUNNING.
7. CI is green on `main`.

## Phase 2 — Market data engine

- `ExchangeAdapter` and the Binance adapter (CCXT), with capability detection
- Historical backfill and incremental sync for BTC, ETH and SOL against USDT, across 1m/5m/15m/30m/1h/4h/1d
- Validation: UTC timestamps, duplicate and gap detection, OHLC sanity checks, `is_closed` handling
- Partitioned `market_candles`; cursor-paginated candles API
- Live kline WebSocket → Redis → Socket.IO; Markets page with Lightweight Charts

**Exit:** each synced series has a data-quality report. The chart matches Binance. The live candle is visibly distinct and finalizes correctly.

## Phase 3 — Strategy Studio

- JSON rule DSL and its schema; FastAPI `/internal/strategies/validate`
- Indicator library (SMA, EMA, MACD, ADX, RSI, Stochastic, ROC, Bollinger, ATR, HV, OBV, Volume SMA) with TA-Lib parity tests and no-look-ahead tests
- 5 built-in strategies; immutable strategy versions; Strategies page

**Exit:** a user can create a strategy and edit it, and each edit creates a new immutable version. Signals are deterministic for a fixed dataset.

## Phase 4 — Backtesting engine

- MinIO; dataset snapshots (Parquet and checksum)
- VectorBT behind `BacktestEngine`; next-bar-open execution; fees and slippage; Decimal accounting boundary
- Metrics (ADR-013), trades, equity and drawdown; ECharts report; side-by-side run comparison

**Exit:** golden test passes. The look-ahead test shows no edge for a strategy that peeks at the future. Re-running gives identical metrics. Each report shows its execution assumptions.

## Phase 5 — Virtual trading

- Virtual accounts, orders, fills, positions and transactions, all NUMERIC, with idempotency keys
- Candle-close forward runner reusing the signal code (ADR-014); live portfolio updates

**Exit:** the forward-vs-backtest parity test passes. A concurrency test shows that balances are never corrupted. A runner restart produces no duplicate fills.

## 🚀 v0.1 — first usable release

Phases 1–5 cover the full initial-release definition: account and workspace, secure login,
BTC/USDT data, candle sync, built-in strategy, backtest, equity curve and trades, configuration
comparison, virtual account, and strategy-in-simulation.

## Phase 6 — Strategy evolution

Grid and random search, `TimeSeriesSplit`, walk-forward, final holdout, sensitivity heatmaps, cost stress tests, deflated Sharpe ratio (ADR-015).

**Exit:** the holdout is provably excluded from the search, and each report shows in-sample vs out-of-sample results.

## Phase 7 — Factor Research Lab

Prerequisite: ADR-016 (universe). Factor registry, IC/rank-IC/time-series IC, decay, correlation heatmap, out-of-sample retention, BH correction, lifecycle labels.

## Phase 8 — AI research assistant and MCP

- **8a (can ship right after v0.1):** read-only MCP tools and an in-app assistant that only reads
- **8b:** action tools with confirmation, LangGraph.js flows, budgets, an evaluation set

**Exit:** every number in an assistant answer traces back to a tool result, and cross-workspace tool calls are rejected.

## Phase 9 — Production readiness

OpenTelemetry, Prometheus/Grafana, GlitchTip; pgBackRest/Restic with tested restores; Trivy and Dependabot; Helm, K3s, then EKS/Terraform/Argo CD only if cloud hosting is needed; security review; load tests; license (ADR-019); open-source docs.

## Later or out of scope

Visual strategy builder, sandboxed custom Python, Optuna TPE, more exchanges and traditional markets. **Live trading is explicitly out of scope.**
