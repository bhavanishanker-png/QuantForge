# QuantForge — API Design

REST over HTTPS, URI-versioned at `/api/v1`. The NestJS-generated OpenAPI spec is the contract
(ADR-001); Swagger UI is served at `/api/docs` outside production.

## 1. Conventions

- **Auth:** `Authorization: Bearer <access JWT>`. The refresh token travels only in an httpOnly cookie (ADR-007).
- **Workspace context:** `X-Workspace-Id: <uuid>` is required on every workspace-scoped route. A missing or unauthorized value returns `403 WORKSPACE_FORBIDDEN`, never 404, so the response doesn't reveal whether the workspace exists.
- **Roles:** routes declare `@Roles(...)`. Defaults: VIEWER can read; DEVELOPER can create and run research; ADMIN manages members; OWNER can delete the workspace and transfer ownership.
- **JSON:** camelCase fields; ISO-8601 UTC timestamps; **decimals are serialized as strings** (`"123.45000000"`) so JSON never loses precision.
- **Idempotency:** `POST` routes that create jobs or financial effects accept an `Idempotency-Key` header. A repeat key returns the original response.
- **Long-running work:** `202 Accepted` with the job reference shown below. HTTP requests never wait for a computation to finish.
  ```json
  { "jobId": "uuid", "status": "QUEUED", "resourceType": "BACKTEST", "resourceId": "uuid" }
  ```

## 2. Pagination

- **Offset** for small collections (users, workspaces, strategies): `?page=1&pageSize=25` returns `{ items, page, pageSize, total }`.
- **Cursor** for large or append-only collections (candles, trades, orders, jobs, equity points): `?limit=500&cursor=<opaque>` returns `{ items, nextCursor }`. The cursor is a base64url encoding of the composite sort key (e.g. `createdAt,id`). Sort order is stable and backed by an index.

## 3. Errors

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Human-readable summary",
    "details": [{ "path": "email", "issue": "invalid_format" }],
    "requestId": "01J…"
  }
}
```
| HTTP | Typical codes |
|---|---|
| 400 | `VALIDATION_FAILED` |
| 401 | `UNAUTHENTICATED`, `TOKEN_EXPIRED` |
| 403 | `FORBIDDEN`, `WORKSPACE_FORBIDDEN` |
| 404 | `NOT_FOUND` |
| 409 | `CONFLICT`, `IDEMPOTENCY_KEY_REUSED` |
| 422 | `STRATEGY_INVALID`, `DATASET_UNAVAILABLE` |
| 429 | `RATE_LIMITED` |
| 500 | `INTERNAL` (no internal details are exposed) |

## 4. Phase 1 endpoints

| Method | Path | Role | Notes |
|---|---|---|---|
| POST | `/auth/register` | public | Creates the user and a personal workspace (OWNER) |
| POST | `/auth/login` | public | Returns `{accessToken, user}` and sets the refresh cookie |
| POST | `/auth/refresh` | cookie | Rotates the refresh token; reuse revokes the family |
| POST | `/auth/logout` | auth | Revokes the current family |
| GET | `/users/me` | auth | |
| PATCH | `/users/me` | auth | displayName, preferences |
| GET | `/workspaces` | auth | The workspaces the caller belongs to (offset pagination) |
| POST | `/workspaces` | auth | The caller becomes OWNER |
| GET | `/workspaces/:id` | VIEWER | |
| PATCH | `/workspaces/:id` | ADMIN | |
| GET | `/workspaces/:id/members` | VIEWER | |
| POST | `/workspaces/:id/members` | ADMIN | Adds an existing user by email (invites come later) |
| PATCH | `/workspaces/:id/members/:userId` | ADMIN | Change a role (OWNER changes require OWNER) |
| DELETE | `/workspaces/:id/members/:userId` | ADMIN | The last OWNER cannot be removed |
| GET | `/jobs` | VIEWER | Cursor pagination; filter by `status` and `type` |
| GET | `/jobs/:id` | VIEWER | |
| POST | `/jobs/:id/cancel` | DEVELOPER | Sets `cancel_requested` |
| POST | `/system/ping-job` | DEVELOPER | Returns 202. A diagnostic job that exercises the pipeline |
| GET | `/health`, `/ready` | public | Not versioned |

## 5. Later-phase endpoints (outline)

Markets: `GET /markets/instruments`, `GET /markets/candles` (cursor), `POST /markets/sync` (202), `GET /markets/sync/:jobId`
Strategies: `GET|POST /strategies`, `GET|PUT /strategies/:id` (PUT creates a new version), `POST /strategies/:id/validate`, `GET /strategies/:id/versions`
Backtests: `POST /backtests` (202), `GET /backtests`, `GET /backtests/:id`, `GET /backtests/:id/trades` (cursor), `GET /backtests/:id/equity` (cursor), `POST /backtests/:id/cancel`, `GET /backtests/compare?ids=`
Optimizations: `POST /optimizations` (202), `GET /optimizations[/:id]`, `GET /optimizations/:id/trials`, `POST /optimizations/:id/cancel`
Factors: `GET /factors`, `POST /factors/evaluate` (202), `GET /factors/evaluations/:id`
Virtual trading: `POST|GET /virtual-accounts`, `GET /virtual-accounts/:id[/positions|/orders|/trades|/equity]`, `POST /virtual-accounts/:id/runs`
AI: `POST /ai/conversations`, `GET /ai/conversations[/:id]`, `POST /ai/conversations/:id/messages` (streamed with SSE)

## 6. Real-time (Socket.IO)

- Namespace `/ws`; authenticate with `auth: { token: <access JWT> }` in the handshake.
- The client emits `workspace.join {workspaceId}`. The server checks membership, then joins the room `workspace:{id}`.
- Server events: `job.updated {jobId, status, progress}`. Later: `market.candle`, `account.updated`.
- Events are invalidation signals. The client refetches through REST, which stays the source of truth (ADR-004).

## 7. Internal API (NestJS → FastAPI)

Reachable only on the internal Docker network and authenticated with a shared service token
(mTLS later). `POST /internal/v1/strategies/validate`, `POST /internal/v1/indicators/preview`.
Every call includes the `workspaceId` that NestJS has already authorized.
