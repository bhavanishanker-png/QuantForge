from celery import Celery

from app.core.config import get_settings
from app.core.logging import configure_logging

configure_logging("worker")
_s = get_settings()

app = Celery("quantforge", broker=str(_s.redis_queue_url), include=["workers.tasks.system"])
app.conf.update(
    task_acks_late=True,  # ack only after the task finishes...
    task_reject_on_worker_lost=True,  # ...so a killed worker's message is redelivered
    task_acks_on_failure_or_timeout=True,
    worker_prefetch_multiplier=1,
    # Keep above the longest task time limit, or long tasks get redelivered while running
    # (harmless thanks to the idempotent claim, but wasteful). Spike 2 finding 6.
    broker_transport_options={"visibility_timeout": _s.visibility_timeout_s},
    task_default_queue="default",
    task_serializer="json",
    accept_content=["json"],
    result_backend=None,
    task_ignore_result=True,
    broker_connection_retry_on_startup=True,
    worker_hijack_root_logger=False,
)
