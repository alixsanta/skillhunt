import logging

from fastapi import APIRouter, Response, status
from sqlalchemy import text

from app.db.database import engine
from app.db.redis import get_redis
from app.models.schemas import HealthResponse, ReadinessResponse

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Health"])


@router.get(
    "/health",
    response_model=HealthResponse,
    summary="Vérification de l'état du service",
)
async def health_check() -> HealthResponse:
    """Sonde de VIVACITÉ (S1, SH-29).

    Volontairement triviale : elle répond « le processus tourne ». N'y ajouter aucune
    dépendance — un incident PostgreSQL ferait sinon redémarrer en boucle un service
    pourtant sain, transformant une panne partielle en panne totale.
    """
    return HealthResponse(status="ok", service="matching-service")


@router.get(
    "/health/ready",
    response_model=ReadinessResponse,
    summary="Disponibilité du service et de ses dépendances",
    responses={503: {"description": "Au moins une dépendance est indisponible"}},
)
async def readiness_check(response: Response) -> ReadinessResponse:
    """Sonde de DISPONIBILITÉ (S1, SH-29).

    Interroge PostgreSQL/PostGIS et Redis. Répond **503** dès qu'une dépendance tombe :
    c'est ce qui rend l'indisponibilité mesurable par Prometheus, donc alertable. Un
    service qui répond 200 alors que sa base est tombée est invisible pour la supervision.
    """
    postgres = await _probe_postgres()
    redis_state = await _probe_redis()

    degraded = "down" in (postgres, redis_state)
    if degraded:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    return ReadinessResponse(
        status="degraded" if degraded else "ok",
        service="matching-service",
        dependencies={"postgres": postgres, "redis": redis_state},
    )


async def _probe_postgres() -> str:
    try:
        async with engine.connect() as connection:
            await connection.execute(text("SELECT 1"))
        return "up"
    except Exception:
        # Une sonde ne propage JAMAIS : elle rendrait 500 au lieu de 503, et la
        # supervision lirait « erreur applicative » là où il s'agit d'une dépendance
        # absente — mauvais diagnostic, donc mauvaise remédiation.
        logger.warning("Sonde PostgreSQL en échec", exc_info=True)
        return "down"


async def _probe_redis() -> str:
    try:
        await get_redis().ping()
        return "up"
    except Exception:
        logger.warning("Sonde Redis en échec", exc_info=True)
        return "down"
