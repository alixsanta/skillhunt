# SH-13 — Géolocalisation PostGIS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer le stub `score_location` (1.0) de SH-12 par un vrai scoring géospatial PostGIS : filtre dur par rayon (`ST_DWithin`), distance réelle (`ST_Distance`), score de proximité linéaire, le tout testé contre un vrai PostGIS en CI.

**Architecture:** PostGIS fait le travail géo en SQL (filtre rayon + distance, via l'index GiST existant) ; Python garde le scoring pur. La distance est calculée par la DB et propagée dans `FreelancerProfile.distance_km` ; `score_location` devient une fonction pure de `(distance_km, radius_km)`. Séparation des couches de SH-12 conservée.

**Tech Stack:** FastAPI, SQLAlchemy 2.0 async, asyncpg, **GeoAlchemy2** (type `Geography` + fonctions `ST_*` via l'ORM, pas de SQL brut), PostGIS, pytest, pytest-asyncio.

## Global Constraints

- Python 3.11 en CI (3.12 acceptable en local).
- PEP 8 : `max-line-length=127`, `max-complexity=10`, zéro erreur `E9,F63,F7,F82`.
- Tout code typé ; validation I/O via Pydantic v2 (déjà en place).
- Aucun secret en dur : `DATABASE_URL` via variable d'environnement.
- **Aucune requête SQL brute / concaténée** (CLAUDE.md §8.2) : passer par l'expression language SQLAlchemy + GeoAlchemy2, paramètres liés uniquement (anti-injection R7).
- Commentaires en français, identifiants en anglais.
- Référencer la compétence RNCP dans tout bloc l'illustrant (`C2.2.2`, `C2.2.3`).
- Conventional Commits : scope `(SH-13/matching)` (ou `(SH-13/ci)` pour le workflow).
- TDD strict : chaque test doit être vu FAIL avant implémentation.
- `bandit -r matching-service/ -x matching-service/tests,matching-service/venv -ll` doit rester propre (0 HIGH, 0 MEDIUM).
- Branche : `feature/SH-13-geolocalisation-postgis` (déjà créée depuis `develop`). **Ne pas supprimer après merge** (traçabilité RNCP).
- Schéma DB existant (créé par backend-core, migration SH-6) :
  - `users` : `id UUID`, `role` (`FREELANCE|RECRUITER|ADMIN`), `location geography(Point,4326)` **nullable**, index GiST `IDX_users_location`.
  - `gear` : `id UUID`, `"freelanceId" UUID`, `category`, `status` (`PENDING|VALIDATED|REJECTED`).
- `MatchRequest.location` est `(lat, lon)` ; PostGIS `ST_MakePoint` attend `(lon, lat)` → **inversion obligatoire**.
- PostGIS `ST_Distance`/`ST_DWithin` sur `geography` travaillent en **mètres** → `radius_m = radius_km * 1000`, `distance_km = ST_Distance(...) / 1000`.
- Formule composite **inchangée** : `0.50 × skills + 0.30 × gear + 0.20 × location`.
- `score_location(distance_km, radius_km) = max(0.0, 1 - distance_km / radius_km)`.

---

## Fichiers touchés

| Opération | Chemin | Responsabilité |
|-----------|--------|----------------|
| Modifier | `matching-service/app/services/scoring.py` | `FreelancerProfile.distance_km` ; `score_location` pur ; `compute_composite_score` |
| Modifier | `matching-service/tests/test_scoring.py` | tests du nouveau `score_location` |
| Modifier | `matching-service/requirements.txt` | ajout `geoalchemy2` |
| Modifier | `matching-service/app/db/models.py` | colonne `location` (type `Geography`) sur `FreelanceDB` |
| Modifier | `matching-service/app/services/freelancer_repo.py` | requête géo paramétrée + nouvelle signature |
| Modifier | `matching-service/tests/test_freelancer_repo.py` | rows à 3 colonnes (id, distance_km, category) |
| Modifier | `matching-service/app/routers/matching.py` | passe location/radius, vraie `distance_km`, tri, lève le TODO |
| Modifier | `matching-service/tests/test_matching.py` | profils avec `distance_km`, assertions distance + tri |
| Créer | `matching-service/tests/test_geo_integration.py` | intégration PostGIS réel |
| Modifier | `.github/workflows/python-ci.yml` | service container PostGIS + step d'intégration |
| Créer | `docs/tickets/SH-13-geolocalisation-postgis.md` | ticket |
| Modifier | `docs/BACKLOG.md` | SH-13 → 🟢 + prochaines actions |

---

## Task 1 : Scoring pur — `score_location` réel + `FreelancerProfile.distance_km`

**Files:**
- Modify: `matching-service/app/services/scoring.py`
- Modify: `matching-service/tests/test_scoring.py`

**Interfaces:**
- Produces:
  ```python
  @dataclass
  class FreelancerProfile:
      freelance_id: UUID
      gear_categories: list[str] = field(default_factory=list)
      distance_km: float = 0.0

  def score_location(distance_km: float, radius_km: float) -> float
  def compute_composite_score(profile: FreelancerProfile, request: MatchRequest) -> float
  ```
- Consumes: `MatchRequest` (inchangé) de `app.models.schemas`.

---

- [ ] **Step 1 : Remplacer les tests de `score_location` (RED)**

Dans `matching-service/tests/test_scoring.py`, **supprimer** le test stub :

```python
def test_score_location_is_stub_returning_one():
    result = score_location(FREELANCE_ID, (43.6, 1.44), 50.0)
    assert result == 1.0
```

et le remplacer par (mettre à jour aussi l'import : `score_location` reste importé) :

```python
# --- score_location (décroissance linéaire, SH-13) ---

def test_score_location_same_point_is_one():
    assert score_location(0.0, 50.0) == 1.0


def test_score_location_half_radius():
    assert score_location(25.0, 50.0) == pytest.approx(0.5)


def test_score_location_at_radius_edge_is_zero():
    assert score_location(50.0, 50.0) == pytest.approx(0.0)


def test_score_location_beyond_radius_is_clamped_to_zero():
    # Défense : ST_DWithin exclut déjà ces cas, mais le score ne doit jamais être négatif
    assert score_location(80.0, 50.0) == 0.0
```

- [ ] **Step 2 : Vérifier que les tests échouent**

Run: `cd matching-service && ./venv/Scripts/python.exe -m pytest tests/test_scoring.py -q`
Expected: FAIL — `score_location` reçoit encore l'ancienne signature `(UUID, tuple, float)` → `TypeError` / assertions fausses.

- [ ] **Step 3 : Mettre à jour `scoring.py`**

Dans `matching-service/app/services/scoring.py` :

1. Ajouter le champ `distance_km` au dataclass :

```python
@dataclass
class FreelancerProfile:
    freelance_id: UUID
    gear_categories: list[str] = field(default_factory=list)
    distance_km: float = 0.0
```

2. Remplacer l'ancien `score_location` stub par :

```python
def score_location(distance_km: float, radius_km: float) -> float:
    """Score de proximité (SH-13) : décroissance linéaire, 1.0 au point exact, ~0 au bord du rayon.

    La distance provient de PostGIS (ST_Distance) ; les candidats hors rayon sont déjà
    exclus par ST_DWithin côté requête. Le clamp `max(0, …)` est une défense.
    """
    return max(0.0, 1.0 - distance_km / radius_km)
```

3. Mettre à jour `compute_composite_score` (la ligne `loc = ...`) :

```python
def compute_composite_score(profile: FreelancerProfile, request: MatchRequest) -> float:
    """Score composite pondéré : 0.50 × skills + 0.30 × gear + 0.20 × location."""
    s = score_skills(request.skills, profile.gear_categories)
    g = score_gear(len(profile.gear_categories))
    loc = score_location(profile.distance_km, request.radius_km)
    return _WEIGHTS["skills"] * s + _WEIGHTS["gear"] * g + _WEIGHTS["location"] * loc
```

- [ ] **Step 4 : Vérifier que les tests passent**

Run: `cd matching-service && ./venv/Scripts/python.exe -m pytest tests/test_scoring.py -q`
Expected: PASS (les tests `compute_composite_score` existants restent verts : `distance_km` par défaut = 0.0 → `score_location(0, 50) = 1.0`, identique à l'ancien stub).

- [ ] **Step 5 : flake8**

Run: `./venv/Scripts/python.exe -m flake8 . --exclude=venv --max-complexity=10 --max-line-length=127`
Expected: exit 0, aucune sortie.

- [ ] **Step 6 : Commit**

```bash
git add matching-service/app/services/scoring.py matching-service/tests/test_scoring.py
git commit -m "feat(SH-13/matching): score_location réel (décroissance linéaire) + distance_km (C2.2.2)"
```

---

## Task 2 : Repository géo — requête PostGIS paramétrée (GeoAlchemy2)

**Files:**
- Modify: `matching-service/requirements.txt`
- Modify: `matching-service/app/db/models.py`
- Modify: `matching-service/app/services/freelancer_repo.py`
- Modify: `matching-service/tests/test_freelancer_repo.py`

**Interfaces:**
- Consumes: `FreelancerProfile` (Task 1), `FreelanceDB`/`GearDB` de `app.db.models`, `AsyncSession`.
- Produces: `async def get_candidates(db: AsyncSession, location: tuple[float, float], radius_km: float) -> list[FreelancerProfile]` — consommé par Task 3 (endpoint) et validé en réel par Task 4 (intégration).

---

- [ ] **Step 1 : Mettre à jour les tests du repository (RED)**

Remplacer le contenu de `matching-service/tests/test_freelancer_repo.py` (les rows ont désormais **3 colonnes** : `id`, `distance_km`, `category` ; `get_candidates` prend `location` et `radius_km`) :

```python
# C2.2.2 — Tests du repository : mock AsyncSession pour valider le mapping (id, distance, gear)
import pytest
from unittest.mock import AsyncMock, MagicMock
from uuid import UUID
from app.services.freelancer_repo import get_candidates

TOULOUSE = (43.6, 1.44)
RADIUS = 50.0


def make_mock_db(rows: list[tuple]) -> AsyncMock:
    """Construit un mock AsyncSession retournant les rows données (id, distance_km, category)."""
    mock_result = MagicMock()
    mock_result.all.return_value = rows
    mock_db = AsyncMock()
    mock_db.execute.return_value = mock_result
    return mock_db


@pytest.mark.asyncio
async def test_get_candidates_empty_db():
    db = make_mock_db([])
    result = await get_candidates(db, TOULOUSE, RADIUS)
    assert result == []


@pytest.mark.asyncio
async def test_get_candidates_single_freelance_no_gear():
    fid = "123e4567-e89b-12d3-a456-426614174000"
    db = make_mock_db([(fid, 12.5, None)])
    result = await get_candidates(db, TOULOUSE, RADIUS)
    assert len(result) == 1
    assert result[0].freelance_id == UUID(fid)
    assert result[0].gear_categories == []
    assert result[0].distance_km == pytest.approx(12.5)


@pytest.mark.asyncio
async def test_get_candidates_single_freelance_with_gear():
    fid = "123e4567-e89b-12d3-a456-426614174000"
    db = make_mock_db([(fid, 3.0, "DRONE"), (fid, 3.0, "CAMERA_360")])
    result = await get_candidates(db, TOULOUSE, RADIUS)
    assert len(result) == 1
    assert set(result[0].gear_categories) == {"DRONE", "CAMERA_360"}
    assert result[0].distance_km == pytest.approx(3.0)


@pytest.mark.asyncio
async def test_get_candidates_multiple_freelances():
    fid1 = "123e4567-e89b-12d3-a456-426614174000"
    fid2 = "223e4567-e89b-12d3-a456-426614174001"
    db = make_mock_db([(fid1, 1.0, "DRONE"), (fid2, 8.0, "ROBOTICS"), (fid2, 8.0, "SENSOR")])
    result = await get_candidates(db, TOULOUSE, RADIUS)
    assert len(result) == 2
    profiles = {str(p.freelance_id): p for p in result}
    assert profiles[fid1].gear_categories == ["DRONE"]
    assert set(profiles[fid2].gear_categories) == {"ROBOTICS", "SENSOR"}
    assert profiles[fid2].distance_km == pytest.approx(8.0)


@pytest.mark.asyncio
async def test_get_candidates_deduplicates_freelances():
    fid = "123e4567-e89b-12d3-a456-426614174000"
    db = make_mock_db([(fid, 2.0, "DRONE"), (fid, 2.0, "DRONE"), (fid, 2.0, "CAMERA_360")])
    result = await get_candidates(db, TOULOUSE, RADIUS)
    assert len(result) == 1
```

- [ ] **Step 2 : Ajouter GeoAlchemy2 aux dépendances**

Remplacer le contenu de `matching-service/requirements.txt` :

```
fastapi==0.115.5
uvicorn[standard]==0.32.1
pydantic==2.10.3
pydantic-settings==2.6.1
sqlalchemy==2.0.36
asyncpg==0.30.0
geoalchemy2==0.16.0
```

Installer :

Run: `cd matching-service && ./venv/Scripts/python.exe -m pip install -r requirements.txt`
Expected: `Successfully installed GeoAlchemy2-0.16.0 ...`

- [ ] **Step 3 : Vérifier que les tests échouent**

Run: `./venv/Scripts/python.exe -m pytest tests/test_freelancer_repo.py -q`
Expected: FAIL — `get_candidates()` n'accepte pas encore `location`/`radius_km` (TypeError) ou ignore `distance_km`.

- [ ] **Step 4 : Ajouter la colonne `location` au modèle ORM**

Dans `matching-service/app/db/models.py`, ajouter l'import et la colonne sur `FreelanceDB` :

```python
from geoalchemy2 import Geography
from sqlalchemy import Column, String
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


class FreelanceDB(Base):
    """Projection lecture seule de la table 'users' du backend-core."""
    __tablename__ = "users"

    id = Column(String, primary_key=True)
    role = Column(String, nullable=False)
    # Position PostGIS GEOGRAPHY(Point,4326), nullable (cf. migration SH-6, index GiST existant)
    location = Column(Geography(geometry_type="POINT", srid=4326), nullable=True)
```

(Le modèle `GearDB` reste inchangé.)

- [ ] **Step 5 : Réécrire `get_candidates` avec la requête géo paramétrée**

Remplacer le contenu de `matching-service/app/services/freelancer_repo.py` :

```python
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
```

- [ ] **Step 6 : Vérifier que les tests du repository passent**

Run: `./venv/Scripts/python.exe -m pytest tests/test_freelancer_repo.py -q`
Expected: 5/5 PASS.

- [ ] **Step 7 : flake8 + suite complète**

Run: `./venv/Scripts/python.exe -m flake8 . --exclude=venv --max-complexity=10 --max-line-length=127`
Expected: exit 0.
Run: `./venv/Scripts/python.exe -m pytest tests/ -q`
Expected: PASS (test_matching restera vert : `get_candidates` y est mocké via `AsyncMock`, qui ignore les nouveaux arguments).

- [ ] **Step 8 : Commit**

```bash
git add matching-service/requirements.txt matching-service/app/db/models.py \
        matching-service/app/services/freelancer_repo.py \
        matching-service/tests/test_freelancer_repo.py
git commit -m "feat(SH-13/matching): requête géo PostGIS (ST_DWithin + ST_Distance) via GeoAlchemy2 (C2.2.3)"
```

---

## Task 3 : Câblage de l'endpoint `/match`

**Files:**
- Modify: `matching-service/app/routers/matching.py`
- Modify: `matching-service/tests/test_matching.py`

**Interfaces:**
- Consumes: `get_candidates(db, location, radius_km)` (Task 2), `compute_composite_score` (Task 1).

---

- [ ] **Step 1 : Ajouter les tests d'endpoint distance + tri (RED)**

Dans `matching-service/tests/test_matching.py`, **remplacer** le test `test_match_results_sorted_by_score_desc` et **ajouter** un test de distance. D'abord remplacer ce test :

```python
def test_match_results_sorted_by_score_desc(client):
    profiles = [
        FreelancerProfile(freelance_id=FREELANCE_A, gear_categories=[], distance_km=40.0),
        FreelancerProfile(freelance_id=FREELANCE_B, gear_categories=["DRONE"] * 5, distance_km=5.0),
    ]
    payload = {"skills": ["drone-dgac"], "location": [43.6, 1.44], "radius_km": 50.0}
    app.dependency_overrides[get_db] = _override_get_db
    with patch("app.routers.matching.get_candidates", new=AsyncMock(return_value=profiles)):
        response = client.post("/match", json=payload)
    app.dependency_overrides.clear()
    assert response.status_code == 200
    results = response.json()
    assert len(results) == 2
    assert results[0]["score"] >= results[1]["score"]
    assert results[0]["freelance_id"] == str(FREELANCE_B)


def test_match_exposes_real_distance(client):
    profiles = [FreelancerProfile(freelance_id=FREELANCE_A, gear_categories=["DRONE"] * 5, distance_km=12.34)]
    payload = {"skills": ["drone-dgac"], "location": [43.6, 1.44], "radius_km": 50.0}
    app.dependency_overrides[get_db] = _override_get_db
    with patch("app.routers.matching.get_candidates", new=AsyncMock(return_value=profiles)):
        response = client.post("/match", json=payload)
    app.dependency_overrides.clear()
    assert response.status_code == 200
    assert response.json()[0]["distance_km"] == pytest.approx(12.34)


def test_match_tiebreak_by_distance_when_scores_equal(client):
    # Même gear/skills → même score ; le plus proche doit passer devant
    near = FreelancerProfile(freelance_id=FREELANCE_A, gear_categories=["DRONE"] * 5, distance_km=5.0)
    far = FreelancerProfile(freelance_id=FREELANCE_B, gear_categories=["DRONE"] * 5, distance_km=45.0)
    payload = {"skills": ["drone-dgac"], "location": [43.6, 1.44], "radius_km": 50.0}
    app.dependency_overrides[get_db] = _override_get_db
    with patch("app.routers.matching.get_candidates", new=AsyncMock(return_value=[far, near])):
        response = client.post("/match", json=payload)
    app.dependency_overrides.clear()
    results = response.json()
    assert [r["freelance_id"] for r in results] == [str(FREELANCE_A), str(FREELANCE_B)]
```

- [ ] **Step 2 : Vérifier que les nouveaux tests échouent**

Run: `cd matching-service && ./venv/Scripts/python.exe -m pytest tests/test_matching.py::test_match_exposes_real_distance tests/test_matching.py::test_match_tiebreak_by_distance_when_scores_equal -q`
Expected: FAIL — l'endpoint renvoie `distance_km=0.0` et ne départage pas par distance.

- [ ] **Step 3 : Mettre à jour l'endpoint**

Remplacer le contenu de `matching-service/app/routers/matching.py` :

```python
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
```

- [ ] **Step 4 : Vérifier que tous les tests passent**

Run: `./venv/Scripts/python.exe -m pytest tests/ -q`
Expected: tous PASS.

- [ ] **Step 5 : flake8 + bandit**

Run: `./venv/Scripts/python.exe -m flake8 . --exclude=venv --max-complexity=10 --max-line-length=127`
Expected: exit 0.
Run: `./venv/Scripts/python.exe -m bandit -r . -x ./tests,./venv -ll`
Expected: 0 HIGH / 0 MEDIUM.

- [ ] **Step 6 : Commit**

```bash
git add matching-service/app/routers/matching.py matching-service/tests/test_matching.py
git commit -m "feat(SH-13/matching): /match expose distance réelle + tri proximité ; lève le stub localisation (C2.4.1)"
```

---

## Task 4 : Test d'intégration PostGIS réel + service CI

**Files:**
- Create: `matching-service/tests/test_geo_integration.py`
- Modify: `.github/workflows/python-ci.yml`

**Interfaces:**
- Consumes: `get_candidates` (Task 2) exécuté contre un vrai PostGIS.

---

- [ ] **Step 1 : Écrire le test d'intégration (RED sans DB / skip)**

Créer `matching-service/tests/test_geo_integration.py` :

```python
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
```

- [ ] **Step 2 : Vérifier le comportement local (skip ou pass)**

Run: `cd matching-service && ./venv/Scripts/python.exe -m pytest tests/test_geo_integration.py -q`
Expected (sans Docker local) : `4 skipped`. Si une base PostGIS est lancée (`docker compose up -d`, port 5433 → adapter `DATABASE_URL`) : `4 passed`.

- [ ] **Step 3 : Ajouter le service PostGIS au workflow CI**

Dans `.github/workflows/python-ci.yml`, sous `jobs.validation-python`, ajouter le bloc `services` (juste après la ligne `runs-on: ubuntu-latest`) :

```yaml
    services:
      postgis:
        image: postgis/postgis:16-3.4
        env:
          POSTGRES_USER: skillhunt
          POSTGRES_PASSWORD: skillhunt
          POSTGRES_DB: skillhunt_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd "pg_isready -U skillhunt"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
```

Puis, dans l'étape 6 (PyTest), fournir l'URL de base au runner. Remplacer le bloc `run` de l'étape de tests par :

```yaml
      - name: 🧪 Exécution des tests unitaires et couverture (PyTest)
        env:
          DATABASE_URL: postgresql+asyncpg://skillhunt:skillhunt@localhost:5432/skillhunt_test
        run: |
          cd matching-service
          if [ -d tests ]; then
            pytest --cov=. --cov-report=xml tests/
          else
            echo "Aucun dossier de test détecté pour le moment."
          fi
```

(Conserver le reste du workflow inchangé.)

- [ ] **Step 4 : Vérifier la cohérence YAML localement**

Run: `cd "C:/Users/ALX/Projects/skillhunt" && matching-service/venv/Scripts/python.exe -c "import yaml; yaml.safe_load(open('.github/workflows/python-ci.yml'))" && echo OK`
Expected: `OK` (YAML valide).

- [ ] **Step 5 : Lancer la suite complète (les tests d'intégration skippent en local)**

Run: `cd matching-service && ./venv/Scripts/python.exe -m pytest tests/ -q`
Expected: tous les tests unitaires PASS, les 4 tests d'intégration `skipped` (sauf si DB locale lancée).

- [ ] **Step 6 : Commit**

```bash
git add matching-service/tests/test_geo_integration.py .github/workflows/python-ci.yml
git commit -m "test(SH-13/ci): intégration PostGIS réelle (rayon, distance, NULL exclu) + service container (C2.2.2)"
```

---

## Task 5 : Ticket SH-13 + BACKLOG

**Files:**
- Create: `docs/tickets/SH-13-geolocalisation-postgis.md`
- Modify: `docs/BACKLOG.md`

---

- [ ] **Step 1 : Créer le ticket**

Créer `docs/tickets/SH-13-geolocalisation-postgis.md` :

```markdown
**Titre du Ticket :** [SH-13] Géolocalisation : indexation spatiale PostGIS + requêtes rayon d'action
**Type :** Feature
**Priorité :** High
**Estimation :** 5 Story Points
**Compétences RNCP visées :** C2.2.3, C2.2.2
**Lot :** Lot 1 (Web MVP)

> Spec de conception : `docs/superpowers/specs/2026-06-29-SH-13-geolocalisation-postgis-design.md`.
> Remplace le stub `score_location` de SH-12. Suite : SH-34 (position freelance obligatoire), SH-14 (cache Redis).

### 0. Definition of Ready (DoR)
- [x] Valeur Claire : filtrer/classer les freelances par rayon d'action réel.
- [x] Specs Complètes : critères Gherkin ci-dessous + spec de conception.
- [x] Faisabilité Technique : PostGIS + index GiST déjà en place (SH-6), GeoAlchemy2.
- [x] Estimé : 5 SP.

### 1. User Story
**En tant que** recruteur,
**Je veux** ne voir que les freelances situés dans mon rayon d'action, les plus proches d'abord,
**Afin de** ne contacter que des experts réellement mobilisables sur ma mission.

### 2. Contexte & Valeur Business
- **Pourquoi maintenant ?** Complète le moteur SH-12 (la localisation y était un stub à 1.0).
- **KPI impacté :** pertinence du matching (R4), performance `/match` < 250 ms (index GiST).

### 3. Critères d'Acceptation (Gherkin)

**Scénario 1 : Filtre par rayon**
- GIVEN des freelances à Toulouse, Paris et Lyon
- WHEN je POSTe `/match` depuis Toulouse avec `radius_km: 50`
- THEN seuls les freelances dans les 50 km sont renvoyés.

**Scénario 2 : Score de proximité**
- GIVEN deux freelances équivalents (mêmes skills/gear) dans le rayon
- WHEN l'un est plus proche que l'autre
- THEN le plus proche a un meilleur score (et passe devant à score égal).

**Scénario 3 : Distance exposée**
- WHEN un freelance est renvoyé
- THEN `distance_km` reflète la vraie distance PostGIS (plus le stub 0.0).

**Scénario 4 : Position inconnue**
- GIVEN un freelance sans position (`location NULL`)
- THEN il n'apparaît dans aucune recherche par rayon.

### 4. Spécifications Techniques
- Requête `get_candidates(db, location, radius_km)` : `ST_DWithin` (filtre dur, index GiST) + `ST_Distance` (mètres → km), `LEFT JOIN gear` (VALIDATED), `role='FREELANCE'`, `location IS NOT NULL`.
- Inversion `(lat, lon)` → `ST_MakePoint(lon, lat)`. Requête paramétrée via GeoAlchemy2 (anti-injection, aucune concaténation).
- `score_location(distance_km, radius_km) = max(0, 1 - distance_km/radius_km)`. Composite inchangé (0.50/0.30/0.20).
- Tri : score décroissant puis distance croissante.

### 5. Definition of Done (DoD)
- [x] `score_location` réel + `FreelancerProfile.distance_km` (tests unitaires).
- [x] Requête géo PostGIS paramétrée (GeoAlchemy2).
- [x] Endpoint `/match` : vraie `distance_km` + tri proximité.
- [x] Test d'intégration PostGIS réel en CI (service container).
- [x] CI verte : flake8 + bandit + pytest.
- [x] Swagger à jour (C2.4.1). Aucun secret en dur.
```

- [ ] **Step 2 : Mettre à jour le BACKLOG**

Dans `docs/BACKLOG.md`, passer la ligne SH-13 à 🟢 :

```markdown
| [SH-13](tickets/SH-13-geolocalisation-postgis.md) | Géolocalisation : indexation spatiale PostGIS + requêtes rayon d'action | 🟢 Terminé | 5 | C2.2.3 | R4 |
```

Et remplacer la section « Prochaines actions suggérées » par :

```markdown
## Prochaines actions suggérées

1. **✅ EP02 complet** ; **✅ `SH-12`** et **✅ `SH-13`** terminés → le moteur de matching géospatial est complet.
2. **Suivant :** `SH-14` (bus d'événements Redis + cache des résultats `/match`).
3. **Nouveau (à rédiger) :** `SH-34` — position freelance obligatoire à l'onboarding (backend-core, CHECK conditionnel par rôle).
4. Mettre à jour le statut ici à chaque changement (🔵 → 🟡 → 🟠 → 🟢).
```

- [ ] **Step 3 : Vérifier la suite + lint une dernière fois**

Run: `cd matching-service && ./venv/Scripts/python.exe -m pytest tests/ -q && ./venv/Scripts/python.exe -m flake8 . --exclude=venv --max-complexity=10 --max-line-length=127`
Expected: tests PASS (intégration skipped en local), flake8 exit 0.

- [ ] **Step 4 : Commit**

```bash
git add docs/tickets/SH-13-geolocalisation-postgis.md docs/BACKLOG.md
git commit -m "docs(SH-13): ticket + BACKLOG (SH-13 terminé, suite SH-14/SH-34)"
```

- [ ] **Step 5 : Push + PR vers develop**

```bash
git push -u origin feature/SH-13-geolocalisation-postgis
gh pr create --base develop \
  --title "[SH-13] Géolocalisation PostGIS (rayon d'action + score de proximité)" \
  --body "Implémente le matching géospatial : filtre dur ST_DWithin, distance ST_Distance, score linéaire, test d'intégration PostGIS réel en CI. Lève le stub localisation de SH-12. Spec : docs/superpowers/specs/2026-06-29-SH-13-geolocalisation-postgis-design.md"
```

---

## Self-Review

### 1. Spec coverage

| Exigence spec | Tâche |
|---|---|
| D1 PostGIS en SQL (ST_DWithin/ST_Distance) | Task 2 |
| D2 Filtre dur par rayon | Task 2 (`ST_DWithin` dans WHERE) + Task 4 (`test_radius_filters_out_distant_freelances`) |
| D3 Score linéaire `max(0,1-d/r)` | Task 1 (`score_location` + tests) |
| D4 NULL exclu | Task 2 (`location IS NOT NULL`) + Task 4 (`test_null_location_is_excluded`) |
| D5 Départage par distance | Task 3 (`sort key`) + `test_match_tiebreak_by_distance_when_scores_equal` |
| D6 Intégration PostGIS réelle en CI | Task 4 |
| Inversion (lat,lon)→(lon,lat) | Task 2 (`point`) + Task 4 (`_point_sql`) |
| distance_km réelle exposée | Task 3 (`test_match_exposes_real_distance`) |
| Anti-injection (paramétré) | Task 2 (GeoAlchemy2 `func.ST_*`, pas de concaténation) |
| Ticket + BACKLOG | Task 5 |
| Suite SH-34 / SH-14 | Task 5 (BACKLOG) |

### 2. Placeholder scan
Aucun placeholder. Le seul `text()` SQL est dans la **fixture de test d'intégration** (création/seed du schéma de test, valeurs constantes maîtrisées — pas une entrée utilisateur) ; le code applicatif (`freelancer_repo.py`) reste 100 % paramétré via GeoAlchemy2.

### 3. Type consistency
- `FreelancerProfile(freelance_id, gear_categories, distance_km)` : cohérent entre Task 1 (def), Task 2 (construction), Task 3 (consommation), tests.
- `get_candidates(db, location: tuple[float,float], radius_km: float) -> list[FreelancerProfile]` : signature identique en Task 2, appel endpoint Task 3, tests Tasks 2 & 4.
- `score_location(distance_km: float, radius_km: float) -> float` : Task 1 def + usage `compute_composite_score`.
- `MatchResult.distance_km` : produit en Task 3, asserté en Task 3 (`test_match_exposes_real_distance`).
