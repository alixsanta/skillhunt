**Titre du Ticket :** [SH-37] Offres/Missions — publication par le recruteur + événement `offer.published` (2ᵉ producteur du bus)
**Type :** Feature
**Priorité :** High
**Estimation :** 8 Story Points (Fibonacci) — *candidat au découpage (voir §6)*
**Compétences RNCP visées :** C2.2.3 (validation stricte + RBAC recruteur), C2.2.2 (tests inter-services), C2.4.1 (Swagger)
**Lot :** Lot 1 (Web MVP)

> **Constat d'architecture (revue post-SH-14).** Le bus d'événements Redis (SH-14) est en place
> mais n'a **qu'un seul producteur** (`reviewGear` → `gear.validated/rejected`). Le scénario de
> référence de CLAUDE.md §2 — *« quand une offre est publiée, le `backend-core` émet un événement,
> le `matching-service` le consomme »* — **n'existe pas** : il n'y a aucune notion d'**offre/mission**
> dans le backend. Ce ticket introduit cette entité et referme le scénario de bout en bout.
> Prérequis livrés : bus Streams (SH-14/SCRUM-30), moteur de scoring (SH-12), géo PostGIS (SH-13).

### 0. Definition of Ready (DoR)
- [ ] **Valeur Claire :** un recruteur publie une mission ; le matching s'exécute en arrière-plan via le bus (asynchrone, non bloquant).
- [ ] **Specs Complètes :** Gherkin ci-dessous + **décision produit §5 tranchée** (que fait le consommateur d'une offre publiée).
- [ ] **UX/UI :** formulaire de création d'offre (recruteur) — à lier côté front (EP05).
- [x] **Faisabilité Technique :** entité TypeORM + `EventPublisherService.publish` existant + consumer FastAPI existant ; réutilise `get_candidates`/`compute_composite_score` (SH-12/13).
- [ ] **Estimé :** 8 SP (à confirmer après découpage éventuel).

### 1. User Story
**En tant que** recruteur,
**Je veux** publier une offre/mission décrivant les compétences recherchées, la localisation et le rayon,
**Afin que** la plateforme identifie automatiquement les freelances pertinents sans que j'aie à lancer une recherche manuelle.

### 2. Contexte & Valeur Business
- **Pourquoi maintenant ?** C'est la pièce manquante qui concrétise la **communication asynchrone inter-services** (CLAUDE.md §2) et donne au bus son **second producteur**. Sans entité Offre, le matching reste purement « pull » (`POST /match` à la demande) alors que l'archi cible un déclenchement « push » à la publication.
- **KPI impacté :** délai de propagation offre→matching, taux de mise en relation proactive (R4).

### 3. Critères d'Acceptation (Gherkin - BDD)

**Scénario 1 : Création d'une offre (brouillon)**
* **GIVEN** un utilisateur `RECRUITER` authentifié
* **WHEN** il crée une offre (`title`, `skills[]`, `location`, `radius_km`) via `POST /api/v1/offers`
* **THEN** l'offre est persistée au statut `DRAFT`, rattachée à son `recruiterId` (dérivé du token, jamais du body — §8).

**Scénario 2 : Publication → événement sur le bus**
* **GIVEN** une offre en `DRAFT` appartenant au recruteur courant
* **WHEN** il la publie (`POST /api/v1/offers/:id/publish`)
* **THEN** le statut passe à `PUBLISHED`
* **AND** un événement `offer.published` est émis sur `skillhunt:events` (best-effort) avec `{ offerId }` — **aucune PII**.

**Scénario 3 : Consommation → scoring proactif**
* **GIVEN** le `matching-service` abonné au bus
* **WHEN** il reçoit `offer.published`
* **THEN** il récupère les critères de l'offre, exécute le scoring (réutilise SH-12/13) et **persiste la liste des freelances correspondants** pour cette offre (voir §5). *(Le consumer n'invalide PAS le cache `/match` : une offre ne modifie pas les données freelance.)*

**Scénario 4 : RBAC — étanchéité**
* **GIVEN** un `FREELANCE` ou un recruteur tiers
* **WHEN** il tente de publier/modifier une offre qui ne lui appartient pas
* **THEN** la réponse est **403** (un recruteur ne voit/agit que sur ses propres offres).

