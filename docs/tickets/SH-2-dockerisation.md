**Titre du Ticket :** [SH-2] Dockerisation des services applicatifs + environnements Dev/Staging/Prod
**Type :** Feature (infrastructure)
**Priorité :** High
**Estimation :** 5 Story Points (Fibonacci)
**Compétences RNCP visées :** C2.1.2 (qualité/normes d'infrastructure), C2.2.3 (durcissement des images)
**Lot :** Lot 1 (Web MVP)

> **Origine.** L'infrastructure de dev (PostgreSQL+PostGIS, Redis, LocalStack) est déjà
> conteneurisée (`docker-compose.yml`, SH-6/14/31), mais les **trois services applicatifs**
> tournent « sur le poste ». Ce ticket les conteneurise : l'application devient
> **reproductible et déployable** — argument central du dossier (jalon J5, PCA SH-30).

### 0. Definition of Ready (DoR)
- [x] **Valeur Claire :** « ça marche sur ma machine » → « ça tourne dans n'importe quel Docker » ; prérequis de la mise en production (SH-30).
- [x] **Specs Complètes :** périmètre ci-dessous ; stratégie d'environnements documentée (§4).
- [x] **UX/UI Validé :** n/a (infrastructure).
- [x] **Faisabilité Technique :** services 12-factor (config par env vars depuis SH-6/7) ; compose infra existant à étendre.
- [x] **Estimé :** 5 SP.

### 1. User Story
**En tant que** mainteneur de SkillHunt,
**Je veux** construire et lancer toute la plateforme (3 services + infra) en une commande Docker,
**Afin de** garantir des environnements reproductibles du dev à la prod.

### 3. Critères d'Acceptation (Gherkin - BDD)

**Scénario 1 : Démarrage complet en une commande**
* **GIVEN** un poste avec Docker seul (ni Node, ni Python)
* **WHEN** `docker compose --profile app up -d --build`
* **THEN** les 6 conteneurs démarrent (postgres, redis, localstack, backend-core, matching-service, frontend-web)
* **AND** les migrations s'appliquent automatiquement au démarrage du backend
* **AND** la boucle démo complète fonctionne (register → gear → recherche matching → armurerie publique).

**Scénario 2 : Le workflow dev existant est préservé**
* **WHEN** `docker compose up -d` (sans profil)
* **THEN** seule l'INFRA démarre (comme avant SH-2) — le dev garde `npm run start:dev` / `uvicorn --reload` en local.

**Scénario 3 : Le matching-service reste interne (archi §2)**
* **GIVEN** la stack conteneurisée
* **THEN** le matching-service n'expose **aucun port sur l'hôte** — seul le réseau Docker privé l'atteint (le proxy SH-22 est le seul chemin).

**Scénario 4 : Images durcies**
* **THEN** chaque image applicative tourne en **utilisateur non-root**, porte un **HEALTHCHECK**, et les images Node sont **multi-stage** (dépendances de build absentes de l'image finale).

### 4. Spécifications Techniques

* **`backend-core/Dockerfile`** : multi-stage `node:20-alpine` (build tsc → `dist/`, `npm prune --omit=dev`) ; entrypoint qui exécute `migration:run` (CLI TypeORM sur le **data-source compilé**) quand `RUN_MIGRATIONS=true`, puis `node dist/main.js`. ⚠️ prérequis : le glob de migrations de `data-source.ts` doit être relatif à `__dirname` (`*.{ts,js}`) — le littéral `src/…/*.ts` ne fonctionne pas compilé.
* **`matching-service/Dockerfile`** : `python:3.11-slim`, `pip install -r requirements.txt`, utilisateur dédié, uvicorn `0.0.0.0:8000`. `.dockerignore` exclut `venv/`.
* **`frontend-web/Dockerfile`** : multi-stage build Vite (ARG `VITE_API_URL`, cuite dans le bundle) → `nginx:alpine` avec fallback SPA (`try_files … /index.html`).
* **`docker-compose.yml`** : services applicatifs sous **`profiles: ["app"]`** (l'infra seule reste le défaut) ; réseau interne : `DB_HOST=postgres` (5432 interne), `REDIS_URL=redis://redis:6379`, `MATCHING_SERVICE_URL=http://matching-service:8000` ; front publié sur **8080**, `CORS_ORIGIN` élargi à `http://localhost:8080`.
* **Environnements (12-factor)** : mêmes images pour Dev/Staging/Prod, seule la **config change** (variables d'env / secrets). Dev = ce compose. Staging/Prod = mêmes images poussées dans un registre + orchestrateur et gestionnaire de secrets (hors périmètre : SH-30 mise en production ; TLS/mTLS : SH-4 ; gateway : SH-5).
* **CI** : workflow `docker-ci.yml` — build des 3 images sur PR touchant les Dockerfiles/compose (preuve de reproductibilité, sans push).

### 5. Definition of Done (DoD)
- [x] 3 Dockerfiles (multi-stage Node, non-root, HEALTHCHECK) + `.dockerignore` — et glob de migrations rendu compatible dist (`__dirname`, `*.{ts,js}`).
- [x] `docker compose --profile app up -d --build` : 6 conteneurs **healthy** (vérifié le 2026-07-16 ; `FRONTEND_PORT`/`CORS_ORIGIN` surchargables si 8080 est occupé sur l'hôte).
- [x] Migrations appliquées automatiquement au boot du backend conteneurisé (CLI TypeORM sur le data-source compilé, log vérifié).
- [x] Boucle démo vérifiée SUR la stack conteneurisée : login recruteur → `POST /matching/search` (réseau interne) → demo-pilote à 0.82 ; front nginx testé au navigateur (login + route profonde `/recherche`).
- [x] `docker compose up -d` sans profil = infra seule (`config --services` : postgres/redis/localstack uniquement).
- [x] matching-service **sans port hôte** : injoignable depuis l'hôte, seul le proxy SH-22 l'atteint (archi §2 prouvée).
- [x] Workflow `docker-ci.yml` (build matriciel des 3 images sur PR) ; `docs/BACKLOG.md` mis à jour — CI à confirmer sur la PR.
