# QuantForge
## AI-Powered Quantitative Trading & Research Operating System

## 1. Project Overview

Build QuantForge, an open-source, local-first, self-hostable AI-powered quantitative trading and research platform.

QuantForge is designed for independent traders, quantitative developers, Python strategy authors, researchers, and small trading teams.

The platform provides an end-to-end environment for:

1. Collecting and managing financial market data.
2. Developing Python-based trading strategies.
3. Calculating technical and quantitative indicators.
4. Backtesting strategies against historical market data.
5. Optimizing strategy parameters.
6. Evaluating statistical robustness and overfitting.
7. Running virtual/paper trading accounts.
8. Monitoring portfolio performance and risk.
9. Conducting quantitative factor research.
10. Interacting with platform capabilities through AI assistants and MCP.

The platform must not be a black-box signal service. Users must retain control over strategy source code, parameters, trading rules, risk configurations, market data, and deployment.

The initial implementation should focus on cryptocurrency spot markets, starting with BTC/USDT, while keeping the architecture extensible to additional crypto pairs, exchanges, and traditional financial markets.

The first release must support historical research, backtesting, and virtual trading only. Real-money execution must not be implemented in the initial release.

---

# 2. Product Goals

The main objective is to consolidate the quantitative trading workflow into a single platform.

A user should be able to:

- Register and create a workspace.
- Connect to a supported market data provider.
- Browse financial instruments and historical price data.
- Create and manage Python trading strategies.
- Configure strategy parameters.
- Run backtests asynchronously.
- View detailed performance reports.
- Optimize strategy parameters using different algorithms.
- Compare experiments.
- Create virtual accounts.
- Run strategies against virtual accounts.
- Monitor positions, transactions, and equity.
- Ask an AI assistant to analyze research and backtesting results.
- Expose supported capabilities to external AI agents through MCP.

The system should be modular, extensible, secure, observable, and maintainable.

---

# 3. Technology Stack

Use the following stack.

## Frontend

- Next.js with App Router.
- React.
- TypeScript.
- Tailwind CSS.
- shadcn/ui.
- TradingView Lightweight Charts.
- TanStack Query for server-state management.
- Zustand for lightweight client-state management.
- React Hook Form.
- Zod for frontend validation.

## Main Backend

- NestJS.
- TypeScript.
- REST APIs.
- Swagger/OpenAPI.
- JWT authentication.
- Role-based access control.
- WebSockets for real-time job and account updates.

## Quantitative Computation Engine

- Python.
- FastAPI.
- Pandas.
- NumPy.
- SciPy.
- TA-Lib or an equivalent indicator implementation.
- Optuna for hyperparameter optimization.
- Scikit-learn for selected statistical and analytical workflows.

## Database

- PostgreSQL.
- SQLAlchemy for Python-side database access where required.
- Prisma or TypeORM for NestJS database access.
- Database migrations.
- Proper relational constraints and indexes.

Choose one ORM for the main NestJS application and keep the schema consistent. Avoid maintaining two independent sources of truth for application tables.

## Background Processing

- Redis.
- Celery for Python computation workers.
- Durable job records in PostgreSQL.
- Retry policies.
- Job status tracking.
- Idempotent job execution.

## Market Data

- CCXT for cryptocurrency exchange integration.
- Exchange WebSocket interfaces where supported.
- A provider abstraction for future exchange integrations.

## AI Integration

- OpenAI SDK.
- Anthropic SDK as an optional provider.
- Structured outputs.
- Function/tool calling.
- MCP server implementation.
- Agent Gateway.

## Infrastructure

- Docker.
- Docker Compose.
- GitHub Actions.
- AWS-compatible deployment architecture.
- Structured application logging.
- Prometheus/Grafana or equivalent optional monitoring.

Use stable versions and maintain compatible dependency versions.

---

# 4. System Architecture

Implement a modular monolith for the primary application, with a separately deployed Python quantitative computation service and workers.

