# C2.2.3 — Client Redis (asyncio) ; URL chargée depuis la config env (jamais en dur)
from redis.asyncio import Redis
from app.core.config import settings

_client: Redis | None = None


def get_redis() -> Redis:
    """Retourne un client Redis partagé (singleton paresseux, réponses décodées en str)."""
    global _client
    if _client is None:
        _client = Redis.from_url(settings.redis_url, decode_responses=True)
    return _client


async def close_redis() -> None:
    """Ferme proprement le client au shutdown (drainage du pool)."""
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None
