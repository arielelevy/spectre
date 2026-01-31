import logging
import json
import os
import socket
import time
from datetime import datetime, timezone
import redis

# Configuration
LOG_REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
LOG_QUEUE_KEY = os.getenv("LOG_QUEUE_KEY", "log:queue")
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
LOG_REDIS_ENABLED = os.getenv("LOG_REDIS_ENABLED", "true").lower() in {
    "1",
    "true",
    "yes",
}
LOG_REDIS_RETRY_SECONDS = int(os.getenv("LOG_REDIS_RETRY_SECONDS", "5"))
SERVICE_NAME = os.getenv("SERVICE_NAME", "unknown")
HOSTNAME = socket.gethostname()


class RedisHandler(logging.Handler):
    def __init__(self, redis_url: str, list_key: str):
        super().__init__()
        self.redis_client = redis.from_url(redis_url)
        self.list_key = list_key
        self._next_retry_at = 0.0

    def emit(self, record):
        now = time.time()
        if now < self._next_retry_at:
            return
        try:
            log_entry = {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "level": record.levelname,
                "service": SERVICE_NAME,
                "host": HOSTNAME,
                "module": record.module,
                "message": record.getMessage(),
                "path": record.pathname,
                "line": record.lineno,
            }
            if record.exc_info:
                log_entry["exception"] = self.format(record)

            self.redis_client.xadd(self.list_key, {"payload": json.dumps(log_entry)})
            self._next_retry_at = 0.0
        except (redis.ConnectionError, redis.TimeoutError, OSError) as exc:
            self._next_retry_at = now + LOG_REDIS_RETRY_SECONDS
            print(f"Redis logging error: {exc}")
        except Exception:
            self._next_retry_at = now + LOG_REDIS_RETRY_SECONDS
            print("Redis logging error")


def _resolve_level(level: int | str | None) -> int:
    if level is None:
        return logging.getLevelName(LOG_LEVEL)
    if isinstance(level, int):
        return level
    return logging.getLevelName(str(level).upper())


def configure_logging(service_name: str, level: int | str | None = None):
    global SERVICE_NAME
    SERVICE_NAME = service_name

    root_logger = logging.getLogger()
    resolved_level = _resolve_level(level)
    root_logger.setLevel(resolved_level)

    # Console Handler (Fallback/Dev)
    console_handler = logging.StreamHandler()

    class EmojiFormatter(logging.Formatter):
        def format(self, record: logging.LogRecord) -> str:
            icon = {
                "WARNING": "⚠️",
                "ERROR": "❗",
                "CRITICAL": "🔥",
            }.get(record.levelname, "")
            record.emoji_prefix = f"{icon}  " if icon else ""
            return super().format(record)

    formatter = EmojiFormatter(
        "%(asctime)s - %(name)s - %(levelname)s - %(emoji_prefix)s%(message)s"
    )
    console_handler.setFormatter(formatter)
    root_logger.addHandler(console_handler)

    # Redis Handler
    if LOG_REDIS_ENABLED and LOG_REDIS_URL:
        try:
            redis_handler = RedisHandler(LOG_REDIS_URL, LOG_QUEUE_KEY)
            root_logger.addHandler(redis_handler)
        except Exception as e:
            print(f"Failed to initialize Redis logging: {e}")

    handlers = list(root_logger.handlers)
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        uv_logger = logging.getLogger(name)
        uv_logger.handlers = handlers
        uv_logger.setLevel(resolved_level)
        uv_logger.propagate = False

    logging.info(f"Logging initialized for {service_name}")
