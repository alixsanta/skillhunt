from fastapi import APIRouter
from app.models.schemas import MatchRequest, MatchResult

router = APIRouter(tags=["Matching"])


# C2.4.1 — Documentation OpenAPI (summary, response_model, tags)
@router.post(
    "/match",
    response_model=list[MatchResult],
    summary="Calcul des scores de matching (stub — moteur SH-12)",
)
async def match(request: MatchRequest) -> list[MatchResult]:
    # Stub : retourne une liste vide jusqu'à l'implémentation du moteur de scoring (SH-12)
    return []
