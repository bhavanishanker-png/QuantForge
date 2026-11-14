import logging
import sys

import structlog

from app.core.config import get_settings


def configure_logging(service: str) -> None:
    s = get_settings()
    level = getattr(logging, s.log_level.upper(), logging.INFO)
    renderer: structlog.types.Processor = (
        structlog.processors.JSONRenderer() if s.log_json else structlog.dev.ConsoleRenderer()
    )
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso", utc=True),
            structlog.processors.format_exc_info,
            renderer,
        ],
        wrapper_class=structlog.make_filtering_bound_logger(level),
        logger_factory=structlog.PrintLoggerFactory(sys.stdout),
    )
    structlog.contextvars.bind_contextvars(service=service)
    logging.basicConfig(level=level, stream=sys.stdout, format="%(message)s")
