# SH-15 — Scaffolding `media-service` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Créer le squelette du microservice média (Node 20 + TypeScript + FFmpeg) — conteneurisé, supervisé, testé, et consommant réellement la file BullMQ `media-transcode` sans encore transcoder.

**Architecture:** Worker pur, sans HTTP métier ni base de données (spec §4). Un serveur `node:http` minimal expose `/health` (sonde conteneur) et `/metrics` (Prometheus). Un `Worker` BullMQ consomme la file `media-transcode` et se contente de journaliser — SH-16 remplacera le no-op par le pipeline `ffprobe`/`ffmpeg`. Arrêt propre sur SIGTERM pour ne jamais tuer un transcodage en cours.

**Tech Stack:** Node 20, TypeScript 5, BullMQ 5, ioredis 5, prom-client 15, pino 10, Jest 30 + ts-jest, ESLint 9 (flat config), Docker `node:20-alpine` + ffmpeg.

**Spec de référence :** [`docs/superpowers/specs/2026-08-24-EP04-media-portfolio-design.md`](../specs/2026-08-24-EP04-media-portfolio-design.md) — §4 (frontières), §7 (contrat du worker), §11 (découpage).

## Global Constraints

- **Langue** : commentaires et messages **en français**, identifiants (variables, fonctions, classes) **en anglais** (CLAUDE.md §7).
- **Traçabilité RNCP** : référencer la compétence en commentaire quand un bloc l'illustre (ex. `// … (C2.1.2)`). SH-15 vise **C2.1.2** (structure, normes) et **C2.2.2** (harnais de tests).
- **Aucun secret en dur** : tout par variable d'environnement (CLAUDE.md §8.4).
- **Aucun port hôte publié** pour ce service (archi §2) : la collecte Prometheus se fait sur le réseau Docker privé.
- **Exécution non-root** dans l'image finale (CLAUDE.md §8).
- **Tests** : fichiers `*.spec.ts` **à côté du code**, `jest.config.js` avec `rootDir: 'src'` et `testRegex: '.*\\.spec\\.ts$'` — convention `backend-core`.
- **Versions alignées sur `backend-core`** (ne pas dériver) : `prom-client ^15.1.3`, `pino ^10.3.1`, `ioredis ^5.11.1`, `typescript ^5.0.0`, `jest ^30.4.2`, `ts-jest ^29.4.11`, `@types/jest ^30.0.0`, `@types/node ^20.0.0`, `ts-node-dev ^2.0.0`, `eslint ^9.39.4`, `@eslint/js ^9.39.4`, `typescript-eslint ^8.61.1`.
- **Port interne du service : `3002`** (backend-core 3001, matching-service 8000).
- **Redis en local : conteneur éphémère sur le port hôte `6381`**. Le 6379 est occupé par un Redis personnel hors projet, et le `6380` par le service `redis` du `docker-compose.yml` du projet (`${REDIS_PORT:-6380}:6379`), qui remonte tout seul au démarrage de Docker. **Ne jamais lancer de `FLUSHDB` sur un Redis non éphémère** : utiliser une file dédiée et `queue.obliterate({ force: true })`.
- **Branche** : `feature/SH-15-scaffolding-media` (déjà créée, porte le commit du spec).
- **Commits** : Conventional Commits, scope `(SH-15/media)`.
- **Hors périmètre SH-15**, ne pas anticiper : accès S3, variables `AWS_*`, installation de ffmpeg dans la CI, entité `user_media`, routes `api/v1/media`. Tout cela est SH-16/SH-17.

---

## File Structure

**Créés — `media-service/`**

| Fichier | Responsabilité |
|---|---|
| `package.json`, `tsconfig.json`, `eslint.config.js`, `jest.config.js`, `.dockerignore` | Outillage, calqué sur `backend-core` |
| `src/config.ts` | Lecture + validation des variables d'environnement. Échec explicite si mal configuré. |
| `src/logger.ts` | Logger pino JSON sur stdout (collecté par Alloy → Loki, SH-29) |
| `src/metrics.ts` | Registre prom-client dédié + compteur et histogramme de jobs |
| `src/http/server.ts` | Serveur `node:http` : `/health`, `/metrics`, 404, 405 |
| `src/queue/worker.ts` | Worker BullMQ + contrat de job typé (no-op en SH-15) |
| `src/main.ts` | `bootstrap()` / `shutdown()` + garde `require.main` |
| `src/*.spec.ts` | Un spec à côté de chaque module |
| `Dockerfile` | Multi-stage, ffmpeg dans l'étage d'exécution, non-root |
| `CLAUDE.md` | Conventions locales du service |

**Modifiés**

| Fichier | Modification |
|---|---|
| `.gitignore` | Ajout de `/media-service/dist/` |
| `docker-compose.yml` | Service `media-service` (profil `app`, sans port hôte, **sans `container_name`**) |
| `docker-compose.staging.yml` | Même service en image GHCR |
| `observability/prometheus/prometheus.yml` | Cible de scrape `media-service:3002` |
| `.github/workflows/docker-ci.yml` | 5ᵉ entrée de matrice + chemins déclencheurs |
| `.github/workflows/publish-staging.yml` | 5ᵉ entrée de matrice |
| `.github/workflows/media-ci.yml` | **Créé** — lint, audit, tests, build |
| `.github/dependabot.yml` | Entrée npm `/media-service` |
| `docs/tickets/SH-15-scaffolding-media.md` | **Créé** |
| `docs/BACKLOG.md` | SH-15 🔵 → 🟢 |

---

## Task 1 : Ticket, outillage et configuration

**Files:**
- Create: `docs/tickets/SH-15-scaffolding-media.md`
- Create: `media-service/package.json`, `media-service/tsconfig.json`, `media-service/eslint.config.js`, `media-service/jest.config.js`, `media-service/.dockerignore`
- Create: `media-service/src/config.ts`
- Test: `media-service/src/config.spec.ts`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: rien (première tâche).
- Produces: `loadConfig(env?: NodeJS.ProcessEnv): MediaServiceConfig` où
  `MediaServiceConfig = { port: number; redisUrl: string; queueName: string; concurrency: number; tmpDir: string }`.
  Toutes les tâches suivantes consomment ce type.

- [ ] **Step 1 : Écrire le ticket**

Créer `docs/tickets/SH-15-scaffolding-media.md` :

