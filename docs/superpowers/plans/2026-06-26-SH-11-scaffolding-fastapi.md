# [SH-11] Scaffolding matching-service FastAPI — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Créer la structure complète du microservice `matching-service` (FastAPI, Python 3.11), avec les endpoints `/health` et `/match` (stub), les modèles Pydantic, les tests pytest, et les dépendances épinglées — prêt pour que le moteur de scoring SH-12 s'y branche directement.

**Architecture:** FastAPI avec une structure `app/` en modules (routers, models, services, db, core). Le `main.py` à la racine de `matching-service/` assemble les routers. Les tests s'exécutent depuis `matching-service/` (`cd matching-service && pytest`), ce qui garantit que les imports relatifs fonctionnent en CI. Pas de dépendance externe réelle (PostgreSQL, Redis) à ce stade — config uniquement.

**Tech Stack:** Python 3.11 · FastAPI 0.115 · Pydantic v2 · pydantic-settings · uvicorn · pytest + pytest-cov + httpx · flake8 · bandit

## Global Constraints

- PEP 8 strict : `flake8 --max-line-length=127 --max-complexity=10` ; zéro erreur `E9,F63,F7,F82`.
- Code entièrement typé (annotations sur toutes les fonctions et variables publiques).
- Aucun secret en dur : toute config passe par `core/config.py` → variables d'environnement.
- Pas de SQL brut ni concaténé.
- Bandit propre (pas d'`eval`, pas d'`assert` en chemin de production).
- Couverture pytest ≥ 80 %.
- Toutes les routes documentées Swagger (`summary`, `response_model`, `tags`).
- Branches : `feature/SH-11-scaffolding-fastapi`. Commits Conventional Commits (`feat:`, `ci:`, `test:`).
- Ne jamais push directement sur `main` ; PR requise.

---

## File Map

| Fichier | Action | Responsabilité |
|---------|--------|----------------|
| `matching-service/requirements.txt` | Créer | Dépendances runtime épinglées |
| `matching-service/requirements-dev.txt` | Créer | Outils dev (pytest, httpx, flake8, bandit) |
| `matching-service/.env.example` | Créer | Template variables d'env (aucune vraie valeur) |
| `matching-service/main.py` | Créer | Point d'entrée FastAPI, assemble les routers |
| `matching-service/app/__init__.py` | Créer | Package `app` |
| `matching-service/app/core/__init__.py` | Créer | Package `core` |
| `matching-service/app/core/config.py` | Créer | `Settings` via pydantic-settings |
| `matching-service/app/models/__init__.py` | Créer | Package `models` |
| `matching-service/app/models/schemas.py` | Créer | Pydantic : `HealthResponse`, `MatchRequest`, `MatchResult` |
| `matching-service/app/routers/__init__.py` | Créer | Package `routers` |
| `matching-service/app/routers/health.py` | Créer | `GET /health` |
| `matching-service/app/routers/matching.py` | Créer | `POST /match` (stub) |
| `matching-service/app/services/__init__.py` | Créer | Package `services` (vide, pour SH-12) |
| `matching-service/app/db/__init__.py` | Créer | Package `db` (vide, pour SH-13) |
| `matching-service/tests/__init__.py` | Créer | Package `tests` |
| `matching-service/tests/conftest.py` | Créer | Fixture `TestClient` partagée |
| `matching-service/tests/test_schemas.py` | Créer | Tests unitaires Pydantic |
| `matching-service/tests/test_health.py` | Créer | Tests `GET /health` |
| `matching-service/tests/test_matching.py` | Créer | Tests `POST /match` stub |
| `.github/workflows/python-ci.yml` | Modifier | Activer le cache pip (commentaire SH-11) |

---

## Task 1 : Branche Git + squelette de dossiers + dépendances