**Scénario 5 : Validation d'entrée**
* **GIVEN** un payload d'offre invalide (`skills` vide, `radius_km` ≤ 0, `location` hors bornes)
* **THEN** rejet **400/422** (DTO `class-validator`), messages en français.

**Scénario 6 : Dégradation gracieuse**
* **GIVEN** Redis indisponible à la publication
* **THEN** l'offre est quand même publiée (vérité en PostgreSQL) ; l'échec d'émission est logué, l'opération n'échoue jamais (best-effort, cohérent SH-14).

### 4. Spécifications Techniques
* **backend-core (NestJS) :**
    * Module `offers/` : `Offer` (TypeORM) — `id`, `recruiterId`, `title`, `skills: string[]`, `location GEOGRAPHY(Point,4326)`, `radiusKm`, `status: DRAFT|PUBLISHED|CLOSED`, timestamps ; migration + index.
    * Endpoints versionnés `api/v1/offers` : `POST` (create), `POST /:id/publish`, `GET` (offres du recruteur), `GET /:id`. `@UseGuards(JwtAuthGuard, RolesGuard([RECRUITER]))`, identité via `@CurrentUser()`.
    * Nouveau `DomainEventType.OFFER_PUBLISHED = 'offer.published'` ; émission via `EventPublisherService.publish` après persistance (best-effort).
    * DTO `class-validator` (réutiliser les bornes lat/lon de `MatchRequest` côté schéma).
    * Swagger complet (`@ApiTags`, `@ApiOperation`, `@ApiResponse`).
* **matching-service (FastAPI) :**
    * `event_consumer._INVALIDATING` **inchangé** ; ajouter une branche `offer.published` distincte → handler `process_offer_published(offer_id)` qui : récupère les critères (voir §5), exécute le scoring, persiste le résultat.
    * Récupération des critères de l'offre : **décision §5** (payload enrichi vs appel API `backend-core`).
* **Sécurité :** `offer.published` ne transporte que `offerId` (pas de critères sensibles) ; pas de requête brute ; réseau Redis privé.

### 5. Décisions à trancher (avant de passer 🟡 Prêt)
1. **Que fait le consumer d'une offre publiée ?**
   - **(a) [recommandé MVP]** scoring proactif → **persiste** une table `offer_matches` (offerId → freelances scorés) que le recruteur consultera ; **notifications hors périmètre** (ticket de suivi SH-38).
   - (b) se limiter à un log/metric pour le MVP (matérialise juste le 2ᵉ producteur), persistance en V+1.
2. **Comment le matching obtient les critères de l'offre ?**
   - **(a) [recommandé]** enrichir l'événement avec les critères non sensibles (`skills`, `location`, `radiusKm`) — le bus reste la source, pas d'appel synchrone inter-services.
   - (b) l'événement ne porte que `offerId` ; le matching appelle `backend-core` (`GET /offers/:id` interne) — couplage synchrone, à éviter tant que la Gateway/mTLS (SH-5/SH-4) n'est pas là.

> ⚠️ Tant que le point 1 n'est pas tranché, ce ticket reste **🔵 Backlog**. Le point 2(a) est cohérent avec l'esprit « bus = source de vérité asynchrone » de SH-14.

### 6. Découpage possible (si 8 SP jugé trop gros)
- **SH-37a** : entité Offre + CRUD recruteur + RBAC + émission `offer.published` (backend-core).
- **SH-37b** : consumer `offer.published` + scoring proactif + persistance `offer_matches` (matching-service).

### 7. Definition of Done (DoD)
- [ ] Entité + migration + CRUD recruteur + RBAC (tests d'étanchéité : freelance/recruteur tiers → 403).
- [ ] Émission `offer.published` best-effort testée (mock + intégration Redis réelle).
- [ ] Consumer : nouvelle branche `offer.published` + comportement retenu (§5) testé end-to-end (intégration Redis).
- [ ] Validation DTO (cas passants + erreurs) ; Swagger à jour (C2.4.1).
- [ ] CI verte (lint + audit + tests + build, 2 services) ; aucun secret en dur ; messages en français.
- [ ] Backlog + CLAUDE.md mis à jour (le bus a désormais 2 producteurs).
