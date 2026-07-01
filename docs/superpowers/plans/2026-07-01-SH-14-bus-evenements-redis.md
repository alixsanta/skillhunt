# SH-14 — Bus d'événements Redis + cache de matching — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduire Redis dans SkillHunt pour (A) l'infra, (B) migrer le registre de refresh tokens en mémoire vers Redis, (C) émettre des événements métier depuis backend-core, (D) consommer ces événements et cacher les résultats `/match` avec invalidation par version.

**Architecture:** Un serveur Redis unique, partitionné par préfixe de clé (`refresh:*` auth, `skillhunt:events` stream, `match:*` cache+version). backend-core (NestJS/ioredis) émet via **Redis Streams** (`XADD`) ; matching-service (FastAPI/redis-py asyncio) consomme via **consumer group** (`XREADGROUP`/`XACK`) et bump un compteur de version qui invalide globalement le cache `/match`. Toute panne Redis dégrade gracieusement (sauf l'auth, en fail-safe : refus par défaut).

**Tech Stack:** Redis 7, `ioredis` (Node), `redis>=5` (redis-py asyncio), NestJS 10, FastAPI, Jest, pytest, GitHub Actions service containers.

## Global Constraints

- **Langue** : commentaires et messages utilisateur **en français** ; identifiants en anglais (CLAUDE.md §7).
- **Secrets hors code** : `REDIS_URL` via variable d'environnement, jamais en dur (§8-4).
- **Pas de requête brute / pas de désérialisation dangereuse** : payloads d'événements et cache en **JSON simple** (pas de `pickle`/`eval`) ; validation à la consommation (§8-1, C2.2.3).
- **Référencer la compétence RNCP** en commentaire des blocs concernés (`C2.2.2` tests, `C2.2.3` sécurité).
- **Auth fail-safe** : indisponibilité Redis ⇒ `isValid` renvoie `false` (refus), jamais fail-open.
- **Dégradation gracieuse** (cache/émission) : une panne Redis ne casse ni `/match` ni `reviewGear`.
- **Commits** : Conventional Commits, scope `(SH-14/<service>)`, terminés par `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **matching-service** : PEP 8, flake8 `max-line-length=127`, code typé, Pydantic pour l'I/O.

---

## Phase A — Infrastructure Redis

### Task 1: Service Redis (docker-compose) + provider ioredis (backend-core)

**Files:**
- Modify: `docker-compose.yml` (ajout service `redis`, MAJ commentaire d'en-tête)
- Modify: `backend-core/package.json` (dépendance `ioredis`)
- Create: `backend-core/src/common/redis/redis.module.ts`
- Modify: `backend-core/src/app.module.ts` (importer `RedisModule`)
- Test: `backend-core/src/common/redis/redis.module.spec.ts`

**Interfaces:**
- Produces: token d'injection `REDIS_CLIENT` (une instance `ioredis` `Redis`), exporté par `RedisModule` ; lu via `@Inject(REDIS_CLIENT) private readonly redis: Redis`.

- [ ] **Step 1: Ajouter le service Redis à docker-compose**

Dans `docker-compose.yml`, mettre à jour le commentaire d'en-tête (Redis n'est plus « à venir ») et ajouter le service :

```yaml
  redis:
    image: redis:7-alpine
    container_name: skillhunt-redis
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    volumes:
      - redis-data:/data
```

Ajouter `redis-data:` sous la section `volumes:` du fichier.

- [ ] **Step 2: Installer ioredis**

Run: `cd backend-core && npm install ioredis@5`
Expected: `ioredis` ajouté à `dependencies` de `package.json`, `package-lock.json` mis à jour.

- [ ] **Step 3: Écrire le test du module (échec attendu)**

`backend-core/src/common/redis/redis.module.spec.ts` :

```typescript
import { Test } from '@nestjs/testing';
import Redis from 'ioredis';
import { RedisModule, REDIS_CLIENT } from './redis.module';

describe('RedisModule', () => {
  it('fournit un client ioredis via le token REDIS_CLIENT', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [RedisModule],
    }).compile();

    const client = moduleRef.get<Redis>(REDIS_CLIENT);
    expect(client).toBeDefined();
    expect(typeof client.xadd).toBe('function');

    await client.quit();
  });
});
```

- [ ] **Step 4: Lancer le test (échec)**

Run: `cd backend-core && npx jest redis.module.spec --silent`
Expected: FAIL — module `./redis.module` introuvable.

- [ ] **Step 5: Implémenter le RedisModule**

`backend-core/src/common/redis/redis.module.ts` :

```typescript
import { Global, Module } from '@nestjs/common';
import Redis from 'ioredis';

// Token d'injection du client Redis partagé (C2.2.3 — URL via env, jamais en dur)
export const REDIS_CLIENT = 'REDIS_CLIENT';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: (): Redis => {
        const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
        // lazyConnect : on ne bloque pas le bootstrap si Redis n'est pas encore prêt
        return new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 2 });
      },
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
```

- [ ] **Step 6: Enregistrer RedisModule dans app.module.ts**

Ajouter l'import en haut de `backend-core/src/app.module.ts` :

```typescript
import { RedisModule } from './common/redis/redis.module';
```

Et ajouter `RedisModule` au tableau `imports` du `@Module`.

- [ ] **Step 7: Lancer le test (succès)**

Run: `cd backend-core && npx jest redis.module.spec --silent`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add docker-compose.yml backend-core/package.json backend-core/package-lock.json backend-core/src/common/redis/ backend-core/src/app.module.ts
git commit -m "feat(SH-14/infra): service Redis (docker-compose) + RedisModule ioredis (C2.2.3)"
```

---

### Task 2: Client Redis asyncio (matching-service)

**Files:**
- Modify: `matching-service/requirements.txt` (dépendance `redis`)
- Create: `matching-service/app/db/redis.py`
- Test: `matching-service/tests/test_redis_client.py`

**Interfaces:**
- Produces: `get_redis() -> redis.asyncio.Redis` (singleton paresseux, `decode_responses=True`) et `async def close_redis() -> None`.

- [ ] **Step 1: Ajouter la dépendance redis**

Dans `matching-service/requirements.txt`, ajouter la ligne :

```
redis==5.2.1
```

Puis : `cd matching-service && pip install -r requirements.txt`

