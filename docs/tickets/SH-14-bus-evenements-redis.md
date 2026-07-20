**Titre du Ticket :** [SH-14] Bus d'événements Redis + cache des résultats de matching
**Type :** Feature
**Priorité :** High
**Estimation :** ~~5 Story Points~~ → **requalifiée 8–13 Story Points** (le périmètre réel couvre 4 sous-chantiers A/B/C/D, décision de brainstorming — voir spec §2)
**Compétences RNCP visées :** C2.2.2 (harnais de tests unitaires + intégration Redis réelle), C2.2.3 (sécurité : fail-safe auth, validation des payloads, secrets en env)
**Lot :** Lot 1 (Web MVP)
**Statut :** ✅ Implémenté — branche `feature/SH-14-bus-evenements-redis`, en attente de PR vers `develop`. *(Ticket rédigé a posteriori pour traçabilité jury.)*

> Spec de conception : `docs/superpowers/specs/2026-07-01-SH-14-bus-evenements-redis-design.md`.
> Introduit **Redis** dans la stack (CLAUDE.md §2 : cache + bus d'événements). Lève la dette « TokenStore en mémoire » (CLAUDE.md §5). Suite : SH-34 branchera l'émission `freelance.updated`.

### 0. Definition of Ready (DoR)
- [x] **Valeur Claire :** performance `/match` (KPI R4, < 250 ms) + robustesse de l'auth (refresh tokens survivant au redémarrage, multi-instances).
- [x] **Specs Complètes :** critères Gherkin ci-dessous + spec de conception (décisions D1–D6 validées en brainstorming).
- [x] **UX/UI :** N/A (feature backend/infra pure).
- [x] **Faisabilité Technique :** Redis 7 en docker-compose ; `ioredis` (NestJS) et `redis>=5` asyncio (FastAPI) ; modèle CI = service container PostGIS de SH-13.
- [x] **Estimé :** requalifié 5 SP → ~8–13 SP après cadrage du périmètre complet A+B+C+D.

### 1. User Story
**En tant que** recruteur,
**Je veux** que mes recherches de matching répondent vite (résultats cachés) **sans jamais me présenter de résultats périmés** après un changement de matériel validé/rejeté,
**Afin de** contacter des freelances sur la base de données à jour, avec un temps de réponse < 250 ms.

*(Valeur secondaire — freelance/plateforme : mes sessions de connexion (refresh tokens) survivent à un redémarrage du serveur et sont révocables de façon fiable.)*

### 2. Contexte & Valeur Business
- **Pourquoi maintenant ?** Le moteur de scoring (SH-12) + géo PostGIS (SH-13) existent : le cache devient le levier perf naturel, et il exige un mécanisme d'invalidation propre (bus d'événements, architecture cible CLAUDE.md §2). Par ailleurs, le `TokenStore` en mémoire est une dette taggée « SH-14 » depuis SH-7.
- **KPI impacté :** latence `/match` (R4, < 250 ms sur cache hit) ; fiabilité de la révocation des refresh tokens (sécurité §8-5).

### 3. Critères d'Acceptation (Gherkin)

**Scénario 1 : Cache hit sur /match**
- GIVEN une requête `/match` déjà servie il y a moins de `match_cache_ttl` secondes
- WHEN je re-POSTe la même requête
- THEN la réponse provient du cache Redis (aucun scoring PostGIS exécuté) et est identique à la première.

**Scénario 2 : Invalidation par événement métier**
- GIVEN un résultat `/match` en cache
- WHEN un admin valide ou rejette un matériel via `reviewGear` (backend-core)
- THEN un événement `gear.validated`/`gear.rejected` est publié sur le stream Redis
- AND le consumer du matching-service incrémente `match:version`
- AND la prochaine requête `/match` recalcule le scoring (l'ancienne clé de cache n'est plus servie).

**Scénario 3 : Dégradation gracieuse du cache (Redis down)**
- GIVEN Redis indisponible côté matching-service
- WHEN je POSTe `/match`
- THEN le scoring PostGIS s'exécute normalement et la réponse est renvoyée (cache no-op, warning logué) — `/match` ne tombe jamais à cause de Redis.

**Scénario 4 : Émission best-effort (Redis down)**
- GIVEN Redis indisponible côté backend-core
- WHEN un admin exécute `reviewGear`
- THEN la revue du matériel réussit quand même (vérité métier en PostgreSQL), l'erreur d'émission est loguée, l'opération métier n'échoue jamais.

**Scénario 5 : Auth fail-safe (Redis down)**
- GIVEN Redis indisponible côté backend-core
- WHEN un client présente un refresh token à `isValid`
- THEN le token est traité comme **invalide** (refus) — jamais fail-open : un token non vérifiable n'est jamais accordé.

**Scénario 6 : Refresh token expiré / révoqué**
- GIVEN un refresh token sauvegardé avec un TTL
- WHEN le TTL expire (expiration native Redis) ou que `revoke`/`revokeAllForUser` est appelé
- THEN `isValid` renvoie `false` pour ce token.

**Scénario 7 : Événement inconnu ou malformé (forward-compatible)**
- GIVEN le consumer reçoit un événement d'un type inconnu ou au payload incomplet
- THEN il est logué, `XACK`é et ignoré — le consumer ne crashe pas et continue de traiter le stream.

### 4. Spécifications Techniques

Un **seul** serveur Redis, partitionné logiquement par préfixe : `refresh:*` (auth), `skillhunt:events` (stream), `match:*` (cache + version).

