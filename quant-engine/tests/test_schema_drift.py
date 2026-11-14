"""ADR-003: fail if the Prisma-migrated schema no longer matches what the workers declare."""

import psycopg
import pytest
from sqlalchemy import create_engine, inspect, types

from app.core.config import get_settings, sqlalchemy_url
from app.db.tables import metadata

# Postgres enums reflect as ENUM; we read them as text.
COMPATIBLE: dict[type, tuple[type, ...]] = {
    types.Text: (types.Text, types.String, types.Enum),
    types.Numeric: (types.Numeric,),
    types.Integer: (types.Integer,),
    types.Boolean: (types.Boolean,),
    types.DateTime: (types.DateTime,),
}


@pytest.mark.parametrize("table", sorted(metadata.tables))
def test_declared_columns_exist_with_compatible_types(table: str, admin_conn: psycopg.Connection) -> None:
    url = get_settings().dispatcher_database_url
    assert url is not None
    insp = inspect(create_engine(sqlalchemy_url(url)))
    actual = {c["name"]: c for c in insp.get_columns(table)}
    for col in metadata.tables[table].columns:
        assert col.name in actual, f"{table}.{col.name} is declared in tables.py but missing in the database"
        db_type = actual[col.name]["type"]
        declared = type(col.type)
        allowed = next((v for k, v in COMPATIBLE.items() if issubclass(declared, k)), (declared,))
        assert isinstance(db_type, allowed) or type(db_type).__name__ == declared.__name__, (
            f"{table}.{col.name}: declared {declared.__name__}, database has {type(db_type).__name__}"
        )
        if not col.nullable:
            assert not actual[col.name]["nullable"], f"{table}.{col.name} is nullable in the database"
