**Titre du Ticket :** [SH-11] Scaffolding `matching-service` FastAPI
**Type :** Feature
**Priorité :** High
**Estimation :** 3 Story Points
**Compétences RNCP visées :** C2.1.2 (structure, normes qualité PEP 8), C2.2.2 (harnais de tests pytest)
**Lot :** Lot 1 (Web MVP)

### 0. Definition of Ready (DoR)
- [x] **Valeur Claire :** Story INVEST — indépendant, 0 dépendance bloquante.
- [x] **Specs Complètes :** Structure de dossiers, librairies, endpoints de santé, modèles Pydantic de base définis ci-dessous.
- [x] **UX/UI Validé :** N/A (service interne).
- [x] **Faisabilité Technique :** FastAPI + Pydantic + pytest, stack déjà arbitrée (CLAUDE.md §3).
- [x] **Estimé :** 3 SP.

### 1. User Story (Le Besoin)
**En tant que** développeur backend,  
**Je veux** disposer d'un squelette `matching-service` FastAPI propre, testé et documenté,  
**Afin de** pouvoir implémenter le moteur de scoring (SH-12) sans friction d'outillage.

### 2. Contexte & Valeur Business
* **Pourquoi maintenant ?** Débloque tout EP03 (matching = cœur différenciant de la plateforme, cf. CLAUDE.md §1).
* **KPI impacté :** Vélocité Sprint 3 — sans ce scaffolding, SH-12/13/14 ne peuvent pas démarrer.

### 3. Critères d'Acceptation (Gherkin - BDD)

**Scénario 1 : Endpoint de santé**
* **GIVEN** le service est lancé (`uvicorn main:app`)
* **WHEN** je requête `GET /health`
* **THEN** je reçois `200 OK` avec `{"status": "ok", "service": "matching-service"}`

**Scénario 2 : Documentation auto-générée accessible**
* **GIVEN** le service est lancé
* **WHEN** j'accède à `/docs`
* **THEN** la page Swagger UI s'affiche avec les routes déclarées

**Scénario 3 : Tests pytest passants en CI**
* **GIVEN** le pipeline CI (`python-ci.yml`)
* **WHEN** `pytest --cov=. tests/` s'exécute
* **THEN** tous les tests passent, couverture ≥ 80 %

**Scénario 4 : Validation Pydantic stricte**
* **GIVEN** un modèle `MatchRequest` avec champs requis
* **WHEN** un champ obligatoire est absent dans le body
* **THEN** FastAPI retourne `422 Unprocessable Entity` avec le détail de l'erreur

### 4. Spécifications Techniques

**Structure cible :**
```
matching-service/
├── main.py                 # point d'entrée FastAPI, routes /health + /match (stub)
├── models/
│   ├── __init__.py
│   └── schemas.py          # Pydantic : MatchRequest, MatchResult, HealthResponse
├── routers/
│   ├── __init__.py
│   ├── health.py           # GET /health
│   └── matching.py         # POST /match (stub → SH-12)
├── core/
│   ├── __init__.py
│   └── config.py           # Settings via pydantic-settings (variables d'env)
├── tests/
│   ├── __init__.py
│   ├── conftest.py         # TestClient fixture
│   ├── test_health.py
│   └── test_matching.py    # tests du stub /match
├── requirements.txt        # versions épinglées
├── requirements-dev.txt    # pytest, httpx, pytest-cov
└── .env.example            # template variables d'env (jamais de vraie valeur)
```

**Modèles Pydantic minimaux (`schemas.py`) :**
- `HealthResponse` : `status: str`, `service: str`
- `MatchRequest` : `freelance_id: UUID`, `skills: list[str]`, `location: tuple[float, float]`, `radius_km: float`
- `MatchResult` : `freelance_id: UUID`, `score: float` (0.0–1.0), `distance_km: float`

**Route stub `/match` :** retourne une liste vide `[]` + `200`. Le vrai scoring arrive en SH-12.

**Config (`core/config.py`) :**
- `DATABASE_URL` (PostgreSQL+PostGIS, pour SH-12/13)
- `REDIS_URL` (pour SH-14)
- `BACKEND_CORE_URL` (pour la communication inter-services)

**CI (`python-ci.yml`) :** vérifier que le workflow existant couvre bien `matching-service/` ; ajuster les chemins si besoin.

**Règles qualité :**
- PEP 8 (flake8, `max-line-length=127`) (C2.1.2)
- Code entièrement typé (mypy compatible)
- Aucun secret dans le code

### 5. Definition of Done (DoD)
- [ ] Structure de dossiers créée, imports fonctionnels.
- [ ] `GET /health` retourne `200` + payload attendu.
- [ ] `POST /match` stub retourne `200` + `[]`.
- [ ] Swagger `/docs` accessible, routes documentées avec `summary` et `response_model`.
- [ ] `requirements.txt` + `requirements-dev.txt` avec versions épinglées.
- [ ] `.env.example` présent, aucun secret commité.
- [ ] Tests pytest écrits pour `/health` et le stub `/match`, couverture ≥ 80 %.
- [ ] `python-ci.yml` passe (flake8 + pytest).
- [ ] PR créée, code review effectuée.