```markdown
**Titre du Ticket :** [SH-15] Scaffolding `media-service` (Node + FFmpeg)
**Type :** Feature
**Priorité :** High
**Estimation :** 3 Story Points
**Compétences RNCP visées :** C2.1.2 (structure, normes qualité, lint), C2.2.2 (harnais de tests, test de bootstrap)
**Lot :** Lot 1 (Web MVP)

### 0. Definition of Ready (DoR)
- [x] **Valeur Claire :** Story INVEST — aucune dépendance bloquante, débloque tout EP04.
- [x] **Specs Complètes :** design validé — `docs/superpowers/specs/2026-08-24-EP04-media-portfolio-design.md`.
- [x] **UX/UI Validé :** N/A (service interne, sans interface).
- [x] **Faisabilité Technique :** Node + FFmpeg arbitré au CLAUDE.md §3 ; BullMQ tranché en D6 du design.
- [x] **Estimé :** 3 SP.

### 1. User Story (Le Besoin)
**En tant que** développeur backend,
**Je veux** disposer d'un squelette `media-service` propre, conteneurisé, supervisé et testé,
**Afin de** pouvoir implémenter le pipeline de transcodage (SH-16) sans friction d'outillage.

### 2. Contexte & Valeur Business
* **Pourquoi maintenant ?** EP04 est le dernier Epic non entamé du Lot 1, et le seul chantier
  qui matérialise réellement le « traitement lourd isolé » justifiant l'architecture hybride
  (CLAUDE.md §2). Sans ce scaffolding, SH-16/17/18 ne peuvent pas démarrer.
* **KPI impacté :** vélocité — déblocage de 14 J/H d'EP04.

### 3. Critères d'Acceptation (Gherkin - BDD)

**Scénario 1 : Sonde de vivacité**
* **GIVEN** le service est lancé
* **WHEN** je requête `GET /health`
* **THEN** je reçois `200 OK` avec `{"status":"ok","service":"media-service","uptimeSeconds":<n>}`

**Scénario 2 : Métriques exposées**
* **GIVEN** le service est lancé
* **WHEN** je requête `GET /metrics`
* **THEN** je reçois `200 OK` au format texte Prometheus, incluant `media_jobs_total`

**Scénario 3 : La file est réellement consommée**
* **GIVEN** un Redis joignable et le worker démarré
* **WHEN** un job est déposé sur la file `media-transcode`
* **THEN** le worker le traite et le job termine en `completed`

**Scénario 4 : Refus de démarrer mal configuré**
* **GIVEN** la variable `REDIS_URL` absente
* **WHEN** le service démarre
* **THEN** il échoue immédiatement avec un message explicite, sans valeur devinée

**Scénario 5 : Arrêt propre**
* **GIVEN** le service est lancé
* **WHEN** il reçoit `SIGTERM`
* **THEN** le worker puis le serveur HTTP se ferment avant la sortie du processus

**Scénario 6 : Image conteneur saine**
* **GIVEN** l'image construite depuis `media-service/Dockerfile`
* **WHEN** le conteneur démarre dans le profil `app`
* **THEN** son HEALTHCHECK passe à `healthy` et Prometheus scrape sa cible

### 4. Spécifications Techniques

Voir le design EP04 §4 (frontières de service), §7 (contrat du worker) et §11 (découpage).

Structure cible :

    media-service/
    ├── src/
    │   ├── config.ts        # lecture + validation de l'environnement
    │   ├── logger.ts        # pino JSON → stdout
    │   ├── metrics.ts       # registre prom-client dédié
    │   ├── http/server.ts   # /health + /metrics (node:http, sans framework)
    │   ├── queue/worker.ts  # Worker BullMQ (no-op en SH-15)
    │   └── main.ts          # bootstrap + arrêt propre
    ├── Dockerfile
    └── CLAUDE.md

Décisions structurantes reprises du design :
* **Worker pur** : ni route métier, ni PostgreSQL, ni JWT. Identité et vérité métier restent au monolithe (D7).
* **Sans framework HTTP** : deux routes techniques ne justifient pas Express.
* **Port 3002, aucun port hôte** : collecte Prometheus sur le réseau Docker privé (archi §2).
* **Pas de `container_name`** : SH-16 doit pouvoir faire `--scale media-service=2`.

### 5. Definition of Done (DoD)
- [ ] Les 6 scénarios Gherkin sont vérifiés.
- [ ] `npm run lint`, `npm run test`, `npm run build` passent dans `media-service/`.
- [ ] L'image se construit et le conteneur devient `healthy` dans le profil `app`.
- [ ] La cible `media-service` apparaît `up` dans Prometheus.
- [ ] `media-ci.yml` est vert sur la PR ; l'image est ajoutée à `docker-ci.yml` et `publish-staging.yml`.
- [ ] Dependabot surveille `/media-service`.
- [ ] `docs/BACKLOG.md` passe SH-15 en 🟢.
```

- [ ] **Step 2 : Créer `media-service/package.json`**

```json
{
  "name": "skillhunt-media-service",
  "version": "1.0.0",
  "description": "SkillHunt Media Service - worker de transcodage video (Node + FFmpeg)",
  "main": "dist/main.js",
  "private": true,
  "scripts": {
    "build": "tsc",
    "start": "node dist/main.js",
    "start:dev": "ts-node-dev --respawn --transpile-only src/main.ts",
    "lint": "eslint src/**/*.ts",
    "test": "jest"
  },
  "dependencies": {
    "ioredis": "^5.11.1",
    "pino": "^10.3.1",
    "prom-client": "^15.1.3"
  },
  "devDependencies": {
    "@eslint/js": "^9.39.4",
    "@types/jest": "^30.0.0",
    "@types/node": "^20.0.0",
    "eslint": "^9.39.4",
    "jest": "^30.4.2",
    "ts-jest": "^29.4.11",
    "ts-node-dev": "^2.0.0",
    "typescript": "^5.0.0",
    "typescript-eslint": "^8.61.1"
  }
}
```

- [ ] **Step 3 : Créer `media-service/tsconfig.json`**

