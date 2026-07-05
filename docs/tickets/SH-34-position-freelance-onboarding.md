**Titre du Ticket :** [SH-34] Position freelance obligatoire à l'onboarding (CHECK conditionnel par rôle)
**Type :** Feature
**Priorité :** High
**Estimation :** 3 Story Points (Fibonacci)
**Compétences RNCP visées :** C2.2.3 (validation stricte des entrées + contrainte d'intégrité), C2.2.2 (tests de validation & RBAC)
**Lot :** Lot 1 (Web MVP)

> Prérequis de qualité de donnée pour le **matching géospatial (SH-13)** : un freelance sans
> `location` est **invisible** dans toute recherche par rayon d'action. Aujourd'hui la colonne
> `users.location` est `nullable` (SH-6/SH-13) → on referme cette faille au niveau **applicatif
> (DTO)** *et* **base (CHECK conditionnel)**. Spec géo : `docs/tickets/SH-13-geolocalisation-postgis.md`.

### 0. Definition of Ready (DoR)
- [x] **Valeur Claire :** un freelance créé sans position ne pourra jamais matcher → règle métier « pas de position, pas de profil freelance ».
- [x] **Specs Complètes :** Gherkin ci-dessous (cas passant freelance/recruteur + cas d'erreur + non-régression données existantes).
- [x] **UX/UI :** champ position à l'onboarding freelance (carte / géoloc navigateur) — maquette à lier côté SH-20 (parcours auth web).
- [x] **Faisabilité Technique :** validation `class-validator` conditionnelle par rôle + migration TypeORM `CHECK (role <> 'FREELANCE' OR location IS NOT NULL)`.
- [x] **Estimé :** 3 SP.

### 1. User Story
**En tant que** plateforme (et recruteur en aval),
**Je veux** que tout compte **Freelance** déclare une position géographique dès l'onboarding,
**Afin de** garantir qu'il soit éligible au matching par rayon d'action (aucun profil « fantôme » hors de la carte).

*(Un **Recruteur** ou un **Admin** n'a pas de position obligatoire : la contrainte est conditionnée au rôle.)*

### 2. Contexte & Valeur Business
- **Pourquoi maintenant ?** SH-13 a livré la recherche géospatiale PostGIS ; sans donnée de position fiable, le moteur exclut silencieusement les freelances → dégrade le KPI de mise en relation (R4). La qualité de la donnée d'entrée est *critique* (cf. principe Armurerie, CLAUDE.md §1).
- **KPI impacté :** couverture du matching (part des freelances géolocalisés = cible 100 %), pertinence des résultats (R4).

### 3. Critères d'Acceptation (Gherkin - BDD)

**Scénario 1 : Onboarding freelance avec position (passant)**
* **GIVEN** un utilisateur s'enregistre avec le rôle `FREELANCE`
* **WHEN** il fournit une `location` valide (lat ∈ [-90,90], lon ∈ [-180,180])
* **THEN** le compte est créé et le point est stocké en `GEOGRAPHY(Point,4326)`.

**Scénario 2 : Onboarding freelance sans position (rejet applicatif)**
* **GIVEN** un enregistrement de rôle `FREELANCE`
* **WHEN** la `location` est absente ou hors bornes
* **THEN** la requête est rejetée en **400/422** (DTO `class-validator`), message en français, avant tout accès base.

**Scénario 3 : Recruteur sans position (passant)**
* **GIVEN** un enregistrement de rôle `RECRUITER`
* **WHEN** aucune `location` n'est fournie
* **THEN** le compte est créé normalement (contrainte non applicable à ce rôle).

**Scénario 4 : Garde-fou base (défense en profondeur)**
* **GIVEN** une tentative d'insertion directe d'un `FREELANCE` sans `location` (contournant l'API)
* **THEN** la contrainte `CHECK` PostgreSQL rejette la ligne (intégrité au niveau donnée).

**Scénario 5 : Non-régression des données existantes**
* **GIVEN** des freelances déjà en base sans `location` (créés avant SH-34)
* **WHEN** la migration s'applique
* **THEN** la stratégie de reprise est explicite (backfill ou fenêtre de complétion) — la migration ne casse pas au déploiement. *(À trancher en implémentation : voir §4.)*

### 4. Spécifications Techniques

* **Backend (NestJS) — validation applicative (1ʳᵉ ligne) :**
    * DTO d'enregistrement : `location` **obligatoire si `role === FREELANCE`**, optionnelle sinon (validation conditionnelle `class-validator`, ex. `@ValidateIf(o => o.role === UserRole.FREELANCE)` + `@IsDefined()` + bornes lat/lon).
    * Identité et rôle jamais dérivés d'un `{id}` client — cf. CLAUDE.md §8.
* **Base (PostgreSQL) — garde-fou (défense en profondeur) :**
    * Migration TypeORM ajoutant `CHECK (role <> 'FREELANCE' OR location IS NOT NULL)` sur `users`.
    * ⚠️ **Reprise des données existantes (Scénario 5) :** décider entre (a) backfill d'une position par défaut/temporaire + flag « à compléter », ou (b) contrainte `NOT VALID` puis validation différée après complétion. Tracer la décision dans la migration.
* **Cohérence :** conserver `users.location` en `GEOGRAPHY(Point,4326)` (pas de changement de type) ; seule la nullabilité devient conditionnelle.
* **Aucune requête brute** : passer par le repository TypeORM ; la contrainte vit dans une migration versionnée.

### 5. Definition of Done (DoD)
- [ ] DTO : validation conditionnelle de `location` par rôle (freelance obligatoire) + tests unitaires (passant/rejet/rôle non concerné).
- [ ] Migration TypeORM : `CHECK` conditionnel + stratégie de reprise des données existantes documentée et testée (la migration s'applique sans casse).
- [ ] **Tests d'étanchéité** : un recruteur reste créable sans position ; un freelance sans position est refusé aux deux niveaux (API + base).
- [ ] CI verte (lint + audit + tests + build) ; Swagger à jour (schéma d'enregistrement, C2.4.1).
- [ ] Aucun secret en dur ; messages utilisateur en français.
- [ ] `CLAUDE.md` §5 / backlog mis à jour si la nullabilité de `location` y est décrite.
