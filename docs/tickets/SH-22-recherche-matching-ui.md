**Titre du Ticket :** [SH-22] Recherche de freelances & affichage du score de matching (proxy backend + UI recruteur)
**Type :** Feature
**Priorité :** High
**Estimation :** 5 Story Points (Fibonacci)
**Compétences RNCP visées :** C2.2.3 (validation d'entrée + RBAC), C2.2.2 (tests), C2.4.1 (Swagger/UI)
**Lot :** Lot 1 (Web MVP)

> **Origine.** Le moteur de matching (SH-12/13/14) est le cœur différenciant, mais il n'a
> **aucune UI** : le jury ne peut pas le voir. Ce ticket ferme la boucle démo :
> *recherche recruteur → scores → armurerie publique du freelance (SH-21b)*.
>
> **Décision d'architecture (validée le 2026-07-16).** Le `matching-service` FastAPI n'a **ni
> auth ni CORS** : c'est un service interne (archi §2 : point d'entrée unique). Le navigateur
> ne l'appelle donc **jamais directement** — un **proxy `backend-core`** (`POST
> /api/v1/matching/search`, rôle `RECRUITER`) relaie la demande sur le réseau privé et
> **enrichit** les résultats avec le `username` (le `/match` ne renvoie que des ids).

### 0. Definition of Ready (DoR)
- [x] **Valeur Claire :** rend le cœur différenciant visible et démontrable.
- [x] **Specs Complètes :** contrat `/match` connu (`skills[1..50]`, `location (lat, lon)`, `radius_km ≤ 500` → `freelance_id, score, distance_km` trié) ; Gherkin ci-dessous.
- [x] **UX/UI Validé :** formulaire (compétences + ville prédéfinie + rayon) ; saisie du lieu par **liste de villes** (décision 2026-07-16, Mapbox SH-23 hors périmètre).
- [x] **Faisabilité Technique :** auth SH-20, vue publique SH-21b (cible du lien), thème HUD.
- [x] **Estimé :** 5 SP.

### 1. User Story
**En tant que** recruteur,
**Je veux** chercher des freelances par compétences autour d'un lieu de mission et voir leur score de matching,
**Afin de** présélectionner les meilleurs profils et vérifier leur matériel avant contact.

### 3. Critères d'Acceptation (Gherkin - BDD)

**Scénario 1 : Recherche nominale**
* **GIVEN** un `RECRUITER` authentifié sur `/recherche`
* **WHEN** il saisit des compétences, choisit une ville et un rayon puis lance la recherche
* **THEN** `POST /api/v1/matching/search` relaie vers le matching-service et renvoie la liste triée (score décroissant, distance croissante)
* **AND** chaque résultat affiche `username`, score en %, distance en km, et un lien vers l'armurerie publique (`/freelances/:id/armurerie`, SH-21b).

**Scénario 2 : Étanchéité RBAC**
* **GIVEN** un `FREELANCE` ou `ADMIN`
* **THEN** `POST /matching/search` répond **403** ; sans token → **401**.

**Scénario 3 : Validation d'entrée (C2.2.3)**
* **WHEN** compétences vides, > 50 entrées, rayon ≤ 0 ou > 500, lat/lon hors bornes
* **THEN** **400** (DTO), et la validation client bloque avant tout appel réseau.

**Scénario 4 : Matching-service indisponible**
* **GIVEN** le microservice éteint ou en erreur
* **THEN** le proxy répond **502** avec un message en français ; l'UI propose « Réessayer ».

**Scénario 5 : Aucun résultat**
* **THEN** 200 + liste vide ; l'UI affiche un état vide explicite (élargir le rayon/les compétences).

### 4. Spécifications Techniques
* **backend-core — `matching/`** : `SearchMatchDto` (`skills` 1..50 × 1..64 chars, `lat`/`lon` bornés, `radiusKm` 0<x≤500) ; `MatchingService.search()` → `fetch` sur `MATCHING_SERVICE_URL` (env, défaut `http://localhost:8000`), timeout 5 s, mapping snake_case→camelCase, enrichissement `username` via le repo `User` (une seule requête `IN`), échec réseau/5xx → `BadGatewayException`. Swagger complet (`MatchResultDto`).
* **frontend-web — `features/matching/`** : page `/recherche` (route protégée), `useMatchSearch` (mutation TanStack via `apiClient`), constantes `CITIES` (villes françaises + coordonnées), thème HUD, a11y (labels, `role="alert"`, statuts textuels).
* **Sécurité :** le microservice reste inaccessible du navigateur ; le rôle est vérifié côté backend (`@Roles(RECRUITER)`) — l'UI ne fait que refléter le 403.
* **Types front :** régénérés via `npm run gen:api` (jamais à la main).

### 5. Definition of Done (DoD)
- [x] Proxy `POST /api/v1/matching/search` (RBAC RECRUITER, DTO validé, 502 si service indisponible, Swagger typé).
- [x] Tests backend (19) : contrat OpenAPI + métadonnées `@Roles`, mapping/enrichissement/erreurs du service, DTO (9 bornes).
- [x] Page `/recherche` : validation client prouvée sans appel réseau, résultats triés + lien vers SH-21b, états chargement/vide/erreur/403/502.
- [x] Tests front (98 au total, 8 nouveaux) : succès, validation, 403, 502→relance, état vide, garde de route.
- [x] **Vérifié de bout en bout sur les services réels** : recherche « drone, telepilote » à Toulouse → demo-pilote à 0.82 (calcul exact 0.5×1 + 0.3×0.4 + 0.2×1), Paris → [], 403 freelance, 400 rayon 900 ; navigation UI recherche → armurerie publique dans Chrome.
- [x] **Bug préexistant corrigé au passage (matching-service)** : `users.role`/`gear.status` sont des ENUM PostgreSQL — asyncpg refusait `enum = VARCHAR`, `/match` n'avait jamais fonctionné contre la vraie base (invisible des tests unitaires, `get_candidates` mocké). Cast des colonnes en texte + 67 tests pytest verts.
- [x] `docs/BACKLOG.md` mis à jour ; CI (3 services) à confirmer sur la PR.
