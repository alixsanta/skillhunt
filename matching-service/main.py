import asyncio
from contextlib import asynccontextmanager
from collections.abc import AsyncIterator
from fastapi import FastAPI
from app.db.database import engine
from app.db.redis import close_redis
from app.services.event_consumer import consume_loop
from app.routers import health, matching


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    # SH-14 — démarre le consumer d'événements (invalidation du cache /match)
    stop_event = asyncio.Event()
    consumer_task = asyncio.create_task(consume_loop(stop_event))
    try:
        yield
    finally:
        # C2.2.3 — arrêt propre : signale l'arrêt, attend la tâche, draine les pools
        stop_event.set()
        await consumer_task
        await close_redis()
        await engine.dispose()


app = FastAPI(
    title="SkillHunt — Matching Service",
    description="Microservice de scoring multicritères (Skills + Matériel + Localisation)",
    version="0.1.0",
    lifespan=lifespan,
)

app.include_router(health.router)
app.include_router(matching.router)
