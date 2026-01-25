import logging
import json
import os
import socket
from datetime import datetime, timezone
import redis

# Configuration
LOG_REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
LOG_QUEUE_KEY = os.getenv("LOG_QUEUE_KEY", "log:queue")
SERVICE_NAME = os.getenv("SERVICE_NAME", "unknown")
HOSTNAME = socket.gethostname()

class RedisHandler(logging.Handler):
    def __init__(self, redis_url: str, list_key: str):
        super().__init__()
        self.redis_client = redis.from_url(redis_url)
        self.list_key = list_key

    def emit(self, record):
        try:
            log_entry = {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "level": record.levelname,
                "service": SERVICE_NAME,
                "host": HOSTNAME,
                "module": record.module,
                "message": record.getMessage(),
                "path": record.pathname,
                "line": record.lineno
            }
            if record.exc_info:
                log_entry["exception"] = self.format(record)
            
            self.redis_client.rpush(self.list_key, json.dumps(log_entry))
        except Exception:
            self.handleError(record)

def configure_logging(service_name: str, level=logging.INFO):
    global SERVICE_NAME
    SERVICE_NAME = service_name
    
    root_logger = logging.getLogger()
    root_logger.setLevel(level)
    
    # Console Handler (Fallback/Dev)
    console_handler = logging.StreamHandler()
    formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
    console_handler.setFormatter(formatter)
    root_logger.addHandler(console_handler)
    
    # Redis Handler
    try:
        redis_handler = RedisHandler(LOG_REDIS_URL, LOG_QUEUE_KEY)
        root_logger.addHandler(redis_handler)
    except Exception as e:
        print(f"Failed to initialize Redis logging: {e}")

    logging.info(f"Logging initialized for {service_name}")