Calqué sur `backend-core/tsconfig.json`, **sans** les options propres aux décorateurs NestJS (ce service n'en utilise aucun) et **sans** le type `multer`.

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "declaration": true,
    "removeComments": true,
    "allowSyntheticDefaultImports": true,
    "target": "es2021",
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "incremental": true,
    "skipLibCheck": true,
    "strict": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "noImplicitThis": true,
    "alwaysStrict": true,
    "types": ["node", "jest"]
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

> Note 1 : `noImplicitAny` n'est **pas** désactivé ici, contrairement à `backend-core` qui doit tolérer les types injectés par NestJS. Ce service n'a pas d'injection de dépendances : on reste strict.
>
> Note 2 : `allowSyntheticDefaultImports` est **obligatoire** — sans lui, `import pino from 'pino'` et `import IORedis from 'ioredis'` échouent à la compilation (TS1259), ces paquets étant CommonJS. C'est la même raison qui l'impose dans `backend-core`.

- [ ] **Step 4 : Créer `media-service/eslint.config.js`**

```js
// Configuration plate ESLint 9 pour le media-service (C2.1.2 - qualité de code)
const js = require('@eslint/js');
const tseslint = require('typescript-eslint');

module.exports = tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
      },
    },
    rules: {
      // Contrairement à backend-core, `no-explicit-any` reste ACTIF : sans injection de
      // dépendances NestJS, aucun `any` n'est ici structurellement nécessaire.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    // Les specs Jest utilisent des globals de test
    files: ['**/*.spec.ts'],
    languageOptions: {
      globals: {
        describe: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        jest: 'readonly',
      },
    },
  },
);
```

- [ ] **Step 5 : Créer `media-service/jest.config.js`**

Identique à `backend-core/jest.config.js` (même convention de specs à côté du code).

```js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage',
};
```

- [ ] **Step 6 : Créer `media-service/.dockerignore`**

```
node_modules
dist
.env
*.log
coverage
```

- [ ] **Step 7 : Ajouter `/media-service/dist/` au `.gitignore` racine**

Dans la section `# --- Node.js & NestJS (backend-core/) ---`, après la ligne `/backend-core/build/`, ajouter :

```
/media-service/dist/
/media-service/build/
```

- [ ] **Step 8 : Installer les dépendances**

```bash
cd media-service && npm install
```

- [ ] **Step 9 : Ajouter BullMQ**

BullMQ n'est pas figé dans le `package.json` du Step 2 : on laisse npm résoudre la dernière 5.x et écrire la plage exacte.

```bash
cd media-service && npm install bullmq@^5
```

Reporter la version résolue (`npm ls bullmq`) dans le ticket §4.

- [ ] **Step 10 : Écrire le test qui échoue — `media-service/src/config.spec.ts`**

```ts
import { loadConfig } from './config';

// C2.2.2 — La configuration est la première chose qui casse en production : elle se teste.
describe('loadConfig', () => {
  it('échoue explicitement si REDIS_URL est absent', () => {
    expect(() => loadConfig({})).toThrow(/REDIS_URL/);
  });

  it('applique les valeurs par défaut documentées', () => {
    const config = loadConfig({ REDIS_URL: 'redis://localhost:6380' });

    expect(config).toEqual({
      port: 3002,
      redisUrl: 'redis://localhost:6380',
      queueName: 'media-transcode',
      concurrency: 1,
      tmpDir: '/tmp/media',
    });
  });

  it('lit les surcharges depuis l\'environnement', () => {
    const config = loadConfig({
      REDIS_URL: 'redis://redis:6379',
      PORT: '4002',
      MEDIA_QUEUE_NAME: 'autre-file',
      MEDIA_WORKER_CONCURRENCY: '4',
      MEDIA_TMP_DIR: '/data/tmp',
    });

    expect(config.port).toBe(4002);
    expect(config.queueName).toBe('autre-file');
    expect(config.concurrency).toBe(4);
    expect(config.tmpDir).toBe('/data/tmp');
  });

  it('refuse une concurrence non entière ou nulle plutôt que de la deviner', () => {
    const base = { REDIS_URL: 'redis://localhost:6380' };

    expect(() => loadConfig({ ...base, MEDIA_WORKER_CONCURRENCY: '0' })).toThrow(/entière positive/);
    expect(() => loadConfig({ ...base, MEDIA_WORKER_CONCURRENCY: 'deux' })).toThrow(/entière positive/);
  });
});
```

- [ ] **Step 11 : Lancer le test pour vérifier qu'il échoue**

```bash
cd media-service && npm test
```

Attendu : ÉCHEC — `Cannot find module './config'`.

- [ ] **Step 12 : Écrire `media-service/src/config.ts`**

```ts
/**
 * Configuration du media-service (SH-15).
 *
 * Aucun secret ni valeur devinée : tout vient de l'environnement, et une variable
 * obligatoire manquante fait échouer le démarrage plutôt que de laisser le service
 * tourner à moitié (même parti pris que `storage.module.ts` côté backend-core). C2.2.3.
 */
export interface MediaServiceConfig {
  /** Port d'écoute du serveur technique (/health, /metrics). Aucun port hôte n'est publié. */
  port: number;
  /** URL du Redis portant la file BullMQ. */
  redisUrl: string;
  /** Nom de la file de jobs, partagé avec le producteur backend-core (SH-16). */
  queueName: string;
  /** Jobs traités simultanément. Défaut 1 : le transcodage est CPU-bound. */
  concurrency: number;
  /** Répertoire de travail du transcodage (SH-16). */
  tmpDir: string;
}

const DEFAULT_PORT = 3002;
const DEFAULT_QUEUE_NAME = 'media-transcode';
const DEFAULT_CONCURRENCY = 1;
const DEFAULT_TMP_DIR = '/tmp/media';

export function loadConfig(env: NodeJS.ProcessEnv = process.env): MediaServiceConfig {
  const redisUrl = env.REDIS_URL;
  if (!redisUrl) {
    throw new Error('REDIS_URL manquant : le worker ne peut pas joindre la file de jobs.');
  }

  return {
    port: toPort(env.PORT, DEFAULT_PORT),
    redisUrl,
    queueName: env.MEDIA_QUEUE_NAME ?? DEFAULT_QUEUE_NAME,
    concurrency: toPositiveInt(env.MEDIA_WORKER_CONCURRENCY, DEFAULT_CONCURRENCY, 'MEDIA_WORKER_CONCURRENCY'),
    tmpDir: env.MEDIA_TMP_DIR ?? DEFAULT_TMP_DIR,
  };
}

/**
 * Port d'écoute. `0` est une valeur LÉGITIME : elle demande au système d'attribuer un
 * port libre — c'est ainsi que les tests démarrent le service sans risquer un conflit
 * avec l'instance conteneurisée. La borne haute évite qu'une coquille (`PORT=999999`)
 * ne se manifeste qu'au `listen`, bien après le démarrage.
 */
function toPort(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === '') {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0 || value > 65535) {
    throw new Error(`PORT : entier attendu entre 0 et 65535, reçu « ${raw} »`);
  }
  return value;
}

function toPositiveInt(raw: string | undefined, fallback: number, name: string): number {
  if (raw === undefined || raw === '') {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} : valeur entière positive attendue, reçu « ${raw} »`);
  }
  return value;
}
```

> **Amendement en cours d'exécution (Task 5).** `PORT` a son propre validateur `toPort` :
> `toPositiveInt` rejetait `0`, ce qui rendait impossible le démarrage sur port éphémère
> exigé par le test de bootstrap de la Task 5. Le correctif borne aussi la plage TCP haute
> et ajoute deux tests à `config.spec.ts` (`PORT=0` accepté, hors plage refusé).

- [ ] **Step 13 : Lancer le test pour vérifier qu'il passe**

```bash
cd media-service && npm test
```

Attendu : PASS — 4 tests.

- [ ] **Step 14 : Vérifier lint et compilation**

```bash
cd media-service && npm run lint && npm run build
```

Attendu : aucune sortie d'erreur, `dist/config.js` généré.

- [ ] **Step 15 : Commit**

```bash
git add docs/tickets/SH-15-scaffolding-media.md .gitignore media-service/
git commit -m "feat(SH-15/media): scaffolding du service et configuration validee"
```

---

## Task 2 : Journalisation et métriques

**Files:**
- Create: `media-service/src/logger.ts`, `media-service/src/metrics.ts`
- Test: `media-service/src/metrics.spec.ts`

**Interfaces:**
- Consumes: rien de Task 1 (modules indépendants).
- Produces:
  - `logger` — instance pino exportée, utilisée par `queue/worker.ts` et `main.ts`.
  - `class MediaMetrics` avec `readonly registry: Registry`, `readonly jobsTotal: Counter<'result'>`, `readonly jobDuration: Histogram` (sans label), et `render(): Promise<string>`. Consommée par `http/server.ts` et `queue/worker.ts`.

- [ ] **Step 1 : Écrire `media-service/src/logger.ts`**

Pas de test dédié : ce module n'est qu'une configuration de bibliothèque, il sera exercé indirectement par les specs du worker.

```ts
import pino from 'pino';

/**
 * Journalisation applicative du media-service (SH-15, C4.1.2).
 *
 * Logs JSON sur stdout, jamais dans un fichier : c'est le pilote `json-file` de Docker
 * qui les collecte, puis Alloy les pousse vers Loki (stack de supervision SH-29). Une
 * rotation applicative ferait doublon avec celle déjà configurée dans les fichiers compose.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  base: { service: 'media-service' },
});
```

- [ ] **Step 2 : Écrire le test qui échoue — `media-service/src/metrics.spec.ts`**

```ts
import { MediaMetrics } from './metrics';

// C2.2.2 — Une métrique jamais vérifiée est une métrique qui ment le jour de l'incident.
describe('MediaMetrics', () => {
  it('expose les compteurs de jobs au format Prometheus', async () => {
    const metrics = new MediaMetrics();

    metrics.jobsTotal.inc({ result: 'completed' });
    const body = await metrics.render();

    expect(body).toContain('media_jobs_total');
    expect(body).toContain('media_jobs_total{result="completed"} 1');
  });

  it('expose un histogramme de durée de job', async () => {
    const metrics = new MediaMetrics();

    const stop = metrics.jobDuration.startTimer();
    stop();
    const body = await metrics.render();

    expect(body).toContain('media_job_duration_seconds');
  });

  it('utilise un registre DÉDIÉ : deux instances coexistent sans conflit', () => {
    // Le registre global de prom-client est un singleton de module : deux instances
    // déclencheraient « métrique déjà enregistrée » et casseraient le harnais de tests.
    expect(() => {
      new MediaMetrics();
      new MediaMetrics();
    }).not.toThrow();
  });

  it('embarque les métriques par défaut du process (saturation)', async () => {
    const metrics = new MediaMetrics();

    const body = await metrics.render();

    expect(body).toContain('process_cpu_user_seconds_total');
  });
});
```

- [ ] **Step 3 : Lancer le test pour vérifier qu'il échoue**

```bash
cd media-service && npm test -- metrics
```

Attendu : ÉCHEC — `Cannot find module './metrics'`.

- [ ] **Step 4 : Écrire `media-service/src/metrics.ts`**

```ts
import { Counter, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

/**
 * Registre des métriques du worker média (SH-15, C4.1.2).
 *
 * Registre DÉDIÉ plutôt que le registre global de prom-client : le global est un
 * singleton de module, ce qui fait échouer les tests dès qu'une seconde instance est
 * créée (« métrique déjà enregistrée »). Même parti pris qu'en backend-core, cf.
 * `observability/metrics.service.ts`.
 */
