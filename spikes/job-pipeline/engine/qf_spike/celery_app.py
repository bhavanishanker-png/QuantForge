from celery import Celery

from .config import REDIS_URL, VISIBILITY_TIMEOUT_S

app = Celery("qf", broker=REDIS_URL, include=["qf_spike.tasks"])
app.conf.update(
    task_acks_late=True,                 # ack only after the task finishes
    task_reject_on_worker_lost=True,     # killed worker -> message is redelivered
    task_acks_on_failure_or_timeout=True,
    worker_prefetch_multiplier=1,
    broker_transport_options={"visibility_timeout": VISIBILITY_TIMEOUT_S},
    task_default_queue="default",
    task_serializer="json",
    accept_content=["json"],
    broker_connection_retry_on_startup=True,
)
