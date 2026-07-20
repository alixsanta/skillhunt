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