export class MediaMetrics {
  readonly registry = new Registry();

  /** Jobs terminés, ventilés par issue — alimente le taux d'échec du pipeline. */
  readonly jobsTotal = new Counter({
    name: 'media_jobs_total',
    help: 'Nombre de jobs de transcodage terminés, par issue',
    labelNames: ['result'] as const,
    registers: [this.registry],
  });

  /**
   * Durée de traitement d'un job. Bornes en SECONDES et volontairement larges : un
   * transcodage 4K se compte en minutes, pas en millisecondes. Les bornes de
   * `http_request_duration_seconds` (backend-core) seraient toutes saturées ici.
   */
  readonly jobDuration = new Histogram({
    name: 'media_job_duration_seconds',
    help: 'Durée de traitement d\'un job de transcodage, en secondes',
    buckets: [1, 5, 15, 30, 60, 120, 300, 600, 1800],
    registers: [this.registry],
  });

  constructor() {
    // Saturation du process : tas, event loop lag, descripteurs de fichiers.
    collectDefaultMetrics({ register: this.registry });
  }

  /** Rendu texte au format d'exposition Prometheus. */
  render(): Promise<string> {
    return this.registry.metrics();
  }
}
```

- [ ] **Step 5 : Lancer le test pour vérifier qu'il passe**

```bash
cd media-service && npm test -- metrics
```

Attendu : PASS — 4 tests.

- [ ] **Step 6 : Commit**

```bash
git add media-service/src/logger.ts media-service/src/metrics.ts media-service/src/metrics.spec.ts
git commit -m "feat(SH-15/media): journalisation pino et registre de metriques dedie"
```

---

## Task 3 : Serveur technique `/health` et `/metrics`

**Files:**
- Create: `media-service/src/http/server.ts`
- Test: `media-service/src/http/server.spec.ts`

**Interfaces:**
- Consumes: `MediaMetrics` (Task 2) — appelle `metrics.render()`.
- Produces: `createHttpServer(metrics: MediaMetrics): Server` (type `Server` de `node:http`). Le serveur est retourné **non démarré** : c'est l'appelant qui fait `listen`. Consommé par `main.ts` (Task 5).

- [ ] **Step 1 : Écrire le test qui échoue — `media-service/src/http/server.spec.ts`**

```ts
import { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createHttpServer } from './server';
import { MediaMetrics } from '../metrics';

// C2.2.2 — Le serveur est démarré POUR DE VRAI puis interrogé : c'est exactement le
// type de bug (« le serveur ne démarrait pas ») qui avait échappé aux tests en SH-41.
describe('serveur technique du media-service', () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    server = createHttpServer(new MediaMetrics());
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('GET /health répond 200 avec le nom du service et son uptime', async () => {
    const response = await fetch(`${baseUrl}/health`);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe('ok');
    expect(body.service).toBe('media-service');
    expect(typeof body.uptimeSeconds).toBe('number');
  });

  it('GET /metrics répond 200 au format texte Prometheus', async () => {
    const response = await fetch(`${baseUrl}/metrics`);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/plain');
    expect(await response.text()).toContain('media_jobs_total');
  });

  it('répond 404 sur une route inconnue', async () => {
    const response = await fetch(`${baseUrl}/inconnu`);

    expect(response.status).toBe(404);
  });

  it('répond 405 sur un verbe autre que GET', async () => {
    const response = await fetch(`${baseUrl}/health`, { method: 'POST' });

    expect(response.status).toBe(405);
  });
});
```

- [ ] **Step 2 : Lancer le test pour vérifier qu'il échoue**

```bash
cd media-service && npm test -- server
```

Attendu : ÉCHEC — `Cannot find module './server'`.

- [ ] **Step 3 : Écrire `media-service/src/http/server.ts`**

```ts
import { createServer, type Server } from 'node:http';
import type { MediaMetrics } from '../metrics';

/**
 * Serveur HTTP technique du media-service (SH-15).
 *
 * Volontairement SANS framework : ce service n'expose aucune route métier — le travail
 * arrive par la file BullMQ, pas par HTTP (design EP04 §4). Deux routes seulement :
 *   - `/health`  : vivacité, interrogée par le HEALTHCHECK du conteneur (sonde S1, SH-29)
 *   - `/metrics` : exposition Prometheus (C4.1.2)
 *
 * Aucun port hôte n'est publié : la collecte se fait sur le réseau Docker privé (archi §2).
 */
export function createHttpServer(metrics: MediaMetrics): Server {
  return createServer((req, res) => {
    if (req.method !== 'GET') {
      res.writeHead(405).end();
      return;
    }

    if (req.url === '/health') {
      // Sonde TRIVIALE, qui n'interroge AUCUNE dépendance. Y brancher Redis ferait
      // redémarrer en boucle un worker pourtant sain lors d'un incident Redis —
      // transformant une panne partielle en panne totale (cf. health.controller.ts).
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'ok',
          service: 'media-service',
          uptimeSeconds: Math.round(process.uptime()),
        }),
      );
      return;
    }

    if (req.url === '/metrics') {
      metrics.render().then(
        (body) => {
          res.writeHead(200, { 'content-type': 'text/plain; version=0.0.4' });
          res.end(body);
        },
        () => {
          res.writeHead(500).end();
        },
      );
      return;
    }

    res.writeHead(404).end();
  });
}
```

- [ ] **Step 4 : Lancer le test pour vérifier qu'il passe**

```bash
cd media-service && npm test -- server
```

Attendu : PASS — 4 tests.

- [ ] **Step 5 : Commit**

```bash
git add media-service/src/http/
git commit -m "feat(SH-15/media): serveur technique /health et /metrics sans framework"
```

---

## Task 4 : Worker BullMQ branché sur la file

**Files:**
- Create: `media-service/src/queue/worker.ts`
- Test: `media-service/src/queue/worker.spec.ts` (unitaire), `media-service/src/queue/worker.integration.spec.ts` (Redis réel)

**Interfaces:**
- Consumes: `MediaServiceConfig` (Task 1), `MediaMetrics` (Task 2), `logger` (Task 2).
- Produces:
  - `interface TranscodeJobData { mediaId: string; sourceKey: string; outputPrefix: string; posterKey: string }`
  - `interface TranscodeJobResult { renditions: unknown[] }`
  - `processTranscodeJob(job: Job<TranscodeJobData>): Promise<TranscodeJobResult>` — **c'est cette fonction que SH-16 remplacera**.
  - `createTranscodeWorker(config: MediaServiceConfig, metrics: MediaMetrics): Worker<TranscodeJobData, TranscodeJobResult>`
  - Consommés par `main.ts` (Task 5).

- [ ] **Step 1 : Écrire le test unitaire qui échoue — `media-service/src/queue/worker.spec.ts`**

```ts
import type { Job } from 'bullmq';
import { processTranscodeJob, type TranscodeJobData } from './worker';

