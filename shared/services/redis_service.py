"""
Redis Service - Singleton client with connection pooling.

Shared between backend and batch workers. Supports both lazy and eager
initialization modes:

- Backend: Lazy initialization (connects on first use, raises if unavailable)
- Batch: Eager initialization (connects at startup, waits for sidecar)

Usage:
    from shared.services.redis_service import RedisService

    # Get singleton (lazy by default)
    redis = RedisService.get_instance()
    redis.client.set("key", "value")

    # Force eager connection (for batch workers)
    redis = RedisService.get_instance(eager=True)
"""

import json
import logging
import os
import time
from typing import Optional

import redis

logger = logging.getLogger(__name__)

# Connection retry configuration
REDIS_STARTUP_TIMEOUT = 30  # Max wait for eager mode
REDIS_RETRY_INTERVAL = 1  # Seconds between retries


class RedisService:
    """
    Singleton Redis client with connection pooling.

    Supports two initialization modes:
    - lazy (default): Connects on first client access, raises if unavailable
    - eager: Connects immediately, raises if Redis unavailable
    """

    _instance: Optional["RedisService"] = None
    _client: Optional[redis.Redis] = None
    _connected: bool = False

    def __init__(self, eager: bool = False, pool_size: int | None = None):
        """
        Initialize Redis service.

        Args:
            eager: If True, connect immediately and wait for Redis.
                   If False, defer connection to first use.
            pool_size: Override default pool size. If None, calculated automatically.
        """
        self._redis_url = os.getenv("REDIS_URL")
        if not self._redis_url:
            raise ValueError("REDIS_URL environment variable required")

        # Calculate pool size
        if pool_size is None:
            worker_concurrency = os.getenv("WORKER_CONCURRENCY")
            if not worker_concurrency:
                raise ValueError("WORKER_CONCURRENCY environment variable is required")
            worker_count = int(worker_concurrency)
            queue_count = 3  # document_models, document_measures, embeddings
            pool_size = max(20, (worker_count * queue_count * 3) + 10)

        self._pool_size = pool_size
        self._eager = eager

        if eager:
            self._connect_eager()
        else:
            logger.info("RedisService initialized (lazy - connects on first use)")

    def _connect_eager(self) -> None:
        """Connect immediately and wait for Redis to be ready."""
        self._create_client()
        start_time = time.time()
        last_error = None

        while time.time() - start_time < REDIS_STARTUP_TIMEOUT:
            try:
                client = self._client
                if client is None:
                    raise ConnectionError("Redis client not initialized")
                client.ping()
                self._connected = True
                logger.info("Redis connected (pool_size=%s)", self._pool_size)
                return
            except redis.ConnectionError as exc:
                last_error = exc
                elapsed = int(time.time() - start_time)
                logger.warning("Waiting for Redis... (%ss)", elapsed)
                time.sleep(REDIS_RETRY_INTERVAL)

        raise ConnectionError(
            f"Redis not available after {REDIS_STARTUP_TIMEOUT}s: {last_error}"
        )

    def _connect_lazy(self) -> None:
        """Connect on first use, raises if unavailable."""
        self._create_client()
        last_error = None

        for attempt in range(10):
            try:
                client = self._client
                if client is None:
                    raise ConnectionError("Redis client not initialized")
                client.ping()
                self._connected = True
                logger.info("Redis connected (lazy)")
                return
            except redis.ConnectionError as exc:
                last_error = exc
                if attempt < 9:
                    logger.warning("Waiting for Redis... (%ss)", attempt)
                    time.sleep(REDIS_RETRY_INTERVAL)

        raise ConnectionError(f"Redis not available after 10 attempts: {last_error}")

    def _create_client(self) -> None:
        """Create Redis client with connection pool."""
        self._client = redis.Redis.from_url(
            self._redis_url,
            decode_responses=True,
            max_connections=self._pool_size,
            socket_timeout=30,  # Increased to allow for blocking operations (5s block time)
            socket_connect_timeout=2,
            retry_on_timeout=True,
        )

    @property
    def client(self) -> redis.Redis:
        """Get Redis client, connecting if needed. Raises if unavailable."""
        if self._client is None and not self._connected:
            self._connect_lazy()
        client = self._client
        if client is None:
            raise ConnectionError("Redis client not initialized")
        return client

    @property
    def is_available(self) -> bool:
        """Check if Redis is available."""
        return self._connected and self._client is not None

    @classmethod
    def get_instance(
        cls, eager: bool = False, pool_size: int | None = None
    ) -> "RedisService":
        """
        Get or create singleton instance.

        Args:
            eager: If True and creating new instance, connect immediately.
            pool_size: Override pool size for new instance.
        """
        if cls._instance is None:
            cls._instance = cls(eager=eager, pool_size=pool_size)
        return cls._instance

    @classmethod
    def reset_instance(cls) -> None:
        """Reset singleton (for testing)."""
        if cls._instance is not None:
            try:
                if cls._instance._client:
                    cls._instance._client.close()
            except Exception:
                pass
            cls._instance = None
            cls._client = None
            cls._connected = False

    def health_check(self) -> bool:
        """Check if Redis connection is healthy."""
        try:
            if self.client:
                self.client.ping()
                return True
            return False
        except Exception as exc:
            logger.error("Redis health check failed: %s", exc)
            return False

    def close(self) -> None:
        """Close Redis connection."""
        try:
            if self._client:
                self._client.close()
                self._client = None
                self._connected = False
            logger.info("Redis connection closed")
        except Exception as exc:
            logger.error("Error closing Redis: %s", exc)

    # =========================================================================
    # Cache Methods
    # =========================================================================

    def cache_get(self, key: str) -> Optional[dict]:
        """Get cached value as dict. Returns None if not found."""
        data = self.client.get(f"cache:{key}")
        if data is not None:
            return json.loads(str(data))
        return None

    def cache_set(self, key: str, value: dict, ttl_seconds: int = 1800) -> bool:
        """Set cached value with TTL."""
        self.client.setex(f"cache:{key}", ttl_seconds, json.dumps(value))
        return True

    def cache_delete(self, key: str) -> bool:
        """Delete cached value."""
        self.client.delete(f"cache:{key}")
        return True

    def cache_invalidate_session(self, session_id: str) -> bool:
        """Invalidate session cache."""
        return self.cache_delete(f"session:{session_id}")
