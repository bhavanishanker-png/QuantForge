"""Database access for workers (ADR-002/003).

Workers connect through PgBouncer (transaction pooling) as qf_worker, which is subject to RLS.
Every unit of work runs inside `workspace_tx`, which sets the transaction-local workspace context
first. Never use session-level SET (spike 1: fails open through PgBouncer).
"""

from collections.abc import Iterator
from contextlib import contextmanager
from functools import lru_cache
from uuid import UUID

from sqlalchemy import Connection, Engine, create_engine, text
from sqlalchemy.pool import NullPool

from app.core.config import get_settings, sqlalchemy_url


@lru_cache
def worker_engine() -> Engine:
    # NullPool: PgBouncer already pools; prepare_threshold=None disables server-side prepared
    # statements, which transaction pooling cannot track.
    return create_engine(
        sqlalchemy_url(get_settings().worker_database_url),
        poolclass=NullPool,
        connect_args={"prepare_threshold": None},
    )


@contextmanager
def workspace_tx(workspace_id: UUID | str) -> Iterator[Connection]:
    ws = str(UUID(str(workspace_id)))  # validates
    with worker_engine().begin() as conn:
        conn.execute(text("SELECT set_config('app.current_workspace_id', :ws, true)"), {"ws": ws})
        yield conn