**Files:**
- Create: `matching-service/requirements.txt`
- Create: `matching-service/requirements-dev.txt`
- Create: `matching-service/.env.example`
- Create: `matching-service/app/__init__.py` (vide)
- Create: `matching-service/app/core/__init__.py` (vide)
- Create: `matching-service/app/models/__init__.py` (vide)
- Create: `matching-service/app/routers/__init__.py` (vide)
- Create: `matching-service/app/services/__init__.py` (vide)
- Create: `matching-service/app/db/__init__.py` (vide)
- Create: `matching-service/tests/__init__.py` (vide)

**Interfaces:**
- Produces: packages importables `app.*`, `tests.*`; `requirements.txt` consommé par CI

- [ ] **Step 1 : Créer la branche**

```bash
git checkout -b feature/SH-11-scaffolding-fastapi
```

- [ ] **Step 2 : Créer les dossiers**

```bash
mkdir -p matching-service/app/core
mkdir -p matching-service/app/models
mkdir -p matching-service/app/routers
mkdir -p matching-service/app/services
mkdir -p matching-service/app/db
mkdir -p matching-service/tests
```

- [ ] **Step 3 : Créer les fichiers `__init__.py` vides**

```bash
touch matching-service/app/__init__.py
touch matching-service/app/core/__init__.py
touch matching-service/app/models/__init__.py
touch matching-service/app/routers/__init__.py
touch matching-service/app/services/__init__.py
touch matching-service/app/db/__init__.py
touch matching-service/tests/__init__.py
```

Sur Windows PowerShell, remplacer `touch` par :
```powershell
$files = @(
  "matching-service/app/__init__.py",
  "matching-service/app/core/__init__.py",
  "matching-service/app/models/__init__.py",
  "matching-service/app/routers/__init__.py",
  "matching-service/app/services/__init__.py",
  "matching-service/app/db/__init__.py",
  "matching-service/tests/__init__.py"
)
foreach ($f in $files) { if (-not (Test-Path $f)) { New-Item -ItemType File -Path $f -Force | Out-Null } }
```

- [ ] **Step 4 : Créer `requirements.txt`**

Contenu exact de `matching-service/requirements.txt` :
```
fastapi==0.115.5
uvicorn[standard]==0.32.1
pydantic==2.10.3
pydantic-settings==2.6.1
```

- [ ] **Step 5 : Créer `requirements-dev.txt`**

Contenu exact de `matching-service/requirements-dev.txt` :
```
pytest==8.3.4
pytest-cov==6.0.0
httpx==0.28.1
flake8==7.1.1
bandit==1.8.0
```

- [ ] **Step 6 : Créer `.env.example`**

Contenu exact de `matching-service/.env.example` :
```
DATABASE_URL=postgresql+psycopg2://user:password@localhost:5432/skillhunt
REDIS_URL=redis://localhost:6379/0
BACKEND_CORE_URL=http://localhost:3001
```

- [ ] **Step 7 : Installer les dépendances localement**

```bash
cd matching-service
python -m venv venv
# Windows :
venv\Scripts\activate
# Linux/macOS :
# source venv/bin/activate

pip install -r requirements.txt
pip install -r requirements-dev.txt
cd ..
```

- [ ] **Step 8 : Commit**

```bash
git add matching-service/requirements.txt matching-service/requirements-dev.txt matching-service/.env.example
git add matching-service/app/ matching-service/tests/
git commit -m "feat(SH-11/matching): scaffold directory structure and pin dependencies"
```

---

## Task 2 : Configuration (`core/config.py`)

**Files:**
- Create: `matching-service/app/core/config.py`

**Interfaces:**
- Produces: `settings` (instance singleton de `Settings`) importable depuis `from app.core.config import settings`

> Pas de tests pour `config.py` : il ne contient que la déclaration des variables d'env, testée implicitement par tous les autres tests qui importent l'app.

- [ ] **Step 1 : Créer `app/core/config.py`**

Contenu exact de `matching-service/app/core/config.py` :
```python
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # C2.2.3 — Secrets hors du code, chargés depuis les variables d'environnement
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg2://postgres:postgres@localhost:5432/skillhunt"
    redis_url: str = "redis://localhost:6379/0"
    backend_core_url: str = "http://localhost:3001"


settings = Settings()
```

- [ ] **Step 2 : Vérifier que flake8 passe**

