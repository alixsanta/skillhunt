from fastapi import APIRouter
from app.models.schemas import HealthResponse

router = APIRouter(tags=["Health"])


@router.get(
    "/health",
    response_model=HealthResponse,
    summary="Vérification de l'état du service",
)
async def health_check() -> HealthResponse:
    return HealthResponse(status="ok", service="matching-service")
