# C2.2.2 — Repository : accès données PostgreSQL pour le moteur de matching (SH-12)
from uuid import UUID
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.models import FreelanceDB, GearDB
from app.services.scoring import FreelancerProfile


async def get_candidates(db: AsyncSession) -> list[FreelancerProfile]:
    """Charge tous les freelances avec leur matériel VALIDATED via une jointure LEFT OUTER.

    TODO SH-13 (perf, KPI R4 < 250 ms) : ce chargement scanne toute la table 'users' à chaque
    requête. À remplacer par un préfiltrage SQL (rayon PostGIS + présence d'au moins un skill)
    et/ou une pagination keyset avant de scorer en mémoire.
    """
    stmt = (
        select(FreelanceDB.id, GearDB.category)
        .outerjoin(GearDB, (GearDB.freelanceId == FreelanceDB.id) & (GearDB.status == "VALIDATED"))
        .where(FreelanceDB.role == "FREELANCE")
        .order_by(FreelanceDB.id)
    )
    rows = (await db.execute(stmt)).all()

    profiles: dict[str, list[str]] = {}
    for freelance_id, category in rows:
        if freelance_id not in profiles:
            profiles[freelance_id] = []
        if category is not None:
            profiles[freelance_id].append(category)

    return [
        FreelancerProfile(freelance_id=UUID(fid), gear_categories=cats)
        for fid, cats in profiles.items()
    ]