```bash
cd matching-service
flake8 app/core/config.py --max-line-length=127
cd ..
```

Sortie attendue : aucune ligne d'erreur (silence = succès).

- [ ] **Step 3 : Commit**

```bash
git add matching-service/app/core/config.py
git commit -m "feat(SH-11/matching): add Settings via pydantic-settings (C2.2.3)"
```

---

## Task 3 : Modèles Pydantic — TDD

**Files:**
- Create: `matching-service/tests/test_schemas.py`
- Create: `matching-service/app/models/schemas.py`

**Interfaces:**
- Produces: `HealthResponse`, `MatchRequest`, `MatchResult` depuis `from app.models.schemas import …`

- [ ] **Step 1 : Écrire les tests (ils vont échouer)**

Contenu exact de `matching-service/tests/test_schemas.py` :
```python
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
        freelance_id=UUID("123e4567-e89b-12d3-a456-426614174000"),
        skills=["drone-dgac", "fpv"],
        location=(43.6, 1.44),
        radius_km=50.0,
    )
    assert len(req.skills) == 2
    assert req.radius_km == 50.0


def test_match_request_rejects_empty_skills():
    with pytest.raises(ValidationError):
        MatchRequest(
            freelance_id=UUID("123e4567-e89b-12d3-a456-426614174000"),
            skills=[],
            location=(43.6, 1.44),
            radius_km=50.0,
        )


def test_match_request_rejects_negative_radius():
    with pytest.raises(ValidationError):
        MatchRequest(
            freelance_id=UUID("123e4567-e89b-12d3-a456-426614174000"),
            skills=["fpv"],
            location=(43.6, 1.44),
            radius_km=-10.0,
        )


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

- [ ] **Step 2 : Vérifier que les tests échouent**

```bash
cd matching-service
pytest tests/test_schemas.py -v
cd ..
```

Sortie attendue : `ModuleNotFoundError: No module named 'app.models.schemas'`

- [ ] **Step 3 : Implémenter `schemas.py`**

Contenu exact de `matching-service/app/models/schemas.py` :
```python
from uuid import UUID
from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: str
    service: str


class MatchRequest(BaseModel):
    # C2.2.3 — Validation stricte des entrées (anti-injection, OWASP A03)
    freelance_id: UUID
    skills: list[str] = Field(min_length=1)
    location: tuple[float, float]
    radius_km: float = Field(gt=0, le=500)


class MatchResult(BaseModel):
    freelance_id: UUID
    score: float = Field(ge=0.0, le=1.0)
    distance_km: float = Field(ge=0.0)
```

- [ ] **Step 4 : Vérifier que les tests passent**

```bash
cd matching-service
pytest tests/test_schemas.py -v
cd ..
```

Sortie attendue :
```
tests/test_schemas.py::test_health_response_valid PASSED
tests/test_schemas.py::test_match_request_valid PASSED
tests/test_schemas.py::test_match_request_rejects_empty_skills PASSED
tests/test_schemas.py::test_match_request_rejects_negative_radius PASSED
tests/test_schemas.py::test_match_result_valid PASSED
tests/test_schemas.py::test_match_result_rejects_score_above_one PASSED
6 passed
```

- [ ] **Step 5 : Commit**

```bash
git add matching-service/tests/test_schemas.py matching-service/app/models/schemas.py
git commit -m "test(SH-11/matching): Pydantic schemas with validation tests (C2.2.3)"
```

---

## Task 4 : Endpoint `/health` — TDD

**Files:**
- Create: `matching-service/tests/conftest.py`
- Create: `matching-service/tests/test_health.py`
- Create: `matching-service/app/routers/health.py`
- Create: `matching-service/main.py`

**Interfaces:**
- Consumes: `HealthResponse` depuis `app.models.schemas`
- Produces: `app` FastAPI importable depuis `from main import app` ; `GET /health` → `200 {"status":"ok","service":"matching-service"}`

- [ ] **Step 1 : Écrire `conftest.py` (fixture partagée)**

Contenu exact de `matching-service/tests/conftest.py` :
```python
import pytest
from fastapi.testclient import TestClient
from main import app


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)
```

- [ ] **Step 2 : Écrire les tests `/health` (ils vont échouer)**

Contenu exact de `matching-service/tests/test_health.py` :
```python
def test_health_status_200(client):
    response = client.get("/health")
    assert response.status_code == 200