// C2.2.2 — Le traitement est une fonction pure testable SANS Redis ni ffmpeg.
// C'est ce découpage qui permettra à SH-16 de tester le vrai transcodage isolément.
describe('processTranscodeJob (SH-15 : no-op)', () => {
  const job = {
    id: '42',
    data: {
      mediaId: '11111111-1111-1111-1111-111111111111',
      sourceKey: 'private/media/f1/m1/master.mp4',
      outputPrefix: 'private/media/f1/m1/hls/',
      posterKey: 'private/media/f1/m1/poster.jpg',
    } satisfies TranscodeJobData,
  } as Job<TranscodeJobData>;

  it('rend une enveloppe de résultat vide, que SH-16 remplira', async () => {
    const result = await processTranscodeJob(job);

    expect(result).toEqual({ renditions: [] });
  });
});
```

- [ ] **Step 2 : Écrire le test d'intégration qui échoue — `media-service/src/queue/worker.integration.spec.ts`**

Même garde que `backend-core/src/auth/token-store.integration.spec.ts` : le test se **saute** si `REDIS_URL` est absent, il ne casse donc jamais un `npm test` local sans Redis.

```ts
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { createTranscodeWorker, type TranscodeJobData } from './worker';
import { MediaMetrics } from '../metrics';
import type { MediaServiceConfig } from '../config';

// C2.2.2 — Intégration Redis réelle : un job déposé sur la file est RÉELLEMENT consommé.
// Sans ce test, « le worker démarre » ne prouve pas « le worker travaille ».
const url = process.env.REDIS_URL;
const describeIf = url ? describe : describe.skip;

// File dédiée au test : on ne touche jamais à la file de production, et surtout
// AUCUN flushdb (le Redis de dev peut être partagé avec d'autres stacks).
const QUEUE_NAME = 'media-transcode-test';

describeIf('worker de transcodage (intégration Redis)', () => {
  const config: MediaServiceConfig = {
    port: 0,
    redisUrl: url as string,
    queueName: QUEUE_NAME,
    concurrency: 1,
    tmpDir: '/tmp/media-test',
  };

  let queue: Queue<TranscodeJobData>;
  let connection: IORedis;
  let worker: ReturnType<typeof createTranscodeWorker>;

  beforeAll(() => {
    connection = new IORedis(url as string, { maxRetriesPerRequest: null });
    queue = new Queue<TranscodeJobData>(QUEUE_NAME, { connection });
    worker = createTranscodeWorker(config, new MediaMetrics());
  });

  afterAll(async () => {
    await worker.close();
    await queue.obliterate({ force: true });
    await queue.close();
    await connection.quit();
  });

  it('consomme un job déposé sur la file et le termine en completed', async () => {
    // L'écouteur est posé AVANT `queue.add` : le worker consomme déjà, et un job
    // traité plus vite que l'attachement de l'écouteur rendrait le test intermittent.
    const completed = new Promise<{ id?: string; result: unknown }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Aucun job terminé en 10 s')), 10_000);
      worker.on('completed', (finished, result) => {
        clearTimeout(timer);
        resolve({ id: finished.id, result });
      });
    });

    const job = await queue.add('transcode', {
      mediaId: '11111111-1111-1111-1111-111111111111',
      sourceKey: 'private/media/f1/m1/master.mp4',
      outputPrefix: 'private/media/f1/m1/hls/',
      posterKey: 'private/media/f1/m1/poster.jpg',
    });

    const observed = await completed;

    expect(observed.id).toBe(job.id);
    expect(observed.result).toEqual({ renditions: [] });
  }, 15_000);
});
```

- [ ] **Step 3 : Lancer les tests pour vérifier qu'ils échouent**

```bash
cd media-service && npm test -- worker
```

Attendu : ÉCHEC — `Cannot find module './worker'`. Le test d'intégration est marqué `skipped` si `REDIS_URL` est absent.

- [ ] **Step 4 : Écrire `media-service/src/queue/worker.ts`**

```ts
import { Worker, type Job } from 'bullmq';
import IORedis from 'ioredis';
import type { MediaServiceConfig } from '../config';
import type { MediaMetrics } from '../metrics';
import { logger } from '../logger';

/**
 * Charge utile d'un job de transcodage (design EP04 §7).
 * Contrat FIGÉ dès SH-15 : le producteur backend-core de SH-16 s'y conformera.
 */
export interface TranscodeJobData {
  mediaId: string;
  sourceKey: string;
  outputPrefix: string;
  posterKey: string;
}

/** Résultat rendu à BullMQ. SH-15 rend une enveloppe vide ; SH-16 la remplira. */
export interface TranscodeJobResult {
  renditions: unknown[];
}

/**
 * Traitement d'un job — **NO-OP volontaire en SH-15** (C2.1.2).
 *
 * Le pipeline `ffprobe`/`ffmpeg` arrive en SH-16. Ici, on prouve seulement que la file
 * est consommée de bout en bout : c'est ce qui rend ce scaffolding vérifiable, au lieu
 * d'un dossier vide qui « compilerait » sans rien démontrer.
 */
export async function processTranscodeJob(job: Job<TranscodeJobData>): Promise<TranscodeJobResult> {
  logger.info(
    { jobId: job.id, mediaId: job.data.mediaId },
    'Job de transcodage reçu (traitement effectif livré en SH-16)',
  );
  return { renditions: [] };
}

/**
 * Construit le worker BullMQ et l'instrumente.
 * Le worker démarre sa consommation dès sa construction (comportement de BullMQ).
 */
export function createTranscodeWorker(
  config: MediaServiceConfig,
  metrics: MediaMetrics,
): Worker<TranscodeJobData, TranscodeJobResult> {
  // `maxRetriesPerRequest: null` est EXIGÉ par BullMQ sur la connexion d'un Worker :
  // avec la valeur par défaut d'ioredis, les commandes bloquantes finissent par être
  // abandonnées et le worker cesse silencieusement de consommer.
  const connection = new IORedis(config.redisUrl, { maxRetriesPerRequest: null });

  const worker = new Worker<TranscodeJobData, TranscodeJobResult>(
    config.queueName,
    async (job) => {
      const stopTimer = metrics.jobDuration.startTimer();
      try {
        const result = await processTranscodeJob(job);
        metrics.jobsTotal.inc({ result: 'completed' });
        return result;
      } catch (err) {
        metrics.jobsTotal.inc({ result: 'failed' });
        throw err;
      } finally {
        stopTimer();
      }
    },
    { connection, concurrency: config.concurrency },
  );

  // Un échec silencieux de job est invisible en supervision : on le journalise
  // explicitement, sans jamais recracher la pile côté logs applicatifs.
  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, raison: err.message }, 'Job de transcodage en échec');
  });

  return worker;
}
```

- [ ] **Step 5 : Lancer le test unitaire pour vérifier qu'il passe**

```bash
cd media-service && npm test -- worker.spec
```

Attendu : PASS — 1 test.

- [ ] **Step 6 : Démarrer un Redis éphémère et lancer le test d'intégration**

Le 6379 est pris par un Redis personnel hors projet et le 6380 par le service `redis` du compose du projet : on utilise **6381**, et on ne fait **aucun `flushdb`**.

```bash
docker run -d --rm -p 6381:6379 --name sh-redis-verif redis:7-alpine
```

```bash
cd media-service && REDIS_URL=redis://127.0.0.1:6381 npm test -- worker
```

Attendu : PASS — 2 tests (unitaire + intégration), aucun `skipped`.

- [ ] **Step 7 : Arrêter le Redis éphémère**

```bash
docker stop sh-redis-verif
```

- [ ] **Step 8 : Vérifier lint et compilation**

```bash
cd media-service && npm run lint && npm run build
```

Attendu : aucune erreur.

- [ ] **Step 9 : Commit**

```bash
git add media-service/src/queue/
git commit -m "feat(SH-15/media): worker BullMQ branche sur la file media-transcode"
```

---

## Task 5 : Bootstrap et arrêt propre

**Files:**
- Create: `media-service/src/main.ts`, `media-service/CLAUDE.md`
- Test: `media-service/src/main.integration.spec.ts`

**Interfaces:**
- Consumes: `loadConfig` (Task 1), `MediaMetrics` (Task 2), `createHttpServer` (Task 3), `createTranscodeWorker` (Task 4).
- Produces:
  - `interface RunningService { server: Server; worker: Worker<TranscodeJobData, TranscodeJobResult>; config: MediaServiceConfig }`
  - `bootstrap(env?: NodeJS.ProcessEnv): Promise<RunningService>`
  - `shutdown(running: RunningService): Promise<void>`
  - Rien ne les consomme en aval : c'est le point d'entrée.

- [ ] **Step 1 : Écrire le test qui échoue — `media-service/src/main.integration.spec.ts`**

C'est **le test de bootstrap** exigé par la leçon de SH-41 : 103 tests verts n'avaient pas empêché un serveur de ne pas démarrer.

```ts
import { AddressInfo } from 'node:net';
import { bootstrap, shutdown, type RunningService } from './main';