- [ ] **Step 2: Écrire le test (échec attendu)**

`matching-service/tests/test_redis_client.py` :

```python
# C2.2.2 — Le client Redis est un singleton paresseux, réutilisé entre appels
from app.db import redis as redis_module


def test_get_redis_returns_singleton():
    redis_module._client = None  # reset de l'état module
    a = redis_module.get_redis()
    b = redis_module.get_redis()
    assert a is b
    assert a.connection_pool.connection_kwargs.get("decode_responses") is True
```

- [ ] **Step 3: Lancer le test (échec)**

Run: `cd matching-service && pytest tests/test_redis_client.py -v`
Expected: FAIL — module `app.db.redis` introuvable.

- [ ] **Step 4: Implémenter le client**

`matching-service/app/db/redis.py` :

```python
# C2.2.3 — Client Redis (asyncio) ; URL chargée depuis la config env (jamais en dur)
from redis.asyncio import Redis
from app.core.config import settings

_client: Redis | None = None


def get_redis() -> Redis:
    """Retourne un client Redis partagé (singleton paresseux, réponses décodées en str)."""
    global _client
    if _client is None:
        _client = Redis.from_url(settings.redis_url, decode_responses=True)
    return _client


async def close_redis() -> None:
    """Ferme proprement le client au shutdown (drainage du pool)."""
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None
```

- [ ] **Step 5: Lancer le test (succès)**

Run: `cd matching-service && pytest tests/test_redis_client.py -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add matching-service/requirements.txt matching-service/app/db/redis.py matching-service/tests/test_redis_client.py
git commit -m "feat(SH-14/matching): client Redis asyncio partagé (config env) (C2.2.3)"
```

---

## Phase B — TokenStore → Redis (backend-core)

### Task 3: Réimplémenter TokenStore sur Redis + adapter les appelants

**Files:**
- Modify: `backend-core/src/auth/token-store.service.ts` (Map → Redis, méthodes async)
- Modify: `backend-core/src/auth/auth.service.ts:92,98,112,133` (ajout `await`, `issueTokens`/`logout` async)
- Modify: `backend-core/src/auth/token-store.service.spec.ts` (si existant) ou création
- Test: `backend-core/src/auth/token-store.service.spec.ts`

**Interfaces:**
- Consumes: `REDIS_CLIENT` (Task 1).
- Produces: `TokenStore` avec `save(jti, userId, ttl): Promise<void>`, `isValid(jti, userId): Promise<boolean>`, `revoke(jti): Promise<void>`, `revokeAllForUser(userId): Promise<void>`.

- [ ] **Step 1: Écrire les tests (échec attendu)**

`backend-core/src/auth/token-store.service.spec.ts` :

```typescript
import { TokenStore } from './token-store.service';

// ioredis mické : on vérifie les commandes émises, sans vrai serveur
function makeRedisMock() {
  return {
    set: jest.fn().mockResolvedValue('OK'),
    get: jest.fn(),
    del: jest.fn().mockResolvedValue(1),
    sadd: jest.fn().mockResolvedValue(1),
    srem: jest.fn().mockResolvedValue(1),
    smembers: jest.fn().mockResolvedValue([]),
    expire: jest.fn().mockResolvedValue(1),
  } as any;
}

describe('TokenStore (Redis)', () => {
  it('save écrit la clé refresh avec TTL natif', async () => {
    const redis = makeRedisMock();
    const store = new TokenStore(redis);
    await store.save('jti-1', 'user-1', 900);
    expect(redis.set).toHaveBeenCalledWith('refresh:jti-1', 'user-1', 'EX', 900);
    expect(redis.sadd).toHaveBeenCalledWith('user:user-1:jtis', 'jti-1');
  });

  it('isValid renvoie true si le userId correspond', async () => {
    const redis = makeRedisMock();
    redis.get.mockResolvedValue('user-1');
    const store = new TokenStore(redis);
    await expect(store.isValid('jti-1', 'user-1')).resolves.toBe(true);
  });

  it('isValid renvoie false si absent ou userId différent', async () => {
    const redis = makeRedisMock();
    redis.get.mockResolvedValue(null);
    const store = new TokenStore(redis);
    await expect(store.isValid('jti-x', 'user-1')).resolves.toBe(false);
    redis.get.mockResolvedValue('autre-user');
    await expect(store.isValid('jti-1', 'user-1')).resolves.toBe(false);
  });

  it('fail-safe : isValid renvoie false si Redis lève', async () => {
    const redis = makeRedisMock();
    redis.get.mockRejectedValue(new Error('connexion Redis perdue'));
    const store = new TokenStore(redis);
    await expect(store.isValid('jti-1', 'user-1')).resolves.toBe(false);
  });

  it('revoke supprime la clé', async () => {
    const redis = makeRedisMock();
    const store = new TokenStore(redis);
    await store.revoke('jti-1');
    expect(redis.del).toHaveBeenCalledWith('refresh:jti-1');
  });

  it('revokeAllForUser supprime tous les jti du set', async () => {
    const redis = makeRedisMock();
    redis.smembers.mockResolvedValue(['jti-1', 'jti-2']);
    const store = new TokenStore(redis);
    await store.revokeAllForUser('user-1');
    expect(redis.del).toHaveBeenCalledWith('refresh:jti-1', 'refresh:jti-2');
    expect(redis.del).toHaveBeenCalledWith('user:user-1:jtis');
  });
});
```

- [ ] **Step 2: Lancer les tests (échec)**

Run: `cd backend-core && npx jest token-store.service.spec --silent`
Expected: FAIL — le constructeur n'accepte pas de client / méthodes non async.

- [ ] **Step 3: Réimplémenter TokenStore sur Redis**

Remplacer intégralement `backend-core/src/auth/token-store.service.ts` :