def test_health_payload(client):
    response = client.get("/health")
    body = response.json()
    assert body["status"] == "ok"
    assert body["service"] == "matching-service"


def test_health_content_type(client):
    response = client.get("/health")
    assert "application/json" in response.headers["content-type"]
```

- [ ] **Step 3 : Vérifier que les tests échouent**

```bash
cd matching-service
pytest tests/test_health.py -v
cd ..
```

Sortie attendue : `ModuleNotFoundError: No module named 'main'`

- [ ] **Step 4 : Créer le router `/health`**

Contenu exact de `matching-service/app/routers/health.py` :
```python
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
```

- [ ] **Step 5 : Créer `main.py`**

Contenu exact de `matching-service/main.py` :
```python
from fastapi import FastAPI
from app.routers import health, matching

app = FastAPI(
    title="SkillHunt — Matching Service",
    description="Microservice de scoring multicritères (Skills + Matériel + Localisation)",
    version="0.1.0",
)

app.include_router(health.router)
app.include_router(matching.router)
```

> `matching.router` est référencé ici mais créé en Task 5. Pour que `main.py` soit importable avant Task 5, créer `matching.py` en stub minimal maintenant (voir note ci-dessous) **ou** créer les deux fichiers dans cette tâche. Option retenue : créer le stub `matching.py` ici pour éviter une ImportError bloquante.

Contenu minimal temporaire de `matching-service/app/routers/matching.py` (sera complété en Task 5) :
```python
from fastapi import APIRouter

router = APIRouter(tags=["Matching"])
```

- [ ] **Step 6 : Vérifier que les tests passent**

```bash
cd matching-service
pytest tests/test_health.py -v
cd ..
```

Sortie attendue :
```
tests/test_health.py::test_health_status_200 PASSED
tests/test_health.py::test_health_payload PASSED
tests/test_health.py::test_health_content_type PASSED
3 passed
```

- [ ] **Step 7 : Vérifier Swagger**

```bash
cd matching-service
uvicorn main:app --reload &
# Ouvrir http://127.0.0.1:8000/docs dans le navigateur
# Vérifier que GET /health apparaît dans l'interface Swagger UI
# Arrêter le serveur : Ctrl+C (ou kill %1 sur Linux)
cd ..
```

- [ ] **Step 8 : Commit**

```bash
git add matching-service/tests/conftest.py matching-service/tests/test_health.py
git add matching-service/app/routers/health.py matching-service/app/routers/matching.py
git add matching-service/main.py
git commit -m "feat(SH-11/matching): GET /health endpoint with TDD (C2.4.1)"
```

---

## Task 5 : Endpoint `/match` stub — TDD

**Files:**
- Modify: `matching-service/app/routers/matching.py` (compléter le stub)
- Create: `matching-service/tests/test_matching.py`

**Interfaces:**
- Consumes: `MatchRequest`, `MatchResult` depuis `app.models.schemas`
- Produces: `POST /match` → `200 []` ; `POST /match` payload invalide → `422`

- [ ] **Step 1 : Écrire les tests `/match` (ils vont échouer)**

Contenu exact de `matching-service/tests/test_matching.py` :
```python
def test_match_stub_returns_200_and_empty_list(client):
    payload = {
        "freelance_id": "123e4567-e89b-12d3-a456-426614174000",
        "skills": ["drone-dgac", "fpv"],
        "location": [43.6, 1.44],
        "radius_km": 50.0,
    }
    response = client.post("/match", json=payload)
    assert response.status_code == 200
    assert response.json() == []


def test_match_rejects_missing_body(client):
    response = client.post("/match", json={})
    assert response.status_code == 422


