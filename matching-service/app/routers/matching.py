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
    summary="Calcul des scores de matching multicritères (Skills + Matériel + Localisation stub)",
)
async def match(
    request: MatchRequest,
    db: AsyncSession = Depends(get_db),
) -> list[MatchResult]:
    # C2.2.2 — Injection de dépendances : get_candidates est mockable dans les tests
    candidates = await get_candidates(db)

    results: list[MatchResult] = []
    for profile in candidates:
        score = compute_composite_score(profile, request)
        if score > 0.0:
            results.append(
                MatchResult(
                    freelance_id=profile.freelance_id,
                    score=round(score, 4),
                    distance_km=0.0,  # stub jusqu'à SH-13 (PostGIS)
                )
            )

    results.sort(key=lambda r: r.score, reverse=True)
    return results
