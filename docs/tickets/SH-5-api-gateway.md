**Titre du Ticket :** [SH-5] API Gateway — point d'entrée unique + rate-limiting (nginx)
**Type :** Feature (infrastructure / sécurité)
**Priorité :** High
**Estimation :** 5 Story Points (Fibonacci)
**Compétences RNCP visées :** C2.2.3 (rate-limiting anti-brute-force, réduction de surface), C2.1.2 (cohérence archi cible/livrée)
**Lot :** Lot 1 (Web MVP)

> **Origine.** L'architecture cible (§2) place une **Gateway en point d'entrée unique** avec
> rate-limiting (mitigation R7/R9) — jusqu'ici, le navigateur parlait directement au
> backend-core. Ce ticket referme l'écart entre le schéma du dossier et la stack livrée.
>
> **Décision « Kong/Nginx » (2026-07-16) : nginx.** Brique déjà maîtrisée dans le projet
> (image du frontend, SH-2), zéro dépendance nouvelle, `limit_req` natif. Kong apporterait
> plugins/API management dont le MVP n'a pas l'usage — surdimensionné à ce stade.

### 0. Definition of Ready (DoR)
- [x] **Valeur Claire :** point d'entrée unique (surface d'attaque réduite) + rate-limiting sur l'auth (un mot de passe ou un TOTP se brute-force par le réseau, pas seulement par l'application).
- [x] **Specs Complètes :** Gherkin ci-dessous ; périmètre lean (pas de TLS ici : SH-4 hardening).
- [x] **UX/UI Validé :** n/a (infrastructure) — l'app devient same-origin derrière la gateway.
- [x] **Faisabilité Technique :** SH-2 a conteneurisé les services ; il ne manque que le reverse proxy.
- [x] **Estimé :** 5 SP (réalisé en lean grâce à SH-2).

### 1. User Story
**En tant que** plateforme,
**Je veux** que tout le trafic navigateur entre par une gateway unique qui limite le débit sur l'authentification,
**Afin de** réduire la surface d'attaque et de rendre le brute-force réseau inopérant (R7, R9).

### 3. Critères d'Acceptation (Gherkin - BDD)

**Scénario 1 : Point d'entrée unique**
* **GIVEN** la stack conteneurisée (`--profile app`)
* **THEN** SEULE la gateway publie un port sur l'hôte — ni le backend-core ni le frontend n'exposent le leur
* **AND** `/` sert le frontend, `/api/*` est relayé au backend-core, le matching-service reste interne (SH-2).

**Scénario 2 : L'app fonctionne en same-origin à travers la gateway**
* **GIVEN** un utilisateur sur `http://localhost:8088`
* **THEN** la boucle démo complète fonctionne (login → recherche matching → armurerie publique), cookies compris — front et API partagent la même origine (CORS devient une défense en profondeur, plus une nécessité).

**Scénario 3 : Rate-limiting sur l'authentification**
* **GIVEN** des requêtes répétées sur `/api/v1/auth/*` depuis une même IP
* **WHEN** le débit dépasse la fenêtre (30 req/min, rafale de 10)
* **THEN** la gateway répond **429** sans atteindre le backend
* **AND** l'usage normal (login + refresh silencieux à chaque navigation) n'est PAS affecté.

**Scénario 4 : Le reste de l'API garde une limite plus large**
* **THEN** `/api/*` hors auth porte une limite généreuse (300 req/min, rafale 50) — filet anti-abus qui n'entrave pas l'UI.

### 4. Spécifications Techniques
* **`gateway/`** : `nginx.conf` (deux `limit_req_zone` par IP : `auth` 30 r/min, `api` 300 r/min ; `limit_req_status 429` ; `proxy_set_header Host/X-Real-IP/X-Forwarded-*`) + `Dockerfile` (nginx:1.27-alpine, non-root d'origine nginx, HEALTHCHECK).
* **Compose (profil `app`)** : service `gateway` publié sur `${GATEWAY_PORT:-8088}` ; **suppression du port hôte du backend-core et du frontend** (point d'entrée unique). Swagger et `gen:api` restent accessibles VIA la gateway (`/api/docs`).
* **Frontend** : image construite avec `VITE_API_URL=http://localhost:8088` par défaut (même origine que la page).
* **CI** : `gateway` ajoutée à la matrice `docker-ci.yml`.
* **Hors périmètre** : TLS 1.3 / mTLS inter-services (SH-4) ; les workflows DEV hors compose (`npm run start:dev` sur 3001, Vite sur 5173) sont inchangés.

### 5. Definition of Done (DoD)
- [x] Conteneur gateway **seul point publié** du profil `app` (vérifié : backend 3001 et front 80 en interne uniquement ; matching toujours sans port hôte).
- [x] Boucle démo vérifiée À TRAVERS la gateway (Swagger, SPA + fallback, login, recherche matching) **et au navigateur en same-origin** (session tenue sur une page protégée).
- [x] Rate-limiting prouvé : rafale de 20 logins → burst de 10 absorbé puis **429 sans atteindre le backend** (7 blocages observés, refill 30 r/min visible) ; l'usage normal n'est pas affecté. Limite **par IP** : suffisant en MVP, à affiner derrière un NAT d'entreprise (SH-4/prod).
- [x] `docker-ci.yml` : image gateway ajoutée à la matrice ; CI à confirmer sur la PR.
- [x] `docs/BACKLOG.md` mis à jour ; décision Kong→nginx tracée (en-tête).