The frontend communicates with NestJS through REST APIs and WebSockets.

NestJS handles authentication, authorization, workspaces, strategies, job orchestration, virtual account management, and application business logic.

The Python service handles quantitative calculations, indicators, strategy execution, backtesting, statistical analysis, and optimization.

Redis coordinates background processing.

PostgreSQL stores persistent application and financial records.

The Python engine must not be directly exposed to untrusted public clients.

## Architecture flow

Frontend:
Next.js
    |
    v
NestJS API
    |
    +---- PostgreSQL
    |
    +---- Redis
    |
    +---- Market Data Providers
    |
    +---- Python Quant Engine
    |          |
    |          +---- Indicators
    |          +---- Strategy Runtime
    |          +---- Backtesting
    |          +---- Optimization
    |          +---- Factor Research
    |
    +---- AI Service
    |          |
    |          +---- LLM Providers
    |          +---- MCP Server
    |          +---- Agent Gateway
    |
    +---- WebSocket Gateway

Background workers:
    |
    +---- Market Data Worker
    +---- Backtesting Worker
    +---- Optimization Worker
    +---- Virtual Trading Worker

All important jobs must have persistent status records.

---

# 5. Functional Modules

## Module 1: Authentication and Workspace Management

Implement:

- User registration.
- Login and logout.
- Password hashing.
- JWT authentication.
- Refresh token rotation.
- User profile management.
- Workspace creation.
- Workspace membership.
- Role-based permissions.

Roles:

- Owner.
- Admin.
- Developer.
- Viewer.

All user-owned resources must be scoped to their workspace.

A user must never be able to access another workspace's strategies, accounts, experiments, or records without explicit authorization.

## Module 2: Market Data Engine

Purpose:

Collect, normalize, store, and serve historical and real-time financial market data.

Initial supported market:

Cryptocurrency spot markets.

Initial exchange integration:

CCXT-compatible exchanges.

Initial instruments:

- BTC/USDT.
- ETH/USDT.
- SOL/USDT.

Support configurable instruments rather than hardcoding only these examples.

Supported timeframes:

- 1 minute.
- 5 minutes.
- 15 minutes.
- 30 minutes.
- 1 hour.
- 4 hours.
- 1 day.

Features:

1. Exchange integration.
2. Instrument discovery.
3. Historical OHLCV ingestion.
4. Incremental synchronization.
5. Historical data pagination.
6. Duplicate candle prevention.
7. Missing candle detection.
8. Data validation.
9. Real-time market data where supported.
10. Market data APIs.
11. Data synchronization status.

OHLCV schema:

- timestamp
- open
- high
- low
- close
- volume

Use UTC timestamps.

Enforce a unique constraint on instrument, timeframe, and candle timestamp.

Do not assume that every exchange returns identical data or supports every timeframe.

Create an exchange provider abstraction so additional exchanges can be added without rewriting the market data module.

The market data engine must distinguish between unavailable data, missing candles, incomplete candles, and valid completed candles.

## Module 3: Strategy Development Studio

Purpose:

Allow users to create, validate, manage, and execute Python-based trading strategies.

Provide a standardized Strategy API.

Example conceptual interface:

class BaseStrategy:

    def initialize(self, context):
        pass

    def on_bar(self, context, bar):
        pass

    def on_order_update(self, context, order):
        pass

A strategy should receive controlled market data and account context.

A strategy must not directly access database credentials, broker credentials, application secrets, or unrestricted internal APIs.

Features:

- Strategy creation.
- Python source code editor.
- Strategy templates.
- Strategy validation.
- Syntax validation.
- Strategy parameter definitions.
- Parameter type validation.
- Strategy versioning.
- Strategy activation and deactivation.
- Strategy execution logs.
- Signal generation.

Initial built-in strategies:

1. SMA crossover.
2. EMA crossover.
3. RSI threshold strategy.
4. MACD crossover.
5. Bollinger Bands strategy.

Signal types:

- BUY.
- SELL.
- HOLD.

