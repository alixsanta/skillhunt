**Titre du Ticket :** [SH-33] Résolveur besoin→critères — catalogue de cas d'usage pour recruteur non-expert
**Type :** User Story / Feature
**Priorité :** Medium
**Estimation :** 5 Story Points (Fibonacci)
**Compétences RNCP visées :** C2.2.2 (tests), C2.2.3 (validation entrées), C2.4.1 (Swagger)
**Lot :** Lot 1 (Web MVP)

> **Dépend de [SH-12](SH-12-moteur-scoring.md)** (moteur de scoring). Posé **devant** le moteur, qui
> reste inchangé. Spec de design : `docs/superpowers/specs/2026-06-28-SH-33-resolveur-besoin-criteres-design.md`.
> **Livrable RNCP associé (hors code) :** mise à jour du dossier `SkillHunt.docx` (persona B2C + SWOT).

### 0. Definition of Ready (DoR)
- [x] **Valeur Claire :** permettre à un recruteur non-expert (particulier) de trouver le bon freelance sans connaître le vocabulaire technique.
- [x] **Specs Complètes :** critères Gherkin ci-dessous (cas passants + erreurs + repli).
- [x] **UX/UI Validé :** n/a backend (l'UI de sélection est côté front, EP05).
- [x] **Faisabilité Technique :** catalogue constante (miroir `CATEGORY_SKILL_MAP`) + réutilisation du scoring SH-12 ; endpoint séparé.
- [x] **Estimé :** 5 SP.

### 1. User Story
**En tant que** recruteur **non-expert** (ex. un particulier voulant faire inspecter sa toiture),
**Je veux** décrire mon besoin via un **cas d'usage en langage clair** (sans connaître le matériel ni les compétences techniques),
**Afin de** obtenir quand même une liste de freelances pertinents, classés par score.

### 2. Contexte & Valeur Business
* **Pourquoi maintenant ?** Élargit le marché au B2C (décision produit MVP). Le moteur SH-12 seul exclut les recruteurs qui ne savent pas nommer leurs critères.
* **KPI impacté :** taux de mise en relation B2C, complétion de recherche (R10), pertinence (R4).

### 3. Critères d'Acceptation (Gherkin - BDD)

**Scénario 1 : Recherche par cas d'usage**
* **GIVEN** un catalogue contenant `ROOF_INSPECTION` (« Inspection de toiture »)
* **WHEN** je POSTe `/match/by-use-case` avec `{ "use_case_id": "ROOF_INSPECTION", "location": [43.6, 1.44], "radius_km": 50 }`
* **THEN** le système **résout** le cas d'usage en `skills` (`["drone-dgac", "telepilote"]`)
* **AND** réutilise le moteur SH-12 pour renvoyer une liste triée par score décroissant.

**Scénario 2 : Transparence des critères inférés**
* **WHEN** une recherche par cas d'usage réussit
* **THEN** la réponse contient `resolved_criteria` (label du cas d'usage + skills recherchés) en plus des `results`.

**Scénario 3 : Lister le catalogue**
* **WHEN** je GET `/use-cases`
* **THEN** je reçois la liste des cas d'usage disponibles (`id`, `label`, `description`) pour peupler l'UI.

**Scénario 4 : Cas d'usage inconnu (jamais bloqué — R10)**
* **GIVEN** un `use_case_id` absent du catalogue
* **WHEN** je POSTe `/match/by-use-case`
* **THEN** le système renvoie **400** avec la liste des cas d'usage valides (pas de cul-de-sac).

**Scénario 5 : Payload invalide**
* **GIVEN** une `location` hors bornes ou un `radius_km` ≤ 0
* **THEN** le système renvoie **422** (validation Pydantic, comme SH-12).

### 4. Spécifications Techniques
* **Service `matching-service` (FastAPI) :**
    * `app/services/use_cases.py` : `UseCase` (dataclass `frozen`), `USE_CASE_CATALOG: dict[str, UseCase]`, `resolve_use_case(id) -> UseCase`.
    * `app/routers/use_cases.py` : `GET /use-cases`.
    * `app/routers/matching.py` : `POST /match/by-use-case` — résout puis **réutilise** `get_candidates` + `compute_composite_score` (SH-12 inchangé).
* **Schémas Pydantic :** `UseCaseSummary` (id, label, description), `MatchByUseCaseRequest` (use_case_id, location, radius_km — mêmes bornes que `MatchRequest`), `MatchByUseCaseResponse` (`resolved_criteria` + `results: list[MatchResult]`).
* **Invariant de cohérence (NON négociable) :** pour tout `UseCase`, `set(skills) ⊆ ⋃ CATEGORY_SKILL_MAP.values()` — sinon recall toujours nul. **Vérifié par un test.**
* **Catalogue MVP (constante) :** `ROOF_INSPECTION`, `REAL_ESTATE_VIDEO`, `SITE_MAPPING`, `INDUSTRIAL_ROBOTICS`, `VR_360_TOUR`, `SENSOR_SURVEY` (skills ⊆ `CATEGORY_SKILL_MAP`).
* **Dégradation gracieuse :** `use_case_id` inconnu → 400 + cas valides ; option « Autre » côté UI (repli par grand domaine) ; aucun candidat → `results: []`.
* **`// TODO` explicites :** migration catalogue constante → table `use_cases` + endpoint admin (référentiel éditable, cf. dossier §1.4/§1.6).

### 5. Definition of Done (DoD)
- [ ] `UseCase` + `USE_CASE_CATALOG` + `resolve_use_case` (constante code).
- [ ] `GET /use-cases` + `POST /match/by-use-case` (réutilise le scoring SH-12 sans le modifier).
- [ ] **Test de l'invariant de cohérence** catalogue ⊆ `CATEGORY_SKILL_MAP`.
- [ ] Tests : résolution, `resolved_criteria`, tri des résultats, `use_case_id` inconnu → 400, payload invalide → 422.
- [ ] CI verte : flake8 + bandit + pytest.
- [ ] Swagger / OpenAPI à jour (`summary`, `response_model`, `tags`) — C2.4.1.
- [ ] Aucun secret en dur.
- [ ] Backlog mis à jour (SH-33 → 🟢).
- [ ] **Hors code (suivi séparé) :** dossier `SkillHunt.docx` mis à jour (persona B2C + SWOT).
