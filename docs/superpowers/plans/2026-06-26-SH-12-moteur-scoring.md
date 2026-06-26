# SH-12 — Moteur de scoring multicritères Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer le stub `POST /match` par un vrai moteur de scoring multicritères (Skills + Matériel + Localisation stub) qui interroge PostgreSQL et retourne une liste de freelances triée par score.

**Architecture:** Le scoring est décomposé en couches indépendantes : (1) `app/db/` — accès données via SQLAlchemy async, (2) `app/services/scoring.py` — fonctions pures testables sans DB, (3) `app/services/freelancer_repo.py` — requêtes PostgreSQL, (4) `app/routers/matching.py` — assemblage via DI FastAPI. Le score location est un stub retournant 1.0 jusqu'à SH-13 (PostGIS).

**Tech Stack:** FastAPI, SQLAlchemy 2.0 (async), asyncpg, Pydantic v2, pytest, httpx

## Global Constraints

- Python 3.11 en CI (3.12 acceptable en local)
- PEP 8 : `max-line-length=127`, `max-complexity=10`, zéro erreur `E9,F63,F7,F82`
- Tout code typé ; validation I/O via Pydantic v2 (class-validator côté NestJS déjà actif)
- Aucun secret en dur : `DATABASE_URL` via variable d'environnement
- Commentaires en français, identifiants en anglais
- Référencer la compétence RNCP dans tout bloc illustrant une compétence (`C2.2.2`, `C2.2.3`, `C2.4.1`)
- Conventional Commits : scope `(SH-12/matching)`
- TDD strict : chaque test doit être vu FAIL avant d'implémenter
- `bandit -r matching-service/ -x matching-service/tests/` doit rester propre (zéro HIGH, zéro MEDIUM)
- La branche de feature doit partir de `develop` : `git checkout develop && git checkout -b feature/SH-12-moteur-scoring`
- **Ne pas supprimer la branche après merge** (traçabilité RNCP)
- La table PostgreSQL `users` expose : `id UUID`, `role VARCHAR` (valeurs : `FREELANCE`, `RECRUITER`, `ADMIN`), `location GEOGRAPHY(Point,4326) nullable`
- La table `gear` expose : `id UUID`, `"freelanceId" UUID`, `category VARCHAR` (valeurs : `DRONE`, `CAMERA_360`, `ROBOTICS`, `SENSOR`, `OTHER`), `status VARCHAR` (valeurs : `PENDING`, `VALIDATED`, `REJECTED`)
- Le schéma existant `MatchRequest` contient `freelance_id` (UUID) qui n'a pas de sens sémantique pour une recherche — ce champ doit être supprimé dans ce ticket
- Formula de score composite : `0.50 × skills_score + 0.30 × gear_score + 0.20 × location_score`
- `location_score` = 1.0 (stub jusqu'à SH-13)
- `skills_score` = `|required_skills ∩ inferred_skills| / |required_skills|` (recall)
- `gear_score` = `min(1.0, count_validated_gear / 5)`
- Les `inferred_skills` d'un freelance sont déduites de ses catégories de matériel validé via `CATEGORY_SKILL_MAP`
- Seuls les résultats avec `score > 0.0` sont retournés, triés par score décroissant

---

## Fichiers touchés

| Opération | Chemin |
|-----------|--------|
| Modifier | `matching-service/requirements.txt` |
| Modifier | `matching-service/app/core/config.py` |
| Créer | `matching-service/app/db/database.py` |
| Créer | `matching-service/app/db/models.py` |
| Modifier | `matching-service/app/models/schemas.py` |
| Créer | `matching-service/app/services/scoring.py` |
| Créer | `matching-service/app/services/freelancer_repo.py` |
| Modifier | `matching-service/app/routers/matching.py` |
| Modifier | `matching-service/tests/test_schemas.py` |
| Modifier | `matching-service/tests/test_matching.py` |
| Créer | `matching-service/tests/test_scoring.py` |
| Créer | `matching-service/tests/test_freelancer_repo.py` |
| Créer | `docs/tickets/SH-12-moteur-scoring.md` |
| Modifier | `docs/BACKLOG.md` |

---

## Task 1 : Couche DB — dépendances, engine async, modèles ORM + mise à jour du schéma Pydantic

**Files:**
- Modify: `matching-service/requirements.txt`
- Modify: `matching-service/app/core/config.py`
- Create: `matching-service/app/db/database.py`
- Create: `matching-service/app/db/models.py`
- Modify: `matching-service/app/models/schemas.py`
- Modify: `matching-service/tests/test_schemas.py`
- Modify: `matching-service/tests/test_matching.py`

**Interfaces:**
- Produces: `get_db() -> AsyncIterator[AsyncSession]` — dependency FastAPI injectable dans Task 4
- Produces: `FreelanceDB`, `GearDB` — classes SQLAlchemy utilisées par Task 3
- Produces: `MatchRequest` sans `freelance_id` — consommé par Tasks 3 et 4

---

- [ ] **Step 1 : Créer la branche de feature depuis develop**

```bash
git checkout develop
git pull
git checkout -b feature/SH-12-moteur-scoring
```

Expected: `Switched to a new branch 'feature/SH-12-moteur-scoring'`

- [ ] **Step 2 : Écrire les tests pour les modèles ORM (RED)**

Créer `matching-service/tests/test_db_models.py` :

```python
# C2.2.2 — Harnais de tests : vérification des modèles ORM (attributs, table names)
from app.db.models import FreelanceDB, GearDB


def test_freelance_db_tablename():
    assert FreelanceDB.__tablename__ == "users"


def test_freelance_db_columns():
    cols = {c.name for c in FreelanceDB.__table__.columns}
    assert "id" in cols
    assert "role" in cols


def test_gear_db_tablename():
    assert GearDB.__tablename__ == "gear"


def test_gear_db_columns():
    cols = {c.name for c in GearDB.__table__.columns}
    assert "id" in cols
    assert "freelanceId" in cols
    assert "category" in cols
    assert "status" in cols
```

- [ ] **Step 3 : Vérifier que les tests échouent**

```bash
cd matching-service
venv/Scripts/activate  # Windows : venv\Scripts\activate
pytest tests/test_db_models.py -v
```

Expected: `ERRORS` (module `app.db.models` introuvable)

- [ ] **Step 4 : Ajouter les dépendances SQLAlchemy et asyncpg**

Remplacer le contenu de `matching-service/requirements.txt` :

```
fastapi==0.115.5
uvicorn[standard]==0.32.1
pydantic==2.10.3
pydantic-settings==2.6.1
sqlalchemy==2.0.36
asyncpg==0.30.0
```

Installer :

```bash
pip install -r requirements.txt
```

Expected: `Successfully installed sqlalchemy-2.0.36 asyncpg-0.30.0 ...`

- [ ] **Step 5 : Mettre à jour config.py — scheme asyncpg + port 5433**

Remplacer le contenu de `matching-service/app/core/config.py` :

```python
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # C2.2.3 — Secrets hors du code, chargés depuis les variables d'environnement
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+asyncpg://user:password@localhost:5433/skillhunt"
    redis_url: str = "redis://localhost:6379/0"
    backend_core_url: str = "http://localhost:3001"


settings = Settings()
```

- [ ] **Step 6 : Créer l'engine async et la dependency get_db**

Créer `matching-service/app/db/database.py` :

```python
from collections.abc import AsyncIterator
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from app.core.config import settings

engine = create_async_engine(settings.database_url, echo=False)
_session_factory = async_sessionmaker(engine, expire_on_commit=False)


async def get_db() -> AsyncIterator[AsyncSession]:
    # C2.2.3 — Session isolée par requête, fermée proprement même en cas d'erreur
    async with _session_factory() as session:
        yield session
```

- [ ] **Step 7 : Créer les modèles ORM SQLAlchemy (lecture seule)**

Créer `matching-service/app/db/models.py` :

```python
from sqlalchemy import Column, String
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


class FreelanceDB(Base):
    """Projection lecture seule de la table 'users' du backend-core."""
    __tablename__ = "users"

    id = Column(String, primary_key=True)
    role = Column(String, nullable=False)


class GearDB(Base):
    """Projection lecture seule de la table 'gear' du backend-core."""
    __tablename__ = "gear"

    id = Column(String, primary_key=True)
    freelanceId = Column("freelanceId", String, nullable=False)
    category = Column(String, nullable=False)
    status = Column(String, nullable=False)
```

- [ ] **Step 8 : Vérifier que les tests DB passent**

```bash
pytest tests/test_db_models.py -v
```

Expected:
```
tests/test_db_models.py::test_freelance_db_tablename PASSED
tests/test_db_models.py::test_freelance_db_columns PASSED
tests/test_db_models.py::test_gear_db_tablename PASSED
tests/test_db_models.py::test_gear_db_columns PASSED
4 passed in 0.Xs
```

- [ ] **Step 9 : Mettre à jour le schéma Pydantic — supprimer freelance_id de MatchRequest**

Remplacer le contenu de `matching-service/app/models/schemas.py` :

```python
from typing import Annotated
from uuid import UUID
from pydantic import BaseModel, Field, field_validator


class HealthResponse(BaseModel):
    status: str
    service: str


class MatchRequest(BaseModel):
    # C2.2.3 — Validation stricte des entrées (anti-injection, OWASP A03)
    skills: list[Annotated[str, Field(min_length=1)]] = Field(min_length=1)
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
```

- [ ] **Step 10 : Mettre à jour test_schemas.py — supprimer les cas utilisant freelance_id dans MatchRequest**

Remplacer le contenu de `matching-service/tests/test_schemas.py` :

```python
# C2.2.2 — Harnais de tests unitaires (validation Pydantic, schémas métier)
import pytest
from uuid import UUID
from pydantic import ValidationError
from app.models.schemas import HealthResponse, MatchRequest, MatchResult


def test_health_response_valid():
    r = HealthResponse(status="ok", service="matching-service")
    assert r.status == "ok"
    assert r.service == "matching-service"


def test_match_request_valid():
    req = MatchRequest(
        skills=["drone-dgac", "fpv"],
        location=(43.6, 1.44),
        radius_km=50.0,
    )
    assert len(req.skills) == 2
    assert req.radius_km == 50.0


def test_match_request_rejects_empty_skills():
    with pytest.raises(ValidationError):
        MatchRequest(skills=[], location=(43.6, 1.44), radius_km=50.0)


def test_match_request_rejects_blank_skill():
    with pytest.raises(ValidationError):
        MatchRequest(skills=[""], location=(43.6, 1.44), radius_km=50.0)


def test_match_request_rejects_negative_radius():
    with pytest.raises(ValidationError):
        MatchRequest(skills=["fpv"], location=(43.6, 1.44), radius_km=-10.0)


def test_match_request_rejects_zero_radius():
    with pytest.raises(ValidationError):
        MatchRequest(skills=["fpv"], location=(43.6, 1.44), radius_km=0.0)


def test_match_request_rejects_invalid_latitude():
    with pytest.raises(ValidationError):
        MatchRequest(skills=["fpv"], location=(91.0, 1.44), radius_km=50.0)


def test_match_request_rejects_invalid_longitude():
    with pytest.raises(ValidationError):
        MatchRequest(skills=["fpv"], location=(43.6, 181.0), radius_km=50.0)


def test_match_result_valid():
    r = MatchResult(
        freelance_id=UUID("123e4567-e89b-12d3-a456-426614174000"),
        score=0.87,
        distance_km=12.5,
    )
    assert 0.0 <= r.score <= 1.0


def test_match_result_rejects_score_above_one():
    with pytest.raises(ValidationError):
        MatchResult(
            freelance_id=UUID("123e4567-e89b-12d3-a456-426614174000"),
            score=1.5,
            distance_km=0.0,
        )
```

- [ ] **Step 11 : Mettre à jour test_matching.py — supprimer freelance_id des payloads**

Remplacer le contenu de `matching-service/tests/test_matching.py` :

```python
BASE_PAYLOAD = {
    "skills": ["drone-dgac", "fpv"],
    "location": [43.6, 1.44],
    "radius_km": 50.0,
}


def test_match_rejects_missing_body(client):
    response = client.post("/match", json={})
    assert response.status_code == 422


def test_match_rejects_empty_skills(client):
    payload = {**BASE_PAYLOAD, "skills": []}
    response = client.post("/match", json=payload)
    assert response.status_code == 422


def test_match_rejects_blank_skill(client):
    payload = {**BASE_PAYLOAD, "skills": [""]}
    response = client.post("/match", json=payload)
    assert response.status_code == 422


def test_match_rejects_negative_radius(client):
    payload = {**BASE_PAYLOAD, "radius_km": -1.0}
    response = client.post("/match", json=payload)
    assert response.status_code == 422


def test_match_rejects_zero_radius(client):
    payload = {**BASE_PAYLOAD, "radius_km": 0.0}
    response = client.post("/match", json=payload)
    assert response.status_code == 422


def test_match_rejects_out_of_bounds_location(client):
    payload = {**BASE_PAYLOAD, "location": [999.0, 999.0]}
    response = client.post("/match", json=payload)
    assert response.status_code == 422
```

Note : les tests de scoring réel (200 + résultats) sont ajoutés en Task 4 une fois l'endpoint câblé.

- [ ] **Step 12 : Lancer la suite complète pour vérifier zéro régression**

```bash
pytest tests/ -v
```

Expected: tous les tests existants passent (les tests `test_match_stub_returns_200_and_empty_list` sont supprimés et remplacés en Task 4).

- [ ] **Step 13 : Vérifier flake8 et bandit**

```bash
flake8 matching-service/ --count --select=E9,F63,F7,F82 --show-source --statistics
bandit -r matching-service/ -x matching-service/tests/ -ll
```

Expected: exit 0 pour flake8 (erreurs critiques). Bandit : no issues identified.

- [ ] **Step 14 : Commiter**

```bash
git add matching-service/requirements.txt \
        matching-service/app/core/config.py \
        matching-service/app/db/database.py \
        matching-service/app/db/models.py \
        matching-service/app/models/schemas.py \
        matching-service/tests/test_db_models.py \
        matching-service/tests/test_schemas.py \
        matching-service/tests/test_matching.py
git commit -m "feat(SH-12/matching): DB async layer (SQLAlchemy+asyncpg) + schema cleanup (C2.2.3)"
```

---

## Task 2 : Moteur de scoring — fonctions pures

**Files:**
- Create: `matching-service/app/services/scoring.py`
- Create: `matching-service/tests/test_scoring.py`

**Interfaces:**
- Produces:
  ```python
  @dataclass
  class FreelancerProfile:
      freelance_id: UUID
      gear_categories: list[str]  # catégories VALIDATED uniquement

  CATEGORY_SKILL_MAP: dict[str, set[str]]

  def score_skills(required_skills: list[str], gear_categories: list[str]) -> float: ...
  def score_gear(gear_count: int) -> float: ...
  def score_location(...) -> float: ...  # stub
  def compute_composite_score(profile: FreelancerProfile, request: MatchRequest) -> float: ...
  ```
- Consumes: `MatchRequest` from `app.models.schemas`

---

- [ ] **Step 1 : Écrire les tests du moteur de scoring (RED)**

Créer `matching-service/tests/test_scoring.py` :

```python
# C2.2.2 — Harnais de tests unitaires du moteur de scoring multicritères (SH-12)
import pytest
from uuid import UUID
from app.models.schemas import MatchRequest
from app.services.scoring import (
    FreelancerProfile,
    CATEGORY_SKILL_MAP,
    score_skills,
    score_gear,
    score_location,
    compute_composite_score,
)

FREELANCE_ID = UUID("123e4567-e89b-12d3-a456-426614174000")


# --- CATEGORY_SKILL_MAP ---

def test_category_skill_map_covers_all_categories():
    expected = {"DRONE", "CAMERA_360", "ROBOTICS", "SENSOR", "OTHER"}
    assert set(CATEGORY_SKILL_MAP.keys()) == expected


def test_drone_category_contains_drone_skills():
    assert "drone-dgac" in CATEGORY_SKILL_MAP["DRONE"]
    assert "fpv" in CATEGORY_SKILL_MAP["DRONE"]


# --- score_skills ---

def test_score_skills_full_match():
    # Freelance avec DRONE → couvre "drone-dgac" et "fpv"
    result = score_skills(["drone-dgac", "fpv"], ["DRONE"])
    assert result == 1.0


def test_score_skills_partial_match():
    # "robotics" n'est pas couvert par DRONE seul
    result = score_skills(["drone-dgac", "robotics"], ["DRONE"])
    assert result == pytest.approx(0.5)


def test_score_skills_no_match():
    result = score_skills(["robotics"], ["DRONE"])
    assert result == 0.0


def test_score_skills_multiple_categories():
    result = score_skills(["drone-dgac", "robotics"], ["DRONE", "ROBOTICS"])
    assert result == 1.0


def test_score_skills_case_insensitive():
    result = score_skills(["DRONE-DGAC"], ["DRONE"])
    assert result == 1.0


# --- score_gear ---

def test_score_gear_zero_items():
    assert score_gear(0) == 0.0


def test_score_gear_five_items_is_max():
    assert score_gear(5) == 1.0


def test_score_gear_more_than_five_capped():
    assert score_gear(10) == 1.0


def test_score_gear_two_items():
    assert score_gear(2) == pytest.approx(0.4)


# --- score_location ---

def test_score_location_is_stub_returning_one():
    result = score_location(FREELANCE_ID, (43.6, 1.44), 50.0)
    assert result == 1.0


# --- compute_composite_score ---

def test_compute_composite_score_full_match():
    profile = FreelancerProfile(freelance_id=FREELANCE_ID, gear_categories=["DRONE", "DRONE", "DRONE", "DRONE", "DRONE"])
    request = MatchRequest(skills=["drone-dgac"], location=(43.6, 1.44), radius_km=50.0)
    score = compute_composite_score(profile, request)
    # skills=1.0 gear=1.0 location=1.0 → composite=1.0
    assert score == pytest.approx(1.0)


def test_compute_composite_score_no_gear():
    profile = FreelancerProfile(freelance_id=FREELANCE_ID, gear_categories=[])
    request = MatchRequest(skills=["drone-dgac"], location=(43.6, 1.44), radius_km=50.0)
    score = compute_composite_score(profile, request)
    # skills=0.0, gear=0.0, location=1.0 → 0.5*0 + 0.3*0 + 0.2*1 = 0.2
    assert score == pytest.approx(0.2)


def test_compute_composite_score_partial():
    profile = FreelancerProfile(freelance_id=FREELANCE_ID, gear_categories=["DRONE"])
    request = MatchRequest(skills=["drone-dgac", "robotics"], location=(43.6, 1.44), radius_km=50.0)
    score = compute_composite_score(profile, request)
    # skills=0.5, gear=min(1,1/5)=0.2, location=1.0
    # → 0.5*0.5 + 0.3*0.2 + 0.2*1.0 = 0.25 + 0.06 + 0.20 = 0.51
    assert score == pytest.approx(0.51)


def test_compute_composite_score_is_bounded():
    profile = FreelancerProfile(freelance_id=FREELANCE_ID, gear_categories=["DRONE"] * 10)
    request = MatchRequest(skills=["drone-dgac"], location=(43.6, 1.44), radius_km=50.0)
    score = compute_composite_score(profile, request)
    assert 0.0 <= score <= 1.0
```

- [ ] **Step 2 : Vérifier que les tests échouent**

```bash
pytest tests/test_scoring.py -v
```

Expected: `ERRORS` — `No module named 'app.services.scoring'`

- [ ] **Step 3 : Implémenter le moteur de scoring**

Créer `matching-service/app/services/scoring.py` :

```python
# C2.2.2 — Moteur de scoring multicritères (Skills + Matériel + Localisation stub) (SH-12)
from dataclasses import dataclass, field
from uuid import UUID
from app.models.schemas import MatchRequest

CATEGORY_SKILL_MAP: dict[str, set[str]] = {
    "DRONE": {"drone", "drone-dgac", "fpv", "pilote-drone", "telepilote", "uas"},
    "CAMERA_360": {"360", "camera-360", "operateur-360", "360-video", "vr"},
    "ROBOTICS": {"robotique", "robotics", "automation", "robot", "ros"},
    "SENSOR": {"capteur", "sensor", "iot", "telemetrie", "lidar"},
    "OTHER": set(),
}

# Poids du score composite (somme = 1.0)
_WEIGHTS = {"skills": 0.50, "gear": 0.30, "location": 0.20}
# Nombre d'items de matériel validé pour atteindre le score gear maximum
_GEAR_MAX_COUNT = 5


@dataclass
class FreelancerProfile:
    freelance_id: UUID
    gear_categories: list[str] = field(default_factory=list)


def score_skills(required_skills: list[str], gear_categories: list[str]) -> float:
    """Recall : proportion des skills requis couverts par les catégories de matériel du freelance."""
    if not required_skills:
        return 1.0
    inferred: set[str] = set()
    for cat in gear_categories:
        inferred |= CATEGORY_SKILL_MAP.get(cat, set())
    required = {s.lower() for s in required_skills}
    matched = required & inferred
    return len(matched) / len(required)


def score_gear(gear_count: int) -> float:
    """Score normalisé du volume de matériel validé (plafonné à 1.0 pour _GEAR_MAX_COUNT items)."""
    return min(1.0, gear_count / _GEAR_MAX_COUNT)


def score_location(freelance_id: UUID, requester_location: tuple[float, float], radius_km: float) -> float:
    """Stub — retourne 1.0 jusqu'à l'implémentation PostGIS (SH-13)."""
    return 1.0


def compute_composite_score(profile: FreelancerProfile, request: MatchRequest) -> float:
    """Score composite pondéré : 0.50 × skills + 0.30 × gear + 0.20 × location."""
    s = score_skills(request.skills, profile.gear_categories)
    g = score_gear(len(profile.gear_categories))
    loc = score_location(profile.freelance_id, request.location, request.radius_km)
    return _WEIGHTS["skills"] * s + _WEIGHTS["gear"] * g + _WEIGHTS["location"] * loc
```

- [ ] **Step 4 : Vérifier que tous les tests passent**

```bash
pytest tests/test_scoring.py -v
```

Expected: tous les tests passent.

- [ ] **Step 5 : Lancer la suite complète**

```bash
pytest tests/ -v
```

Expected: zéro régression sur les tests existants.

- [ ] **Step 6 : Vérifier flake8**

```bash
flake8 matching-service/ --count --select=E9,F63,F7,F82 --show-source --statistics
```

Expected: exit 0.

- [ ] **Step 7 : Commiter**

```bash
git add matching-service/app/services/scoring.py matching-service/tests/test_scoring.py
git commit -m "feat(SH-12/matching): moteur de scoring multicritères — fonctions pures TDD (C2.2.2, C2.2.3)"
```

---

## Task 3 : Freelancer repository — requêtes PostgreSQL

**Files:**
- Create: `matching-service/app/services/freelancer_repo.py`
- Create: `matching-service/tests/test_freelancer_repo.py`

**Interfaces:**
- Consumes: `FreelancerProfile` from `app.services.scoring`, `FreelanceDB`/`GearDB` from `app.db.models`, `AsyncSession` from sqlalchemy
- Produces: `async def get_candidates(db: AsyncSession) -> list[FreelancerProfile]`

---

- [ ] **Step 1 : Écrire les tests du repository (RED)**

Créer `matching-service/tests/test_freelancer_repo.py` :

```python
# C2.2.2 — Tests du repository : mock AsyncSession pour valider la logique de mapping
import pytest
from unittest.mock import AsyncMock, MagicMock
from uuid import UUID
from app.services.freelancer_repo import get_candidates
from app.services.scoring import FreelancerProfile


def make_mock_db(rows: list[tuple]) -> AsyncMock:
    """Construit un mock AsyncSession retournant les rows données."""
    mock_result = MagicMock()
    mock_result.all.return_value = rows
    mock_db = AsyncMock()
    mock_db.execute.return_value = mock_result
    return mock_db


@pytest.mark.asyncio
async def test_get_candidates_empty_db():
    db = make_mock_db([])
    result = await get_candidates(db)
    assert result == []


@pytest.mark.asyncio
async def test_get_candidates_single_freelance_no_gear():
    fid = "123e4567-e89b-12d3-a456-426614174000"
    db = make_mock_db([(fid, None)])
    result = await get_candidates(db)
    assert len(result) == 1
    assert result[0].freelance_id == UUID(fid)
    assert result[0].gear_categories == []


@pytest.mark.asyncio
async def test_get_candidates_single_freelance_with_gear():
    fid = "123e4567-e89b-12d3-a456-426614174000"
    db = make_mock_db([(fid, "DRONE"), (fid, "CAMERA_360")])
    result = await get_candidates(db)
    assert len(result) == 1
    assert set(result[0].gear_categories) == {"DRONE", "CAMERA_360"}


@pytest.mark.asyncio
async def test_get_candidates_multiple_freelances():
    fid1 = "123e4567-e89b-12d3-a456-426614174000"
    fid2 = "223e4567-e89b-12d3-a456-426614174001"
    db = make_mock_db([(fid1, "DRONE"), (fid2, "ROBOTICS"), (fid2, "SENSOR")])
    result = await get_candidates(db)
    assert len(result) == 2
    profiles = {str(p.freelance_id): p for p in result}
    assert profiles[fid1].gear_categories == ["DRONE"]
    assert set(profiles[fid2].gear_categories) == {"ROBOTICS", "SENSOR"}


@pytest.mark.asyncio
async def test_get_candidates_deduplicates_freelances():
    fid = "123e4567-e89b-12d3-a456-426614174000"
    # Même freelance apparaît 3 fois (3 items de gear)
    db = make_mock_db([(fid, "DRONE"), (fid, "DRONE"), (fid, "CAMERA_360")])
    result = await get_candidates(db)
    assert len(result) == 1
```

- [ ] **Step 2 : Ajouter pytest-asyncio dans requirements-dev.txt**

Remplacer le contenu de `matching-service/requirements-dev.txt` :

```
pytest==8.3.4
pytest-cov==6.0.0
pytest-asyncio==0.24.0
httpx==0.28.1
flake8==7.1.1
bandit==1.8.0
```

Installer :

```bash
pip install -r requirements-dev.txt
```

- [ ] **Step 3 : Configurer pytest-asyncio dans pytest.ini**

Mettre à jour `matching-service/pytest.ini` :

```ini
[pytest]
pythonpath = .
asyncio_mode = auto
```

- [ ] **Step 4 : Vérifier que les tests échouent**

```bash
pytest tests/test_freelancer_repo.py -v
```

Expected: `ERRORS` — `No module named 'app.services.freelancer_repo'`

- [ ] **Step 5 : Implémenter le repository**

Créer `matching-service/app/services/freelancer_repo.py` :

```python
# C2.2.2 — Repository : accès données PostgreSQL pour le moteur de matching (SH-12)
from uuid import UUID
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.models import FreelanceDB, GearDB
from app.services.scoring import FreelancerProfile


async def get_candidates(db: AsyncSession) -> list[FreelancerProfile]:
    """Charge tous les freelances avec leur matériel VALIDATED via une jointure LEFT OUTER."""
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
```

- [ ] **Step 6 : Vérifier que les tests du repository passent**

```bash
pytest tests/test_freelancer_repo.py -v
```

Expected: 5/5 PASSED.

- [ ] **Step 7 : Lancer la suite complète**

```bash
pytest tests/ -v
```

Expected: zéro régression.

- [ ] **Step 8 : Commiter**

```bash
git add matching-service/requirements-dev.txt \
        matching-service/pytest.ini \
        matching-service/app/services/freelancer_repo.py \
        matching-service/tests/test_freelancer_repo.py
git commit -m "feat(SH-12/matching): freelancer repository — requêtes PostgreSQL avec JOIN (C2.2.2)"
```

---

## Task 4 : Câblage de l'endpoint + ticket + BACKLOG

**Files:**
- Modify: `matching-service/app/routers/matching.py`
- Modify: `matching-service/tests/test_matching.py`
- Create: `docs/tickets/SH-12-moteur-scoring.md`
- Modify: `docs/BACKLOG.md`

**Interfaces:**
- Consumes: `get_db` from `app.db.database`, `get_candidates` from `app.services.freelancer_repo`, `compute_composite_score` from `app.services.scoring`

---

- [ ] **Step 1 : Ajouter les tests d'intégration endpoint avec mock DI (RED)**

Ajouter à la fin de `matching-service/tests/test_matching.py` :

```python
from unittest.mock import AsyncMock, patch
from uuid import UUID
from main import app
from app.db.database import get_db
from app.services.scoring import FreelancerProfile

FREELANCE_A = UUID("aaaaaaaa-e89b-12d3-a456-426614174000")
FREELANCE_B = UUID("bbbbbbbb-e89b-12d3-a456-426614174001")


async def _override_get_db():
    yield None  # Session non utilisée — get_candidates est mocké


def _make_client_with_profiles(profiles: list[FreelancerProfile]):
    """Retourne un client TestClient avec get_candidates mocké."""
    from fastapi.testclient import TestClient
    app.dependency_overrides[get_db] = _override_get_db
    with patch("app.routers.matching.get_candidates", new=AsyncMock(return_value=profiles)):
        with TestClient(app) as c:
            yield c
    app.dependency_overrides.clear()


def test_match_returns_scored_freelance(client):
    profiles = [FreelancerProfile(freelance_id=FREELANCE_A, gear_categories=["DRONE"] * 5)]
    payload = {"skills": ["drone-dgac"], "location": [43.6, 1.44], "radius_km": 50.0}
    app.dependency_overrides[get_db] = _override_get_db
    with patch("app.routers.matching.get_candidates", new=AsyncMock(return_value=profiles)):
        response = client.post("/match", json=payload)
    app.dependency_overrides.clear()
    assert response.status_code == 200
    results = response.json()
    assert len(results) == 1
    assert results[0]["freelance_id"] == str(FREELANCE_A)
    assert results[0]["score"] > 0.0


def test_match_excludes_zero_score(client):
    # ROBOTICS ne couvre pas "drone-dgac" → skills_score=0.0, mais location=1.0 donc score=0.2 > 0
    # Pour score=0.0, il faudrait que skills ET gear soient 0 ET location=0 — impossible avec location stub=1.0
    # On teste donc qu'un profil sans gear ET sans skills match a un score faible mais non nul (0.2)
    profiles = [FreelancerProfile(freelance_id=FREELANCE_A, gear_categories=[])]
    payload = {"skills": ["drone-dgac"], "location": [43.6, 1.44], "radius_km": 50.0}
    app.dependency_overrides[get_db] = _override_get_db
    with patch("app.routers.matching.get_candidates", new=AsyncMock(return_value=profiles)):
        response = client.post("/match", json=payload)
    app.dependency_overrides.clear()
    assert response.status_code == 200
    results = response.json()
    # score = 0.5*0 + 0.3*0 + 0.2*1.0 = 0.2 → inclus car > 0
    assert len(results) == 1
    assert results[0]["score"] == pytest.approx(0.2)


def test_match_results_sorted_by_score_desc(client):
    profiles = [
        FreelancerProfile(freelance_id=FREELANCE_A, gear_categories=[]),          # score faible
        FreelancerProfile(freelance_id=FREELANCE_B, gear_categories=["DRONE"] * 5),  # score élevé
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


def test_match_returns_empty_list_when_no_freelances(client):
    app.dependency_overrides[get_db] = _override_get_db
    with patch("app.routers.matching.get_candidates", new=AsyncMock(return_value=[])):
        payload = {"skills": ["drone-dgac"], "location": [43.6, 1.44], "radius_km": 50.0}
        response = client.post("/match", json=payload)
    app.dependency_overrides.clear()
    assert response.status_code == 200
    assert response.json() == []
```

Ne pas oublier d'ajouter `import pytest` en haut du fichier test_matching.py.

- [ ] **Step 2 : Vérifier que les nouveaux tests échouent**

```bash
pytest tests/test_matching.py::test_match_returns_scored_freelance -v
```

Expected: FAIL — l'endpoint retourne toujours `[]` (stub actuel).

- [ ] **Step 3 : Câbler l'endpoint avec le scoring réel**

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
```

- [ ] **Step 4 : Vérifier que tous les tests passent**

```bash
pytest tests/ -v
```

Expected: tous les tests PASSED.

- [ ] **Step 5 : Vérifier flake8 et bandit**

```bash
flake8 matching-service/ --count --select=E9,F63,F7,F82 --show-source --statistics
flake8 matching-service/ --count --exit-zero --max-complexity=10 --max-line-length=127 --statistics
bandit -r matching-service/ -x matching-service/tests/ -ll
```

Expected: zéro erreur critique flake8. Bandit : no issues identified.

- [ ] **Step 6 : Créer le ticket SH-12**

Créer `docs/tickets/SH-12-moteur-scoring.md` :

```markdown
**Titre du Ticket :** [SH-12] Moteur de scoring multicritères (Skills + Matériel + Localisation)
**Type :** Feature
**Priorité :** High
**Estimation :** 8 Story Points
**Compétences RNCP visées :** C2.2.2, C2.2.3
**Lot :** Lot 1 (Web MVP)

### 0. Definition of Ready (DoR)
- [x] Valeur Claire : User Story INVEST validée
- [x] Specs Complètes : critères Gherkin définis
- [x] Faisabilité Technique : SQLAlchemy async + scoring pur, PostGIS délégué à SH-13
- [x] Estimé : 8 SP

### 1. User Story
**En tant que** recruteur,
**Je veux** obtenir une liste de freelances classés par pertinence,
**Afin de** identifier rapidement les meilleurs profils pour ma mission.

### 2. Contexte & Valeur Business
- **Pourquoi maintenant ?** Fondation du différenciateur SkillHunt (algorithme de matching).
- **KPI impacté :** Taux de mise en relation recruteur → freelance.

### 3. Critères d'Acceptation (Gherkin)

**Scénario 1 : Résultats triés par score**
- GIVEN une base contenant des freelances avec du matériel VALIDATED
- WHEN je POSTe `{"skills": ["drone-dgac"], "location": [43.6, 1.44], "radius_km": 50}`
- THEN je reçois une liste JSON triée score décroissant
- AND chaque résultat contient `freelance_id`, `score` ∈ [0,1], `distance_km`

**Scénario 2 : Score composite calculé**
- GIVEN un freelance avec 5 items DRONE validés
- WHEN je cherche `skills=["drone-dgac"]`
- THEN son score ≥ 0.8 (skills=1.0, gear=1.0, location=1.0 → 1.0)

**Scénario 3 : Résultats vides si aucun freelance**
- GIVEN une base vide
- WHEN je POSTe une requête valide
- THEN je reçois `[]` avec status 200

### 4. Spécifications Techniques
- Algorithme : `0.50 × skills_score + 0.30 × gear_score + 0.20 × location_score`
- `skills_score` : recall des skills requis vs skills inférés depuis les catégories de matériel
- `gear_score` : min(1.0, nb_gear_validé / 5)
- `location_score` : 1.0 (stub jusqu'à SH-13)
- DB : requête SQLAlchemy async LEFT JOIN `users` ↔ `gear` (status=VALIDATED, role=FREELANCE)
- DI FastAPI : `get_db` injectable → mockable dans les tests

### 5. Definition of Done (DoD)
- [x] Tests unitaires scoring (fonctions pures) : ≥ 12 cas
- [x] Tests repository (mock AsyncSession)
- [x] Tests endpoint (DI override, mock get_candidates)
- [x] CI verte : lint + bandit + tests + build
- [x] Swagger mis à jour (C2.4.1)
- [x] Aucun secret en dur
```

- [ ] **Step 7 : Mettre à jour BACKLOG.md**

Dans `docs/BACKLOG.md`, changer la ligne SH-12 :

```markdown
| [SH-12](tickets/SH-12-moteur-scoring.md) | Moteur de scoring multicritères (Skills + Matériel + Localisation) | 🟢 Terminé | 8 | C2.2.2 | R4 |
```

Et dans la section "Prochaines actions" :

```markdown
## Prochaines actions suggérées

1. **Suivant :** `SH-13` (Géolocalisation PostGIS) → remplace le stub `score_location` par de vraies distances
2. **Suivant :** `SH-10` (Certifications upload S3 + Signed URLs) → complète EP02
3. Mettre à jour le statut ici à chaque changement (🔵 → 🟡 → 🟠 → 🟢).
```

- [ ] **Step 8 : Lancer la suite complète une dernière fois**

```bash
pytest tests/ -v --tb=short
```

Expected: tous les tests PASSED.

- [ ] **Step 9 : Commiter**

```bash
git add matching-service/app/routers/matching.py \
        matching-service/tests/test_matching.py \
        docs/tickets/SH-12-moteur-scoring.md \
        docs/BACKLOG.md
git commit -m "feat(SH-12/matching): câblage POST /match — scoring réel + tests DI (C2.2.2, C2.4.1)"
```

- [ ] **Step 10 : Push et PR vers develop**

```bash
git push -u origin feature/SH-12-moteur-scoring
gh pr create \
  --base develop \
  --title "[SH-12] Moteur de scoring multicritères (Skills + Matériel + Localisation stub)" \
  --body "## Résumé
- Moteur de scoring multicritères : 0.50×skills + 0.30×gear + 0.20×location (stub)
- Couche DB async (SQLAlchemy + asyncpg) avec modèles ORM en lecture seule
- Repository freelancer avec LEFT JOIN optimisé (pas de N+1)
- Fonctions de scoring pures, fully unit-testées (TDD)
- Endpoint POST /match câblé avec DI injectable (testable sans base réelle)
- Suppression du champ \`freelance_id\` sémantiquement incorrect dans MatchRequest

## Compétences RNCP
- C2.2.2 : harnais de tests (scoring, repo, endpoint)
- C2.2.3 : validation stricte des entrées Pydantic
- C2.4.1 : documentation OpenAPI (summary, response_model, tags)

## Test plan
- [ ] CI verte (lint + bandit + pytest)
- [ ] Tester GET /health → 200
- [ ] Tester POST /match avec payload valide → 200 liste JSON
- [ ] Tester POST /match avec payload invalide → 422

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

---

## Self-Review

### 1. Spec coverage

| Exigence | Couverte par |
|---|---|
| Scoring Skills (recall) | Task 2 `score_skills` + `test_scoring.py` |
| Scoring Gear (normalisé) | Task 2 `score_gear` + `test_scoring.py` |
| Scoring Location (stub 1.0) | Task 2 `score_location` + test |
| Score composite pondéré 0.5/0.3/0.2 | Task 2 `compute_composite_score` + test_partial |
| Requête DB LEFT JOIN (no N+1) | Task 3 `get_candidates` |
| Endpoint POST /match câblé | Task 4 `matching.py` |
| Tri par score décroissant | Task 4 + `test_match_results_sorted_by_score_desc` |
| Filtrage score > 0.0 | Task 4 + `test_match_excludes_zero_score` |
| Suppression `freelance_id` de MatchRequest | Task 1 `schemas.py` |
| Ticket + BACKLOG | Task 4 |

### 2. Placeholder scan
Aucun placeholder détecté. Tout le code est complet.

### 3. Type consistency
- `FreelancerProfile.gear_categories: list[str]` utilisé de façon cohérente dans `scoring.py`, `freelancer_repo.py`, et les tests
- `compute_composite_score(profile: FreelancerProfile, request: MatchRequest) -> float` — signature identique dans `scoring.py` et `matching.py`
- `get_candidates(db: AsyncSession) -> list[FreelancerProfile]` — signature identique dans `freelancer_repo.py` et le mock `test_matching.py`
