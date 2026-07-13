**Titre du Ticket :** [SH-21] Armurerie gamifiée (front web) — grille d'inventaire, cartes, loadout, progression, badges
**Type :** Feature
**Priorité :** High
**Estimation :** 8 Story Points (Fibonacci) — *à découper, voir §6*
**Compétences RNCP visées :** C2.4.1 (documentation/UI), C2.1.2 (qualité de code, lint/format), C2.2.2 (tests composants + RBAC vu du front)
**Lot :** Lot 1 (Web MVP)

> **Design validé.** L'écran de grille d'inventaire est spécifié dans
> `docs/superpowers/specs/2026-07-01-armurerie-grille-inventaire-design.md`
> (issu d'une session de brainstorming avec compagnon visuel) : fiche technique horizontale,
> palette HUD tactique alignée sur l'identité de marque existante, vue privée/publique,
> responsive mobile-first, état vide. **Ce document fait foi pour l'UI.**
>
> Le backend de l'Armurerie est **déjà livré** (SH-9) : `POST /api/v1/gear`, `GET /api/v1/gear/me`
> (paginé, filtres `category`/`status`), workflow de validation Admin.

### 0. Definition of Ready (DoR)
- [x] **Valeur Claire :** l'Armurerie est LA fonctionnalité différenciante (CLAUDE.md §1) ; sa donnée alimente le matching.
- [x] **Specs Complètes :** Gherkin ci-dessous + spec de design (palette, composants, responsive, état vide).
- [x] **UX/UI Validé :** spec de design ci-dessus.
- [ ] **Faisabilité Technique :** ⚠️ **dépendances non levées** — voir §5.
- [x] **Estimé :** 8 SP (à requalifier après découpage §6).

### 1. User Story
**En tant que** freelance,
**Je veux** consulter et gérer mon casier de matériel dans une interface lisible et valorisante,
**Afin de** rendre mon équipement visible des recruteurs et améliorer ma pertinence dans le matching.

### 2. Contexte & Valeur Business
- **Pourquoi maintenant ?** Le scaffold front est en place (SH-19/SH-38) et le backend Armurerie est livré (SH-9). C'est la première feature métier « visible » du Lot 1 et la vitrine de la proposition de valeur.
- **KPI impacté :** taux de complétion du casier (qualité de la donnée de matching, R10 — un casier vide dégrade tout le scoring).

### 3. Critères d'Acceptation (Gherkin - BDD)

**Scénario 1 : Grille d'inventaire (vue privée)**
* **GIVEN** un freelance authentifié possédant du matériel déclaré
* **WHEN** il ouvre « Mon Armurerie »
* **THEN** il voit le compteur d'équipements, la barre de progression (part de matériel `VALIDATED` sur le total), les chips de filtre par catégorie et la liste de ses fiches
* **AND** **tous les statuts sont visibles** (`VALIDATED`, `PENDING`, `REJECTED`) — le freelance doit connaître l'état de validation de tout son matériel.

**Scénario 2 : Fiche équipement**
* **GIVEN** un équipement en base
* **THEN** sa fiche affiche : pastille d'icône **neutre** (la catégorie se lit dans l'**icône**, pas dans une couleur), `brand` + `model` en gras, la catégorie en label, et un badge de statut (point coloré + libellé : vert « VALIDÉ », ambre « ATTENTE », rose « REJETÉ »).

**Scénario 3 : Filtrage par catégorie**
* **GIVEN** la grille affichée
* **WHEN** le freelance sélectionne une chip de catégorie
* **THEN** la liste ne montre que les équipements de cette catégorie ; la chip « Tous » rétablit la liste complète.

**Scénario 4 : État vide**
* **GIVEN** un freelance sans aucun matériel déclaré
* **THEN** il voit l'état vide (« Ton arsenal est vide »), le sous-texte expliquant l'impact sur le matching, et un CTA unique « + Ajouter mon premier équipement ».

**Scénario 5 : Responsive (mobile-first)**
* **GIVEN** un viewport < 1024px
* **THEN** la liste est en **une colonne** pleine largeur
* **WHEN** le viewport atteint ≥ 1024px
* **THEN** les fiches passent en **grille 2 colonnes**, l'en-tête restant pleine largeur au-dessus.

**Scénario 6 : États de chargement et d'erreur**
* **GIVEN** l'appel `GET /api/v1/gear/me` en cours
* **THEN** un état de chargement est affiché (skeletons)
* **WHEN** l'appel échoue (réseau/500)
* **THEN** un message d'erreur en français est affiché avec une action « Réessayer » — jamais une page blanche.