Strategy configuration should support:

- Trading pair.
- Timeframe.
- Initial parameters.
- Trading direction.
- Position sizing.
- Stop-loss settings.
- Take-profit settings.
- Risk constraints.

Use versioned strategy definitions.

A strategy version used in a backtest must remain reproducible even if the user subsequently modifies the strategy.

### Python sandboxing

Executing user-provided Python code is a major security concern.

Never execute arbitrary user code inside the main NestJS or FastAPI process.

Use isolated execution containers or equivalent sandbox infrastructure with:

- CPU limits.
- Memory limits.
- Execution timeouts.
- Restricted filesystem access.
- No access to application secrets.
- Restricted network access.
- Process isolation.
- Resource cleanup.

For the initial MVP, restrict strategy execution to approved built-in templates and controlled user strategy code.

## Module 4: Technical Indicator Library

Implement a reusable indicator library.

Initial indicators:

### Trend indicators

- SMA.
- EMA.
- MACD.
- ADX.

### Momentum indicators

- RSI.
- Stochastic Oscillator.
- Rate of Change.

### Volatility indicators

- Bollinger Bands.
- ATR.
- Historical Volatility.

### Volume indicators

- OBV.
- Volume SMA.

Each indicator must:

- Have validated parameters.
- Return deterministic results.
- Handle insufficient historical data.
- Handle NaN values correctly.
- Be tested against known sample datasets.
- Avoid using future data.

Indicators must be reusable across strategy execution, backtesting, and factor research.

## Module 5: Backtesting Engine

Purpose:

Simulate strategy performance using historical market data.

This is one of the most important modules.

Build an event-driven backtesting engine.

The engine should process historical candles chronologically.

At each event:

1. Update market data.
2. Update indicators.
3. Invoke the strategy.
4. Generate trading signals.
5. Validate risk constraints.
6. Generate virtual orders.
7. Simulate execution.
8. Update positions and balances.
9. Calculate account equity.
10. Record trade and portfolio events.

Features:

- Historical backtesting.
- Configurable initial capital.
- Trading pair selection.
- Timeframe selection.
- Date range selection.
- Position sizing.
- Transaction commission.
- Slippage simulation.
- Stop loss.
- Take profit.
- Long-only mode initially.
- Trade history.
- Equity curve.
- Drawdown curve.
- Performance analytics.

Execution assumptions must be explicit.

For example, a signal generated from a completed candle must not automatically execute at that same candle's already-observed closing price.

Use the next available executable price according to the simulation model.

Support market and limit order simulations in later iterations.

### Backtest metrics

Calculate:

1. Initial capital.
2. Final equity.
3. Total return.
4. Annualized return where appropriate.
5. Win rate.
6. Number of trades.
7. Average profit.
8. Average loss.
9. Profit factor.
10. Maximum drawdown.
11. Sharpe ratio.
12. Sortino ratio.
13. Calmar ratio.
14. Average holding period.
15. Total transaction costs.

Document metric conventions and annualization assumptions.

Do not calculate performance using only winning trades or incomplete equity records.

### Backtest result storage

Persist:

- Backtest configuration.
- Strategy version.
- Dataset identifier.
- Execution assumptions.
- Performance metrics.
- Equity curve.
- Trade records.
- Logs.
- Start and completion timestamps.
- Job status.

Backtests must be reproducible from their recorded inputs.

## Module 6: Strategy Evolution and Parameter Optimization

Purpose:

Automatically search for robust strategy parameter combinations.

Use Optuna for TPE optimization.

Also implement:

- Random Search.
- Grid Search.

Example:

Strategy: Moving Average Crossover.

Parameters:

short_window:
    min: 5
    max: 30

long_window:
    min: 30
    max: 100

objective:
    maximize risk_adjusted_return

Users must be able to:

- Configure parameter ranges.
- Select optimization algorithms.
- Set maximum trial counts.
- Select optimization objectives.
- Configure date ranges.
- View trial progress.
- Compare parameter combinations.
- Review experiment history.
- Cancel running jobs.

