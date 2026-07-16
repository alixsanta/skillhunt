**Titre du Ticket :** [SH-39] Armurerie — consultation du casier d'un freelance par un recruteur (endpoint public filtré)
**Type :** Feature
**Priorité :** High
**Estimation :** 3 Story Points (Fibonacci)
**Compétences RNCP visées :** C2.2.3 (RBAC + minimisation de la donnée exposée), C2.2.2 (tests d'étanchéité), C2.4.1 (Swagger)
**Lot :** Lot 1 (Web MVP)

> **Origine.** Dépendance identifiée lors du design de la grille d'inventaire de l'Armurerie
> (`docs/superpowers/specs/2026-07-01-armurerie-grille-inventaire-design.md`, §6). La **vue publique**
> de l'Armurerie (un recruteur consulte le casier d'un freelance depuis son profil) n'a **aucun endpoint
> pour l'alimenter** : `GearController` n'expose aujourd'hui que `GET /api/v1/gear/me` (rôle `FREELANCE`,
> casier de l'utilisateur du token) et `GET /api/v1/gear/pending` (rôle `ADMIN`).
> **Ce ticket est bloquant pour SH-21b** (vue publique côté front).

### 0. Definition of Ready (DoR)
- [x] **Valeur Claire :** sans cet endpoint, la « preuve de compétence par le matériel » — cœur de la proposition de valeur — reste invisible pour le recruteur.
- [x] **Specs Complètes :** Gherkin ci-dessous (cas passants + étanchéité + minimisation).
- [x] **UX/UI Validé :** spec de design §5.2 (vue publique) — même composants, sans CTA, statuts non validés masqués.
- [x] **Faisabilité Technique :** réutilise `GearService.paginate` ; entité `Gear` et `RolesGuard` existants. Aucune migration.
- [x] **Estimé :** 3 SP.

### 1. User Story
**En tant que** recruteur,
**Je veux** consulter le matériel **validé** déclaré par un freelance depuis son profil,
**Afin de** vérifier qu'il possède réellement l'équipement requis par ma mission avant de le contacter.

### 2. Contexte & Valeur Business
- **Pourquoi maintenant ?** Le matching (SH-12) score déjà les freelances sur leur matériel, mais le recruteur ne peut pas **vérifier** ce score à l'œil nu. C'est le chaînon manquant entre le score et la décision de contact.
- **KPI impacté :** taux de contact après consultation de profil ; confiance dans le score (R10 — crédibilité de la donnée matériel).

### 3. Critères d'Acceptation (Gherkin - BDD)

**Scénario 1 : Consultation nominale**
* **GIVEN** un utilisateur `RECRUITER` authentifié
* **WHEN** il appelle `GET /api/v1/gear/freelance/:freelanceId`
* **THEN** il reçoit la liste **paginée** du matériel de ce freelance **filtrée strictement sur `status = VALIDATED`**
* **AND** chaque élément est **dépourvu de `serialNumber`** (voir §4, minimisation).

**Scénario 2 : Étanchéité — le filtre de statut n'est pas contournable**
* **GIVEN** un `RECRUITER` authentifié
* **WHEN** il tente de forcer le statut (`?status=PENDING`, `?status=REJECTED`)
* **THEN** la requête est **rejetée en 400** (paramètre non autorisé par le DTO, `forbidNonWhitelisted`) — **jamais** un 200 contenant du matériel non validé.

**Scénario 3 : Étanchéité — rôles**
* **GIVEN** un utilisateur `FREELANCE` authentifié
* **WHEN** il appelle `GET /api/v1/gear/freelance/:freelanceId` (y compris avec **son propre** id)
* **THEN** la réponse est **403** — un freelance passe par `GET /gear/me` ; ce n'est pas une route de consultation croisée entre freelances.

**Scénario 4 : Cible inexistante ou non-freelance**
* **GIVEN** un `freelanceId` inconnu, ou qui correspond à un utilisateur de rôle `RECRUITER`/`ADMIN`
* **THEN** la réponse est **404** (« Profil Freelance introuvable ») — pas d'énumération du rôle des comptes.

**Scénario 5 : Casier vide côté public**
* **GIVEN** un freelance dont aucun matériel n'est `VALIDATED` (casier vide, ou uniquement `PENDING`/`REJECTED`)
* **THEN** la réponse est **200** avec `items: []` et `total: 0` — pas un 404 (le profil existe, il n'a simplement rien à montrer ; le front affiche l'état vide neutre du §5.4 de la spec).

