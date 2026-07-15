**Titre du Ticket :** [SH-43] Armurerie — écran de déclaration de matériel (front web)
**Type :** Feature
**Priorité :** High
**Estimation :** 3 Story Points (Fibonacci)
**Compétences RNCP visées :** C2.2.3 (validation d'entrée), C2.2.2 (tests composants + formulaire), C2.4.1 (documentation/UI)
**Lot :** Lot 1 (Web MVP)

> **Suite directe de SH-21a.** La grille d'inventaire (vue privée) est livrée, mais ses CTA
> « + Ajouter mon premier équipement » (état vide) et « + Ajouter du matériel » (grille) sont
> volontairement **désactivés** : l'écran de déclaration n'existe pas encore. Ce ticket le crée
> et active ces CTA.
>
> Le backend est **déjà livré** (SH-9) : `POST /api/v1/gear` accepte `brand`, `model`,
> `serialNumber`, `category` (enum) et crée l'équipement au statut `PENDING` pour le freelance
> authentifié.

### 0. Definition of Ready (DoR)
- [x] **Valeur Claire :** sans écran de saisie, le casier ne peut pas se remplir → la donnée de matching reste vide (R10).
- [x] **Specs Complètes :** contrat backend `POST /api/v1/gear` connu (SH-9) ; composants de thème et types réutilisés de SH-21a.
- [ ] **UX/UI Validé :** maquette du formulaire à cadrer (réutilise la palette HUD de SH-21a).
- [x] **Faisabilité Technique :** dépendances levées (auth SH-20, thème + types + `useMyGear` de SH-21a).
- [x] **Estimé :** 3 SP.

### 1. User Story
**En tant que** freelance,
**Je veux** déclarer un nouvel équipement via un formulaire clair,
**Afin d'**enrichir mon casier et améliorer ma pertinence dans le matching.

### 2. Contexte & Valeur Business
- **Pourquoi maintenant ?** SH-21a affiche le casier mais ne permet pas de l'alimenter ; les CTA sont désactivés en attendant cet écran.
- **KPI impacté :** taux de complétion du casier (qualité de la donnée de matching, R10).

### 3. Critères d'Acceptation (Gherkin - BDD)

**Scénario 1 : Déclaration d'un équipement**
* **GIVEN** un freelance authentifié sur l'écran de déclaration
* **WHEN** il saisit `brand`, `model`, `serialNumber` et choisit une `category`, puis valide
* **THEN** un appel `POST /api/v1/gear` (via `apiClient`) crée l'équipement au statut `PENDING`
* **AND** le casier (`useMyGear`) est invalidé/rafraîchi et la nouvelle fiche apparaît dans « Mon Armurerie ».

**Scénario 2 : Validation d'entrée**
* **GIVEN** le formulaire
* **WHEN** un champ requis est vide ou la catégorie n'est pas dans l'enum
* **THEN** un message d'erreur en français est affiché **sans** appel réseau (validation client),
* **AND** les erreurs de validation renvoyées par le backend (400) sont affichées lisiblement.

**Scénario 3 : Activation des CTA de SH-21a**
* **GIVEN** la grille et l'état vide de l'Armurerie
* **THEN** les CTA « + Ajouter … » ne sont plus désactivés et mènent à cet écran.

### 4. Spécifications Techniques
* **frontend-web :** `src/features/gear/` — mutation TanStack Query (`useCreateGear`) sur `POST /api/v1/gear` via `apiClient`, invalidation de la clé `['gear','me']` au succès. Formulaire accessible (labels `htmlFor`, `role="alert"`), palette HUD réutilisée (tokens `--color-hud-*`, aucune couleur en dur). Types issus de `schema.d.ts` (généré).
* **Sécurité :** `serialNumber` est saisi mais **jamais réaffiché** dans les vues de consultation (SH-39) ; aucune donnée sensible en `localStorage`.
* **Tests (Vitest + RTL + MSW) :** succès de création + rafraîchissement du casier, validation client sans appel réseau, gestion d'un 400 backend.

### 5. Definition of Done (DoD)
- [ ] Écran de déclaration branché sur `POST /api/v1/gear` via `apiClient`.
- [ ] Validation client (champs requis, enum de catégorie) prouvée sans appel réseau.
- [ ] Casier rafraîchi après création (invalidation de `['gear','me']`).
- [ ] CTA « + Ajouter … » de SH-21a activés.
- [ ] Aucune couleur en dur ; `schema.d.ts` non édité à la main.
- [ ] Tests Vitest + RTL passants ; CI frontend verte (lint + `format:check` + tests + build).
- [ ] `docs/BACKLOG.md` mis à jour.
