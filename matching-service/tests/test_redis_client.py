# C2.2.2 — Le client Redis est un singleton paresseux, réutilisé entre appels
from app.db import redis as redis_module


def test_get_redis_returns_singleton():
    redis_module._client = None  # reset de l'état module
    a = redis_module.get_redis()
    b = redis_module.get_redis()
    assert a is b
    assert a.connection_pool.connection_kwargs.get("decode_responses") is True
