import os
from collections.abc import Iterator

import psycopg
import pytest

os.environ.setdefault("LOG_JSON", "false")

from app.core.config import get_settings


@pytest.fixture(scope="session")
def admin_conn() -> Iterator[psycopg.Connection]:
    """Postgres SUPERUSER, direct connection. Tests only: arranges data and inspects results
    from outside RLS. No service ever connects this way."""
    get_settings()  # loads the repo .env
    password = os.environ.get("POSTGRES_PASSWORD")
    if not password:
        pytest.skip("POSTGRES_PASSWORD not set")
    port = os.environ.get("POSTGRES_HOST_PORT", "5432")
    host = os.environ.get("POSTGRES_TEST_HOST", "localhost")
    with psycopg.connect(f"postgresql://postgres:{password}@{host}:{port}/quantforge", autocommit=True) as c:
        yield c
