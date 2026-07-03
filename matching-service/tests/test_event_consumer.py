# C2.2.2 — Le consumer bump la version du cache sur les événements pertinents, ignore les autres
import asyncio
import pytest
from unittest.mock import AsyncMock, patch
from app.services import event_consumer


@pytest.mark.asyncio
async def test_gear_validated_bumps_version():
    redis = AsyncMock()
    with patch("app.services.event_consumer.get_redis", return_value=redis):
        await event_consumer.process_event({"type": "gear.validated", "gearId": "g1"})
    redis.incr.assert_awaited_once_with("match:version")


@pytest.mark.asyncio
async def test_gear_rejected_bumps_version():
    redis = AsyncMock()
    with patch("app.services.event_consumer.get_redis", return_value=redis):
        await event_consumer.process_event({"type": "gear.rejected", "gearId": "g2"})
    redis.incr.assert_awaited_once_with("match:version")


@pytest.mark.asyncio
async def test_unknown_event_is_ignored():
    redis = AsyncMock()
    with patch("app.services.event_consumer.get_redis", return_value=redis):
        await event_consumer.process_event({"type": "something.else"})
    redis.incr.assert_not_awaited()


@pytest.mark.asyncio
async def test_missing_type_is_ignored():
    redis = AsyncMock()
    with patch("app.services.event_consumer.get_redis", return_value=redis):
        await event_consumer.process_event({"gearId": "g3"})
    redis.incr.assert_not_awaited()


@pytest.mark.asyncio
async def test_consume_loop_stops_on_event():
    # C2.2.2 — Vérifie que consume_loop s'arrête proprement quand stop_event est levé
    stop = asyncio.Event()
    redis = AsyncMock()
    redis.xreadgroup.return_value = []  # aucun message
    with patch("app.services.event_consumer.get_redis", return_value=redis):
        task = asyncio.create_task(event_consumer.consume_loop(stop))
        await asyncio.sleep(0.05)
        stop.set()
        await asyncio.wait_for(task, timeout=3)  # se termine proprement