### Validation

Do not optimize and evaluate on the same historical period only.

Implement chronological train/test splits and walk-forward validation.

The final blind holdout must not influence parameter selection.

### Advanced robustness analysis

Add the following in later iterations:

- Probability of Backtest Overfitting (PBO).
- Deflated Sharpe Ratio.
- Block-bootstrap Monte Carlo.
- Transaction cost stress tests.
- Parameter sensitivity analysis.

Optimization results must be treated as historical experiment comparisons, not forecasts of future returns.

## Module 7: Virtual Trading Engine

Purpose:

Allow users to execute strategy signals in simulated accounts without using real capital.

This module must be completely independent of live broker execution.

Features:

- Create virtual accounts.
- Configure initial balance.
- Associate strategies with accounts.
- Receive strategy signals.
- Convert signals into virtual orders.
- Simulate fills.
- Manage positions.
- Update balances.
- Calculate realized PnL.
- Calculate unrealized PnL.
- Record trade history.
- Maintain account equity.
- Display performance charts.

Initial virtual trading assumptions:

- Fixed commission: 0.05% of executed notional.
- Adverse slippage: 0.05%.
- No additional commission multiplier based on leverage.
- Start with spot trading and no leverage.

The cost model must be configurable in future releases.

### Financial correctness

Use decimal arithmetic for monetary calculations.

Ensure:

- No duplicate fills.
- No duplicate balance deductions.
- Atomic order processing.
- Unique idempotency keys.
- Transactional position updates.
- Consistent account balances.

Persist a complete order and fill history.

Virtual trading must never call a real exchange order-submission endpoint.

## Module 8: Factor Research Lab

Purpose:

Evaluate quantitative factors and determine whether they have statistically meaningful relationships with future asset returns.

Start with technical factors.

Later support fundamental factors and external factor providers.

Initial factors:

- Momentum.
- RSI.
- Moving average distance.
- Volatility.
- Volume change.
- MACD.
- ATR.

Features:

- Factor registration.
- Factor computation.
- Multi-asset factor evaluation.
- Information Coefficient calculation.
- Rank IC.
- Time-series IC.
- IC stability.
- Out-of-sample evaluation.
- Cross-factor correlation.
- Factor comparison.

Implement:

### Point-in-time data

All factor calculations must use information available at the evaluation timestamp.

Prevent future data from entering factor values.

### Statistical validation

Add:

- Time-ordered holdout.
- Out-of-sample IC retention.
- Benjamini-Hochberg false-discovery control.
- Cost-aware scoring.
- Factor lifecycle labels.
- Cross-factor IC correlation.

Support asynchronous evaluation of multiple registered factors.

Start with a smaller number of factors and add a maximum of 40 registered factors as the system matures.

## Module 9: AI Research Assistant

Purpose:

Provide a natural language interface to QuantForge.

Integrate OpenAI and optionally Anthropic through provider abstractions.

The AI assistant should not be the source of truth for trading calculations.

It should use actual platform APIs and quantitative engine results.

Initial capabilities:

- Explain market data.
- Explain technical indicators.
- Explain registered strategies.
- Retrieve backtest results.
- Compare backtest runs.
- Explain performance metrics.
- Start authorized research jobs.
- Retrieve optimization results.
- Summarize factor research.

Example interaction:

User:
"Backtest my RSI strategy on BTC/USDT for the last year."

AI workflow:

1. Parse the request.
2. Identify the strategy.
3. Resolve the market instrument.
4. Validate configuration.
5. Request user confirmation if required.
6. Call the backtest API.
7. Return the job ID.
8. Retrieve completed results.
9. Explain the actual metrics.

Another example:

"Compare my last three backtest runs and explain which one is more robust."

The AI should retrieve the runs and explain their differences using real results.

### AI safety

