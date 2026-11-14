import time
from datetime import UTC, datetime

from workers.celery_app import app
from workers.jobs import JobContext, JobResult, run_job


def ping_handler(ctx: JobContext) -> JobResult:
    """Diagnostic job: runs for `durationSec`, heartbeating, so the whole pipeline can be observed."""
    duration = float(ctx.payload.get("durationSec", 3))
    if not 0 <= duration <= 60:
        raise ValueError(f"durationSec out of range: {duration}")
    started = time.monotonic()
    while (elapsed := time.monotonic() - started) < duration:
        ctx.heartbeat(100 * elapsed / duration)
        time.sleep(0.1)
    finished = datetime.now(UTC).isoformat()
    return JobResult(result={"pong": True, "durationSec": duration, "finishedAt": finished})


@app.task(name="qf.system.ping")
def ping(payload: object) -> None:
    run_job(payload, ping_handler)
