# C2.2.2 — Cache /match : clé déterministe versionnée + dégradation gracieuse si Redis down
import pytest
from unittest.mock import AsyncMock, patch
from app.models.schemas import MatchRequest, MatchResult
from app.services import match_cache

REQ = MatchRequest(skills=["DRONE"], location=(43.6, 1.44), radius_km=50.0)


def test_build_cache_key_is_deterministic_and_versioned():
    k1 = match_cache.build_cache_key(3, REQ)
    k2 = match_cache.build_cache_key(3, REQ)
    assert k1 == k2
    assert k1.startswith("match:v3:")
    # une version différente change la clé (invalidation globale)
    assert match_cache.build_cache_key(4, REQ) != k1


@pytest.mark.asyncio
async def test_get_cached_miss_returns_none():
    redis = AsyncMock()
    redis.get.return_value = None  # version absente puis clé absente
    with patch("app.services.match_cache.get_redis", return_value=redis):
        assert await match_cache.get_cached(REQ) is None


@pytest.mark.asyncio
async def test_set_then_get_roundtrip():
    store: dict[str, str] = {}
    redis = AsyncMock()
    redis.get.side_effect = lambda k: store.get(k)

    async def fake_setex(k, ttl, v):
        store[k] = v
    redis.setex.side_effect = fake_setex

    results = [MatchResult(freelance_id="123e4567-e89b-12d3-a456-426614174000", score=0.9, distance_km=3.0)]
    with patch("app.services.match_cache.get_redis", return_value=redis):
        await match_cache.set_cached(REQ, results)
        cached = await match_cache.get_cached(REQ)
    assert cached is not None
    assert cached[0].score == pytest.approx(0.9)


@pytest.mark.asyncio
async def test_get_cached_degrades_to_none_on_redis_error():
    redis = AsyncMock()
    redis.get.side_effect = ConnectionError("Redis down")
    with patch("app.services.match_cache.get_redis", return_value=redis):
        assert await match_cache.get_cached(REQ) is None  # pas d'exception propagée