**Décisions de conception (D1–D6, validées en brainstorming) :**

| # | Décision | Choix retenu |
|---|---|---|
| D1 | Mécanisme de bus | **Redis Streams + consumer group** (durable, at-least-once, rejouable, `XACK`) — pas de Pub/Sub (fire-and-forget, perdu si consumer down) |
| D2 | Invalidation du cache | **Globale par tag de version** : `INCR match:version` rend tout l'ancien cache inatteignable — pas de `KEYS`/`SCAN` ni d'index inverse (YAGNI) |
| D3 | Points d'émission réels | **`reviewGear`** → `gear.validated`/`gear.rejected` (seules mutations existantes impactant le matching) ; `freelance.updated` **réservé** pour SH-34 |
| D4 | TTL du cache `/match` | **60 s par défaut, configurable** (`match_cache_ttl` / env `MATCH_CACHE_TTL`) |
| D5 | Résilience Redis down | **Dégradation gracieuse** : cache no-op, émission best-effort loguée ; **exception : auth fail-safe** (`isValid` → `false`, jamais fail-open) |
| D6 | Stratégie de test | **Intégration Redis réelle en CI** (service container `redis:7-alpine`) dans les 2 CI + unitaires avec client mocké |

**Chantier A — Infra Redis :**
- `docker-compose.yml` : service `redis` (`redis:7-alpine`, healthcheck `redis-cli ping`, volume nommé).
- backend-core : dépendance `ioredis` ; `common/redis/redis.module.ts` expose une connexion partagée (`REDIS_URL` via env, défaut `redis://localhost:6379`), enregistrée dans `app.module.ts`.
- matching-service : dépendance `redis>=5` (redis-py, API **asyncio**) ; `app/db/redis.py` fournit le client (pool) partagé, `redis_url` déjà présent dans `app/core/config.py`.

**Chantier B — TokenStore → Redis (backend-core) :**
- `auth/token-store.service.ts` : Map en mémoire → Redis, **interface publique inchangée** (`save`/`isValid`/`revoke`/`revokeAllForUser`), méthodes passées async (`await` chez les appelants).
- `save` → `SET refresh:{jti} {userId} EX {ttl}` (TTL natif) + set `user:{userId}:jtis` ; `revokeAllForUser` → `SMEMBERS` + `DEL` en pipeline.
- **Fail-safe (D5)** : Redis indisponible ⇒ `isValid` renvoie `false` — refus par défaut, jamais fail-open (C2.2.3).

**Chantier C — Émission d'événements (backend-core) :**
- `common/events/event-publisher.service.ts` : enum `DomainEventType` (`gear.validated`, `gear.rejected`, `freelance.updated` réservé SH-34) ; `publish()` → `XADD skillhunt:events` en **best-effort** (try/catch + log, ne relance jamais).
- Branché dans `gear.service.ts::reviewGear` : après persistance du statut, émet l'événement avec `{ gearId, freelanceId }` — **aucune PII** dans le stream.

**Chantier D — Consumer + cache (matching-service) :**
- `app/services/event_consumer.py` : consumer group `matching` sur `skillhunt:events` (`XGROUP CREATE … MKSTREAM` idempotent), boucle `XREADGROUP … BLOCK`, `INCR match:version` sur `gear.*` puis `XACK` ; type inconnu → `XACK` + ignoré ; erreur → pas de `XACK` (retraitement via PEL).
- `app/services/match_cache.py` : clé **versionnée** `match:v{N}:{sha256(json_canonique(request))}` ; `GET` (hit/miss), `SETEX` avec `match_cache_ttl` après scoring ; toute exception Redis capturée → scoring normal (no-op).
- `routers/matching.py` : lecture/écriture du cache autour du scoring ; `main.py` : démarrage/arrêt du consumer dans le **lifespan** FastAPI (tâche asyncio, shutdown résilient même si le consumer est mort).

**Sécurité (CLAUDE.md §8) :** `REDIS_URL` en env des deux côtés (aucun secret en dur) ; désérialisation **JSON simple** (jamais `pickle`/`eval`) ; payloads validés à la consommation ; pas de PII dans le stream ni les clés de cache (sha256) ; Redis sur le réseau Docker privé, non exposé publiquement.

### 5. Definition of Done (DoD)
- [x] Tous tests verts : unitaires (Jest + pytest, clients Redis mockés) **et intégration Redis réelle** dans les 2 CI (service containers `redis:7-alpine` dans `node-ci.yml` et `python-ci.yml`, `REDIS_URL` injecté aux steps de test).
- [x] **Dégradation gracieuse** vérifiée : cache no-op et émission best-effort si Redis down (`/match` et `reviewGear` n'échouent jamais à cause de Redis).
- [x] **Fail-safe auth** vérifié : Redis down ⇒ `isValid` = `false` (jamais fail-open), tests à l'appui (C2.2.3).
- [x] Aucun secret en dur : `REDIS_URL` via variables d'environnement des deux services.
- [x] Lint (ESLint + flake8), audit sécurité et build OK dans les 2 CI.
- [x] Dette « TokenStore en mémoire » levée (tag SH-14 de `token-store.service.ts` et CLAUDE.md §5).
- [x] Code review (high effort) passée — 6 findings tracés en SH-35/SH-36 (non bloquants) — et PR #15 `feature/SH-14-bus-evenements-redis` → `develop` **mergée** (2026-07-05).
