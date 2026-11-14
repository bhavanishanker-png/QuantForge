"""SQLAlchemy Core views of tables Prisma owns (ADR-003). Python never runs DDL.

tests/test_schema_drift.py reflects the migrated database and fails if anything declared here is
missing or has a different type, so a Prisma migration can't silently break the workers.
"""

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Integer,
    MetaData,
    Numeric,
    Table,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID

metadata = MetaData()

background_jobs = Table(
    "background_jobs",
    metadata,
    Column("id", UUID, primary_key=True),
    Column("workspace_id", UUID, nullable=False),
    Column("type", Text, nullable=False),
    Column("status", Text, nullable=False),  # enum JobStatus; compared as text
    Column("payload", JSONB, nullable=False),
    Column("result", JSONB),
    Column("progress", Numeric(5, 2), nullable=False),
    Column("attempt", Integer, nullable=False),
    Column("max_attempts", Integer, nullable=False),
    Column("cancel_requested", Boolean, nullable=False),
    Column("heartbeat_at", DateTime(timezone=True)),
    Column("error_code", Text),
    Column("error_message", Text),
    Column("started_at", DateTime(timezone=True)),
    Column("finished_at", DateTime(timezone=True)),
)

outbox_events = Table(
    "outbox_events",
    metadata,
    Column("id", UUID, primary_key=True),
    Column("workspace_id", UUID, nullable=False),
    Column("job_id", UUID, nullable=False),
    Column("event_type", Text, nullable=False),
    Column("payload", JSONB, nullable=False),
    Column("status", Text, nullable=False),  # enum OutboxStatus
    Column("attempts", Integer, nullable=False),
    Column("available_at", DateTime(timezone=True), nullable=False),
    Column("claimed_until", DateTime(timezone=True)),
    Column("last_error", Text),
    Column("created_at", DateTime(timezone=True), nullable=False),
    Column("published_at", DateTime(timezone=True)),
)