- Do not invent backtest metrics.
- Do not fabricate market data.
- Do not make unsupported return predictions.
- Do not expose credentials.
- Do not execute live trades.
- Enforce workspace authorization for every tool call.
- Require appropriate confirmation for consequential actions.

## Module 10: MCP Server and Agent Gateway

Expose selected QuantForge capabilities through the Model Context Protocol.

Initial MCP tools:

- list_market_instruments
- get_market_candles
- list_strategies
- get_strategy_details
- validate_strategy
- create_backtest
- get_backtest_results
- list_optimization_runs
- start_optimization
- get_virtual_account
- get_virtual_positions
- get_factor_results

The MCP server must use the same authorization and business rules as the main API.

Do not expose arbitrary database queries or unrestricted code execution through MCP.

Separate read-only research tools from tools that initiate computational jobs.

Require authorization and confirmation where appropriate.

---

# 6. Frontend Product Design

Create a polished, professional quantitative trading terminal.

The design should be inspired by professional financial research terminals and modern developer platforms.

Avoid a generic admin dashboard appearance.

## Design direction

- Dark-first interface.
- Professional typography.
- Neutral charcoal and slate backgrounds.
- Green for positive performance.
- Red for negative performance.
- Subtle borders.
- Compact data tables.
- Responsive layouts.
- Clear chart legends.
- Consistent spacing.
- Minimal unnecessary animations.

Use a consistent component system.

The dashboard should prioritize information density without becoming cluttered.

## Main navigation

Create a persistent sidebar.

Navigation:

1. Overview.
2. Markets.
3. Strategies.
4. Backtesting.
5. Optimization.
6. Factor Lab.
7. Virtual Trading.
8. AI Assistant.
9. Job Monitor.
10. Settings.

## Page 1: Overview Dashboard

Display:

- Total virtual portfolio value.
- Daily PnL.
- Total PnL.
- Active strategies.
- Running backtests.
- Running optimization jobs.
- Recent trades.
- Market watchlist.
- Portfolio equity curve.
- Recent activity.

All values must come from backend APIs.

Do not use hardcoded fake financial metrics in the production interface.

Provide loading, empty, and error states.

## Page 2: Markets

Display:

- Trading pair selector.
- Exchange selector.
- Timeframe selector.
- Candlestick chart.
- Volume chart.
- Market information.
- Historical data range.
- Technical indicator overlays.
- Data synchronization status.

Use TradingView Lightweight Charts.

## Page 3: Strategy Studio

Display:

- Strategy list.
- Strategy creation.
- Python code editor.
- Strategy templates.
- Parameter configuration.
- Strategy validation.
- Version history.
- Execution logs.

Provide a clear distinction between strategy source code and strategy configuration.

## Page 4: Backtesting

Display:

- Strategy selector.
- Market selector.
- Date range.
- Initial capital.
- Trading fees.
- Slippage.
- Execution assumptions.
- Start Backtest action.

After execution display:

- Performance metrics.
- Equity curve.
- Drawdown chart.
- Trade history.
- Entry and exit details.
- Execution logs.
- Backtest configuration.

## Page 5: Optimization

Display:

- Strategy selection.
- Optimization algorithm.
- Parameter ranges.
- Objective selection.
- Trial limit.
- Training period.
- Validation period.
- Holdout configuration.

Results:

- Best trial.
- Trial comparison.
- Parameter sensitivity.
- Performance distribution.
- Optimization history.
- Robustness reports.

## Page 6: Factor Lab

Display:

- Registered factors.
- Factor selection.
- Evaluation configuration.
- IC charts.
- IC distribution.
- Cross-factor correlation heatmap.
- Statistical significance.
- Out-of-sample results.
- Factor lifecycle.

## Page 7: Virtual Trading

Display:

- Account list.
- Virtual balance.
- Equity curve.
- Active positions.
- Open orders.
- Executed trades.
- Realized PnL.
- Unrealized PnL.
- Account activity.

## Page 8: AI Assistant

Create a conversational interface.

