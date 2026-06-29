from contextlib import asynccontextmanager
from collections.abc import AsyncIterator
from fastapi import FastAPI
from app.db.database import engine
from app.routers import health, matching


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    # C2.2.3 — Drainage propre du pool de connexions au shutdown
    yield
    await engine.dispose()


app = FastAPI(
    title="SkillHunt — Matching Service",
    description="Microservice de scoring multicritères (Skills + Matériel + Localisation)",
    version="0.1.0",
    lifespan=lifespan,
)

app.include_router(health.router)
app.include_router(matching.router)