```typescript
import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../common/redis/redis.module';

/**
 * Registre des refresh tokens valides, persisté dans Redis (SH-14).
 *
 * TTL natif Redis (plus de purge paresseuse) + partage entre instances.
 * Clés : `refresh:{jti}` -> userId ; set secondaire `user:{userId}:jtis`
 * pour la révocation globale (PCA en cas de compromission, dossier §4.4).
 */
@Injectable()
export class TokenStore {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async save(jti: string, userId: string, ttlSeconds: number): Promise<void> {
    await this.redis.set(`refresh:${jti}`, userId, 'EX', ttlSeconds);
    await this.redis.sadd(`user:${userId}:jtis`, jti);
    // Borne supérieure sur le set d'index pour éviter une fuite mémoire
    await this.redis.expire(`user:${userId}:jtis`, ttlSeconds);
  }

  async isValid(jti: string, userId: string): Promise<boolean> {
    try {
      const stored = await this.redis.get(`refresh:${jti}`);
      return stored !== null && stored === userId;
    } catch {
      // Fail-safe (C2.2.3) : un token non vérifiable est traité comme invalide
      return false;
    }
  }

  async revoke(jti: string): Promise<void> {
    await this.redis.del(`refresh:${jti}`);
  }

  /**
   * Invalide tous les refresh tokens d'un utilisateur.
   * Utilisé par le Plan de Continuité d'Activité en cas de compromission (dossier §4.4).
   */
  async revokeAllForUser(userId: string): Promise<void> {
    const jtis = await this.redis.smembers(`user:${userId}:jtis`);
    if (jtis.length > 0) {
      await this.redis.del(...jtis.map((jti) => `refresh:${jti}`));
    }
    await this.redis.del(`user:${userId}:jtis`);
  }
}
```

- [ ] **Step 4: Adapter les appelants dans auth.service.ts**

Dans `backend-core/src/auth/auth.service.ts` :

1. Ligne ~92 — ajouter `await` dans la condition de `refresh` :
```typescript
      !(await this.tokenStore.isValid(payload.jti, payload.userId))
```
2. Ligne ~98 — `await this.tokenStore.revoke(payload.jti);`
3. `logout` devient async et attend la révocation :
```typescript
  async logout(refreshToken: string): Promise<{ success: boolean }> {
    try {
      const payload = this.jwt.verify(refreshToken) as JwtPayload & { jti?: string };
      if (payload.jti) {
        await this.tokenStore.revoke(payload.jti);
      }
    } catch {
      // Logout idempotent : un token déjà invalide n'est pas une erreur
    }
    return { success: true };
  }
```
4. `issueTokens` devient async (pour attendre `save`) :
```typescript
  private async issueTokens(user: User): Promise<TokenPair> {
    // ... inchangé jusqu'à :
    await this.tokenStore.save(jti, user.id, REFRESH_TTL_SECONDS);
    return { accessToken, refreshToken };
  }
```
5. Les appelants de `issueTokens` (login, register, refresh) renvoient déjà `return this.issueTokens(user);` dans des méthodes `async` → ils renvoient maintenant une `Promise<TokenPair>`, ce qui reste valide sans changement. Vérifier que le contrôleur `logout` gère bien la `Promise` (il `await` déjà les méthodes du service).

- [ ] **Step 5: Lancer les tests (succès)**

Run: `cd backend-core && npx jest token-store.service.spec --silent`
Expected: PASS.

- [ ] **Step 6: Vérifier la non-régression auth + build**

Run: `cd backend-core && npx jest auth --silent && npm run build`
Expected: PASS + build TypeScript sans erreur (signale toute `Promise` non attendue).

- [ ] **Step 7: Commit**

```bash
git add backend-core/src/auth/token-store.service.ts backend-core/src/auth/token-store.service.spec.ts backend-core/src/auth/auth.service.ts
git commit -m "feat(SH-14/auth): TokenStore en mémoire → Redis (TTL natif, fail-safe) (C2.2.3)"
```

---

### Task 4: Test d'intégration Redis backend-core + service CI

**Files:**
- Create: `backend-core/src/auth/token-store.integration.spec.ts`
- Modify: `.github/workflows/node-ci.yml` (service container `redis:7` + `REDIS_URL` au step de test)

**Interfaces:**
- Consumes: vrai serveur Redis via `REDIS_URL`.

- [ ] **Step 1: Écrire le test d'intégration (skip si pas de Redis)**

`backend-core/src/auth/token-store.integration.spec.ts` :

```typescript
import Redis from 'ioredis';
import { TokenStore } from './token-store.service';

// C2.2.2 — Intégration Redis réelle : round-trip save → isValid avec vrai TTL
const url = process.env.REDIS_URL;
const describeIf = url ? describe : describe.skip;

describeIf('TokenStore (intégration Redis)', () => {
  let redis: Redis;
  let store: TokenStore;

  beforeAll(() => {
    redis = new Redis(url as string);
    store = new TokenStore(redis);
  });

  afterAll(async () => {
    await redis.flushdb();
    await redis.quit();
  });

  it('save puis isValid retourne true, revoke invalide', async () => {
    await store.save('jti-int', 'user-int', 60);
    expect(await store.isValid('jti-int', 'user-int')).toBe(true);
    await store.revoke('jti-int');
    expect(await store.isValid('jti-int', 'user-int')).toBe(false);
  });

  it('revokeAllForUser purge tous les jetons de l’utilisateur', async () => {
    await store.save('jti-a', 'user-multi', 60);
    await store.save('jti-b', 'user-multi', 60);
    await store.revokeAllForUser('user-multi');
    expect(await store.isValid('jti-a', 'user-multi')).toBe(false);
    expect(await store.isValid('jti-b', 'user-multi')).toBe(false);
  });
});
```

- [ ] **Step 2: Lancer le test en local sans Redis (skip attendu)**

Run: `cd backend-core && npx jest token-store.integration --silent`
Expected: la suite est **skipped** (pas de `REDIS_URL`) — aucune erreur.

- [ ] **Step 3: Ajouter le service Redis à node-ci.yml**

Dans `.github/workflows/node-ci.yml`, sous le job de test, ajouter (calqué sur le service PostGIS de SH-13) :

```yaml
    services:
      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
```

Et injecter l'URL au step qui lance les tests :

```yaml
        env:
          REDIS_URL: redis://localhost:6379
```

- [ ] **Step 4: Vérifier localement avec un Redis docker (optionnel mais recommandé)**

