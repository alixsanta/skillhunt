from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.database import get_db
from app.models.schemas import MatchRequest, MatchResult
from app.services.freelancer_repo import get_candidates
from app.services.scoring import compute_composite_score

router = APIRouter(tags=["Matching"])


# C2.4.1 — Documentation OpenAPI (summary, response_model, tags)
@router.post(
    "/match",
    response_model=list[MatchResult],
    summary="Calcul des scores de matching multicritères (Skills + Matériel + Localisation PostGIS)",
)
async def match(
    request: MatchRequest,
    db: AsyncSession = Depends(get_db),
) -> list[MatchResult]:
    # C2.2.2 — Injection de dépendances : get_candidates est mockable dans les tests.
    # PostGIS a déjà filtré les candidats hors rayon et calculé leur distance.
    candidates = await get_candidates(db, request.location, request.radius_km)

    results: list[MatchResult] = []
    for profile in candidates:
        score = compute_composite_score(profile, request)
        if score > 0.0:
            results.append(
                MatchResult(
                    freelance_id=profile.freelance_id,
                    score=round(score, 4),
                    distance_km=round(profile.distance_km, 2),
                )
            )

    # Tri : score décroissant, puis distance croissante à score égal (le plus proche d'abord)
    results.sort(key=lambda r: (-r.score, r.distance_km))
    return results