**Scénario 6 : Non authentifié**
* **GIVEN** aucun token (ou token expiré)
* **THEN** **401** — l'endpoint est « public » au sens *profil consultable*, **pas** au sens *anonyme*.

### 4. Spécifications Techniques

* **backend-core (NestJS) — `gear/` :**
    * Endpoint : `GET /api/v1/gear/freelance/:freelanceId` (`@Param('freelanceId', ParseUUIDPipe)`).
    * Protection : `@Roles(UserRole.RECRUITER)` (le `RolesGuard` du contrôleur s'applique déjà).
    * **DTO de requête dédié** — `PublicQueryGearDto` : `page`, `limit`, `category` **uniquement**. ⚠️ **Ne pas réutiliser `QueryGearDto`** : il expose `status`, ce qui permettrait à un recruteur de demander explicitement du matériel `PENDING`. Le statut est **imposé par le service**, jamais par le client.
    * Service : `getPublicFreelanceGear(freelanceId, query)` → vérifie que la cible existe **et** a le rôle `FREELANCE` (sinon `NotFoundException`), puis `paginate({ freelanceId, status: VALIDATED, ...category })`. Réutiliser le helper `paginate` existant.
* **Sécurité & minimisation (non négociable, cf. CLAUDE.md §8) :**
    * **`serialNumber` n'est JAMAIS exposé** sur cette route : c'est une donnée sensible (identification/traçabilité d'un bien, exploitable en cas de vol) qui n'a **aucune valeur** pour la décision du recruteur — la marque, le modèle et la catégorie suffisent. Implémenter via une **projection explicite** (`select` TypeORM ou mapper vers un `PublicGearDto`), **pas** en supprimant le champ après coup.
    * Filtre `status = VALIDATED` **appliqué côté service**, non dérivé d'une entrée client.
    * Aucune requête brute (ORM uniquement).
    * **Défense en profondeur (constat revue sécurité SH-21a) :** `GearController` renvoie aujourd'hui des **entités TypeORM brutes** (le `GearResponseDto` de SH-21a n'est que *documentaire*, aucun filtrage de champ à l'exécution). Sûr tant qu'aucune relation n'est chargée, mais un futur `relations: ['freelance']` sérialiserait tout le `User` (dont `passwordHash`, non `@Exclude`) dans la réponse. La projection/`PublicGearDto` explicite de cette route ferme ce risque **pour la vue recruteur** ; envisager un `ClassSerializerInterceptor` + `@Exclude()` sur `User.passwordHash` (ou un mapping DTO systématique) pour le fermer partout — voir aussi la note ci-dessus.
* **Swagger (C2.4.1) :** `@ApiOperation`, `@ApiOkResponse` (schéma `PublicGearDto` paginé), `@ApiNotFoundResponse`, `@ApiForbiddenResponse`. Le contrôleur porte déjà `@ApiBearerAuth`.
* **Front :** consommé par la vue publique de l'Armurerie (SH-21b). Le type TS est régénéré depuis l'OpenAPI (`npm run gen:api` dans `frontend-web/`).

### 5. Definition of Done (DoD)
- [x] Endpoint + `PublicQueryGearDto` (PickType, sans `status`) + projection par allowlist (`PublicGearView`, sans `serialNumber` ni `freelanceId`).
- [x] **Tests RBAC d'étanchéité** : métadonnées `@Roles([RECRUITER])` verrouillées par test — le `RolesGuard` (testé SH-8) fait respecter 403 pour `FREELANCE`/`ADMIN`, 401 sans token (`JwtAuthGuard`).
- [x] **Test de non-contournement** : `?status=PENDING`/`REJECTED` → 400 (ValidationPipe aux options de `main.ts`) ; un `PENDING`/`REJECTED` en base n'apparaît jamais (test service).
- [x] **Test de minimisation** : clés EXACTES de la réponse vérifiées (service) + schéma OpenAPI `PublicGearDto` verrouillé (contrat).
- [x] Cible inconnue / non-freelance → 404 uniforme ; freelance sans matériel validé → 200 + liste vide.
- [x] Lint + tests (92) + build verts en local ; Swagger à jour (`@ApiOkResponse` typé, `@ApiNotFoundResponse`) ; messages en français.
- [x] `docs/BACKLOG.md` mis à jour.