def test_match_rejects_empty_skills(client):
    payload = {
        "freelance_id": "123e4567-e89b-12d3-a456-426614174000",
        "skills": [],
        "location": [43.6, 1.44],
        "radius_km": 50.0,
    }
    response = client.post("/match", json=payload)
    assert response.status_code == 422


def test_match_rejects_negative_radius(client):
    payload = {
        "freelance_id": "123e4567-e89b-12d3-a456-426614174000",
        "skills": ["fpv"],
        "location": [43.6, 1.44],
        "radius_km": -1.0,
    }
    response = client.post("/match", json=payload)
    assert response.status_code == 422
```

- [ ] **Step 2 : Vérifier que les tests échouent**

```bash
cd matching-service
pytest tests/test_matching.py -v
cd ..
```

Sortie attendue : `404 Not Found` pour `POST /match` (la route n'existe pas encore dans le router).

- [ ] **Step 3 : Compléter `matching.py`**

Contenu final de `matching-service/app/routers/matching.py` :
```python
from fastapi import APIRouter
from app.models.schemas import MatchRequest, MatchResult

router = APIRouter(tags=["Matching"])


@router.post(
    "/match",
    response_model=list[MatchResult],
    summary="Calcul des scores de matching (stub — moteur SH-12)",
)
async def match(request: MatchRequest) -> list[MatchResult]:
    # Stub : retourne une liste vide jusqu'à l'implémentation du moteur de scoring (SH-12)
    return []
```

- [ ] **Step 4 : Vérifier que tous les tests passent**

```bash
cd matching-service
pytest tests/ -v --cov=. --cov-report=term-missing
cd ..
```

Sortie attendue :
```
tests/test_schemas.py::... PASSED  (6 tests)
tests/test_health.py::...  PASSED  (3 tests)
tests/test_matching.py::...PASSED  (4 tests)
---------- coverage ----------
TOTAL   ...%  (doit être ≥ 80 %)
13 passed
```

- [ ] **Step 5 : Vérifier flake8 et bandit**

```bash
cd matching-service
flake8 . --count --select=E9,F63,F7,F82 --show-source --statistics
flake8 . --count --exit-zero --max-complexity=10 --max-line-length=127 --statistics
bandit -r . -x ./tests/ -ll
cd ..
```

Sortie attendue : zéro erreur `E9/F6x/F82` ; bandit : `No issues identified.`

- [ ] **Step 6 : Commit**

```bash
git add matching-service/app/routers/matching.py matching-service/tests/test_matching.py
git commit -m "feat(SH-11/matching): POST /match stub with TDD and Pydantic validation (C2.2.3, C2.4.1)"
```

---

## Task 6 : Activation du cache pip en CI

**Files:**
- Modify: `.github/workflows/python-ci.yml`

**Interfaces:**
- Produces: cache pip actif, CI installe depuis `requirements.txt` + `requirements-dev.txt`

- [ ] **Step 1 : Activer le cache pip dans `setup-python`**

Dans `.github/workflows/python-ci.yml`, remplacer le bloc `🐍 Configuration de Python` :

Avant :
```yaml
      - name: 🐍 Configuration de Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'
          # Cache pip désactivé tant que matching-service/requirements.txt n'existe pas.
          # À réactiver lors du scaffolding du microservice (SH-11).
```

Après :
```yaml
      - name: 🐍 Configuration de Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'
          cache: 'pip'
          cache-dependency-path: |
            matching-service/requirements.txt
            matching-service/requirements-dev.txt
```

- [ ] **Step 2 : Mettre à jour le step d'installation pour inclure `requirements-dev.txt`**

Remplacer le bloc `📦 Installation des dépendances et outils de validation` :

Avant :
```yaml
      - name: 📦 Installation des dépendances et outils de validation
        run: |
          python -m pip install --upgrade pip
          if [ -f matching-service/requirements.txt ]; then
            pip install -r matching-service/requirements.txt
          fi
          # Installation des outils d'analyse statique, de sécurité et de test
          pip install flake8 bandit pytest pytest-cov