// C2.2.2 — Test de bootstrap (leçon SH-41) : on démarre le service COMPLET — worker
// compris — et on vérifie qu'il sert réellement du trafic, puis qu'il s'arrête proprement.
const url = process.env.REDIS_URL;
const describeIf = url ? describe : describe.skip;

describeIf('bootstrap du media-service', () => {
  let running: RunningService;

  afterAll(async () => {
    // Filet de sécurité si le test échoue avant son propre `shutdown` : sans lui, le
    // worker resterait connecté et Jest ne rendrait jamais la main. Tolérant au double
    // appel, `shutdown` étant idempotent.
    if (running) {
      await shutdown(running).catch(() => undefined);
    }
  });

  it('démarre, sert /health, puis s\'arrête proprement', async () => {
    running = await bootstrap({
      REDIS_URL: url as string,
      PORT: '0', // port éphémère : aucun conflit si le service tourne déjà en conteneur
      MEDIA_QUEUE_NAME: 'media-transcode-bootstrap-test',
    });

    const { port } = running.server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${port}/health`);

    expect(response.status).toBe(200);
    expect((await response.json()).service).toBe('media-service');

    await shutdown(running);

    // Après l'arrêt, plus rien n'écoute : la connexion doit être refusée.
    await expect(fetch(`http://127.0.0.1:${port}/health`)).rejects.toThrow();
  }, 20_000);
});
```

- [ ] **Step 2 : Lancer le test pour vérifier qu'il échoue**

```bash
cd media-service && npm test -- main
```

Attendu : ÉCHEC — `Cannot find module './main'`.

- [ ] **Step 3 : Écrire `media-service/src/main.ts`**

```ts
import type { Server } from 'node:http';
import type { Worker } from 'bullmq';
import { loadConfig, type MediaServiceConfig } from './config';
import { MediaMetrics } from './metrics';
import { createHttpServer } from './http/server';
import {
  createTranscodeWorker,
  type TranscodeJobData,
  type TranscodeJobResult,
} from './queue/worker';
import { logger } from './logger';

/** Poignées du service démarré, pour pouvoir l'arrêter (et le tester). */
export interface RunningService {
  server: Server;
  worker: Worker<TranscodeJobData, TranscodeJobResult>;
  config: MediaServiceConfig;
}

/**
 * Démarre le media-service : worker BullMQ + serveur technique (SH-15).
 *
 * Exporté (plutôt qu'exécuté à l'import) pour être testable : c'est ce qui permet au
 * test de bootstrap de démarrer le service pour de vrai, leçon directe de SH-41.
 */
export async function bootstrap(env: NodeJS.ProcessEnv = process.env): Promise<RunningService> {
  const config = loadConfig(env);
  const metrics = new MediaMetrics();
  const worker = createTranscodeWorker(config, metrics);
  const server = createHttpServer(metrics);

  await new Promise<void>((resolve) => server.listen(config.port, resolve));

  logger.info(
    { port: config.port, file: config.queueName, concurrence: config.concurrency },
    'media-service démarré',
  );

  return { server, worker, config };
}

/**
 * Arrêt propre : le worker d'abord, le serveur ensuite.
 *
 * `worker.close()` attend la fin du job en cours. Sans cela, un `docker compose down`
 * tuerait un transcodage en plein milieu (SH-16) et laisserait le job « bloqué » côté
 * BullMQ jusqu'à expiration de son verrou.
 */
export async function shutdown(running: RunningService): Promise<void> {
  await running.worker.close();
  await new Promise<void>((resolve) => running.server.close(() => resolve()));
}

// Exécution réelle uniquement quand le module est le point d'entrée : à l'import
// (donc en test), rien ne démarre tout seul.
if (require.main === module) {
  bootstrap()
    .then((running) => {
      for (const signal of ['SIGTERM', 'SIGINT'] as const) {
        process.on(signal, () => {
          logger.info({ signal }, 'Arrêt demandé : fermeture du worker puis du serveur');
          void shutdown(running).then(() => process.exit(0));
        });
      }
    })
    .catch((err: Error) => {
      logger.error({ raison: err.message }, 'Échec du démarrage du media-service');
      process.exit(1);
    });
}
```

- [ ] **Step 4 : Lancer le test avec Redis pour vérifier qu'il passe**

```bash
docker run -d --rm -p 6381:6379 --name sh-redis-verif redis:7-alpine
```

```bash
cd media-service && REDIS_URL=redis://127.0.0.1:6381 npm test
```

Attendu : PASS — l'intégralité de la suite (config, metrics, server, worker × 2, bootstrap), aucun `skipped`.

- [ ] **Step 5 : Arrêter le Redis éphémère**

```bash
docker stop sh-redis-verif
```

- [ ] **Step 6 : Écrire `media-service/CLAUDE.md`**

```markdown
# CLAUDE.md — media-service

> Conventions **locales** du microservice média. Le contexte projet fait foi : voir le
> `CLAUDE.md` racine. Ne rien y dupliquer.

## Rôle

**Worker pur** de transcodage vidéo (SH-15 → SH-17). Il ne possède **ni base de données,
ni route métier, ni JWT** : le travail arrive par la file BullMQ `media-transcode`, et la
vérité métier reste dans `backend-core` (design EP04, décision D7).

## Structure

    src/
    ├── config.ts        # lecture + validation de l'environnement (échec explicite)
    ├── logger.ts        # pino JSON → stdout (collecté par Alloy → Loki, SH-29)
    ├── metrics.ts       # registre prom-client DÉDIÉ (jamais le registre global)
    ├── http/server.ts   # /health + /metrics, sans framework
    ├── queue/worker.ts  # Worker BullMQ + contrat de job typé
    └── main.ts          # bootstrap() / shutdown() + garde require.main

## Conventions

- Commentaires **en français**, identifiants **en anglais**.
- Specs `*.spec.ts` **à côté** du code ; `*.integration.spec.ts` pour ce qui exige Redis,
  avec la garde `process.env.REDIS_URL ? describe : describe.skip` (calque de
  `backend-core/src/auth/token-store.integration.spec.ts`).
- **Aucun `flushdb`** dans les tests : le Redis de dev peut être partagé. Utiliser une
  file dédiée et `queue.obliterate({ force: true })`.
