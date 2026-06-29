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