**Scénario 7 : Vue publique (recruteur)** — *dépend de SH-39*
* **GIVEN** un recruteur consultant le profil d'un freelance
* **THEN** il voit les **mêmes composants**, mais **uniquement le matériel `VALIDATED`**, **sans CTA d'ajout**
* **AND** aucune donnée de workflow interne (`PENDING`/`REJECTED`) ni `serialNumber` n'est visible.

### 4. Spécifications Techniques

* **frontend-web (React 19 / TS / Tailwind / shadcn) :**
    * `src/features/gear/` : composants (`GearCard`, `GearGrid`, `GearStatusBadge`, `GearCategoryChips`, `GearProgress`, `GearEmptyState`) + hooks TanStack Query (`useMyGear`).
    * `src/pages/` : une page par route (« Mon Armurerie »), branchée dans `src/app/routes.tsx`.
    * **API** : passer par `apiClient` (`@/api/client`) exclusivement ; types issus de `src/api/schema.d.ts` (**générés** — `npm run gen:api`, ne pas éditer à la main).
    * **Filtrage/pagination** : le backend expose déjà `category`, `status`, `page`, `limit` sur `GET /gear/me`. Décider par écrit : filtre **côté serveur** (requête par chip) **ou côté client** (une seule requête, filtre en mémoire) — la barre de progression a de toute façon besoin du **total tous statuts**.
    * **Design tokens** : la palette de la spec (§3) est ajoutée comme thème Tailwind, **pas** en couleurs codées en dur dans les composants.
* **Accessibilité (R6) :** contrastes vérifiés sur fond sombre ; le statut **ne doit pas reposer sur la couleur seule** (le libellé texte « VALIDÉ »/« ATTENTE »/« REJETÉ » accompagne toujours la pastille) ; chips filtrantes navigables au clavier.
* **Tests (Vitest + RTL) :** tester du point de vue utilisateur (rôles/labels accessibles) — rendu des 3 statuts, filtrage, état vide, état d'erreur.

### 5. Dépendances à lever (⚠️ avant de démarrer)
1. **SH-20 — Parcours Auth Web (bloquant pour la vue privée).** `GET /api/v1/gear/me` exige un JWT et déduit l'identité du token. Tant que le front n'a ni écran de connexion ni stockage/injection du token, **la vue privée ne peut pas être branchée sur l'API réelle**. À cela s'ajoute le **TODO CORS** laissé en SH-19, à traiter dans SH-20.
   → *Options : (a) faire SH-20 d'abord [recommandé] ; (b) développer SH-21a contre une API mockée (MSW) et câbler l'auth ensuite — livre l'UI mais pas la tranche verticale.*
2. **SH-39 — endpoint recruteur (bloquant pour la vue publique).** `GET /api/v1/gear/freelance/:id` n'existe pas encore.
3. **Sources de marque non versionnées.** Palette et principes transcrits depuis des maquettes Visily et un logo réalisés hors dépôt → les verser sous `docs/design/brand/` pour disposer d'une source de vérité unique.

### 6. Découpage proposé
- **SH-21a — Grille d'inventaire, vue privée** (~5 SP) : thème/tokens, `GearCard`, grille responsive, chips, progression, état vide, états chargement/erreur, tests. *Dépend de SH-20.*
- **SH-21b — Vue publique recruteur** (~2 SP) : réutilise les composants, filtre `VALIDATED`, pas de CTA. *Dépend de SH-39.*
- **SH-21c — Loadout, progression/XP, badges** (à cadrer) : **hors périmètre de la spec de design actuelle**, nécessite un cadrage produit dédié (et probablement de nouveaux champs backend).

### 7. Definition of Done (DoD)
- [ ] Composants conformes à la spec de design (palette en tokens, fiche horizontale, badges de statut).
- [ ] Responsive vérifié : 1 colonne < 1024px, 2 colonnes ≥ 1024px.
- [ ] États vide / chargement / erreur couverts et testés.
- [ ] Tests Vitest + RTL passants (rendu des statuts, filtrage, état vide, erreur).
- [ ] Statut jamais porté par la **couleur seule** (accessibilité, R6).
- [ ] Aucun appel API hors `apiClient` ; `schema.d.ts` régénéré, non édité à la main.
- [ ] CI frontend verte (lint + `format:check` + tests + build).
- [ ] `docs/BACKLOG.md` mis à jour.