- Port interne **3002**, **aucun port hôte publié** (archi §2).
- **Pas de `container_name`** dans compose : le service doit pouvoir être scalé
  (`--scale media-service=2`).
- `noImplicitAny` **actif** (contrairement à `backend-core`) : pas d'injection de
  dépendances ici, donc aucun `any` structurellement nécessaire.

## Commandes

    npm ci
    npm run start:dev      # ts-node-dev, hot reload
    npm run lint
    npm run test
    npm run build

Tests d'intégration en local (le port 6379 est occupé sur le poste de dev) :

    docker run -d --rm -p 6381:6379 --name sh-redis-verif redis:7-alpine
    REDIS_URL=redis://127.0.0.1:6381 npm test
    docker stop sh-redis-verif
```

- [ ] **Step 7 : Commit**

```bash
git add media-service/src/main.ts media-service/src/main.integration.spec.ts media-service/CLAUDE.md
git commit -m "feat(SH-15/media): bootstrap testable et arret propre sur SIGTERM"
```

---

## Task 6 : Conteneurisation et supervision

**Files:**
- Create: `media-service/Dockerfile`
- Modify: `docker-compose.yml`, `docker-compose.staging.yml`, `observability/prometheus/prometheus.yml`, `.github/workflows/docker-ci.yml`, `.github/workflows/publish-staging.yml`

**Interfaces:**
- Consumes: `dist/main.js` produit par `npm run build` (Task 5), et la route `/health` (Task 3) pour le HEALTHCHECK.
- Produces: le service `media-service` du profil `app`, scrapé par Prometheus sur `media-service:3002`.

- [ ] **Step 1 : Écrire `media-service/Dockerfile`**

```dockerfile
# SH-15 — Image du media-service (worker Node + FFmpeg).
# Multi-stage : les outils de build (tsc, devDependencies) n'entrent jamais dans l'image finale.

# --- Étape 1 : build TypeScript ---
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build \
    # Ne garde que les dépendances de production pour l'étape finale
    && npm prune --omit=dev

# --- Étape 2 : image d'exécution minimale ---
FROM node:20-alpine
ENV NODE_ENV=production
# ffmpeg fournit `ffmpeg` ET `ffprobe` : c'est la raison d'être de ce service (SH-16).
# Installé dans l'étage d'EXÉCUTION uniquement — l'étage de build n'en fait rien.
RUN apk add --no-cache ffmpeg
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
# Répertoire de travail du transcodage, possédé par l'utilisateur non-root
RUN mkdir -p /tmp/media && chown -R node:node /tmp/media
# Exécution non-root (durcissement, CLAUDE.md §8) — l'utilisateur `node` existe dans l'image
USER node
EXPOSE 3002
# Cible EXPLICITEMENT 127.0.0.1 et non `localhost` : c'est la résolution de `localhost`
# en IPv6 ::1 qui avait rendu deux conteneurs « unhealthy » en production (AN-01, SH-49).
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD wget -qO /dev/null http://127.0.0.1:3002/health || exit 1
CMD ["node", "dist/main.js"]
```

- [ ] **Step 2 : Construire l'image et vérifier ffmpeg**

```bash
docker build -t skillhunt-media-service:ci ./media-service
```

```bash
docker run --rm --entrypoint ffprobe skillhunt-media-service:ci -version
```

Attendu : la version de ffprobe s'affiche (preuve que SH-16 aura son binaire).

- [ ] **Step 3 : Ajouter le service à `docker-compose.yml`**

Insérer après le bloc `matching-service:` (avant `frontend-web:`) :

```yaml
  # SH-15 — Worker de transcodage média (EP04). Consomme la file BullMQ `media-transcode`
  # sur Redis ; ne possède ni base de données ni route métier (design EP04, décision D7).
  media-service:
    build: ./media-service
    # PAS de `container_name` — volontaire : un nom fixe interdirait
    # `docker compose up --scale media-service=2`, qui est la démonstration de
    # scalabilité horizontale attendue en SH-16.
    profiles: ["app"]
    restart: unless-stopped
    environment:
      PORT: 3002
      NODE_ENV: production
      REDIS_URL: redis://redis:6379
      MEDIA_WORKER_CONCURRENCY: ${MEDIA_WORKER_CONCURRENCY:-1}
      MEDIA_TMP_DIR: /tmp/media
    # AUCUN port hôte (archi §2) : service interne. Prometheus le scrape sur le
    # réseau Docker privé, et il n'expose de toute façon aucune route métier.
    depends_on:
      redis:
        condition: service_healthy
```

> Le HEALTHCHECK est porté par le `Dockerfile` : inutile de le redéclarer ici.

- [ ] **Step 4 : Ajouter le service à `docker-compose.staging.yml`**

Insérer après le bloc `matching-service:`, en calquant sa forme (image GHCR, réseau privé, logging borné) :

```yaml
  media-service:
    image: ghcr.io/alixsanta/skillhunt/media-service:latest
    restart: unless-stopped
    environment:
      PORT: 3002
      NODE_ENV: production
      REDIS_URL: redis://redis:6379
      MEDIA_WORKER_CONCURRENCY: ${MEDIA_WORKER_CONCURRENCY:-1}
      MEDIA_TMP_DIR: /tmp/media
    networks:
      - skillhunt-private-net
    depends_on:
      redis:
        condition: service_healthy
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

- [ ] **Step 5 : Ajouter la cible Prometheus**

Dans `observability/prometheus/prometheus.yml`, après le bloc `matching-service` :

```yaml
  # ── Worker média : jobs traités, durée de transcodage, échecs (SH-15/SH-16) ──────────
  # Note : sans `container_name` et une fois le service scalé, le DNS Docker ne résout
  # qu'une réplique par scrape. Une découverte dynamique sera à poser en SH-16 si le
  # scaling devient permanent.
  - job_name: media-service
    metrics_path: /metrics
    static_configs:
      - targets: ['media-service:3002']
        labels:
          service: media-service
```

- [ ] **Step 6 : Ajouter l'image à `docker-ci.yml`**

Dans les deux listes `paths:` (push et pull_request), ajouter :

```yaml
      - 'media-service/Dockerfile'
```

Et dans la matrice, remplacer :

```yaml
        service: [backend-core, matching-service, frontend-web, gateway]
```

par :

```yaml
        service: [backend-core, matching-service, media-service, frontend-web, gateway]
```

Mettre également à jour le commentaire d'en-tête : « les **5** images applicatives ».

- [ ] **Step 7 : Ajouter l'image à `publish-staging.yml`**

Dans la matrice `include`, après l'entrée `matching-service` :

```yaml
          - service: media-service
            context: ./media-service
```

- [ ] **Step 8 : Vérifier la stack complète**

```bash
docker compose --profile app up -d --build media-service
```

```bash
docker compose ps media-service
```

Attendu : état `running (healthy)` après ~20 s.

```bash
docker compose exec media-service wget -qO- http://127.0.0.1:3002/metrics | head -5
```

Attendu : des lignes de métriques Prometheus.

- [ ] **Step 9 : Vérifier la collecte Prometheus**

```bash
docker compose --profile app --profile obs up -d
```

Prometheus **ne publie aucun port hôte** (profil `obs`) : la requête se fait depuis le conteneur.

```bash
docker compose exec prometheus wget -qO- 'http://127.0.0.1:9090/api/v1/query?query=up{service="media-service"}'
```

Attendu : un résultat avec `"value":[...,"1"]` (cible `up`). Laisser ~30 s après le démarrage pour le premier scrape.

- [ ] **Step 10 : Laisser la stack dans l'état où on l'a trouvée**

