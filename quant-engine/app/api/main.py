"""Internal quant API (ADR-008). Reachable only on the internal network; every call carries the
shared service token and a workspace id NestJS has already authorized. Never public."""

import hmac
from typing import Annotated

from fastapi import Depends, FastAPI, Header, HTTPException, Response, status
from sqlalchemy import text

from app.core.config import get_settings
from app.core.events import _client as redis_client
from app.core.logging import configure_logging
from app.db.session import worker_engine

configure_logging("quant-api")
app = FastAPI(title="QuantForge Quant Engine (internal)", version="0.1.0", docs_url=None, redoc_url=None)


def require_service_token(authorization: Annotated[str | None, Header()] = None) -> None:
    expected = f"Bearer {get_settings().internal_service_token}"
    if authorization is None or not hmac.compare_digest(authorization.encode(), expected.encode()):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid service token")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/ready")
def ready(response: Response) -> dict[str, object]:
    checks: dict[str, str] = {}
    try:
        with worker_engine().connect() as c:
            c.execute(text("SELECT 1"))
        checks["database"] = "ok"
    except Exception:  # noqa: BLE001 - any failure means "down"
        checks["database"] = "down"
    try:
        redis_client().ping()
        checks["redisQueue"] = "ok"
    except Exception:  # noqa: BLE001 - any failure means "down"
        checks["redisQueue"] = "down"
    ok = all(v == "ok" for v in checks.values())
    if not ok:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return {"status": "ok" if ok else "degraded", "checks": checks}


@app.get("/internal/v1/ping", dependencies=[Depends(require_service_token)])
def internal_ping() -> dict[str, str]:
    return {"pong": "quant-engine"}
