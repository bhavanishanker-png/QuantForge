"""Publish invalidation events for the NestJS Socket.IO relay (ADR-004). Call ONLY after commit."""
import json
import time

import redis

from .config import REDIS_URL

_r = redis.Redis.from_url(REDIS_URL)


def publish_job_updated(workspace_id: str, job_id: str, status: str, progress: float) -> None:
    _r.publish(
        f"qf:events:{workspace_id}",
        json.dumps({"type": "job.updated", "jobId": job_id, "status": status,
                    "progress": progress, "ts": time.time()}),
    )
