"""
Enterprise Caching Layer
Redis-backed cache with multi-level support, invalidation, and serialization.
"""
from __future__ import annotations

import json
import pickle
from typing import Any, Callable, Dict, Optional, TypeVar, Union
from datetime import timedelta

import redis.asyncio as aioredis

from app.core.config import settings

T = TypeVar("T")

# ── Cache Serializer ────────────────────────────────────────────────────────


class CacheSerializer:
    """Serialize/deserialize cache values."""

    @staticmethod
    def serialize(value: Any) -> str:
        return json.dumps(value, default=str)

    @staticmethod
    def deserialize(value: str) -> Any:
        return json.loads(value)


# ── Redis Cache ─────────────────────────────────────────────────────────────


class RedisCache:
    """Redis-backed cache with connection pooling."""

    def __init__(self, redis_url: Optional[str] = None):
        self._redis_url = redis_url or settings.redis_url
        self._redis: Optional[aioredis.Redis] = None
        self._prefix = settings.CACHE_PREFIX
        self._default_ttl = settings.CACHE_TTL

    async def connect(self) -> None:
        """Connect to Redis."""
        if self._redis is None:
            self._redis = aioredis.from_url(
                self._redis_url,
                encoding="utf-8",
                decode_responses=True,
                socket_connect_timeout=settings.REDIS_TIMEOUT,
                socket_keepalive=True,
                health_check_interval=30,
            )
            await self._redis.ping()

    async def disconnect(self) -> None:
        """Disconnect from Redis."""
        if self._redis:
            await self._redis.close()
            self._redis = None

    def _key(self, key: str) -> str:
        return f"{self._prefix}{key}"

    async def get(self, key: str, default: Any = None) -> Any:
        """Get a value from cache."""
        if not self._redis:
            return default
        try:
            value = await self._redis.get(self._key(key))
            if value is None:
                return default
            return CacheSerializer.deserialize(value)
        except Exception:
            return default

    async def set(
        self,
        key: str,
        value: Any,
        ttl: Optional[int] = None,
    ) -> bool:
        """Set a value in cache with optional TTL."""
        if not self._redis:
            return False
        try:
            serialized = CacheSerializer.serialize(value)
            ttl = ttl or self._default_ttl
            return bool(await self._redis.setex(self._key(key), ttl, serialized))
        except Exception:
            return False

    async def delete(self, key: str) -> bool:
        """Delete a key from cache."""
        if not self._redis:
            return False
        try:
            return bool(await self._redis.delete(self._key(key)))
        except Exception:
            return False

    async def exists(self, key: str) -> bool:
        """Check if a key exists."""
        if not self._redis:
            return False
        try:
            return bool(await self._redis.exists(self._key(key)))
        except Exception:
            return False

    async def clear_pattern(self, pattern: str) -> int:
        """Clear all keys matching a pattern."""
        if not self._redis:
            return 0
        try:
            cursor = 0
            deleted = 0
            while True:
                cursor, keys = await self._redis.scan(cursor, match=self._key(pattern), count=100)
                if keys:
                    await self._redis.delete(*keys)
                    deleted += len(keys)
                if cursor == 0:
                    break
            return deleted
        except Exception:
            return 0

    async def clear_all(self) -> bool:
        """Clear all cached data."""
        if not self._redis:
            return False
        try:
            await self._redis.flushdb()
            return True
        except Exception:
            return False

    async def get_or_set(
        self,
        key: str,
        factory: Callable[[], T],
        ttl: Optional[int] = None,
    ) -> T:
        """Get a value from cache or compute and cache it."""
        cached = await self.get(key)
        if cached is not None:
            return cached
        value = factory()
        if hasattr(value, "__await__"):
            import asyncio
            value = await value
        await self.set(key, value, ttl)
        return value

    async def increment(self, key: str, amount: int = 1) -> int:
        """Increment a counter."""
        if not self._redis:
            return 0
        try:
            return await self._redis.incr(self._key(key), amount)
        except Exception:
            return 0

    async def expire(self, key: str, ttl: int) -> bool:
        """Set expiration on a key."""
        if not self._redis:
            return False
        try:
            return bool(await self._redis.expire(self._key(key), ttl))
        except Exception:
            return False

    async def ttl(self, key: str) -> int:
        """Get TTL of a key."""
        if not self._redis:
            return -2
        try:
            return await self._redis.ttl(self._key(key))
        except Exception:
            return -2

    @property
    def client(self) -> Optional[aioredis.Redis]:
        return self._redis


# ── Null Cache (disabled caching) ───────────────────────────────────────────


class NullCache:
    """No-op cache for when caching is disabled."""

    async def connect(self) -> None:
        pass

    async def disconnect(self) -> None:
        pass

    async def get(self, key: str, default: Any = None) -> Any:
        return default

    async def set(self, key: str, value: Any, ttl: Optional[int] = None) -> bool:
        return True

    async def delete(self, key: str) -> bool:
        return True

    async def exists(self, key: str) -> bool:
        return False

    async def clear_pattern(self, pattern: str) -> int:
        return 0

    async def clear_all(self) -> bool:
        return True

    async def increment(self, key: str, amount: int = 1) -> int:
        return 0

    async def expire(self, key: str, ttl: int) -> bool:
        return True


# ── Cache Factory ────────────────────────────────────────────────────────────


def create_cache() -> Union[RedisCache, NullCache]:
    """Create cache instance based on configuration."""
    if settings.CACHE_ENABLED:
        return RedisCache()
    return NullCache()


cache: Union[RedisCache, NullCache] = create_cache()
