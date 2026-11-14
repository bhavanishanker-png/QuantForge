import os

DATABASE_URL = os.environ["DATABASE_URL"]
REDIS_URL = os.environ["REDIS_URL"]
HEARTBEAT_EVERY_S = float(os.getenv("HEARTBEAT_EVERY_S", "15"))
STALE_AFTER_S = float(os.getenv("STALE_AFTER_S", "90"))
REAPER_EVERY_S = float(os.getenv("REAPER_EVERY_S", "30"))
VISIBILITY_TIMEOUT_S = int(os.getenv("VISIBILITY_TIMEOUT_S", "3600"))
BACKOFF_BASE_S = float(os.getenv("BACKOFF_BASE_S", "2"))
MAX_DISPATCH_ATTEMPTS = 5