Run:
```bash
docker run -d --rm -p 6379:6379 --name sh-redis-test redis:7-alpine
cd backend-core && REDIS_URL=redis://localhost:6379 npx jest token-store.integration --silent
docker stop sh-redis-test
```
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add backend-core/src/auth/token-store.integration.spec.ts .github/workflows/node-ci.yml
git commit -m "test(SH-14/auth): intégration Redis réelle (TTL, révocation) + service CI (C2.2.2)"
```

---

## Phase C — Émission d'événements (backend-core)

### Task 5: EventPublisherService + enum DomainEventType

**Files:**
- Create: `backend-core/src/common/events/event-publisher.service.ts`
- Modify: `backend-core/src/app.module.ts` (déclarer `EventPublisherService` en provider)
- Test: `backend-core/src/common/events/event-publisher.service.spec.ts`

**Interfaces:**
- Consumes: `REDIS_CLIENT` (Task 1).
- Produces: `enum DomainEventType { GEAR_VALIDATED='gear.validated', GEAR_REJECTED='gear.rejected', FREELANCE_UPDATED='freelance.updated' }` ; `EventPublisherService.publish(type: DomainEventType, payload: Record<string,string>): Promise<void>`.

- [ ] **Step 1: Écrire les tests (échec attendu)**

`backend-core/src/common/events/event-publisher.service.spec.ts` :

```typescript
import { EventPublisherService, DomainEventType } from './event-publisher.service';

function makeRedisMock() {
  return { xadd: jest.fn().mockResolvedValue('1-0') } as any;
}

