"""
Redis Service - Proxy to shared singleton.

Keeps batch imports consistent with local services module.
"""

from shared.services.redis_service import RedisService

__all__ = ["RedisService"]
