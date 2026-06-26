from fastapi import FastAPI
from app.routers import health, matching

app = FastAPI(
    title="SkillHunt — Matching Service",
    description="Microservice de scoring multicritères (Skills + Matériel + Localisation)",
    version="0.1.0",
)

app.include_router(health.router)
app.include_router(matching.router)
