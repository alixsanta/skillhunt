from uuid import UUID
from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: str
    service: str


class MatchRequest(BaseModel):
    # C2.2.3 — Validation stricte des entrées (anti-injection, OWASP A03)
    freelance_id: UUID
    skills: list[str] = Field(min_length=1)
    location: tuple[float, float]
    radius_km: float = Field(gt=0, le=500)


class MatchResult(BaseModel):
    freelance_id: UUID
    score: float = Field(ge=0.0, le=1.0)
    distance_km: float = Field(ge=0.0)