describe('EventPublisherService', () => {
  it('publish émet un XADD sur le stream avec type + payload aplati', async () => {
    const redis = makeRedisMock();
    const publisher = new EventPublisherService(redis);
    await publisher.publish(DomainEventType.GEAR_VALIDATED, { gearId: 'g1', freelanceId: 'f1' });
    expect(redis.xadd).toHaveBeenCalledWith(
      'skillhunt:events', '*',
      'type', 'gear.validated',
      'gearId', 'g1',
      'freelanceId', 'f1',
    );
  });

  it('best-effort : une erreur Redis est avalée (ne relance pas)', async () => {
    const redis = { xadd: jest.fn().mockRejectedValue(new Error('Redis down')) } as any;
    const publisher = new EventPublisherService(redis);
    await expect(publisher.publish(DomainEventType.GEAR_REJECTED, { gearId: 'g2' })).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Lancer les tests (échec)**

Run: `cd backend-core && npx jest event-publisher.service.spec --silent`
Expected: FAIL — module introuvable.

- [ ] **Step 3: Implémenter le publisher**

`backend-core/src/common/events/event-publisher.service.ts` :

```typescript
import { Inject, Injectable, Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.module';

// Types d'événements métier publiés sur le bus (consommés par matching-service, SH-14).
export enum DomainEventType {
  GEAR_VALIDATED = 'gear.validated',
  GEAR_REJECTED = 'gear.rejected',
  FREELANCE_UPDATED = 'freelance.updated', // réservé : émis par SH-34 (MAJ position freelance)
}

const STREAM_KEY = 'skillhunt:events';

@Injectable()
export class EventPublisherService {
  private readonly logger = new Logger(EventPublisherService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /**
   * Publie un événement sur le stream Redis (XADD).
   * Best-effort (C2.2.3) : une panne Redis est loguée mais ne fait jamais échouer
   * l'opération métier appelante (la vérité est en PostgreSQL, le bus est une optimisation).
   * Payload = données NON sensibles uniquement (ids, type) — aucune PII.
   */
  async publish(type: DomainEventType, payload: Record<string, string>): Promise<void> {
    const fields: string[] = ['type', type];
    for (const [key, value] of Object.entries(payload)) {
      fields.push(key, value);
    }
    try {
      await this.redis.xadd(STREAM_KEY, '*', ...fields);
    } catch (err) {
      this.logger.error(`Échec de publication de l'événement ${type} : ${(err as Error).message}`);
    }
  }
}
```

- [ ] **Step 4: Déclarer le provider**

Dans `backend-core/src/app.module.ts` : importer `EventPublisherService` et l'ajouter au tableau `providers`.

```typescript
import { EventPublisherService } from './common/events/event-publisher.service';
// ... providers: [ ..., EventPublisherService ]
```

- [ ] **Step 5: Lancer les tests (succès)**

Run: `cd backend-core && npx jest event-publisher.service.spec --silent`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend-core/src/common/events/ backend-core/src/app.module.ts
git commit -m "feat(SH-14/events): EventPublisherService (Redis Streams XADD, best-effort) (C2.2.3)"
```

---

### Task 6: Émettre l'événement dans reviewGear

**Files:**
- Modify: `backend-core/src/gear/gear.service.ts` (injecter le publisher, émettre après persistance)
- Modify: `backend-core/src/gear/gear.service.spec.ts` (vérifier l'émission)

**Interfaces:**
- Consumes: `EventPublisherService.publish`, `DomainEventType` (Task 5).

- [ ] **Step 1: Écrire/étendre le test (échec attendu)**

Dans `backend-core/src/gear/gear.service.spec.ts`, ajouter un `EventPublisherService` mické et un test :

```typescript
import { DomainEventType } from '../common/events/event-publisher.service';

// Dans le setup du module de test, fournir :
//   { provide: EventPublisherService, useValue: { publish: jest.fn() } }
// et récupérer la référence `publisher`.

it('reviewGear(VALIDATED) émet un événement gear.validated', async () => {
  gearRepo.findOne.mockResolvedValue({ id: 'g1', freelanceId: 'f1', status: GearStatus.PENDING });
  gearRepo.save.mockResolvedValue({ id: 'g1', freelanceId: 'f1', status: GearStatus.VALIDATED });
  await service.reviewGear('g1', GearStatus.VALIDATED);
  expect(publisher.publish).toHaveBeenCalledWith(
    DomainEventType.GEAR_VALIDATED,
    { gearId: 'g1', freelanceId: 'f1' },
  );
});

it('reviewGear(REJECTED) émet un événement gear.rejected', async () => {
  gearRepo.findOne.mockResolvedValue({ id: 'g2', freelanceId: 'f2', status: GearStatus.PENDING });
  gearRepo.save.mockResolvedValue({ id: 'g2', freelanceId: 'f2', status: GearStatus.REJECTED });
  await service.reviewGear('g2', GearStatus.REJECTED);
  expect(publisher.publish).toHaveBeenCalledWith(
    DomainEventType.GEAR_REJECTED,
    { gearId: 'g2', freelanceId: 'f2' },
  );
});
```

- [ ] **Step 2: Lancer les tests (échec)**

Run: `cd backend-core && npx jest gear.service.spec --silent`
Expected: FAIL — `publisher.publish` non appelé / dépendance manquante.

- [ ] **Step 3: Injecter le publisher et émettre**

Dans `backend-core/src/gear/gear.service.ts`, ajouter au constructeur :

```typescript
import { EventPublisherService, DomainEventType } from '../common/events/event-publisher.service';
// ...
  constructor(
    @InjectRepository(Gear)
    private readonly gearRepo: Repository<Gear>,
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    private readonly events: EventPublisherService,
  ) {}
```

Modifier la fin de `reviewGear` :

```typescript
    gear.status = decision;
    const saved = await this.gearRepo.save(gear);

    // Émission best-effort : notifie le matching-service pour invalider son cache (SH-14)
    const type =
      decision === GearStatus.VALIDATED
        ? DomainEventType.GEAR_VALIDATED
        : DomainEventType.GEAR_REJECTED;
    await this.events.publish(type, { gearId: saved.id, freelanceId: saved.freelanceId });

    return saved;
```

- [ ] **Step 4: Lancer les tests (succès)**

Run: `cd backend-core && npx jest gear.service.spec --silent`
Expected: PASS.

- [ ] **Step 5: Vérifier build**

Run: `cd backend-core && npm run build`
Expected: build OK.

- [ ] **Step 6: Commit**

```bash
git add backend-core/src/gear/gear.service.ts backend-core/src/gear/gear.service.spec.ts
git commit -m "feat(SH-14/gear): reviewGear émet gear.validated/rejected sur le bus (C2.2.2)"
```

---

## Phase D — Consommation + cache (matching-service)

### Task 7: Module de cache /match (clé versionnée, dégradation)

**Files:**
- Create: `matching-service/app/services/match_cache.py`
- Modify: `matching-service/app/core/config.py` (`match_cache_ttl: int = 60`)
- Test: `matching-service/tests/test_match_cache.py`

**Interfaces:**
- Consumes: `get_redis` (Task 2), `MatchRequest`/`MatchResult` (`app/models/schemas.py`).
- Produces :
  - `build_cache_key(version: int, request: MatchRequest) -> str`
  - `async def get_cached(request: MatchRequest) -> list[MatchResult] | None`
  - `async def set_cached(request: MatchRequest, results: list[MatchResult]) -> None`
  - `async def current_version() -> int`

- [ ] **Step 1: Ajouter le TTL configurable**

Dans `matching-service/app/core/config.py`, ajouter dans `Settings` :

```python
    match_cache_ttl: int = 60  # TTL (s) du cache des résultats /match (SH-14)
```

- [ ] **Step 2: Écrire les tests (échec attendu)**

`matching-service/tests/test_match_cache.py` :

```python
# C2.2.2 — Cache /match : clé déterministe versionnée + dégradation gracieuse si Redis down
import pytest
from unittest.mock import AsyncMock, patch
from app.models.schemas import MatchRequest, MatchResult
from app.services import match_cache

REQ = MatchRequest(skills=["DRONE"], location=(43.6, 1.44), radius_km=50.0)


def test_build_cache_key_is_deterministic_and_versioned():
    k1 = match_cache.build_cache_key(3, REQ)
    k2 = match_cache.build_cache_key(3, REQ)
    assert k1 == k2
    assert k1.startswith("match:v3:")
    # une version différente change la clé (invalidation globale)
    assert match_cache.build_cache_key(4, REQ) != k1


@pytest.mark.asyncio
async def test_get_cached_miss_returns_none():
    redis = AsyncMock()
    redis.get.return_value = None  # version absente puis clé absente
    with patch("app.services.match_cache.get_redis", return_value=redis):
        assert await match_cache.get_cached(REQ) is None


@pytest.mark.asyncio
async def test_set_then_get_roundtrip():
    store: dict[str, str] = {}
    redis = AsyncMock()
    redis.get.side_effect = lambda k: store.get(k)

    async def fake_setex(k, ttl, v):
        store[k] = v
    redis.setex.side_effect = fake_setex

    results = [MatchResult(freelance_id="123e4567-e89b-12d3-a456-426614174000", score=0.9, distance_km=3.0)]
    with patch("app.services.match_cache.get_redis", return_value=redis):
        await match_cache.set_cached(REQ, results)
        cached = await match_cache.get_cached(REQ)
    assert cached is not None
    assert cached[0].score == pytest.approx(0.9)


@pytest.mark.asyncio
async def test_get_cached_degrades_to_none_on_redis_error():
    redis = AsyncMock()
    redis.get.side_effect = ConnectionError("Redis down")
    with patch("app.services.match_cache.get_redis", return_value=redis):
        assert await match_cache.get_cached(REQ) is None  # pas d'exception propagée
```

- [ ] **Step 3: Lancer les tests (échec)**

Run: `cd matching-service && pytest tests/test_match_cache.py -v`
Expected: FAIL — module `app.services.match_cache` introuvable.

- [ ] **Step 4: Implémenter le cache**

`matching-service/app/services/match_cache.py` :

```python
# C2.2.3 — Cache des résultats /match : clé versionnée, JSON simple, dégradation gracieuse
import hashlib
import json
import logging
from app.db.redis import get_redis
from app.core.config import settings
from app.models.schemas import MatchRequest, MatchResult

logger = logging.getLogger(__name__)

_VERSION_KEY = "match:version"


async def current_version() -> int:
    """Version courante du cache (compteur incrémenté à chaque événement d'invalidation)."""
    redis = get_redis()
    raw = await redis.get(_VERSION_KEY)
    return int(raw) if raw is not None else 0


def build_cache_key(version: int, request: MatchRequest) -> str:
    """Clé déterministe : la version en préfixe rend obsolète tout cache antérieur."""
    # tri des clés → sérialisation canonique (indépendante de l'ordre)
    canonical = json.dumps(request.model_dump(), sort_keys=True, separators=(",", ":"))
    digest = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    return f"match:v{version}:{digest}"


async def get_cached(request: MatchRequest) -> list[MatchResult] | None:
    """Retourne les résultats en cache, ou None (miss ou Redis indisponible)."""
    try:
        redis = get_redis()
        version = await current_version()
        raw = await redis.get(build_cache_key(version, request))
        if raw is None:
            return None
        return [MatchResult(**item) for item in json.loads(raw)]
    except Exception as exc:  # dégradation : le scoring sera recalculé
        logger.warning("Cache /match indisponible (lecture) : %s", exc)
        return None


async def set_cached(request: MatchRequest, results: list[MatchResult]) -> None:
    """Écrit les résultats avec TTL ; silencieux si Redis indisponible."""
    try:
        redis = get_redis()
        version = await current_version()
        payload = json.dumps([r.model_dump(mode="json") for r in results])
        await redis.setex(build_cache_key(version, request), settings.match_cache_ttl, payload)
    except Exception as exc:
        logger.warning("Cache /match indisponible (écriture) : %s", exc)
```

- [ ] **Step 5: Lancer les tests (succès)**

Run: `cd matching-service && pytest tests/test_match_cache.py -v`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add matching-service/app/services/match_cache.py matching-service/app/core/config.py matching-service/tests/test_match_cache.py
git commit -m "feat(SH-14/matching): cache /match versionné + dégradation gracieuse (C2.2.3)"
```

---

### Task 8: Brancher le cache dans l'endpoint /match

**Files:**
- Modify: `matching-service/app/routers/matching.py` (lookup cache → miss → scoring → set)
- Modify: `matching-service/tests/test_matching.py` (hit/miss)

**Interfaces:**
- Consumes: `get_cached`, `set_cached` (Task 7).

- [ ] **Step 1: Écrire les tests (échec attendu)**

Dans `matching-service/tests/test_matching.py`, ajouter deux tests calqués sur le style existant
(fixture `client`, `app.dependency_overrides[get_db]`, patch de `app.routers.matching.*`) :

```python
def test_match_returns_cache_hit_without_scoring(client):
    # Un hit renvoie le cache tel quel, sans jamais appeler le scoring (get_candidates)
    cached = [{"freelance_id": str(FREELANCE_A), "score": 0.8, "distance_km": 1.0}]
    from app.models.schemas import MatchResult
    hit = [MatchResult(**cached[0])]
    payload = {"skills": ["drone-dgac"], "location": [43.6, 1.44], "radius_km": 50.0}
    app.dependency_overrides[get_db] = _override_get_db
    with patch("app.routers.matching.get_cached", new=AsyncMock(return_value=hit)), \
         patch("app.routers.matching.get_candidates", new=AsyncMock()) as candidates:
        response = client.post("/match", json=payload)
    app.dependency_overrides.clear()
    assert response.status_code == 200
    assert response.json() == cached
    candidates.assert_not_called()  # scoring court-circuité par le cache


def test_match_miss_computes_and_sets_cache(client):
    # Un miss (cache = None) recalcule puis écrit le résultat dans le cache
    profiles = [FreelancerProfile(freelance_id=FREELANCE_A, gear_categories=["DRONE"] * 5)]
    payload = {"skills": ["drone-dgac"], "location": [43.6, 1.44], "radius_km": 50.0}
    app.dependency_overrides[get_db] = _override_get_db
    with patch("app.routers.matching.get_cached", new=AsyncMock(return_value=None)), \
         patch("app.routers.matching.set_cached", new=AsyncMock()) as setter, \
         patch("app.routers.matching.get_candidates", new=AsyncMock(return_value=profiles)):
        response = client.post("/match", json=payload)
    app.dependency_overrides.clear()
    assert response.status_code == 200
    setter.assert_awaited_once()  # le résultat recalculé est mis en cache
```

> Note : les tests `/match` existants ne patchent PAS le cache. Grâce à la dégradation gracieuse
> (Task 7), l'absence de Redis en environnement de test fait échouer silencieusement `get_cached`
> (retour `None` = miss) et `set_cached` (no-op) — ils continuent donc de passer sans modification.

- [ ] **Step 2: Lancer les tests (échec)**

Run: `cd matching-service && pytest tests/test_matching.py -v`
Expected: FAIL — imports `get_cached`/`set_cached` inexistants dans le module router.

- [ ] **Step 3: Intégrer le cache dans le router**

Dans `matching-service/app/routers/matching.py`, importer et encadrer le scoring :

```python
from app.services.match_cache import get_cached, set_cached
```

Au début de `match`, avant le scoring :

```python
    # C2.2.2 — Cache Redis : un hit renvoie immédiatement sans recalcul (KPI < 250 ms)
    cached = await get_cached(request)
    if cached is not None:
        return cached
```

À la fin, avant `return results` :

```python
    await set_cached(request, results)
    return results
```

- [ ] **Step 4: Lancer les tests (succès)**

Run: `cd matching-service && pytest tests/test_matching.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add matching-service/app/routers/matching.py matching-service/tests/test_matching.py
git commit -m "feat(SH-14/matching): /match lit/écrit le cache Redis autour du scoring (C2.2.2)"
```

---

### Task 9: Consumer d'événements (bump version)

**Files:**
- Create: `matching-service/app/services/event_consumer.py`
- Test: `matching-service/tests/test_event_consumer.py`

**Interfaces:**
- Consumes: `get_redis` (Task 2).
- Produces :
  - `async def process_event(fields: dict[str, str]) -> None` (bump version si type pertinent)
  - `async def ensure_group() -> None`
  - `async def consume_loop(stop_event: asyncio.Event) -> None`
  - constantes `STREAM_KEY="skillhunt:events"`, `GROUP="matching"`.

- [ ] **Step 1: Écrire les tests (échec attendu)**

`matching-service/tests/test_event_consumer.py` :

```python
# C2.2.2 — Le consumer bump la version du cache sur les événements pertinents, ignore les autres
import pytest
from unittest.mock import AsyncMock, patch
from app.services import event_consumer


@pytest.mark.asyncio
async def test_gear_validated_bumps_version():
    redis = AsyncMock()
    with patch("app.services.event_consumer.get_redis", return_value=redis):
        await event_consumer.process_event({"type": "gear.validated", "gearId": "g1"})
    redis.incr.assert_awaited_once_with("match:version")


@pytest.mark.asyncio
async def test_gear_rejected_bumps_version():
    redis = AsyncMock()
    with patch("app.services.event_consumer.get_redis", return_value=redis):
        await event_consumer.process_event({"type": "gear.rejected", "gearId": "g2"})
    redis.incr.assert_awaited_once_with("match:version")


@pytest.mark.asyncio
async def test_unknown_event_is_ignored():
    redis = AsyncMock()
    with patch("app.services.event_consumer.get_redis", return_value=redis):
        await event_consumer.process_event({"type": "something.else"})
    redis.incr.assert_not_awaited()


@pytest.mark.asyncio
async def test_missing_type_is_ignored():
    redis = AsyncMock()
    with patch("app.services.event_consumer.get_redis", return_value=redis):
        await event_consumer.process_event({"gearId": "g3"})
    redis.incr.assert_not_awaited()
```

- [ ] **Step 2: Lancer les tests (échec)**

Run: `cd matching-service && pytest tests/test_event_consumer.py -v`
Expected: FAIL — module introuvable.

- [ ] **Step 3: Implémenter le consumer**

`matching-service/app/services/event_consumer.py` :

```python
# C2.2.2/C2.2.3 — Consumer Redis Streams : invalide le cache /match sur événements métier
import asyncio
import logging
from app.db.redis import get_redis

logger = logging.getLogger(__name__)

STREAM_KEY = "skillhunt:events"
GROUP = "matching"
CONSUMER = "matching-1"
_VERSION_KEY = "match:version"

# Types qui modifient un résultat de matching → invalident le cache
_INVALIDATING = {"gear.validated", "gear.rejected", "freelance.updated"}


async def process_event(fields: dict[str, str]) -> None:
    """Traite un événement : bump la version du cache si le type est pertinent."""
    event_type = fields.get("type")
    if event_type in _INVALIDATING:
        redis = get_redis()
        await redis.incr(_VERSION_KEY)
        logger.info("Cache /match invalidé (événement %s)", event_type)
    else:
        # Type inconnu ou champ manquant : ignoré (forward-compatible)
        logger.debug("Événement ignoré : %s", event_type)


async def ensure_group() -> None:
    """Crée le consumer group (idempotent : ignore l'erreur BUSYGROUP)."""
    redis = get_redis()
    try:
        await redis.xgroup_create(STREAM_KEY, GROUP, id="0", mkstream=True)
    except Exception as exc:
        if "BUSYGROUP" not in str(exc):
            raise


async def consume_loop(stop_event: asyncio.Event) -> None:
    """Boucle de consommation : XREADGROUP bloquant, ACK après traitement."""
    await ensure_group()
    redis = get_redis()
    while not stop_event.is_set():
        try:
            response = await redis.xreadgroup(
                GROUP, CONSUMER, {STREAM_KEY: ">"}, count=10, block=2000
            )
            if not response:
                continue
            for _stream, messages in response:
                for message_id, fields in messages:
                    try:
                        await process_event(fields)
                        await redis.xack(STREAM_KEY, GROUP, message_id)
                    except Exception as exc:  # pas d'ACK → retraité (reste dans le PEL)
                        logger.error("Échec de traitement %s : %s", message_id, exc)
        except asyncio.CancelledError:
            break
        except Exception as exc:  # panne Redis : on log et on retente après pause
            logger.warning("Consumer Redis interrompu : %s", exc)
            await asyncio.sleep(1)
```

- [ ] **Step 4: Lancer les tests (succès)**

Run: `cd matching-service && pytest tests/test_event_consumer.py -v`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add matching-service/app/services/event_consumer.py matching-service/tests/test_event_consumer.py
git commit -m "feat(SH-14/matching): consumer Redis Streams → invalidation cache par version (C2.2.2)"
```

---

### Task 10: Démarrer le consumer dans le lifespan FastAPI

**Files:**
- Modify: `matching-service/main.py` (lancer/arrêter la tâche consumer + close_redis)

**Interfaces:**
- Consumes: `consume_loop` (Task 9), `close_redis` (Task 2).

- [ ] **Step 1: Écrire un test de démarrage/arrêt propre**

Dans `matching-service/tests/test_event_consumer.py`, ajouter :

```python
@pytest.mark.asyncio
async def test_consume_loop_stops_on_event():
    stop = asyncio.Event()
    redis = AsyncMock()
    redis.xreadgroup.return_value = []  # aucun message
    with patch("app.services.event_consumer.get_redis", return_value=redis):
        task = asyncio.create_task(event_consumer.consume_loop(stop))
        await asyncio.sleep(0.05)
        stop.set()
        await asyncio.wait_for(task, timeout=3)  # se termine proprement
```

- [ ] **Step 2: Lancer le test (échec attendu si consume_loop ne respecte pas stop)**

Run: `cd matching-service && pytest tests/test_event_consumer.py::test_consume_loop_stops_on_event -v`
Expected: PASS (la boucle vérifie `stop_event.is_set()` — implémentée en Task 9 ; ce test verrouille le comportement).

- [ ] **Step 3: Câbler le lifespan**

Modifier `matching-service/main.py` :

```python
import asyncio
from contextlib import asynccontextmanager
from collections.abc import AsyncIterator
from fastapi import FastAPI
from app.db.database import engine
from app.db.redis import close_redis
from app.services.event_consumer import consume_loop
from app.routers import health, matching


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    # SH-14 — démarre le consumer d'événements (invalidation du cache /match)
    stop_event = asyncio.Event()
    consumer_task = asyncio.create_task(consume_loop(stop_event))
    try:
        yield
    finally:
        # C2.2.3 — arrêt propre : signale l'arrêt, attend la tâche, draine les pools
        stop_event.set()
        await consumer_task
        await close_redis()
        await engine.dispose()
```

- [ ] **Step 4: Vérifier que l'app démarre (import + lifespan)**

Run: `cd matching-service && pytest tests/ -k "matching or consumer" -v`
Expected: PASS (pas de régression ; l'app s'importe).

- [ ] **Step 5: Commit**

```bash
git add matching-service/main.py matching-service/tests/test_event_consumer.py
git commit -m "feat(SH-14/matching): démarrage/arrêt du consumer dans le lifespan (C2.2.3)"
```

---

### Task 11: Test d'intégration Redis matching + service CI

**Files:**
- Create: `matching-service/tests/test_redis_integration.py`
- Modify: `.github/workflows/python-ci.yml` (service `redis:7` + `REDIS_URL`)

**Interfaces:**
- Consumes: vrai Redis via `settings.redis_url` (env `REDIS_URL` mappé — voir note).

> Note : `config.py` lit `redis_url`. Pydantic-settings mappe la variable d'env `REDIS_URL` (insensible à la casse) sur `redis_url`. Le service CI exporte donc `REDIS_URL`.

- [ ] **Step 1: Écrire le test d'intégration (skip si pas de Redis)**

`matching-service/tests/test_redis_integration.py` :

```python
# C2.2.2 — Intégration Redis réelle : publish → consumer bump version → ancien cache inatteignable
import os
import pytest
from app.db.redis import get_redis, close_redis
from app.services import event_consumer, match_cache
from app.models.schemas import MatchRequest, MatchResult

pytestmark = pytest.mark.skipif(
    not os.getenv("REDIS_URL"), reason="Redis non disponible (test d'intégration)"
)

REQ = MatchRequest(skills=["DRONE"], location=(43.6, 1.44), radius_km=50.0)


@pytest.mark.asyncio
async def test_event_invalidates_cache_end_to_end():
    redis = get_redis()
    await redis.flushdb()

    # 1) on cache un résultat à la version courante
    results = [MatchResult(freelance_id="123e4567-e89b-12d3-a456-426614174000", score=0.9, distance_km=2.0)]
    await match_cache.set_cached(REQ, results)
    assert await match_cache.get_cached(REQ) is not None

    # 2) un événement gear.validated bump la version → l'ancien cache n'est plus servi
    await event_consumer.process_event({"type": "gear.validated", "gearId": "g1"})
    assert await match_cache.get_cached(REQ) is None

    await redis.flushdb()
    await close_redis()


@pytest.mark.asyncio
async def test_consumer_reads_published_event():
    redis = get_redis()
    await redis.flushdb()
    await event_consumer.ensure_group()

    await redis.xadd(event_consumer.STREAM_KEY, {"type": "gear.validated", "gearId": "g2"})
    response = await redis.xreadgroup(
        event_consumer.GROUP, "test-consumer", {event_consumer.STREAM_KEY: ">"}, count=1
    )
    assert response  # l'événement est lisible par le groupe

    await redis.flushdb()
    await close_redis()
```

- [ ] **Step 2: Lancer en local sans Redis (skip attendu)**

Run: `cd matching-service && pytest tests/test_redis_integration.py -v`
Expected: tests **skipped**.

- [ ] **Step 3: Ajouter le service Redis à python-ci.yml**

Dans `.github/workflows/python-ci.yml`, sous `services:` (à côté de `postgis`), ajouter :

```yaml
      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
```

Et au step pytest, compléter le bloc `env:` existant avec :

```yaml
          REDIS_URL: redis://localhost:6379
```

- [ ] **Step 4: Vérifier localement avec Redis docker (recommandé)**

Run:
```bash
docker run -d --rm -p 6379:6379 --name sh-redis-test redis:7-alpine
cd matching-service && REDIS_URL=redis://localhost:6379 pytest tests/test_redis_integration.py -v
docker stop sh-redis-test
```
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add matching-service/tests/test_redis_integration.py .github/workflows/python-ci.yml
git commit -m "test(SH-14/matching): intégration Redis réelle (bus + invalidation cache) + service CI (C2.2.2)"
```

---

### Task 12: Documentation — ticket SH-14 + backlog

**Files:**
- Create: `docs/tickets/SH-14-bus-evenements-redis.md`
- Modify: `docs/BACKLOG.md` (statut SH-14, estimation requalifiée, prochaines actions)
- Modify: `backend-core/CLAUDE.md` (retirer la dette TokenStore résolue) et racine `CLAUDE.md` §5 (ligne refresh store)

- [ ] **Step 1: Rédiger le ticket**

Créer `docs/tickets/SH-14-bus-evenements-redis.md` au format `docs/templates/TICKET_TEMPLATE.md`, en reprenant les critères Gherkin depuis le spec (`docs/superpowers/specs/2026-07-01-SH-14-bus-evenements-redis-design.md`) : périmètre A+B+C+D, décisions D1–D6, **estimation requalifiée (5 → ~8–13 SP)**, DoD (tous les tests verts, CI Redis, dégradation gracieuse, fail-safe auth, secrets en env), compétences **C2.2.2 / C2.2.3**.

- [ ] **Step 2: Mettre à jour le backlog**

Dans `docs/BACKLOG.md` : passer SH-14 en 🟢 (ou 🟠 selon avancement), noter la requalification d'estimation, et mettre à jour « Prochaines actions » (suivant : SH-34, puis EP04 média).

- [ ] **Step 3: Résorber la dette documentée**

- Racine `CLAUDE.md` §5 : la ligne « refresh store à migrer en Redis (SH-14) » → marquer ✅ fait (SH-14).
- `backend-core/CLAUDE.md` : retirer la puce « `token-store.service.ts` … → migrer vers Redis (SH-14) » de la section dette (résolue).

- [ ] **Step 4: Commit**

```bash
git add docs/tickets/SH-14-bus-evenements-redis.md docs/BACKLOG.md CLAUDE.md backend-core/CLAUDE.md
git commit -m "docs(SH-14): ticket + backlog + résorption dette TokenStore (C2.4.1)"
```

---

## Vérification finale (avant PR)

- [ ] `cd backend-core && npm run lint && npm run test && npm run build` — tout vert.
- [ ] `cd matching-service && flake8 . && bandit -r app && pytest --cov=. tests/` — tout vert, bandit 0 HIGH/MEDIUM.
- [ ] Tests d'intégration Redis exécutés au moins une fois avec un vrai Redis (local ou CI).
- [ ] Aucun secret en dur ; `REDIS_URL` uniquement via env.
- [ ] Ouvrir la PR **vers `develop`** (jamais `main`), corps décrivant A/B/C/D + décisions + compétences RNCP.

## Notes de séquencement

- **Phase A** (Tasks 1–2) est prérequise à toutes les autres.
- **Phase B** (Tasks 3–4) est indépendante de C/D — peut être livrée/mergée séparément si besoin.
- **Phase C** (Tasks 5–6) doit précéder la validation end-to-end de **Phase D** (le consumer a besoin d'un émetteur), mais D peut être développée en parallèle avec des événements simulés (`XADD` manuel dans les tests).