Support:

- Chat history.
- Streaming responses.
- Tool invocation indicators.
- Backtest result references.
- Research summaries.
- Confirmation prompts.

The AI should clearly distinguish between its own explanations and actual retrieved platform results.

## Page 9: Job Monitor

Display asynchronous job information:

- Job ID.
- Job type.
- Workspace.
- Status.
- Progress.
- Creation time.
- Start time.
- Completion time.
- Error details.
- Cancellation action.

Job types:

- Market data ingestion.
- Backtest.
- Optimization.
- Factor evaluation.

---

# 7. Database Design

Use PostgreSQL.

Create normalized relational tables with proper indexes, constraints, and foreign keys.

Initial tables:

### Identity and workspace

- users
- refresh_tokens
- workspaces
- workspace_members
- audit_logs

### Market data

- exchanges
- instruments
- market_candles
- data_sync_jobs

### Strategies

- strategies
- strategy_versions
- strategy_parameters
- strategy_execution_logs

### Backtesting

- backtest_runs
- backtest_trades
- backtest_equity_points
- backtest_metrics

### Optimization

- optimization_runs
- optimization_trials
- optimization_parameters

### Factor research

- factor_definitions
- factor_evaluations
- factor_results
- factor_correlations

### Virtual trading

- virtual_accounts
- virtual_orders
- virtual_fills
- virtual_positions
- virtual_transactions
- virtual_equity_snapshots

### Infrastructure

- background_jobs
- notifications
- ai_conversations
- ai_messages

Database rules:

1. Use UUID primary keys where appropriate.
2. Use UTC timestamps.
3. Use NUMERIC/DECIMAL for monetary values.
4. Enforce workspace-level authorization.
5. Use unique constraints for market candles.
6. Use idempotency keys for financial operations.
7. Store strategy versions used by experiments.
8. Preserve completed experiment inputs and outputs.
9. Add indexes to frequently queried fields.
10. Avoid unnecessary database duplication.

Define and document the relationship between all major entities.

---

# 8. API Design

Use REST APIs with consistent response formats.

All endpoints must include validation, authorization, appropriate error handling, and Swagger documentation.

Suggested endpoints:

Authentication:
- POST /api/v1/auth/register
- POST /api/v1/auth/login
- POST /api/v1/auth/refresh
- POST /api/v1/auth/logout

Workspaces:
- GET /api/v1/workspaces
- POST /api/v1/workspaces
- GET /api/v1/workspaces/:id

Markets:
- GET /api/v1/markets/instruments
- GET /api/v1/markets/candles
- POST /api/v1/markets/sync
- GET /api/v1/markets/sync/:jobId

Strategies:
- GET /api/v1/strategies
- POST /api/v1/strategies
- GET /api/v1/strategies/:id
- PUT /api/v1/strategies/:id
- POST /api/v1/strategies/:id/validate
- GET /api/v1/strategies/:id/versions

Backtesting:
- POST /api/v1/backtests
- GET /api/v1/backtests
- GET /api/v1/backtests/:id
- GET /api/v1/backtests/:id/trades
- GET /api/v1/backtests/:id/equity
- POST /api/v1/backtests/:id/cancel

Optimization:
- POST /api/v1/optimizations
- GET /api/v1/optimizations
- GET /api/v1/optimizations/:id
- GET /api/v1/optimizations/:id/trials
- POST /api/v1/optimizations/:id/cancel

Factor Lab:
- GET /api/v1/factors
- POST /api/v1/factors/evaluate
- GET /api/v1/factors/evaluations/:id

Virtual trading:
- POST /api/v1/virtual-accounts
- GET /api/v1/virtual-accounts
- GET /api/v1/virtual-accounts/:id
- GET /api/v1/virtual-accounts/:id/positions
- GET /api/v1/virtual-accounts/:id/orders
- GET /api/v1/virtual-accounts/:id/trades

AI:
- POST /api/v1/ai/chat
- GET /api/v1/ai/conversations
- GET /api/v1/ai/conversations/:id

