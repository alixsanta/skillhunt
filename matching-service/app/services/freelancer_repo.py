# C2.2.2 — Repository : accès données PostgreSQL/PostGIS pour le matching géospatial (SH-13)
from uuid import UUID
from sqlalchemy import cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from geoalchemy2 import Geography
from app.db.models import FreelanceDB, GearDB
from app.services.scoring import FreelancerProfile


async def get_candidates(
    db: AsyncSession,
    location: tuple[float, float],
    radius_km: float,
) -> list[FreelancerProfile]:
    """Charge les freelances DANS le rayon, avec leur matériel VALIDATED et leur distance.

    PostGIS applique le filtre dur (ST_DWithin, index GiST) et calcule la distance ;
    les positions NULL sont écartées. C2.2.3 — requête paramétrée, aucune concaténation SQL.
    """
    lat, lon = location  # MatchRequest fournit (lat, lon)
    # ST_MakePoint attend (lon, lat) ; cast en geography pour comparer à la colonne geography
    point = cast(
        func.ST_SetSRID(func.ST_MakePoint(lon, lat), 4326),
        Geography(geometry_type="POINT", srid=4326),
    )
    radius_m = radius_km * 1000.0
    distance_km = (func.ST_Distance(FreelanceDB.location, point) / 1000.0).label("distance_km")

    stmt = (
        select(FreelanceDB.id, distance_km, GearDB.category)
        .outerjoin(
            GearDB,
            (GearDB.freelanceId == FreelanceDB.id) & (GearDB.status == "VALIDATED"),
        )
        .where(
            FreelanceDB.role == "FREELANCE",
            FreelanceDB.location.isnot(None),
            func.ST_DWithin(FreelanceDB.location, point, radius_m),
        )
        .order_by(FreelanceDB.id)
    )
    rows = (await db.execute(stmt)).all()

    profiles: dict[str, FreelancerProfile] = {}
    for freelance_id, dist_km, category in rows:
        profile = profiles.get(freelance_id)
        if profile is None:
            profile = FreelancerProfile(
                freelance_id=UUID(freelance_id),
                gear_categories=[],
                distance_km=float(dist_km),
            )
            profiles[freelance_id] = profile
        if category is not None:
            profile.gear_categories.append(category)

    return list(profiles.values())