```

Après :
```yaml
      - name: 📦 Installation des dépendances et outils de validation
        run: |
          python -m pip install --upgrade pip
          pip install -r matching-service/requirements.txt
          pip install -r matching-service/requirements-dev.txt
```

- [ ] **Step 3 : Vérifier que le YAML est valide**

```bash
python -c "import yaml; yaml.safe_load(open('.github/workflows/python-ci.yml'))"
```

Sortie attendue : aucune erreur (silence).

- [ ] **Step 4 : Commit**

```bash
git add .github/workflows/python-ci.yml
git commit -m "ci(SH-11): enable pip cache and install requirements-dev.txt (C2.2.2)"
```

---

## Task 7 : Vérification finale + PR

- [ ] **Step 1 : Lancer la suite complète depuis la racine du repo**

```bash
cd matching-service
pytest --cov=. --cov-report=term-missing tests/
cd ..
```

Sortie attendue : 13 tests passants, couverture ≥ 80 %.

- [ ] **Step 2 : Lancer flake8 complet**

```bash
cd matching-service
flake8 . --count --select=E9,F63,F7,F82 --show-source --statistics
flake8 . --count --exit-zero --max-complexity=10 --max-line-length=127 --statistics
cd ..
```

Sortie attendue : 0 erreur `E9/F6x/F82`.

- [ ] **Step 3 : Vérifier le Swagger en local**

```bash
cd matching-service
uvicorn main:app --port 8001
# Ouvrir http://127.0.0.1:8001/docs
# Vérifier : GET /health et POST /match visibles, response_model affiché, summary lisibles
cd ..
```

- [ ] **Step 4 : Mettre à jour `docs/BACKLOG.md`**

Changer le statut de SH-11 : `🟠 En cours` → `🟢 Terminé`.

- [ ] **Step 5 : Push et créer la PR**

```bash
git push -u origin feature/SH-11-scaffolding-fastapi
gh pr create \
  --title "[SH-11] Scaffolding matching-service FastAPI" \
  --body "## Résumé
- Structure \`app/\` (routers, models, services, db, core) créée
- Endpoints \`GET /health\` et \`POST /match\` (stub) documentés Swagger
- Modèles Pydantic v2 avec validation stricte (C2.2.3)
- 13 tests pytest, couverture ≥ 80 % (C2.2.2)
- Cache pip CI activé, \`requirements-dev.txt\` installé en CI

## Test plan
- [ ] CI verte (flake8 + bandit + pytest)
- [ ] \`GET /health\` → 200 + payload attendu
- [ ] \`POST /match\` payload valide → 200 + \`[]\`
- [ ] \`POST /match\` payload invalide → 422
- [ ] Swagger \`/docs\` affiche les deux routes avec \`response_model\`"
```

---

## Self-Review

**1. Spec coverage**

| Exigence ticket SH-11 | Couverte par |
|---|---|
| `GET /health` → 200 + `{"status":"ok","service":"matching-service"}` | Task 4 |
| `POST /match` stub → 200 + `[]` | Task 5 |
| Swagger `/docs` accessible, routes documentées | Task 4 + Task 5 (`summary`, `response_model`, `tags`) |
| Validation Pydantic stricte → 422 sur champ manquant | Task 5 (`test_match_rejects_missing_body`) |
| `requirements.txt` + `requirements-dev.txt` versions épinglées | Task 1 |
| `.env.example` sans vraie valeur | Task 1 |
| Tests pytest ≥ 80 % couverture | Task 5 (step 4 vérifie) |
| `python-ci.yml` passe | Task 6 |
| PEP 8 / flake8 propre | Task 5 (step 5) + Task 7 (step 2) |
| Bandit propre | Task 5 (step 5) |
| PR créée | Task 7 |

**2. Placeholder scan** : aucun TBD / TODO / "handle edge cases" sans code.

**3. Type consistency** :
- `HealthResponse`, `MatchRequest`, `MatchResult` définis en Task 3, importés identiquement en Task 4 et Task 5.
- `from app.models.schemas import …` — chemin unique, cohérent partout.
- `from main import app` dans `conftest.py` — correspond au fichier `main.py` créé en Task 4.
