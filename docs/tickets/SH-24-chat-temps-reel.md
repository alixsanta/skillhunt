**Titre du Ticket :** [SH-24] Chat contextuel temps réel (WebSocket + MongoDB)
**Type :** Feature
**Priorité :** High
**Estimation :** 8 Story Points (Fibonacci)
**Compétences RNCP visées :** C2.2.3 (auth WS, validation, étanchéité des conversations), C2.2.2 (tests), C2.4.1 (Swagger/UI)
**Lot :** Lot 1 (Web MVP)

> **Périmètre acté (2026-07-17) : texte + MongoDB.** Chat 1-à-1 **recruteur ↔ freelance**
> (le « chat contextuel » de la proposition de valeur : un recruteur contacte un freelance
> depuis son armurerie publique). Le **partage de fichiers lourds est HORS périmètre** — il
> dépend du pipeline média S3/Signed URLs (EP04, sacrifié au cadrage du 23/07) ; l'événement
> WS et le modèle de message n'en tiennent pas la place.
> Ce ticket branche ENFIN la **brique NoSQL de l'architecture** (§2/§3 : MongoDB pour le chat).

### 0. Definition of Ready (DoR)
- [x] **Valeur Claire :** troisième fonctionnalité différenciante du dossier ; sans elle, la mise en relation s'arrête au score.
- [x] **Specs Complètes :** Gherkin ci-dessous ; décisions : socket.io (rooms par utilisateur), jeton JWT au handshake, paire de rôles imposée.
- [x] **UX/UI Validé :** « Contacter » sur l'armurerie publique (recruteur) → fil `/messages/:userId` ; liste `/messages` pour retrouver ses conversations (indispensable côté freelance).
- [x] **Faisabilité Technique :** @nestjs/websockets + socket.io ; MongoDB via compose (infra), Mongoose ; la gateway nginx (SH-5) sait proxyfier l'upgrade WS.
- [x] **Estimé :** 8 SP.

### 1. User Story
**En tant que** recruteur (ou freelance contacté),
**Je veux** échanger des messages en temps réel avec l'autre partie,
**Afin de** concrétiser la mise en relation sans quitter la plateforme.

### 3. Critères d'Acceptation (Gherkin - BDD)

**Scénario 1 : Envoi temps réel**
* **GIVEN** un recruteur connecté au WS (jeton d'accès vérifié au handshake) et un freelance connecté
* **WHEN** le recruteur envoie un message depuis le fil du freelance
* **THEN** le message est **persisté (MongoDB)** puis poussé en temps réel au destinataire ET renvoyé à l'émetteur (accusé).

**Scénario 2 : Authentification du WebSocket**
* **GIVEN** une connexion WS sans jeton, avec un jeton invalide, ou avec un jeton qui n'est pas de type `access` (refresh, twofa_pending…)
* **THEN** la connexion est **refusée** — aucun événement n'est traité.

**Scénario 3 : Étanchéité des conversations**
* **GIVEN** l'historique `GET /api/v1/chat/with/:userId`
* **THEN** un utilisateur ne peut lire QUE les conversations dont il est participant (l'identité vient du token, jamais d'un id client)
* **AND** la paire est toujours **RECRUITER ↔ FREELANCE** (pas de freelance→freelance ni recruteur→recruteur ; cible inexistante → 404).

**Scénario 4 : Validation des messages**
* **GIVEN** un message vide, blanc, ou > 2000 caractères
* **THEN** il est refusé (WS : erreur explicite à l'émetteur ; REST : 400) — jamais persisté.

**Scénario 5 : Historique et liste des conversations**
* **GIVEN** un utilisateur authentifié
* **THEN** `/messages` liste ses conversations (interlocuteur + dernier message), `/messages/:userId` charge l'historique (50 derniers) puis vit en temps réel.

**Scénario 6 : À travers la gateway (SH-5)**
* **GIVEN** la stack conteneurisée
* **THEN** le WS passe par la gateway (`/socket.io`, upgrade proxyfié) — le point d'entrée reste unique.

### 4. Spécifications Techniques
* **Infra** : service `mongo` (mongo:7) dans le compose **infra** (comme postgres/redis), port hôte **27018** (27017 occupé par un service personnel hors projet, même convention que Redis 6380), volume + healthcheck. `MONGODB_URL` en env (`.env.example`).
* **backend-core** : `chat/` — schéma Mongoose `Message` (`conversationId` = ids triés joints, `senderId`, `body ≤ 2000`, `createdAt`) ; `ChatService` (persist, historique paginé, liste des conversations par agrégation, garde de paire de rôles) ; `ChatGateway` socket.io (jeton au handshake via JwtService — refuse tout type ≠ `access` ; room `user:{id}` ; événement `message:send` → persist + émission `message:new` aux deux parties) ; `ChatController` REST (`GET conversations`, `GET with/:userId`) documenté Swagger. CORS WS aligné sur `resolveCorsOrigins`.
* **gateway (SH-5)** : `location /socket.io/` avec `Upgrade`/`Connection` (proxy WS) — hors zones de rate-limit auth.
* **frontend-web** : `features/chat/` — socket.io-client (jeton d'accès dans `auth` du handshake, jamais en query string) ; pages `/messages` (liste) et `/messages/:userId` (fil : historique REST + live WS + envoi) ; bouton « Contacter » sur l'armurerie publique (SH-21b). WSS = TLS terminé en amont : SH-4.
* **Tests** : service (modèle mongoose mocké : étanchéité, validation, agrégation), gateway (handshake refusé/accepté, émissions), front (socket mocké : historique, envoi, réception live). E2E réel à la vérification (2 clients socket.io + curl).

### 5. Definition of Done (DoD)
- [x] MongoDB branché (compose infra + Mongoose) — la ligne « NoSQL : pas encore branchée » de CLAUDE.md §5 est mise à jour.
- [x] WS authentifié (handshake JWT type `access` uniquement) ; paire RECRUITER↔FREELANCE imposée ; validation ≤ 2000 caractères.
- [x] Persistance + historique + liste des conversations (étanchéité testée).
- [x] Front : liste, fil temps réel, « Contacter » depuis l'armurerie publique (+ socket coupée au logout).
- [x] WS proxyfié par la gateway (vérifié sur la stack conteneurisée le 2026-07-17 : 16/16 sondes e2e vertes — temps réel bidirectionnel, refus sans jeton/jeton invalide, 400/403/404, historique + liste ; UI pilotée dans Chrome via `http://localhost:8088`).
- [x] Tests backend (162) + front (141) verts ; e2e réel vérifié (2 clients socket.io + REST à travers la gateway). CI verte : à confirmer sur la PR.
- [x] `docs/BACKLOG.md` mis à jour ; partage de fichiers tracé hors périmètre (EP04).
