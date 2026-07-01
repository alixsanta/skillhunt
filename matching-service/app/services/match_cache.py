# C2.2.3 — Cache des résultats /match : clé versionnée, JSON simple, dégradation gracieuse
import hashlib
import json
import logging
from app.db.redis import get_redis
from app.core.config import settings
from app.models.schemas import MatchRequest, MatchResult

logger = logging.getLogger(__name__)

_VERSION_KEY = "match:version"


async def current_version() -> int:
    """Version courante du cache (compteur incrémenté à chaque événement d'invalidation)."""
    redis = get_redis()
    raw = await redis.get(_VERSION_KEY)
    return int(raw) if raw is not None else 0


def build_cache_key(version: int, request: MatchRequest) -> str:
    """Clé déterministe : la version en préfixe rend obsolète tout cache antérieur."""
    # tri des clés → sérialisation canonique (indépendante de l'ordre)
    canonical = json.dumps(request.model_dump(), sort_keys=True, separators=(",", ":"))
    digest = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    return f"match:v{version}:{digest}"


async def get_cached(request: MatchRequest) -> list[MatchResult] | None:
    """Retourne les résultats en cache, ou None (miss ou Redis indisponible)."""
    try:
        redis = get_redis()
        version = await current_version()
        raw = await redis.get(build_cache_key(version, request))
        if raw is None:
            return None
        return [MatchResult(**item) for item in json.loads(raw)]
    except Exception as exc:  # dégradation : le scoring sera recalculé
        logger.warning("Cache /match indisponible (lecture) : %s", exc)
        return None


async def set_cached(request: MatchRequest, results: list[MatchResult]) -> None:
    """Écrit les résultats avec TTL ; silencieux si Redis indisponible."""
    try:
        redis = get_redis()
        version = await current_version()
        payload = json.dumps([r.model_dump(mode="json") for r in results])
        await redis.setex(build_cache_key(version, request), settings.match_cache_ttl, payload)
    except Exception as exc:
        logger.warning("Cache /match indisponible (écriture) : %s", exc)
