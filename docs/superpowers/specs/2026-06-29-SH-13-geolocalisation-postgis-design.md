# SH-13 — Géolocalisation PostGIS (rayon d'action + score de proximité) — Design

> Spec de conception issue d'un brainstorming. Cible : microservice `matching-service` (FastAPI).
> Remplace le stub `score_location` (1.0) de SH-12 par un vrai scoring géospatial fondé sur PostGIS.
> Compétences RNCP : **C2.2.3** (sécurité des requêtes, anti-injection), **C2.2.2** (tests, dont intégration géo).

## 1. Objectif & valeur

Permettre au recruteur de ne voir que les freelances **réellement atteignables** dans son rayon d'action,
classés en récompensant la proximité. C'est le filtre de pertinence géographique qui manquait à SH-12
(où `score_location` valait toujours 1.0 et où aucun rayon n'était appliqué).

KPI : pertinence du matching (R4), `/match` < 250 ms (via l'index spatial).

## 2. État existant (acquis)

- Table `users` (backend-core, migration SH-6) : colonne `location geography(Point, 4326)` **nullable**,
  avec **index spatial GiST** `IDX_users_location` déjà créé.
- `matching-service` (SH-12) : couche scoring pure + `freelancer_repo.get_candidates(db)` (LEFT JOIN
  `users`↔`gear` VALIDATED) + endpoint `POST /match` (tri par score décroissant, filtre `score > 0`).
- `MatchRequest` : `skills`, `location: tuple[float, float]` **(lat, lon)**, `radius_km` (`> 0`, `≤ 500`).
- `MatchResult` : `freelance_id`, `score`, `distance_km` (aujourd'hui stub `0.0`).
- Formule composite (inchangée) : `0.50 × skills + 0.30 × gear + 0.20 × location`.

## 3. Décisions produit (validées en brainstorming)

| # | Décision | Choix retenu |
|---|---|---|
| D1 | Calcul de distance / rayon | **En SQL PostGIS** (`ST_DWithin` + `ST_Distance`), index GiST. Pas d'API carto tierce, pas de Haversine Python. |
| D2 | Rôle du rayon | **Filtre dur** : `ST_DWithin` exclut tout freelance hors rayon. |
| D3 | `location_score` dans le rayon | **Décroissance linéaire** : `max(0, 1 - distance_km / radius_km)`. |
| D4 | Freelance `location IS NULL` | **Exclu** du résultat (naturellement écarté par la requête). |
| D5 | Départage à score égal | **Distance croissante** (le plus proche d'abord). |
| D6 | Stratégie de test | **Test d'intégration PostGIS réel en CI** (service container) + unit tests des fonctions pures. |

**Hors périmètre (tickets séparés) :**
- Renseigner / mettre à jour la position d'un freelance, et la rendre obligatoire à l'onboarding
  (contrainte `CHECK` conditionnelle par rôle) → **ticket SH-34** (backend-core). SH-13 est en **lecture seule**.
- Cache Redis des résultats → **SH-14**.

## 4. Architecture (changements par couche)

La séparation de SH-12 est conservée : **PostGIS fait le travail géo**, **Python garde le scoring pur**.

### 4.1 Repository — `app/services/freelancer_repo.py`

Nouvelle signature :
```python
async def get_candidates(
    db: AsyncSession,
    location: tuple[float, float],   # (lat, lon) tel que reçu dans MatchRequest
    radius_km: float,
) -> list[FreelancerProfile]: ...
```

Requête (paramétrée, **aucune concaténation** — anti-injection R7) :
- Point de référence : `ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography`
  — ⚠️ **inversion** : `MatchRequest.location` est `(lat, lon)`, mais `ST_MakePoint` attend `(lon, lat)`.
- Distance : `ST_Distance(users.location, :point) / 1000.0 AS distance_km` (PostGIS renvoie des **mètres**).
- Filtre dur : `WHERE users.role = 'FREELANCE' AND users.location IS NOT NULL
  AND ST_DWithin(users.location, :point, :radius_m)` avec `:radius_m = radius_km * 1000`
  (utilise l'index GiST).
- `LEFT OUTER JOIN gear ON gear."freelanceId" = users.id AND gear.status = 'VALIDATED'` (conservé de SH-12).
- `ORDER BY users.id` (regroupement applicatif des lignes par freelance, comme SH-12).

Les fonctions PostGIS sont appelées via `func.ST_*` de SQLAlchemy (ou `text()` avec **bindparams**), jamais
par interpolation de chaîne. La colonne `geography` peut être typée via **GeoAlchemy2** (décision d'implémentation
laissée au plan ; à défaut, cast SQL explicite).

**Bonus perf** : le filtre rayon supprime le scan de table complet relevé en revue SH-12 (#2) — on ne charge
plus que les candidats géographiquement pertinents.

### 4.2 Modèle — `FreelancerProfile` (dans `app/services/scoring.py`)

Ajout d'un champ fourni par la DB :
```python
@dataclass
class FreelancerProfile:
    freelance_id: UUID
    gear_categories: list[str] = field(default_factory=list)
    distance_km: float = 0.0
```

### 4.3 Scoring pur — `app/services/scoring.py`

`score_location` devient **pur** (plus de stub, plus de coords) :
```python
def score_location(distance_km: float, radius_km: float) -> float:
    """Décroissance linéaire : 1.0 au point exact, ~0 au bord du rayon."""
    return max(0.0, 1.0 - distance_km / radius_km)
```
`compute_composite_score(profile, request)` utilise `profile.distance_km` et `request.radius_km`.
La pondération composite (0.50/0.30/0.20) est **inchangée**.

### 4.4 Endpoint — `app/routers/matching.py`

- Passe `request.location` et `request.radius_km` à `get_candidates`.
- `MatchResult.distance_km` = vraie distance arrondie (`round(profile.distance_km, 2)`).
- Tri : score décroissant, puis distance croissante (D5).
- Le filtre `score > 0` est conservé (et redevient utile, voir §5).

## 5. Cas limites

| Situation | Comportement |
|---|---|
| distance = 0 km | `location_score = 1.0` |
| distance = rayon | `location_score ≈ 0.0` (inclus, départagé par skills/gear puis distance) |
| distance > rayon | jamais scoré (exclu par `ST_DWithin`) ; `max(0, …)` en défense |
| `radius_km` | déjà validé `> 0` et `≤ 500` → pas de division par zéro |
| `location IS NULL` | exclu par la requête |
| candidat au bord, sans skill ni gear | composite `= 0` → exclu par `score > 0` (résout le no-op #3 de la revue SH-12) |

## 6. Sécurité (CLAUDE.md §8)

- **Anti-injection (R7)** : requête entièrement paramétrée (bindparams / `func.ST_*`), aucune concaténation SQL.
- **Validation des entrées** : `location` et `radius_km` déjà bornés par Pydantic (SH-12) ; bornes inchangées.
- Pas de secret en dur (`DATABASE_URL` via env, déjà en place).
- Pas d'exposition de PII : la réponse ne contient que `freelance_id`, `score`, `distance_km`.

## 7. Stratégie de tests (D6)

**Unit (sans DB) :**
- `score_location` : 0 km → 1.0 ; mi-distance → valeur attendue ; bord → ~0 ; au-delà → clamp 0.
- `compute_composite_score` : intègre une vraie `distance_km`.
- Mapping repository (regroupement lignes → profils, `distance_km` propagée) avec `AsyncSession` mocké.

**Intégration PostGIS réel (CI, marqué `@pytest.mark.integration`, skip si pas de DB locale) :**
- Service container `postgis/postgis` dans `python-ci.yml` (+ healthcheck), `DATABASE_URL` injecté.
- Fixture : `CREATE EXTENSION postgis` + tables minimales `users`/`gear` (miroir du schéma backend-core) + seed
  de freelances à positions connues : Toulouse `(43.6, 1.44)`, Paris `(48.85, 2.35)`, Lyon `(45.76, 4.83)`.
- Assertions : recherche depuis Toulouse rayon 50 km → ne renvoie que le(s) freelance(s) toulousain(s) ;
  distances justes (±1 km de tolérance) ; freelance `location NULL` exclu ; ordre par proximité ;
  le LEFT JOIN gear continue de fonctionner.

## 8. Fichiers concernés (indicatif)

| Opération | Chemin |
|---|---|
| Modifier | `matching-service/app/services/freelancer_repo.py` (requête géo + signature) |
| Modifier | `matching-service/app/services/scoring.py` (`FreelancerProfile.distance_km`, `score_location` pur) |
| Modifier | `matching-service/app/routers/matching.py` (passe location/radius, vraie `distance_km`, tri) |
| Modifier | `matching-service/tests/test_scoring.py` (nouveau `score_location`) |
| Modifier | `matching-service/tests/test_freelancer_repo.py` (mapping + `distance_km`) |
| Créer | `matching-service/tests/test_geo_integration.py` (intégration PostGIS) |
| Modifier | `matching-service/requirements.txt` (GeoAlchemy2 si retenu) |
| Modifier | `.github/workflows/python-ci.yml` (service container PostGIS + step intégration) |
| Créer | `docs/tickets/SH-13-geolocalisation-postgis.md` |
| Modifier | `docs/BACKLOG.md` (SH-13 → 🟢 ; lever les TODO SH-13 de SH-12) |

## 9. Suites / liens

- **SH-34** (à créer) : position freelance obligatoire à l'onboarding + endpoint MAJ + `CHECK` rôle.
- **SH-14** : cache Redis des résultats de `/match`.
- Lève les `# TODO SH-13` posés dans `matching.py` (filtre no-op) et `freelancer_repo.py` (scan complet).