Use pagination for collection endpoints.

Use consistent HTTP status codes.

Long-running jobs should return HTTP 202 with a persistent job identifier.

---

# 9. Background Job Architecture

Backtesting, optimization, market data ingestion, and factor evaluation must run asynchronously.

Implement a persistent job lifecycle:

QUEUED
  |
  v
RUNNING
  |
  +---- COMPLETED
  |
  +---- FAILED
  |
  +---- CANCELLED

Requirements:

- Persist job status.
- Support progress updates.
- Support cancellation where practical.
- Implement retry policies.
- Avoid duplicate execution effects.
- Record errors.
- Recover jobs after worker restarts.
- Provide job status APIs.
- Notify the frontend through WebSockets.

A worker must not assume that a message is delivered exactly once.

Use idempotent processing and persistent state to handle duplicate delivery and retries.

---

# 10. Non-Functional Requirements

## Performance

- Use database indexes.
- Avoid unnecessary full-table scans.
- Paginate large result sets.
- Use caching for frequently accessed market data.
- Stream large historical datasets where appropriate.
- Process heavy computations in background workers.

## Security

- Secure password storage.
- JWT refresh token rotation.
- RBAC.
- Workspace isolation.
- Rate limiting.
- Request validation.
- Secure CORS configuration.
- Secret management.
- Audit logging.
- Sandboxed strategy execution.

## Reliability

- Database transactions for financial operations.
- Idempotent processing.
- Persistent job states.
- Worker recovery.
- Structured logs.
- Health checks.
- Error tracking.

## Testing

Implement:

- Unit tests.
- API integration tests.
- Database tests.
- Indicator correctness tests.
- Backtesting correctness tests.
- Virtual trading accounting tests.
- Job retry tests.
- Workspace isolation tests.
- End-to-end user workflow tests.

Create deterministic test datasets and expected financial results.

---

# 11. Repository Structure

Use a monorepo.

quantforge/
|
├── apps/
|   ├── web/
|   └── api/
|
├── quant-engine/
|   ├── app/
|   |   ├── indicators/
|   |   ├── strategies/
|   |   ├── backtesting/
|   |   ├── execution/
|   |   ├── optimization/
|   |   ├── analytics/
|   |   └── api/
|   └── tests/
|
├── workers/
|   ├── market-data/
|   └── quant-jobs/
|
├── mcp-server/
|
├── packages/
|   └── shared-types/
|
├── infrastructure/
|   ├── docker/
|   └── monitoring/
|
├── docs/
|
├── docker-compose.yml
└── README.md

Keep clear separation between application modules and quantitative computation modules.

---

# 12. Development Phases

Do not attempt to implement all modules at once.

Develop in the following order.

## Phase 1: Project Foundation

- Monorepo.
- Next.js.
- NestJS.
- FastAPI.
- PostgreSQL.
- Redis.
- Docker Compose.
- Authentication.
- Workspace management.
- Basic dashboard.

Acceptance criteria: The user can register, log in, create a workspace, and access a functioning dashboard.

## Phase 2: Market Data

- CCXT integration.
- Instrument discovery.
- Historical OHLCV ingestion.
- Candle persistence.
- Data validation.
- Market charts.

Acceptance criteria: The user can select BTC/USDT, retrieve historical candles, and inspect them in the chart.

## Phase 3: Strategy Studio

- Strategy API.
- Built-in strategies.
- Parameter definitions.
- Strategy validation.
- Versioning.
- Safe execution environment.

Acceptance criteria: The user can create a strategy, configure it, and generate deterministic trading signals.

## Phase 4: Backtesting

- Event-driven simulation.
- Virtual order execution.
- Position accounting.
- Commission and slippage.
- Performance metrics.
- Backtest reports.

Acceptance criteria: The user can run a backtest and inspect trades, equity, drawdown, and performance metrics.

## Phase 5: Virtual Trading

