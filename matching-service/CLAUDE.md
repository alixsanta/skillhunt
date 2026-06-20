# CLAUDE.md — matching-service (Microservice FastAPI)

> Contexte local. Hérite du `CLAUDE.md` racine. **Service à démarrer** (dossier encore vide).

## Rôle du service
Microservice de **scoring de matching multicritères** (Skills + Matériel + Localisation) — le cœur métier différenciant de SkillHunt.
Python 3.11 · FastAPI · asynchrone. Lit les données géo dans **PostgreSQL/PostGIS** (requêtes de rayon d'action). Communique avec le `backend-core` de façon **asynchrone via Redis** (bus d'événements : consomme les événements « nouvelle offre / nouveau profil »).

## Structure cible à créer
```
matching-service/
├── main.py               # app FastAPI (point d'entrée)
├── requirements.txt      # dépendances (attendu par python-ci.yml)
├── app/
│   ├── routers/          # endpoints (ex. /match)
│   ├── models/           # schémas Pydantic (validation I/O)
│   ├── services/         # logique de scoring
│   └── db/               # accès PostGIS, Redis
└── tests/                # pytest (attendu par la CI)
```
> La CI (`.github/workflows/python-ci.yml`) attend `matching-service/requirements.txt` et un dossier `tests/`.

## Conventions
- **PEP 8** (flake8, `max-line-length=127`, `max-complexity=10`). Zéro erreur `E9,F63,F7,F82`.
- **Tout typer** ; validation des entrées/sorties via **modèles Pydantic** (anti-injection, C2.2.3).
- **Pas de requête SQL brute** concaténée — passer par une couche d'accès paramétrée/ORM. Les requêtes spatiales s'appuient sur **PostGIS** (pas d'API carto tierce).
- Performance : endpoint `/match` cible **< 250 ms** (KPI R4) ; mettre en cache les résultats fréquents via Redis.
- Sécurité : `bandit` doit rester propre (pas d'`eval`, pas d'`assert` en prod, secrets en variables d'env).
- Tests `pytest` avec couverture pour le moteur de scoring et les requêtes géo (C2.2.2).

## Commandes
```bash
python -m venv venv
# Windows : venv\Scripts\activate   |   *nix : source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload          # adapter au point d'entrée réel
flake8 .
pytest --cov=. tests/
```
