# QuantForge — Product Requirements

## 1. Summary

QuantForge is an open-source, local-first, self-hostable platform for quantitative trading
research. It takes a user from market data through strategy definition, backtesting, optimization,
virtual (paper) trading and factor research, with an AI assistant that works only from real
platform data. It is **research infrastructure, not a trading bot**: no live trading, no return
predictions, no black-box signals.

## 2. Users

- **Independent traders** who want to test ideas rigorously before risking money.
- **Quant developers and Python strategy authors** who want reproducible experiments.
- **Small research teams** who share a workspace with role-based access.

## 3. Product principles

1. **Correctness over features.** A smaller set of trustworthy results beats ten unfinished modules.
2. **Reproducibility.** Every result can be traced to an immutable strategy version, dataset checksum and set of assumptions.
3. **Transparency.** Execution assumptions, costs and metric definitions are always visible.
4. **User control.** Users own their strategies, data and deployment.
5. **Honest AI.** The assistant reads platform data through tools. It never invents numbers or bypasses permissions.

## 4. v0.1 scope (Phases 1–5)

A user can:
1. Create an account and workspace, and invite teammates with roles (Owner, Admin, Developer, Viewer).
2. Log in securely.
3. View BTC/USDT (and ETH and SOL) candles on Binance across 1m–1d.
4. Sync historical candles and see data-quality status.
5. Create a strategy from a built-in template or the JSON rule DSL, configure its parameters and keep versions.
6. Run a historical backtest with explicit costs (0.05% commission, 0.05% slippage) and next-bar execution.
7. Inspect the equity curve, drawdown, trades and standard metrics.
8. Compare backtest runs side by side.
9. Create a virtual trading account.
10. Run a strategy forward in simulation and watch positions, fills and P&L update live.

**Constraints:** crypto spot, long-only, no leverage, public market data only, Docker Compose deployment.

## 5. After v0.1

- **Strategy evolution:** grid and random search with chronological validation, walk-forward, holdout, sensitivity and deflated Sharpe.
- **Factor Lab:** IC, rank IC, decay, correlation, out-of-sample retention, BH correction.
- **AI assistant + MCP:** read tools first, then action tools with confirmation.
- **Production:** observability, backups, Kubernetes (K3s/EKS) deployment, security hardening.
- **Later:** visual builder, sandboxed custom Python, more exchanges and asset classes.

## 6. Explicitly out of scope

Live or real-money order execution · brokerage integrations · leverage, margin and derivatives (v1) · hosted multi-tenant SaaS with untrusted code (until sandboxing is hardened) · return forecasts.

## 7. Success measures for v0.1

- From a clean clone, a new user reaches a first completed backtest in under 15 minutes.
- 100% of backtests store their full reproducibility record, and re-running one reproduces its metrics exactly.
- Zero cross-workspace access paths in the isolation test suite.
- Virtual account balances reconcile exactly (Decimal) with the fill history.

## 8. Non-functional requirements

Security: Argon2id, rotating refresh tokens, RBAC and RLS, rate limiting, audit logs, no secrets in the client.
Reliability: persistent job states, idempotent workers, recovery after worker loss, health checks.
Performance: indexed and paginated queries; heavy computation only in workers; candle queries under 200 ms for 5,000 bars.
Testing: unit, integration, isolation, indicator correctness, backtest correctness, accounting and end-to-end tests.

## 9. UX

A dark-first, information-dense research terminal: persistent sidebar, compact tables, green and red used only for performance, and a loading, empty and error state on every view. Every number on screen comes from the backend.
