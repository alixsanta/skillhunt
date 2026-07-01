# SH-14 — Bus d'événements Redis + cache des résultats de matching — Design

> Spec de conception issue d'un brainstorming. Cibles : `backend-core` (NestJS) et `matching-service` (FastAPI).
> Introduit **Redis** dans la stack : (A) infra, (B) migration du registre de refresh tokens en mémoire → Redis,
> (C) émission d'événements métier depuis backend-core, (D) consommation + cache des résultats `/match`.
> Compétences RNCP : **C2.2.2** (tests unitaires + intégration Redis réelle), **C2.2.3** (secrets en env, validation des payloads, résilience).

## 1. Objectif & valeur

Deux valeurs distinctes servies par la même brique Redis :

1. **Performance & fraîcheur du matching** — cacher les résultats `/match` (KPI R4, `/match` < 250 ms) tout en
   garantissant qu'un changement de matériel/profil **invalide** immédiatement le cache périmé, via un
   **bus d'événements** entre le monolithe et le microservice (communication asynchrone décrite au CLAUDE.md §2).
2. **Robustesse de l'auth** — le registre des refresh tokens quitte la mémoire process (perdu au redémarrage,
   non partagé entre instances) pour Redis, qui apporte le **TTL natif** et le partage multi-instances
   (dette explicitement taggée « SH-14 » dans `token-store.service.ts` et au CLAUDE.md §5).

## 2. Périmètre (validé en brainstorming)

Périmètre **complet A + B + C + D** (décision utilisateur ; requalifie l'estimation backlog de 5 SP → ~8–13 SP,
à répercuter sur le ticket).

| Chantier | Contenu | Service |
|---|---|---|
| **A** | Service Redis (docker-compose) + clients (`ioredis`, `redis`/redis-py) + config env | infra |
| **B** | `TokenStore` en mémoire → Redis (TTL natif, multi-instances) | backend-core |
| **C** | `EventPublisherService` + émission sur `reviewGear` | backend-core |
| **D** | Consumer Redis Streams + cache `/match` avec invalidation par version | matching-service |

**Hors périmètre (tickets séparés), documenté honnêtement :**
- **Émission `freelance.updated`** : aucun endpoint de mise à jour de profil/position n'existe aujourd'hui
  (le module `users` ne contient que `user.entity.ts`). Le **type d'événement est défini et réservé**, mais
  son émetteur sera branché par **SH-34** (position freelance à l'onboarding + endpoint MAJ). On livre
  l'abstraction, pas un émetteur mort.
- **Événement « offre publiée »** : aucun module « offre/mission » n'existe (hors EP05). Non couvert.
- Pagination/`LIMIT` du scoring : reste une piste perf distincte, non requise ici.

## 3. Décisions de conception (validées en brainstorming)

| # | Décision | Choix retenu |
|---|---|---|
| D1 | Mécanisme de bus | **Redis Streams + consumer group** (durable, at-least-once, rejouable, `XACK`). Pas de Pub/Sub (fire-and-forget, perdu si consumer down). |
| D2 | Stratégie d'invalidation du cache | **Globale par tag de version** : `INCR match:version` rend tout l'ancien cache inatteignable. Pas de `KEYS`/`SCAN`, pas d'index inverse (YAGNI). |
| D3 | Points d'émission réels | **`reviewGear`** → `gear.validated` / `gear.rejected` (seules mutations existantes impactant le matching). `freelance.updated` **réservé** pour SH-34. |
| D4 | TTL du cache `/match` | **60 s par défaut, configurable** (`MATCH_CACHE_TTL`). |
| D5 | Résilience si Redis indisponible | **Dégradation gracieuse** : cache = no-op (on calcule quand même), émission d'événement = best-effort loguée (ne casse jamais `reviewGear`). Auth : voir §5 (fail-safe). |
| D6 | Stratégie de test | **Intégration Redis réelle en CI** (service container `redis:7`) côté backend-core (Jest) ET matching-service (pytest), + unitaires avec client mické. |

## 4. Architecture

```
backend-core (NestJS)                     Redis                      matching-service (FastAPI)
─────────────────────                  ─────────                    ──────────────────────────
reviewGear(VALIDATED/REJECTED)                                       lifespan startup
   └─ EventPublisherService.publish ──XADD──▶ stream                    └─ démarre consumer task
                                    "skillhunt:events"                         │
                                                      ──XREADGROUP──▶  group "matching"
                                                                              │ traite + XACK
                                                                              ▼
TokenStore (auth)                                                     INCR "match:version"
   save/isValid/revoke ──SET/GET/DEL (EX ttl)──▶ "refresh:{jti}"
                                                                     POST /match
                                                                       key = "match:v{N}:{sha256(body)}"
                                                                       GET → hit ? renvoie
                                                                             miss ? scoring PostGIS
                                                                                    puis SETEX (ttl)
```

Un **seul** serveur Redis, logiquement partitionné par préfixe de clé : `refresh:*` (auth),
`skillhunt:events` (stream), `match:*` (cache + compteur de version).

### 4.1 Chantier A — Infra & clients

- **docker-compose.yml** : service `redis` (`redis:7-alpine`, port hôte `6379`, `healthcheck` `redis-cli ping`,
  volume nommé pour la durabilité du stream en dev). Mise à jour du commentaire d'en-tête (Redis n'est plus « à venir »).
