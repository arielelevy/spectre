"""Redis pub/sub log subscriber."""

import json
import threading
from typing import Callable, List, Optional
from dataclasses import dataclass
from queue import Queue, Empty


@dataclass
class LogLine:
    """A parsed log line."""

    source: str
    timestamp: str
    level: str
    logger_name: str
    message: str
    raw: str


class RedisLogSubscriber:
    """
    Tails a Redis stream for log streaming.

    Runs polling in a background thread and queues messages
    for the main thread to consume.
    """

    def __init__(self, redis_url: str, stream_key: str, sources: List[str]):
        """
        Initialize subscriber.

        Args:
            redis_url: Redis connection URL
            stream_key: Redis stream key (e.g., 'log:queue')
            sources: List of sources to include (e.g., ['backend', 'batch-worker'])
        """
        self.redis_url = redis_url
        self.stream_key = stream_key
        self.sources = set(sources)
        self.queue: Queue[LogLine] = Queue(maxsize=1000)
        self._running = False
        self._thread: Optional[threading.Thread] = None
        self._pubsub = None
        self._last_id = "0-0"

    def start(self):
        """Start the subscriber in a background thread."""
        if self._running:
            return

        self._running = True
        self._thread = threading.Thread(target=self._subscribe_loop, daemon=True)
        self._thread.start()

    def stop(self):
        """Stop the subscriber."""
        self._running = False
        self._pubsub = None

    def _subscribe_loop(self):
        """Background thread that tails Redis stream."""
        import redis
        from urllib.parse import urlparse

        try:
            parsed = urlparse(self.redis_url)
            # Force IPv4 - 'localhost' may resolve to IPv6 which port-forward doesn't support
            host = parsed.hostname or "localhost"
            if host == "localhost":
                host = "127.0.0.1"
            client = redis.Redis(
                host=host,
                port=parsed.port or 6379,
                db=int(parsed.path.lstrip("/") or 0),
                decode_responses=True,
                protocol=2,
            )
            while self._running:
                try:
                    response = client.xread(
                        {self.stream_key: self._last_id}, count=200, block=1000
                    )
                    if not response:
                        continue
                    for _, entries in response:
                        for entry_id, fields in entries:
                            payload = fields.get("payload")
                            if not payload:
                                continue
                            try:
                                data = json.loads(payload)
                            except json.JSONDecodeError:
                                continue

                            source = data.get(
                                "service", data.get("component", "unknown")
                            )
                            normalized_source = source
                            if self.sources:
                                if source in self.sources:
                                    normalized_source = source
                                elif "backend" in source and "backend" in self.sources:
                                    normalized_source = "backend"
                                elif (
                                    "batch" in source and "batch-worker" in self.sources
                                ):
                                    normalized_source = "batch-worker"
                                elif "ray" in source and "ray" in self.sources:
                                    normalized_source = "ray"
                                else:
                                    continue

                            log_line = LogLine(
                                source=normalized_source,
                                timestamp=data.get("timestamp", ""),
                                level=data.get("level", "INFO"),
                                logger_name=data.get("module", data.get("logger", "")),
                                message=data.get("message", ""),
                                raw=payload,
                            )

                            if self.queue.full():
                                try:
                                    self.queue.get_nowait()
                                except Empty:
                                    pass
                            self.queue.put_nowait(log_line)
                            self._last_id = entry_id

                except Exception:
                    pass

        except Exception as e:
            # Connection error - will be handled by monitor
            pass
        finally:
            self._running = False

    def get_new_lines(self) -> List[LogLine]:
        """Get all new log lines from the queue (non-blocking)."""
        lines = []
        while True:
            try:
                line = self.queue.get_nowait()
                lines.append(line)
            except Empty:
                break
        return lines

    @property
    def is_running(self) -> bool:
        return self._running
