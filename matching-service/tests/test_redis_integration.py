# C2.2.2 — Intégration Redis réelle : publish → consumer bump version → ancien cache inatteignable
import os
import pytest
from app.db.redis import get_redis, close_redis
from app.services import event_consumer, match_cache
from app.models.schemas import MatchRequest, MatchResult

pytestmark = pytest.mark.skipif(
    not os.getenv("REDIS_URL"), reason="Redis non disponible (test d'intégration)"
)

REQ = MatchRequest(skills=["DRONE"], location=(43.6, 1.44), radius_km=50.0)


@pytest.mark.asyncio
async def test_event_invalidates_cache_end_to_end():
    redis = get_redis()
    await redis.flushdb()

    # 1) on cache un résultat à la version courante
    results = [MatchResult(freelance_id="123e4567-e89b-12d3-a456-426614174000", score=0.9, distance_km=2.0)]
    await match_cache.set_cached(REQ, results)
    assert await match_cache.get_cached(REQ) is not None

    # 2) un événement gear.validated bump la version → l'ancien cache n'est plus servi
    await event_consumer.process_event({"type": "gear.validated", "gearId": "g1"})
    assert await match_cache.get_cached(REQ) is None

    await redis.flushdb()
    await close_redis()


@pytest.mark.asyncio
async def test_consumer_reads_published_event():
    redis = get_redis()
    await redis.flushdb()
    await event_consumer.ensure_group()

    await redis.xadd(event_consumer.STREAM_KEY, {"type": "gear.validated", "gearId": "g2"})
    response = await redis.xreadgroup(
        event_consumer.GROUP, "test-consumer", {event_consumer.STREAM_KEY: ">"}, count=1
    )
    assert response  # l'événement est lisible par le groupe

    await redis.flushdb()
    await close_redis()