- **backend-core** : dépendance `ioredis`. Un `RedisModule`/provider expose une connexion partagée
  (`REDIS_URL` via env, défaut `redis://localhost:6379`). Enregistré dans `app.module.ts`.
- **matching-service** : dépendance `redis>=5` (redis-py, API **asyncio**). `redis_url` existe déjà dans
  `app/core/config.py`. Un helper `app/db/redis.py` fournit le client (pool) partagé.
- **Aucun secret en dur** : URL Redis lue via variable d'environnement (CLAUDE.md §8-4).

### 4.2 Chantier B — `TokenStore` → Redis (backend-core)

`auth/token-store.service.ts` conserve **exactement son interface publique** (`save` / `isValid` / `revoke` /
`revokeAllForUser`) — déjà pensée « Redis-ready », donc **zéro changement chez les appelants**.

| Méthode | Implémentation Redis |
|---|---|
| `save(jti, userId, ttl)` | `SET refresh:{jti} {userId} EX {ttl}` (TTL natif, plus de purge paresseuse) + `SADD user:{userId}:jtis {jti}` puis `EXPIRE` sur le set (borne supérieure) |
| `isValid(jti, userId)` | `GET refresh:{jti}` ; valide si présent **et** égal à `userId` |
| `revoke(jti)` | `DEL refresh:{jti}` (+ `SREM` du set) |
| `revokeAllForUser(userId)` | `SMEMBERS user:{userId}:jtis` → `DEL` sur chaque `refresh:{jti}` (pipeline) + `DEL` du set |

Les méthodes deviennent **async** (retour `Promise`). Impact appelants : ajout de `await` (l'`AuthService`
appelle déjà ces méthodes dans un contexte async). Le type de retour de `isValid` passe `boolean` → `Promise<boolean>`.

**Fail-safe auth (D5)** : si Redis est indisponible, `isValid` renvoie **`false`** (refus par défaut — un token
non vérifiable est traité comme invalide, jamais accordé). On ne dégrade **pas** la sécurité de l'auth.

### 4.3 Chantier C — Émission d'événements (backend-core)

Nouveau `common/events/event-publisher.service.ts` (réutilisable, injectable) :

```typescript
enum DomainEventType {
  GEAR_VALIDATED = 'gear.validated',
  GEAR_REJECTED  = 'gear.rejected',
  FREELANCE_UPDATED = 'freelance.updated', // réservé — émis par SH-34
}

publish(type: DomainEventType, payload: Record<string, string>): Promise<void>
// → XADD skillhunt:events * type <type> ...payload  (best-effort : try/catch + log, ne relance pas)
```

- Branché dans `gear.service.ts::reviewGear` : après persistance du nouveau statut, émet
  `gear.validated` ou `gear.rejected` avec `{ gearId, freelanceId }`.
- **Best-effort (D5)** : une panne Redis logue une erreur mais **ne fait pas échouer** la revue du gear
  (la vérité métier est en PostgreSQL ; le cache est une optimisation).
- Payload = **données non sensibles** (identifiants + type), sérialisées en champs de stream simples (pas de PII).

### 4.4 Chantier D — Consumer + cache (matching-service)

