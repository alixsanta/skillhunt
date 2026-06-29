# C2.2.2 — Test d'intégration : la requête géo PostGIS exécutée contre une vraie base
# Skippé automatiquement si aucune base n'est joignable (dev local sans Docker).
import os
import pytest
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from app.services.freelancer_repo import get_candidates

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://skillhunt:skillhunt@localhost:5432/skillhunt_test",
)

# Positions de référence (lat, lon)
TOULOUSE = (43.6045, 1.4440)
PARIS = (48.8566, 2.3522)
LYON = (45.7640, 4.8357)

FID_TLS = "11111111-1111-1111-1111-111111111111"
FID_PAR = "22222222-2222-2222-2222-222222222222"
FID_LYO = "33333333-3333-3333-3333-333333333333"
FID_NULL = "44444444-4444-4444-4444-444444444444"
FID_RECRUITER = "55555555-5555-5555-5555-555555555555"


def _point_sql(latlon: tuple[float, float]) -> str:
    lat, lon = latlon
    return f"ST_SetSRID(ST_MakePoint({lon}, {lat}), 4326)::geography"


@pytest_asyncio.fixture
async def db() -> AsyncSession:
    engine = create_async_engine(DATABASE_URL)
    try:
        async with engine.begin() as conn:
            await conn.execute(text("CREATE EXTENSION IF NOT EXISTS postgis"))
    except Exception as exc:  # pragma: no cover - dépend de l'environnement
        await engine.dispose()
        pytest.skip(f"PostGIS non disponible ({exc})")

    async with engine.begin() as conn:
        await conn.execute(text("DROP TABLE IF EXISTS gear"))
        await conn.execute(text("DROP TABLE IF EXISTS users"))
        await conn.execute(text(
            'CREATE TABLE users ("id" uuid PRIMARY KEY, "role" varchar NOT NULL, '
            '"location" geography(Point,4326))'
        ))
        await conn.execute(text(
            'CREATE TABLE gear ("id" uuid PRIMARY KEY, "freelanceId" uuid NOT NULL, '
            '"category" varchar NOT NULL, "status" varchar NOT NULL)'
        ))
        # Seed : 3 freelances localisés, 1 sans position, 1 recruteur
        await conn.execute(text(
            f"INSERT INTO users (id, role, location) VALUES "
            f"('{FID_TLS}', 'FREELANCE', {_point_sql(TOULOUSE)}), "
            f"('{FID_PAR}', 'FREELANCE', {_point_sql(PARIS)}), "
            f"('{FID_LYO}', 'FREELANCE', {_point_sql(LYON)}), "
            f"('{FID_NULL}', 'FREELANCE', NULL), "
            f"('{FID_RECRUITER}', 'RECRUITER', {_point_sql(TOULOUSE)})"
        ))
        await conn.execute(text(
            f"INSERT INTO gear (id, \"freelanceId\", category, status) VALUES "
            f"('66666666-6666-6666-6666-666666666666', '{FID_TLS}', 'DRONE', 'VALIDATED')"
        ))

    session = AsyncSession(engine, expire_on_commit=False)
    try:
        yield session
    finally:
        await session.close()
        await engine.dispose()


@pytest.mark.asyncio
async def test_radius_filters_out_distant_freelances(db):
    # Depuis Toulouse, rayon 50 km → seul le freelance toulousain
    result = await get_candidates(db, TOULOUSE, 50.0)
    ids = {str(p.freelance_id) for p in result}
    assert ids == {FID_TLS}


@pytest.mark.asyncio
async def test_distance_is_accurate(db):
    result = await get_candidates(db, TOULOUSE, 50.0)
    assert result[0].distance_km == pytest.approx(0.0, abs=1.0)


@pytest.mark.asyncio
async def test_null_location_is_excluded(db):
    # Rayon très large : Paris et Lyon entrent, mais jamais le freelance sans position ni le recruteur
    result = await get_candidates(db, TOULOUSE, 1000.0)
    ids = {str(p.freelance_id) for p in result}
    assert FID_NULL not in ids
    assert FID_RECRUITER not in ids
    assert ids == {FID_TLS, FID_PAR, FID_LYO}


@pytest.mark.asyncio
async def test_validated_gear_is_joined(db):
    result = await get_candidates(db, TOULOUSE, 50.0)
    assert result[0].gear_categories == ["DRONE"]