- Virtual accounts.
- Order processing.
- Fill simulation.
- Positions.
- Trade history.
- PnL.
- Account equity.

Acceptance criteria: A strategy can generate simulated trades that update account balances and positions correctly.

## Phase 6: Strategy Evolution

- Random Search.
- Grid Search.
- TPE.
- Walk-forward validation.
- Experiment tracking.
- Robustness analysis.

Acceptance criteria: Users can optimize parameters, compare trials, and inspect validation results.

## Phase 7: Factor Lab

- Factor registration.
- Factor calculations.
- IC analysis.
- Statistical evaluation.
- Correlation analysis.
- False-discovery control.

Acceptance criteria: Users can evaluate multiple factors and inspect out-of-sample results.

## Phase 8: AI and MCP

- LLM integration.
- Tool calling.
- AI research assistant.
- MCP server.
- Agent Gateway.
- Permission enforcement.

Acceptance criteria: An authorized AI client can retrieve market data, inspect strategies, launch backtests, and explain actual results through platform tools.

## Phase 9: Production Readiness

- Automated test pipelines.
- Monitoring.
- Audit logs.
- Security hardening.
- Documentation.
- Deployment.

Acceptance criteria: The system can be deployed with documented configuration and reproducible setup.

---

# 13. Development Rules for the AI IDE

Follow these instructions throughout implementation.

1. First inspect the existing repository before modifying files.
2. Do not generate the entire project in one response or one coding operation.
3. Start by producing a technical implementation plan.
4. Create a clear task breakdown for the current phase.
5. Implement one module at a time.
6. Follow clean architecture and separation of concerns.
7. Avoid giant controllers and service classes.
8. Use dependency injection appropriately.
9. Keep Python and TypeScript contracts synchronized.
10. Use shared API documentation and explicit schemas.
11. Validate every external API response.
12. Never hardcode production market data or financial metrics.
13. Use environment variables for configuration.
14. Never commit secrets.
15. Add tests alongside features.
16. Use migrations for database changes.
17. Document important architecture decisions.
18. Do not silently replace existing functionality.
19. Do not introduce microservices without a demonstrated need.
20. Do not implement live trading in the initial version.
21. Do not claim a feature is complete unless it has been implemented and tested.
22. Keep the application runnable after every development milestone.

If a requirement is ambiguous, explain the options and recommend an approach before implementing it.

---

# 14. First Task for the AI IDE

Do not start implementing all product modules immediately.

First:

1. Inspect the repository.
2. Prepare the complete system architecture.
3. Create a development roadmap.
4. Define the initial database ER diagram.
5. Define module boundaries.
6. Define API communication contracts.
7. Create the monorepo structure.
8. Configure Docker Compose with PostgreSQL and Redis.
9. Bootstrap Next.js, NestJS, and FastAPI.
10. Verify all services start successfully.

Create the following documentation:

- docs/PRD.md
- docs/ARCHITECTURE.md
- docs/DATABASE_DESIGN.md
- docs/API_DESIGN.md
- docs/DEVELOPMENT_ROADMAP.md
- docs/ENGINEERING_DECISIONS.md

After completing the foundation, stop and present:

- Implemented files.
- Architecture decisions.
- Commands to run the application.
- Tests executed.
- Remaining tasks.
- Any unresolved design decisions.

Wait for approval before moving into the next major development phase.

---

# 15. Final Product Vision

QuantForge should become a complete, self-hostable quantitative trading research environment.

A developer should be able to move through the entire workflow:

Market Data
    ↓
Strategy Development
    ↓
Indicator Computation
    ↓
Historical Backtesting
    ↓
Parameter Optimization
    ↓
Statistical Validation
    ↓
Virtual Trading
    ↓
Performance Monitoring
    ↓
AI Research and MCP Integration

The platform must prioritize correctness, reproducibility, transparency, user control, and security over flashy AI-generated trading predictions.

Build a reliable quantitative infrastructure platform, not a speculative trading bot.