**Consumer** — `app/services/event_consumer.py` :
- Démarré/arrêté par le `lifespan` FastAPI (tâche `asyncio`).
- Crée le consumer group `matching` sur `skillhunt:events` (`XGROUP CREATE … MKSTREAM`, idempotent).
- Boucle `XREADGROUP GROUP matching {consumer} BLOCK … COUNT …`.
- Pour chaque événement de type `gear.*` (et plus tard `freelance.updated`) : `INCR match:version`, puis `XACK`.
- Un type inconnu est `XACK`é et ignoré (forward-compatible).
- Erreur de traitement : pas de `XACK` (l'événement reste en PEL, retraité) ; log.

**Cache `/match`** — `app/services/match_cache.py` + intégration dans `routers/matching.py` :
- Version courante : `GET match:version` (absent → `0`).
- Clé : `match:v{version}:{sha256(json_canonique(request))}`.
- Lecture : `GET` → hit (désérialise la liste `MatchResult`) ou miss.
- Écriture : après scoring, `SETEX match:v{version}:{hash} {MATCH_CACHE_TTL} {json}`.
- **Dégradation (D5)** : toute exception Redis est capturée → on exécute le scoring normal (no-op cache),
  logue un warning ; `/match` ne tombe jamais à cause de Redis.

## 5. Cas limites & sécurité

| Situation | Comportement |
|---|---|
| Redis down (matching) | cache no-op → scoring PostGIS exécuté, `/match` répond normalement (plus lent) |
| Redis down (émission) | `reviewGear` réussit quand même, erreur loguée, événement perdu (cache éventuellement périmé jusqu'au TTL) |
| Redis down (auth `isValid`) | renvoie `false` → refus (fail-safe, jamais fail-open) |
| Événement rejoué (at-least-once) | `INCR` idempotent en effet (invalide simplement une fois de plus) ; traitement sans effet de bord destructeur |
| Type d'événement inconnu | `XACK` + ignoré (forward-compatible) |
| `INCR match:version` en continu | compteur monotone borné par la fréquence des events ; entier Redis 64 bits, non problématique |
| Payload d'événement malformé | validé à la consommation ; champ manquant → log + `XACK` (pas de crash) |

**Sécurité (CLAUDE.md §8) :**
- **Secrets hors code** : `REDIS_URL` en env des deux côtés (§8-4).
- **Validation** : payloads d'événements validés à la consommation ; désérialisation **JSON simple** (pas de
  `pickle`/`eval`), pas de désérialisation d'objets arbitraires (§8-1, C2.2.3).
- **Pas de PII** dans le stream ni dans les clés de cache (les clés dérivent d'un `sha256` de la requête).
- **Auth fail-safe** : indisponibilité Redis ⇒ refus, jamais octroi.
- **Réseau** : Redis reste sur le réseau Docker privé (pas d'exposition publique) — cohérent avec §8-8.

## 6. Stratégie de tests (D6)

**backend-core (Jest) :**
- `TokenStore` : unitaires avec `ioredis` mické (`save/isValid/revoke/revokeAllForUser`, fail-safe `isValid`=false si erreur).
- `EventPublisherService` : `XADD` appelé avec le bon type/payload ; une erreur Redis est avalée (best-effort).
- `gear.service` : `reviewGear` émet l'événement attendu selon la décision.
- **Intégration réelle** : service container `redis:7` en CI ; round-trip `save` → `isValid` avec vrai TTL.

**matching-service (pytest) :**
- `match_cache` : construction de clé (déterministe pour une requête), hit/miss, dégradation si Redis down (mické).
- `event_consumer` : un `gear.validated` déclenche `INCR match:version` ; type inconnu ignoré.
- **Intégration réelle** (`@pytest.mark.integration`) : service container `redis:7` ; publie un événement dans le
  stream, vérifie que le consumer bump la version et qu'une clé de cache de l'ancienne version n'est plus servie.

**CI :** ajouter le service `redis:7` (healthcheck `redis-cli ping`) dans `node-ci.yml` et `python-ci.yml`,
avec `REDIS_URL` injecté aux steps de test. Modèle : le service container PostGIS de SH-13.

## 7. Fichiers concernés (indicatif)

| Opération | Chemin |
|---|---|
| Modifier | `docker-compose.yml` (service `redis`, commentaire d'en-tête) |
| Créer | `backend-core/src/common/redis/redis.module.ts` (+ provider connexion `ioredis`) |
| Modifier | `backend-core/src/auth/token-store.service.ts` (Map → Redis, méthodes async) |
| Modifier | `backend-core/src/auth/*.service.ts` (ajout `await` sur les appels TokenStore) |
| Créer | `backend-core/src/common/events/event-publisher.service.ts` (+ enum `DomainEventType`) |
| Modifier | `backend-core/src/gear/gear.service.ts` (émission dans `reviewGear`) |
| Modifier | `backend-core/src/app.module.ts` (enregistrer RedisModule + EventPublisher) |
| Modifier | `backend-core/package.json` (dép. `ioredis`) |
| Créer | `matching-service/app/db/redis.py` (client redis-py asyncio partagé) |
| Créer | `matching-service/app/services/event_consumer.py` (consumer group + bump version) |
| Créer | `matching-service/app/services/match_cache.py` (clé versionnée, get/set, dégradation) |
| Modifier | `matching-service/app/routers/matching.py` (lecture/écriture cache autour du scoring) |
| Modifier | `matching-service/main.py` (démarrage/arrêt du consumer dans le `lifespan`) |
| Modifier | `matching-service/requirements.txt` (dép. `redis`) |
| Créer/Modifier | tests Jest + pytest (unitaires + intégration Redis) |
| Modifier | `.github/workflows/node-ci.yml` + `python-ci.yml` (service `redis:7`) |
| Créer | `docs/tickets/SH-14-bus-evenements-redis.md` (avec estimation requalifiée) |
| Modifier | `docs/BACKLOG.md` (SH-14 en cours/terminé ; note estimation) |

## 8. Suites / liens

- **SH-34** : branchera l'émission `freelance.updated` (endpoint MAJ position freelance) sur `EventPublisherService`.
- Cette brique Redis (`RedisModule`, stream, cache) est réutilisable pour les futurs besoins asynchrones
  (ex. notifications, transcodage média EP04).
- Lève la dette « TokenStore en mémoire » du CLAUDE.md §5 et du commentaire dans `token-store.service.ts`.
