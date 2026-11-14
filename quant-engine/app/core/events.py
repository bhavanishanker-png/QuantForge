"""Invalidation events for the NestJS Socket.IO relay (ADR-004). Publish ONLY after commit."""

import json
import time
from functools import lru_cache

import redis

from app.core.config import get_settings


@lru_cache
def _client() -> redis.Redis:
    return redis.Redis.from_url(str(get_settings().redis_queue_url))


def publish_job_updated(workspace_id: str, job_id: str, status: str, progress: float) -> None:
    _client().publish(
        f"qf:events:{workspace_id}",
        json.dumps(
            {
                "type": "job.updated",
                "jobId": job_id,
                "status": status,
                "progress": progress,
                "ts": time.time(),
            }
        ),
    )
