from typing import Annotated
from uuid import UUID
from pydantic import BaseModel, Field, field_validator


class HealthResponse(BaseModel):
    status: str
    service: str


class MatchRequest(BaseModel):
    # C2.2.3 — Validation stricte des entrées (anti-injection, OWASP A03 ;
    # bornes anti-DoS : une liste de skills non bornée serait amplifiée par candidat lors du scoring)
    skills: list[Annotated[str, Field(min_length=1, max_length=64)]] = Field(min_length=1, max_length=50)
    location: tuple[float, float]
    radius_km: float = Field(gt=0, le=500)

    @field_validator("location")
    @classmethod
    def validate_location_bounds(cls, v: tuple[float, float]) -> tuple[float, float]:
        lat, lon = v
        if not (-90.0 <= lat <= 90.0):
            raise ValueError(f"Latitude doit être entre -90 et 90, reçu : {lat}")
        if not (-180.0 <= lon <= 180.0):
            raise ValueError(f"Longitude doit être entre -180 et 180, reçu : {lon}")
        return v


class MatchResult(BaseModel):
    freelance_id: UUID
    score: float = Field(ge=0.0, le=1.0)
    distance_km: float = Field(ge=0.0)
