import asyncio
import logging
import os
from contextlib import asynccontextmanager
from collections.abc import AsyncIterator
from fastapi import FastAPI
from app.db.database import engine
from app.db.redis import close_redis
from app.services.event_consumer import consume_loop
from app.routers import health, matching
from app.observability.logging_config import configure_logging
from app.observability.metrics import setup_metrics
from app.observability.request_id import RequestIdMiddleware

# SH-29 — logs JSON AVANT toute autre initialisation : les lignes émises pendant
# l'amorçage (connexion aux bases, démarrage du consumer) sont précisément celles qui
# comptent quand le service ne démarre pas. Les laisser en texte libre les rendrait
# inexploitables par Loki au pire moment.
configure_logging(os.getenv("LOG_LEVEL", "INFO"))

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    # SH-14 — démarre le consumer d'événements (invalidation du cache /match)
    stop_event = asyncio.Event()
    consumer_task = asyncio.create_task(consume_loop(stop_event))
    try:
        yield
    finally:
        # C2.2.3 — arrêt propre : signale l'arrêt, attend la tâche, draine les pools.
        # Dégradation gracieuse (D5) : si le consumer est mort (Redis indisponible au
        # démarrage), on logue son exception sans interrompre le drainage des pools.
        stop_event.set()
        try:
            await consumer_task
        except Exception:
            logger.exception("Consumer d'événements terminé en erreur")
        await close_redis()
        await engine.dispose()


app = FastAPI(
    title="SkillHunt — Matching Service",
    description="Microservice de scoring multicritères (Skills + Matériel + Localisation)",
    version="0.1.0",
    lifespan=lifespan,
)

# Corrélation inter-services (SH-29) : reprend le X-Request-Id posé par le backend-core
# et relayé par son proxy de matching. C'est la clé de jointure des deux journaux.
app.add_middleware(RequestIdMiddleware)

# Métriques Prometheus + /metrics (réseau privé uniquement, cf. app/observability/metrics.py)
setup_metrics(app)

app.include_router(health.router)
app.include_router(matching.router)