Les services du projet sont en `restart: unless-stopped` : ils remontent seuls au démarrage
de Docker et constituent l'état normal du poste. **Ne pas lancer `docker compose down`** —
cela supprimerait des conteneurs que l'on n'a pas démarrés. Se contenter de vérifier que
`media-service` a bien rejoint la stack :

```bash
docker compose ps --format '{{.Service}}	{{.Status}}'
```

- [ ] **Step 11 : Commit**

```bash
git add media-service/Dockerfile docker-compose.yml docker-compose.staging.yml observability/prometheus/prometheus.yml .github/workflows/docker-ci.yml .github/workflows/publish-staging.yml
git commit -m "feat(SH-15/media): conteneurisation, profil app et cible de supervision"
```

---

## Task 7 : Intégration continue et clôture

**Files:**
- Create: `.github/workflows/media-ci.yml`
- Modify: `.github/dependabot.yml`, `docs/BACKLOG.md`

**Interfaces:**
- Consumes: les scripts `lint` / `test` / `build` du `package.json` (Task 1).
- Produces: rien pour d'autres tâches — c'est la clôture du ticket.

- [ ] **Step 1 : Créer `.github/workflows/media-ci.yml`**

Calqué sur `node-ci.yml`. **Pas d'installation de ffmpeg à ce stade** : aucun test de SH-15 n'en a besoin, c'est SH-16 qui l'ajoutera avec les tests de transcodage.

```yaml
# Nom du workflow affiché dans l'onglet Actions de GitHub
name: SkillHunt - CI Media Service

# SH-15 — Même discipline que node-ci.yml : lint, audit, tests, build.
on:
  push:
    branches: [ "main", "develop" ]
    paths:
      - 'media-service/**'
      - '.github/workflows/media-ci.yml'
  pull_request:
    branches: [ "main", "develop" ]
    paths:
      - 'media-service/**'
      - '.github/workflows/media-ci.yml'

jobs:
  validation-media:
    name: Validation du worker média
    runs-on: ubuntu-latest
    # Monorepo : toutes les commandes `run` s'exécutent dans media-service/
    defaults:
      run:
        working-directory: media-service

    # Redis réel : les tests d'intégration du worker consomment une VRAIE file BullMQ.
    # Sans ce service, `worker.integration.spec.ts` et le test de bootstrap se sautent
    # silencieusement — et la CI ne prouverait plus rien (C2.2.2).
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

    steps:
      - name: 📥 Récupération du code source
        uses: actions/checkout@v4

      - name: 🟢 Configuration de Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          # Monorepo : le lockfile est dans media-service/ (et non à la racine du dépôt)
          cache-dependency-path: 'media-service/package-lock.json'

      - name: 📦 Installation propre des dépendances (ci)
        run: npm ci

      # BLOQUANT au niveau high, même politique que backend-core (SH-32/SH-47)
      - name: 🛡️ Audit de sécurité des dépendances NPM
        run: npm audit --audit-level=high

      - name: 🔍 Analyse statique du code (Lint)
        run: npm run lint

      - name: 🧪 Exécution des tests automatisés
        env:
          REDIS_URL: redis://localhost:6379
        run: npm run test

      - name: 🏗️ Validation de la compilation (Build)
        run: npm run build
```

- [ ] **Step 2 : Ajouter l'entrée Dependabot**

Dans `.github/dependabot.yml`, après l'entrée `/backend-core`, insérer :

```yaml
  # ────────────────────────────────────────────────────────────────────────────
  # Worker média (Node 20 / TypeScript / FFmpeg)
  # ────────────────────────────────────────────────────────────────────────────
  - package-ecosystem: "npm"
    directory: "/media-service"
    schedule:
      interval: "weekly"
      day: "monday"
      time: "06:00"
      timezone: "Europe/Paris"
    open-pull-requests-limit: 5
    labels: ["dependencies", "media-service"]
    commit-message:
      prefix: "chore(deps)"
      prefix-development: "chore(deps-dev)"
    target-branch: "develop"
    groups:
      media-service-mineur:
        patterns: ["*"]
        update-types: ["minor", "patch"]
```

- [ ] **Step 3 : Vérifier que les fichiers YAML sont valides**

```bash
python -c "import yaml,sys; [yaml.safe_load(open(p,encoding='utf-8')) for p in ['.github/workflows/media-ci.yml','.github/dependabot.yml','.github/workflows/docker-ci.yml','.github/workflows/publish-staging.yml','docker-compose.yml','docker-compose.staging.yml','observability/prometheus/prometheus.yml']]; print('YAML OK')"
```

Attendu : `YAML OK`.

- [ ] **Step 4 : Mettre à jour `docs/BACKLOG.md`**

Dans la table **EP04**, remplacer la ligne SH-15 par :

```markdown
| [SH-15](tickets/SH-15-scaffolding-media.md) | Scaffolding `media-service` (Node + FFmpeg) — *worker pur : `/health`, `/metrics`, file BullMQ consommée, image ffmpeg non-root ; [design EP04](superpowers/specs/2026-08-24-EP04-media-portfolio-design.md)* | 🟢 Terminé | 3 | C2.1.2, C2.2.2 | — |
```

Ajuster également les intitulés de SH-16 et SH-17 conformément à la décision **D10** du design (frontière « ce qui entre » / « ce qui sort ») :

```markdown
| [SH-16](tickets/SH-16-transcodage-async.md) | Pipeline de transcodage asynchrone 4K/360° — *flux entrant : upload présigné, entité `user_media`, job BullMQ, worker ffprobe/ffmpeg* | 🔵 Backlog | 8 | C2.2.2, C2.2.3 | R1 |
| [SH-17](tickets/SH-17-streaming-s3-cdn.md) | Streaming & stockage : S3 + Signed URLs — *flux sortant : manifeste HLS réécrit en segments signés, poster, consultation recruteur, purge* | 🔵 Backlog | 5 | C2.2.3, C2.4.1 | R8, R3 |
```

- [ ] **Step 5 : Vérification finale de bout en bout**

```bash
cd media-service && npm run lint && npm run build
```

```bash
docker run -d --rm -p 6381:6379 --name sh-redis-verif redis:7-alpine
```

```bash
cd media-service && REDIS_URL=redis://127.0.0.1:6381 npm test
```

Attendu : toute la suite passe, **aucun test `skipped`**.

```bash
docker stop sh-redis-verif
```

- [ ] **Step 6 : Commit**

```bash
git add .github/workflows/media-ci.yml .github/dependabot.yml docs/BACKLOG.md
git commit -m "ci(SH-15/media): pipeline dedie, veille Dependabot et cloture du ticket"
```

---

## Vérification de la Definition of Done

À cocher avant d'ouvrir la PR vers `develop` :

- [ ] Scénario 1 — `GET /health` répond 200 (Task 3, Task 6 Step 8)
- [ ] Scénario 2 — `GET /metrics` expose `media_jobs_total` (Task 3, Task 6 Step 8)
- [ ] Scénario 3 — un job déposé est consommé (Task 4 Step 6)
- [ ] Scénario 4 — démarrage refusé sans `REDIS_URL` (Task 1 Step 13)
- [ ] Scénario 5 — arrêt propre worker puis serveur (Task 5 Step 4)
- [ ] Scénario 6 — conteneur `healthy` et cible Prometheus `up` (Task 6 Steps 8-9)
- [ ] `npm run lint`, `npm run test`, `npm run build` verts
- [ ] `media-ci.yml`, `docker-ci.yml` verts sur la PR
- [ ] `docs/BACKLOG.md` à jour (SH-15 🟢, intitulés SH-16/17 alignés sur D10)

**PR** : base `develop`, **jamais `main`** (CLAUDE.md §11). Ne pas supprimer la branche après merge (traçabilité jury).
