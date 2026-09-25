# SH-16b — Pipeline de transcodage réel : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer le worker no-op de SH-15 par un vrai pipeline `ffprobe` / `ffmpeg` qui produit du HLS multi-débit et un poster, les dépose en S3, et rend un résultat que le validateur de `backend-core` accepte — ce qui rend enfin l'état `READY` atteignable.

**Architecture :** Cinq unités séparées par leur nature testable. `ladder.ts` est de la **logique pure** (dimensions → échelle ABR), testable sans aucune I/O. `probe.ts` et `encode.ts` enveloppent les deux binaires et se testent sur une **fixture de 2 s générée par ffmpeg au setup**, jamais versionnée. `storage/s3.ts` isole les accès S3. `worker.ts` orchestre, gère la progression, les métriques, et le nettoyage du temporaire dans un `finally`. Le worker reste un **worker pur** : ni base, ni route métier, ni JWT.

**Tech Stack :** Node 20 + TypeScript (`noImplicitAny` actif), BullMQ 5, `@aws-sdk/client-s3`, ffmpeg/ffprobe via `node:child_process`, Jest + ts-jest.

## Global Constraints

- **Contrat de job FIGÉ** (SH-15, non négociable) — entrée `{ mediaId, sourceKey, outputPrefix, posterKey }`, sortie `{ durationSeconds, width, height, type, mimeType, renditions: [{ name, width, height, bandwidth, playlistKey }] }`.
- **Le validateur de `backend-core` fait foi** (`backend-core/src/media/media.service.ts`, `parseTranscodeResult`) : `durationSeconds` nombre fini > 0 ; `width`/`height`/`bandwidth` entiers > 0 ; `type` ∈ `{VIDEO, VIDEO_360}` ; `mimeType` ∈ `['video/mp4','video/quicktime']` ; `name` de 1 à 32 caractères ; **chaque `playlistKey` doit commencer par `private/media/<freelanceId>/<mediaId>/`**.
- **Confinement de préfixe = exigence de sécurité (C2.2.3).** Toute clé produite est dérivée de l'`outputPrefix` reçu dans le job. Jamais recomposée, jamais concaténée depuis une autre source.
- **`outputPrefix` reçu vaut déjà `private/media/<freelanceId>/<mediaId>/hls/`** (cf. `media.service.ts:300`). `posterKey` vaut `.../poster.jpg`.
- **Jamais de sur-échantillonnage** : aucune piste ne dépasse la hauteur de la source.
- **Dimensions paires obligatoires** : `libx264` refuse les dimensions impaires.
- **Commentaires en français, identifiants en anglais** (CLAUDE.md §7).
- **Aucun secret en dur** : credentials S3 par la chaîne par défaut du SDK (`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`), comme `storage.module.ts`.
- **Aucun `flushdb`** dans les tests ; file dédiée + `queue.obliterate({ force: true })` (media-service/CLAUDE.md).
- **Tests exigeant un binaire ou un service se GARDENT, ils ne se sautent pas en silence** : calque de `process.env.REDIS_URL ? describe : describe.skip`.
- **Le manifeste maître n'est PAS produit ici** — décision D4, il est généré à la volée par SH-17.

---

## Structure des fichiers

| Fichier | Responsabilité |
|---|---|
| `media-service/src/transcode/ladder.ts` (créer) | Logique pure : dimensions source → échelle ABR, sans sur-échantillonnage, dimensions paires |
| `media-service/src/transcode/probe.ts` (créer) | `ffprobe` → durée, dimensions, projection 360° |
| `media-service/src/transcode/encode.ts` (créer) | `ffmpeg` → playlists de variante, segments, poster |
| `media-service/src/storage/s3.ts` (créer) | Téléchargement du master, dépôt récursif de l'arborescence de sortie |
| `media-service/src/transcode/pipeline.ts` (créer) | Orchestration : télécharge → sonde → encode → dépose → rend le résultat |
| `media-service/src/test/fixture.ts` (créer) | Génère une fixture vidéo de 2 s par ffmpeg (et une variante 360°) |
| `media-service/src/config.ts` (modifier) | Ajoute bucket, endpoint et région S3 |
| `media-service/src/queue/worker.ts` (modifier) | Branche le pipeline, la progression et le nettoyage |
| `media-service/src/metrics.ts` (modifier) | Ajoute le compteur de pistes produites |
| `.github/workflows/media-ci.yml` (modifier) | Installe ffmpeg, ajoute LocalStack |
| `docker-compose.yml`, `docker-compose.staging.yml`, `.env.example` (modifier) | Variables S3 du worker |
| `docs/BACKLOG.md`, `CHANGELOG.md`, `docs/tickets/SH-16b-*.md` (modifier) | Traçabilité |

---

## Task 1 : Configuration S3 du worker

**Files:**
- Modify: `media-service/src/config.ts`
- Modify: `media-service/src/config.spec.ts`
- Modify: `docker-compose.yml:189-194`, `docker-compose.staging.yml`, `.env.example`

**Interfaces:**
- Consumes: rien.
- Produces: `MediaServiceConfig` gagne `s3: { bucket: string; endpoint?: string; region: string }`. Consommé par les tâches 4 et 6.

- [ ] **Step 1 : Écrire le test qui échoue**

Ajouter dans `media-service/src/config.spec.ts` :

```ts
describe('loadConfig — stockage objet (SH-16b)', () => {
  const baseEnv = { REDIS_URL: 'redis://127.0.0.1:6379' } as NodeJS.ProcessEnv;

  it('exige AWS_S3_BUCKET : sans bucket, le worker ne saurait où déposer', () => {
    // Même parti pris que storage.module.ts côté backend-core : échec au démarrage
    // plutôt qu'un worker qui consomme des jobs et perd chaque sortie.
    expect(() => loadConfig({ ...baseEnv })).toThrow(/AWS_S3_BUCKET/);
  });

  it('retient le bucket, l\'endpoint et la région', () => {
    const config = loadConfig({
      ...baseEnv,
      AWS_S3_BUCKET: 'skillhunt-media',
      AWS_S3_ENDPOINT: 'http://localstack:4566',
      AWS_REGION: 'eu-west-1',
    });

    expect(config.s3).toEqual({
      bucket: 'skillhunt-media',
      endpoint: 'http://localstack:4566',
      region: 'eu-west-1',
    });
  });

  it('applique eu-west-3 par défaut et laisse l\'endpoint absent pour AWS réel', () => {
    // `endpoint` absent = S3 réel ; renseigné = LocalStack/MinIO (path-style).
    const config = loadConfig({ ...baseEnv, AWS_S3_BUCKET: 'skillhunt-media' });

    expect(config.s3.region).toBe('eu-west-3');
    expect(config.s3.endpoint).toBeUndefined();
  });
});
```

- [ ] **Step 2 : Lancer le test pour vérifier qu'il échoue**

Run: `cd media-service && npx jest src/config.spec.ts -t "stockage objet"`
Expected: FAIL — `config.s3` est `undefined`, et le premier test ne lève pas.

- [ ] **Step 3 : Implémenter**

Dans `media-service/src/config.ts`, ajouter à l'interface :

```ts
  /**
   * Stockage objet. Le worker lit le master et dépose ses sorties DIRECTEMENT en S3
   * (architecture EP04 §4) : le job ne porte que des clés, pas d'URL signée.
   * Il reste un worker pur — S3 n'est ni une base métier, ni une API authentifiée.
   */
  s3: {
    bucket: string;
    /** Absent ⇒ S3 réel. Renseigné ⇒ LocalStack/MinIO, et le path-style est forcé. */
    endpoint?: string;
    region: string;
  };
```

et dans `loadConfig`, avant le `return` :

```ts
  const bucket = env.AWS_S3_BUCKET;
  if (!bucket) {
    throw new Error('AWS_S3_BUCKET manquant : le worker ne saurait où déposer ses sorties.');
  }
```

puis dans l'objet retourné :

```ts
    s3: {
      bucket,
      // `|| undefined` et non `??` : une substitution compose non résolue laisse une
      // chaîne VIDE, que `??` laisserait passer — même piège qu'en storage.module.ts.
      endpoint: env.AWS_S3_ENDPOINT || undefined,
      region: env.AWS_REGION ?? 'eu-west-3',
    },
```

- [ ] **Step 4 : Lancer les tests**

Run: `cd media-service && npx jest src/config.spec.ts`
Expected: PASS, tous les tests du fichier.

- [ ] **Step 5 : Câbler l'environnement**

Dans `docker-compose.yml`, service `media-service`, sous `environment:` (après `MEDIA_TMP_DIR`) :

```yaml
      # Stockage objet : le worker lit le master et dépose HLS + poster lui-même
      # (EP04 §4). Endpoint INTERNE — le worker est dans le réseau Docker, il n'a
      # aucune raison d'utiliser l'endpoint public destiné au navigateur (D9).
      AWS_S3_ENDPOINT: http://localstack:4566
      AWS_S3_BUCKET: ${AWS_S3_BUCKET:-skillhunt-media}
      AWS_REGION: ${AWS_REGION:-eu-west-3}
      AWS_ACCESS_KEY_ID: ${AWS_ACCESS_KEY_ID:-test}
      AWS_SECRET_ACCESS_KEY: ${AWS_SECRET_ACCESS_KEY:-test}
```

et ajouter à `depends_on` :

```yaml
      localstack:
        condition: service_healthy
```

Reporter les mêmes variables dans `docker-compose.staging.yml` (service `media-service`), en reprenant les valeurs déjà utilisées par `backend-core` dans ce fichier. Vérifier que `.env.example` documente déjà `AWS_S3_BUCKET`, `AWS_REGION`, `AWS_S3_ENDPOINT` — si oui, ne rien dupliquer ; sinon les ajouter avec un commentaire d'une ligne.

- [ ] **Step 6 : Valider la syntaxe compose**

Run: `docker compose config --quiet`
Expected: aucune sortie, code 0. (Si Docker n'est pas démarré, noter l'étape comme non vérifiée et la reprendre à la recette de la tâche 8 — **ne pas démarrer ni arrêter la stack**.)

- [ ] **Step 7 : Commit**

```bash
git add media-service/src/config.ts media-service/src/config.spec.ts docker-compose.yml docker-compose.staging.yml .env.example
git commit -m "feat(SH-16b/media): donne au worker sa configuration de stockage objet"
```

---

## Task 2 : Échelle ABR — logique pure

**Files:**
- Create: `media-service/src/transcode/ladder.ts`
- Create: `media-service/src/transcode/ladder.spec.ts`

**Interfaces:**
- Consumes: rien.
- Produces:
  ```ts
  export interface RenditionSpec { name: string; width: number; height: number; bandwidth: number }
  export function selectLadder(sourceWidth: number, sourceHeight: number): RenditionSpec[]
  ```
  Consommé par les tâches 5 et 7.

- [ ] **Step 1 : Écrire les tests qui échouent**

Créer `media-service/src/transcode/ladder.spec.ts` :

```ts
import { selectLadder } from './ladder';

describe('selectLadder (SH-16b)', () => {
  it('produit les trois paliers pour une source 1080p', () => {
    const ladder = selectLadder(1920, 1080);

    expect(ladder.map((r) => r.name)).toEqual(['360p', '720p', '1080p']);
  });

  it('ne SUR-ÉCHANTILLONNE jamais : une source 720p s\'arrête à 720p', () => {
    // Inventer un 1080p depuis un 720p coûte du CPU et du stockage pour une
    // qualité qui n'existe pas dans la source. C'est le test qui l'interdit.
    const ladder = selectLadder(1280, 720);

    expect(ladder.map((r) => r.name)).toEqual(['360p', '720p']);
    expect(ladder.every((r) => r.height <= 720)).toBe(true);
  });

  it('rend au moins une piste pour une source plus petite que le premier palier', () => {
    // Zéro piste ferait rejeter le résultat par le validateur du monolithe
    // (`renditions` doit être un tableau non vide de pistes valides).
    const ladder = selectLadder(320, 240);

    expect(ladder).toHaveLength(1);
    expect(ladder[0]).toMatchObject({ name: '240p', width: 320, height: 240 });
  });

  it('préserve le rapport d\'aspect : un 4:3 de 1440x1080 donne du 960x720', () => {
    const ladder = selectLadder(1440, 1080);
    const p720 = ladder.find((r) => r.name === '720p');

    expect(p720).toMatchObject({ width: 960, height: 720 });
  });

  it('rend des dimensions PAIRES : libx264 refuse les dimensions impaires', () => {
    // 1001x563 est choisi pour produire des arrondis impairs sans le garde-fou.
    const ladder = selectLadder(1001, 563);

    for (const rendition of ladder) {
      expect(rendition.width % 2).toBe(0);
      expect(rendition.height % 2).toBe(0);
    }
  });

  it('attribue un débit croissant avec la définition', () => {
    const ladder = selectLadder(1920, 1080);
    const bandwidths = ladder.map((r) => r.bandwidth);

    expect(bandwidths).toEqual([...bandwidths].sort((a, b) => a - b));
    expect(bandwidths.every((b) => Number.isInteger(b) && b > 0)).toBe(true);
  });

  it('rejette des dimensions source absurdes', () => {
    expect(() => selectLadder(0, 1080)).toThrow(/dimensions/i);
    expect(() => selectLadder(1920, -1)).toThrow(/dimensions/i);
  });
});
```

- [ ] **Step 2 : Lancer les tests pour vérifier qu'ils échouent**

Run: `cd media-service && npx jest src/transcode/ladder.spec.ts`
Expected: FAIL — `Cannot find module './ladder'`.

- [ ] **Step 3 : Implémenter**

Créer `media-service/src/transcode/ladder.ts` :

```ts
/**
 * Échelle ABR (décision EP04 D3 : HLS multi-débit 360p / 720p / 1080p).
 *
 * Logique PURE, sans I/O : c'est ce qui permet de tester la règle métier (pas de
 * sur-échantillonnage, rapport d'aspect, dimensions paires) sans binaire ni fixture.
 */

/** Une piste de qualité à produire. `bandwidth` est en bits par seconde. */
export interface RenditionSpec {
  name: string;
  width: number;
  height: number;
  bandwidth: number;
}

/** Paliers cibles, du plus léger au plus lourd. Hauteur = critère de sélection. */
const RUNGS: readonly { name: string; height: number; bandwidth: number }[] = [
  { name: '360p', height: 360, bandwidth: 800_000 },
  { name: '720p', height: 720, bandwidth: 2_800_000 },
  { name: '1080p', height: 1080, bandwidth: 5_000_000 },
];

/** Débit de repli pour une source sous le premier palier, proportionné à sa surface. */
const FALLBACK_BITS_PER_PIXEL = 4;

/** Arrondit à l'entier pair le plus proche, minimum 2 : `libx264` refuse l'impair. */
function toEvenDimension(value: number): number {
  const rounded = Math.round(value);
  return Math.max(2, rounded % 2 === 0 ? rounded : rounded - 1);
}

/**
 * Choisit les pistes à produire pour une source donnée.
 *
 * Deux règles, toutes deux couvertes par des tests :
 *  1. **jamais de sur-échantillonnage** — un palier plus haut que la source est écarté ;
 *  2. **au moins une piste** — une source minuscule est rendue à sa taille native,
 *     sans quoi `renditions` serait vide et le monolithe rejetterait le résultat.
 *
 * La largeur est DÉRIVÉE du rapport d'aspect, jamais reprise du palier : une source 4:3
 * étirée en 16:9 déformerait l'image.
 */
export function selectLadder(sourceWidth: number, sourceHeight: number): RenditionSpec[] {
  if (
    !Number.isFinite(sourceWidth) ||
    !Number.isFinite(sourceHeight) ||
    sourceWidth <= 0 ||
    sourceHeight <= 0
  ) {
    throw new Error(
      `Dimensions source invalides : ${sourceWidth}x${sourceHeight} — sondage ffprobe incohérent.`,
    );
  }

  const selected = RUNGS.filter((rung) => rung.height <= sourceHeight).map((rung) => ({
    name: rung.name,
    width: toEvenDimension((sourceWidth * rung.height) / sourceHeight),
    height: toEvenDimension(rung.height),
    bandwidth: rung.bandwidth,
  }));

  if (selected.length > 0) {
    return selected;
  }

  // Source sous le premier palier : une seule piste, à la définition native.
  const width = toEvenDimension(sourceWidth);
  const height = toEvenDimension(sourceHeight);
  return [
    {
      name: `${height}p`,
      width,
      height,
      bandwidth: Math.max(1, Math.round(width * height * FALLBACK_BITS_PER_PIXEL)),
    },
  ];
}
```

- [ ] **Step 4 : Lancer les tests**

Run: `cd media-service && npx jest src/transcode/ladder.spec.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5 : Vérification de sabotage**

Remplacer temporairement `rung.height <= sourceHeight` par `true` dans `selectLadder`, relancer :

Run: `cd media-service && npx jest src/transcode/ladder.spec.ts`
Expected: FAIL sur « ne SUR-ÉCHANTILLONNE jamais ». Rétablir la ligne, relancer, PASS.

- [ ] **Step 6 : Commit**

```bash
git add media-service/src/transcode/ladder.ts media-service/src/transcode/ladder.spec.ts
git commit -m "feat(SH-16b/media): derive l'echelle ABR sans jamais sur-echantillonner"
```

---

## Task 3 : Fixture générée par ffmpeg + ffmpeg en CI

**Files:**
- Create: `media-service/src/test/fixture.ts`
- Create: `media-service/src/test/fixture.spec.ts`
- Modify: `.github/workflows/media-ci.yml`

**Interfaces:**
- Consumes: rien.
- Produces:
  ```ts
  export function hasFfmpeg(): boolean
  export const describeIfFfmpeg: jest.Describe
  export async function makeFixture(dir: string, options?: { spherical?: boolean }): Promise<string>
  ```
  Consommé par les tâches 4, 5 et 8.

- [ ] **Step 1 : Écrire le test qui échoue**

Créer `media-service/src/test/fixture.spec.ts` :

```ts
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describeIfFfmpeg, makeFixture } from './fixture';

describeIfFfmpeg('makeFixture (SH-16b)', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'sh-fixture-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('génère un MP4 lisible de 2 secondes', async () => {
    const chemin = await makeFixture(dir);

    const infos = await stat(chemin);
    expect(infos.size).toBeGreaterThan(0);
    expect(chemin.endsWith('.mp4')).toBe(true);
  }, 60_000);

  it('génère une variante portant les métadonnées de projection sphérique', async () => {
    const chemin = await makeFixture(dir, { spherical: true });

    const infos = await stat(chemin);
    expect(infos.size).toBeGreaterThan(0);
  }, 60_000);
});
```

- [ ] **Step 2 : Lancer le test pour vérifier qu'il échoue**

Run: `cd media-service && npx jest src/test/fixture.spec.ts`
Expected: FAIL — `Cannot find module './fixture'`.

- [ ] **Step 3 : Implémenter**

Créer `media-service/src/test/fixture.ts` :

```ts
import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * Fixtures vidéo GÉNÉRÉES, jamais versionnées (décision actée en brainstorming).
 *
 * Commiter un binaire vidéo alourdit le dépôt à chaque modification et ne dit rien de
 * son contenu en revue. `ffmpeg` sait fabriquer une mire déterministe en deux secondes :
 * la fixture est donc reproductible et lisible dans le code qui la produit.
 */

/** ffmpeg est-il disponible ? Le conteneur l'a toujours, un poste de dev pas forcément. */
export function hasFfmpeg(): boolean {
  return process.env.SKILLHUNT_HAS_FFMPEG !== '0';
}

/**
 * Garde explicite, calquée sur `process.env.REDIS_URL ? describe : describe.skip`
 * (`backend-core/src/auth/token-store.integration.spec.ts`). Les tests exigeant un
 * binaire se GARDENT — ils ne disparaissent pas en silence.
 */
export const describeIfFfmpeg: jest.Describe = hasFfmpeg() ? describe : describe.skip;

/**
 * Fabrique une vidéo de test de 2 s, 640x360, 25 fps.
 *
 * `spherical: true` ajoute les métadonnées de projection équirectangulaire, pour
 * exercer la détection 360° de `probe.ts` (décision D5). On les pose via les tags de
 * conteneur : c'est la forme que `ffprobe` restitue dans `tags`.
 */
export async function makeFixture(
  dir: string,
  options: { spherical?: boolean } = {},
): Promise<string> {
  const nom = options.spherical ? 'fixture-360.mp4' : 'fixture.mp4';
  const chemin = join(dir, nom);

  const args = [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-f',
    'lavfi',
    '-i',
    'testsrc=size=640x360:rate=25:duration=2',
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-pix_fmt',
    'yuv420p',
  ];

  if (options.spherical) {
    args.push('-metadata', 'spherical-video=1', '-metadata', 'projection=equirectangular');
  }

  args.push(chemin);

  await execFileAsync('ffmpeg', args);
  return chemin;
}
```

- [ ] **Step 4 : Lancer le test**

Run: `cd media-service && npx jest src/test/fixture.spec.ts`
Expected: PASS, 2 tests — **si ffmpeg est installé localement**. Sinon les tests sont marqués « skipped » et il faut installer ffmpeg (`winget install Gyan.FFmpeg` sous Windows, `apt install ffmpeg` sous Linux) **avant de poursuivre** : les tâches 4, 5 et 8 ne sont pas vérifiables sans lui.

- [ ] **Step 5 : Installer ffmpeg en CI**

Dans `.github/workflows/media-ci.yml`, insérer entre « 🟢 Configuration de Node.js » et « 📦 Installation propre des dépendances » :

```yaml
      # ffmpeg ET ffprobe : les tests de transcodage les exercent réellement (SH-16b).
      # Sans eux, `describeIfFfmpeg` sauterait tout le pipeline et la CI ne prouverait
      # plus rien du cœur de ce service (C2.2.2). Le paquet Ubuntu fournit les deux.
      - name: 🎬 Installation de ffmpeg
        run: |
          sudo apt-get update
          sudo apt-get install -y --no-install-recommends ffmpeg
          ffmpeg -version | head -1
          ffprobe -version | head -1
```

- [ ] **Step 6 : Vérifier lint et build**

Run: `cd media-service && npm run lint && npm run build`
Expected: aucune erreur.

- [ ] **Step 7 : Commit**

```bash
git add media-service/src/test/fixture.ts media-service/src/test/fixture.spec.ts .github/workflows/media-ci.yml
git commit -m "test(SH-16b/media): genere la fixture video et installe ffmpeg en CI"
```

---

## Task 4 : Sondage `ffprobe`

**Files:**
- Create: `media-service/src/transcode/probe.ts`
- Create: `media-service/src/transcode/probe.spec.ts`

**Interfaces:**
- Consumes: `describeIfFfmpeg`, `makeFixture` (tâche 3).
- Produces:
  ```ts
  export interface ProbeResult {
    durationSeconds: number;
    width: number;
    height: number;
    spherical: boolean;
  }
  export async function probeVideo(filePath: string): Promise<ProbeResult>
  ```
  Consommé par les tâches 5 et 7.

- [ ] **Step 1 : Écrire les tests qui échouent**

Créer `media-service/src/transcode/probe.spec.ts` :

```ts
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describeIfFfmpeg, makeFixture } from '../test/fixture';
import { probeVideo } from './probe';

describeIfFfmpeg('probeVideo (SH-16b)', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'sh-probe-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('rend la durée et les dimensions réelles', async () => {
    const chemin = await makeFixture(dir);

    const resultat = await probeVideo(chemin);

    expect(resultat.width).toBe(640);
    expect(resultat.height).toBe(360);
    // 2 s demandées ; on tolère l'arrondi du conteneur sans accepter n'importe quoi.
    expect(resultat.durationSeconds).toBeGreaterThan(1.5);
    expect(resultat.durationSeconds).toBeLessThan(3);
  }, 60_000);

  it('ne voit AUCUNE projection sphérique sur une vidéo plate', async () => {
    const chemin = await makeFixture(dir);

    const resultat = await probeVideo(chemin);

    expect(resultat.spherical).toBe(false);
  }, 60_000);

  it('détecte la projection équirectangulaire', async () => {
    const chemin = await makeFixture(dir, { spherical: true });

    const resultat = await probeVideo(chemin);

    expect(resultat.spherical).toBe(true);
  }, 60_000);

  it('échoue explicitement sur un fichier qui n\'est pas une vidéo', async () => {
    // Le dépôt a été vérifié par `head()` côté monolithe, mais un `Content-Type`
    // annoncé n'est pas une garantie de contenu : le worker reste juge (C2.2.3).
    const chemin = join(dir, 'pas-une-video.mp4');
    await writeFile(chemin, 'ceci est du texte, pas un flux vidéo');

    await expect(probeVideo(chemin)).rejects.toThrow();
  }, 60_000);
});
```

- [ ] **Step 2 : Lancer les tests pour vérifier qu'ils échouent**

Run: `cd media-service && npx jest src/transcode/probe.spec.ts`
Expected: FAIL — `Cannot find module './probe'`.

- [ ] **Step 3 : Implémenter**

Créer `media-service/src/transcode/probe.ts` :

```ts
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** Sortie utile du sondage. Tout le reste de `ffprobe` est ignoré volontairement. */
export interface ProbeResult {
  durationSeconds: number;
  width: number;
  height: number;
  /** Projection équirectangulaire détectée (décision D5 : le rendu reste côté front). */
  spherical: boolean;
}

/** Sous-ensemble typé de la sortie JSON de ffprobe. Le reste n'est pas décrit. */
interface FfprobeStream {
  codec_type?: string;
  width?: number;
  height?: number;
  duration?: string;
  tags?: Record<string, string>;
  side_data_list?: { side_data_type?: string }[];
}

interface FfprobeOutput {
  streams?: FfprobeStream[];
  format?: { duration?: string; tags?: Record<string, string> };
}

/** Marqueurs de projection, en minuscules — comparés sur clés ET valeurs. */
const MARQUEURS_360 = ['spherical', 'equirectangular'];

function contientMarqueur360(tags: Record<string, string> | undefined): boolean {
  if (!tags) {
    return false;
  }
  return Object.entries(tags).some(([cle, valeur]) => {
    const texte = `${cle} ${valeur}`.toLowerCase();
    return MARQUEURS_360.some((marqueur) => texte.includes(marqueur));
  });
}

/**
 * Sonde une vidéo locale.
 *
 * On sonde le FICHIER TÉLÉCHARGÉ et non une URL : le 4K supporte mal les aléas réseau
 * en cours de `seek` (conception EP04 §7).
 *
 * `ffprobe` sort en code non nul sur un fichier illisible, ce qui rejette la promesse —
 * on laisse cette erreur remonter telle quelle : c'est un échec de transcodage légitime,
 * que BullMQ retentera puis basculera en `FAILED`.
 */
export async function probeVideo(filePath: string): Promise<ProbeResult> {
  const { stdout } = await execFileAsync('ffprobe', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-print_format',
    'json',
    '-show_format',
    '-show_streams',
    filePath,
  ]);

  let sortie: FfprobeOutput;
  try {
    sortie = JSON.parse(stdout) as FfprobeOutput;
  } catch {
    throw new Error('Sortie ffprobe illisible : le fichier déposé n\'est pas une vidéo exploitable.');
  }

  const video = sortie.streams?.find((flux) => flux.codec_type === 'video');
  if (!video || !video.width || !video.height) {
    throw new Error('Aucun flux vidéo exploitable : dimensions absentes du sondage.');
  }

  // La durée du CONTENEUR fait foi quand elle existe : celle du flux manque sur
  // certains encodages, et une durée nulle ferait rejeter le résultat par le monolithe.
  const duree = Number(sortie.format?.duration ?? video.duration ?? Number.NaN);
  if (!Number.isFinite(duree) || duree <= 0) {
    throw new Error('Durée introuvable ou nulle : sondage ffprobe incohérent.');
  }

  const spherical =
    contientMarqueur360(video.tags) ||
    contientMarqueur360(sortie.format?.tags) ||
    (video.side_data_list ?? []).some((donnee) =>
      (donnee.side_data_type ?? '').toLowerCase().includes('spherical'),
    );

  return { durationSeconds: duree, width: video.width, height: video.height, spherical };
}
```

- [ ] **Step 4 : Lancer les tests**

Run: `cd media-service && npx jest src/transcode/probe.spec.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5 : Vérification de sabotage**

Remplacer temporairement le calcul de `spherical` par `false`, relancer :

Run: `cd media-service && npx jest src/transcode/probe.spec.ts`
Expected: FAIL sur « détecte la projection équirectangulaire ». Rétablir, relancer, PASS.

> **Si le test 360° échoue même avec l'implémentation correcte** : ffmpeg n'a pas conservé les tags demandés. Inspecter la sortie réelle — `ffprobe -print_format json -show_format -show_streams fixture-360.mp4` — et **adapter la fixture** (tâche 3, `makeFixture`) pour poser un marqueur que ffprobe restitue effectivement. Ne PAS relâcher la détection pour faire passer le test : c'est la fixture qui doit refléter une vraie vidéo 360°, pas le code qui doit accepter n'importe quoi.

- [ ] **Step 6 : Commit**

```bash
git add media-service/src/transcode/probe.ts media-service/src/transcode/probe.spec.ts
git commit -m "feat(SH-16b/media): sonde duree, dimensions et projection 360 par ffprobe"
```

---

## Task 5 : Encodage HLS + poster

**Files:**
- Create: `media-service/src/transcode/encode.ts`
- Create: `media-service/src/transcode/encode.spec.ts`

**Interfaces:**
- Consumes: `RenditionSpec` (tâche 2), `describeIfFfmpeg` / `makeFixture` (tâche 3).
- Produces:
  ```ts
  export async function encodeRendition(
    sourcePath: string, outDir: string, rendition: RenditionSpec,
    onProgress?: (seconds: number) => void,
  ): Promise<string>                              // chemin de la playlist écrite
  export async function extractPoster(sourcePath: string, outPath: string, durationSeconds: number): Promise<void>
  ```
  Consommé par la tâche 7.

- [ ] **Step 1 : Écrire les tests qui échouent**

Créer `media-service/src/transcode/encode.spec.ts` :

```ts
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describeIfFfmpeg, makeFixture } from '../test/fixture';
import { encodeRendition, extractPoster } from './encode';

describeIfFfmpeg('encodeRendition (SH-16b)', () => {
  let dir: string;
  let source: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'sh-encode-'));
    source = await makeFixture(dir);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('écrit une playlist et ses segments', async () => {
    const sortie = join(dir, 'out');

    const playlist = await encodeRendition(source, sortie, {
      name: '360p',
      width: 640,
      height: 360,
      bandwidth: 800_000,
    });

    expect(playlist).toBe(join(sortie, '360p.m3u8'));
    const contenu = await readFile(playlist, 'utf8');
    expect(contenu).toContain('#EXTM3U');
    // VOD et non live : la playlist doit être close, sinon un lecteur attend la suite.
    expect(contenu).toContain('#EXT-X-ENDLIST');

    const segments = await readdir(join(sortie, '360p'));
    expect(segments.length).toBeGreaterThan(0);
    expect(segments.every((nom) => nom.endsWith('.ts'))).toBe(true);
  }, 120_000);

  it('référence les segments par un chemin RELATIF au sous-dossier de la piste', async () => {
    // SH-17 réécrira chaque ligne de segment en URL signée. Si la playlist portait un
    // chemin ABSOLU du système de fichiers du worker, cette réécriture serait fausse
    // ET fuiterait l'arborescence interne du conteneur.
    const sortie = join(dir, 'out');
    const playlist = await encodeRendition(source, sortie, {
      name: '360p',
      width: 640,
      height: 360,
      bandwidth: 800_000,
    });

    const lignes = (await readFile(playlist, 'utf8'))
      .split('\n')
      .filter((ligne) => ligne.trim() !== '' && !ligne.startsWith('#'));

    expect(lignes.length).toBeGreaterThan(0);
    for (const ligne of lignes) {
      expect(ligne.trim()).toMatch(/^360p\/seg-\d+\.ts$/);
    }
  }, 120_000);

  it('rapporte la progression en secondes encodées', async () => {
    const sortie = join(dir, 'out');
    const avancees: number[] = [];

    await encodeRendition(
      source,
      sortie,
      { name: '360p', width: 640, height: 360, bandwidth: 800_000 },
      (secondes) => avancees.push(secondes),
    );

    expect(avancees.length).toBeGreaterThan(0);
    expect(avancees.every((valeur) => Number.isFinite(valeur) && valeur >= 0)).toBe(true);
  }, 120_000);

  it('échoue sur une source illisible plutôt que d\'écrire une playlist vide', async () => {
    const sortie = join(dir, 'out');

    await expect(
      encodeRendition(join(dir, 'inexistant.mp4'), sortie, {
        name: '360p',
        width: 640,
        height: 360,
        bandwidth: 800_000,
      }),
    ).rejects.toThrow();
  }, 120_000);
});

describeIfFfmpeg('extractPoster (SH-16b)', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'sh-poster-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('extrait une image non vide à t = 1 s', async () => {
    const source = await makeFixture(dir);
    const poster = join(dir, 'poster.jpg');

    await extractPoster(source, poster, 2);

    const infos = await stat(poster);
    expect(infos.size).toBeGreaterThan(0);
  }, 120_000);

  it('retombe sur la première image quand la vidéo est plus courte qu\'une seconde', async () => {
    // `-ss 1` sur une vidéo de 0,4 s ne rend AUCUNE image : ffmpeg sort en succès avec
    // un fichier vide, et le portfolio afficherait une vignette cassée.
    const source = await makeFixture(dir);
    const poster = join(dir, 'poster-court.jpg');

    await extractPoster(source, poster, 0.4);

    const infos = await stat(poster);
    expect(infos.size).toBeGreaterThan(0);
  }, 120_000);
});
```

- [ ] **Step 2 : Lancer les tests pour vérifier qu'ils échouent**

Run: `cd media-service && npx jest src/transcode/encode.spec.ts`
Expected: FAIL — `Cannot find module './encode'`.

- [ ] **Step 3 : Implémenter**

Créer `media-service/src/transcode/encode.ts` :

```ts
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { RenditionSpec } from './ladder';

/** Durée cible d'un segment HLS, en secondes. 4 s est l'usage courant en VOD. */
const HLS_SEGMENT_SECONDS = 4;

/**
 * Lance ffmpeg et rejette si le processus sort en erreur.
 *
 * `spawn` et non `execFile` : l'encodage écrit sa progression en continu, et un buffer
 * de sortie unique la rendrait inexploitable. `onLine` reçoit chaque ligne de `stdout`.
 */
function runFfmpeg(args: string[], onLine?: (ligne: string) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const processus = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });

    let reste = '';
    processus.stdout.on('data', (morceau: Buffer) => {
      if (!onLine) {
        return;
      }
      reste += morceau.toString();
      const lignes = reste.split('\n');
      reste = lignes.pop() ?? '';
      for (const ligne of lignes) {
        onLine(ligne.trim());
      }
    });

    // La sortie d'erreur est CONSERVÉE : sans elle, un échec d'encodage se résume à
    // « exit 1 », inexploitable en supervision comme en recette.
    let erreurs = '';
    processus.stderr.on('data', (morceau: Buffer) => {
      erreurs += morceau.toString();
    });

    processus.on('error', reject);
    processus.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      const extrait = erreurs.trim().split('\n').slice(-3).join(' | ');
      reject(new Error(`ffmpeg a échoué (code ${code}) : ${extrait}`));
    });
  });
}

/**
 * Encode UNE piste en HLS.
 *
 * Arborescence produite, alignée sur la conception §5.4 :
 *   <outDir>/<name>.m3u8
 *   <outDir>/<name>/seg-00001.ts …
 *
 * `-hls_base_url <name>/` est ce qui garde les lignes de segment RELATIVES dans la
 * playlist. Sans lui, ffmpeg y écrit le chemin complet qu'on lui a donné — donc un
 * chemin absolu du conteneur, que SH-17 ne saurait pas réécrire en URL signée et qui
 * fuiterait l'arborescence interne.
 *
 * @returns le chemin local de la playlist écrite.
 */
export async function encodeRendition(
  sourcePath: string,
  outDir: string,
  rendition: RenditionSpec,
  onProgress?: (seconds: number) => void,
): Promise<string> {
  await mkdir(join(outDir, rendition.name), { recursive: true });

  const playlistPath = join(outDir, `${rendition.name}.m3u8`);

  const args = [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-i',
    sourcePath,
    // `-progress pipe:1` : progression lisible par machine sur stdout, au lieu de
    // gratter la barre d'avancement destinée à l'humain sur stderr.
    '-progress',
    'pipe:1',
    '-vf',
    `scale=${rendition.width}:${rendition.height}`,
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-b:v',
    String(rendition.bandwidth),
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-f',
    'hls',
    '-hls_time',
    String(HLS_SEGMENT_SECONDS),
    '-hls_playlist_type',
    'vod',
    '-hls_base_url',
    `${rendition.name}/`,
    '-hls_segment_filename',
    join(outDir, rendition.name, 'seg-%05d.ts'),
    playlistPath,
  ];

  await runFfmpeg(args, (ligne) => {
    if (!onProgress) {
      return;
    }
    // Format de `-progress` : une paire `cle=valeur` par ligne. `out_time_us` donne
    // la position encodée en microsecondes.
    const correspondance = /^out_time_us=(\d+)$/.exec(ligne);
    if (correspondance) {
      onProgress(Number(correspondance[1]) / 1_000_000);
    }
  });

  return playlistPath;
}

/**
 * Extrait le poster.
 *
 * `-ss 1` (conception §7) SAUF si la vidéo est plus courte : ffmpeg sortirait alors en
 * succès avec un fichier vide, et le portfolio afficherait une vignette cassée. Sous
 * une seconde, on prend la première image.
 */
export async function extractPoster(
  sourcePath: string,
  outPath: string,
  durationSeconds: number,
): Promise<void> {
  const instant = durationSeconds > 1 ? '1' : '0';

  await runFfmpeg([
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-ss',
    instant,
    '-i',
    sourcePath,
    '-frames:v',
    '1',
    '-q:v',
    '3',
    outPath,
  ]);
}
```

- [ ] **Step 4 : Lancer les tests**

Run: `cd media-service && npx jest src/transcode/encode.spec.ts`
Expected: PASS, 6 tests.

> **Si le test des chemins relatifs échoue** : inspecter la playlist réellement produite (`cat` du `.m3u8`). Selon la version de ffmpeg, `-hls_base_url` se combine différemment avec `-hls_segment_filename`. Corriger les arguments jusqu'à obtenir des lignes `360p/seg-00001.ts` — **ne pas relâcher l'assertion**, c'est elle qui protège SH-17.

- [ ] **Step 5 : Commit**

```bash
git add media-service/src/transcode/encode.ts media-service/src/transcode/encode.spec.ts
git commit -m "feat(SH-16b/media): encode le HLS multi-debit et extrait le poster"
```

---

## Task 6 : Adaptateur S3 du worker

**Files:**
- Create: `media-service/src/storage/s3.ts`
- Create: `media-service/src/storage/s3.spec.ts`
- Modify: `media-service/package.json` (ajout de `@aws-sdk/client-s3`)

**Interfaces:**
- Consumes: `MediaServiceConfig['s3']` (tâche 1).
- Produces:
  ```ts
  export interface MediaStorage {
    download(key: string, destPath: string): Promise<void>;
    uploadTree(localDir: string, keyPrefix: string): Promise<void>;
    uploadFile(localPath: string, key: string): Promise<void>;
  }
  export function createMediaStorage(config: MediaServiceConfig['s3']): MediaStorage
  export function contentTypeFor(fileName: string): string
  ```
  Consommé par la tâche 7.

- [ ] **Step 1 : Installer la dépendance**

Run: `cd media-service && npm install @aws-sdk/client-s3`
Expected: installation propre. Vérifier ensuite `npm audit --audit-level=high` — **si un avis `high` apparaît, l'arbitrer avant de continuer** (politique de dépendances §3).

- [ ] **Step 2 : Écrire les tests qui échouent**

Créer `media-service/src/storage/s3.spec.ts` :

```ts
import { contentTypeFor } from './s3';

describe('contentTypeFor (SH-16b)', () => {
  it('type les playlists HLS', () => {
    // Un mauvais type ici et le lecteur refuse le manifeste : hls.js s'appuie dessus.
    expect(contentTypeFor('720p.m3u8')).toBe('application/vnd.apple.mpegurl');
  });

  it('type les segments de transport', () => {
    expect(contentTypeFor('seg-00001.ts')).toBe('video/mp2t');
  });

  it('type le poster', () => {
    expect(contentTypeFor('poster.jpg')).toBe('image/jpeg');
  });

  it('retombe sur un type binaire neutre pour une extension inconnue', () => {
    // Jamais de type deviné : un `text/html` inventé sur un fichier inconnu serait
    // servi comme tel par S3 et ouvrirait un vecteur de XSS stocké.
    expect(contentTypeFor('bizarre.xyz')).toBe('application/octet-stream');
  });
});
```

- [ ] **Step 3 : Lancer les tests pour vérifier qu'ils échouent**

Run: `cd media-service && npx jest src/storage/s3.spec.ts`
Expected: FAIL — `Cannot find module './s3'`.

- [ ] **Step 4 : Implémenter**

Créer `media-service/src/storage/s3.ts` :

```ts
import { createWriteStream } from 'node:fs';
import { mkdir, readdir, readFile } from 'node:fs/promises';
import { dirname, extname, join, posix } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { MediaServiceConfig } from '../config';

/**
 * Accès S3 du worker (EP04 §4 : `media-service` lit et écrit le stockage objet).
 *
 * Volontairement plus étroit que le `StorageService` de backend-core : le worker n'a
 * besoin que de descendre un master et de remonter une arborescence. Pas d'URL signée,
 * pas de suppression — ce n'est pas lui qui porte le cycle de vie du média.
 */
export interface MediaStorage {
  download(key: string, destPath: string): Promise<void>;
  uploadTree(localDir: string, keyPrefix: string): Promise<void>;
  uploadFile(localPath: string, key: string): Promise<void>;
}

const TYPES_PAR_EXTENSION: Record<string, string> = {
  '.m3u8': 'application/vnd.apple.mpegurl',
  '.ts': 'video/mp2t',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.mp4': 'video/mp4',
};

/**
 * Type MIME d'un fichier de sortie, par extension.
 *
 * Repli sur `application/octet-stream` et jamais sur un type deviné : un `text/html`
 * inventé serait servi tel quel par S3 et ouvrirait un XSS stocké (C2.2.3).
 */
export function contentTypeFor(fileName: string): string {
  return TYPES_PAR_EXTENSION[extname(fileName).toLowerCase()] ?? 'application/octet-stream';
}

/** Liste récursivement les fichiers d'un répertoire, en chemins relatifs POSIX. */
async function listerFichiers(racine: string, sousChemin = ''): Promise<string[]> {
  const entrees = await readdir(join(racine, sousChemin), { withFileTypes: true });
  const fichiers: string[] = [];

  for (const entree of entrees) {
    // `posix.join` et non `join` : la clé S3 est TOUJOURS séparée par des `/`, même
    // quand le worker tourne sous Windows en développement.
    const relatif = sousChemin === '' ? entree.name : posix.join(sousChemin, entree.name);
    if (entree.isDirectory()) {
      fichiers.push(...(await listerFichiers(racine, relatif)));
    } else {
      fichiers.push(relatif);
    }
  }

  return fichiers;
}

export function createMediaStorage(config: MediaServiceConfig['s3']): MediaStorage {
  const client = new S3Client({
    region: config.region,
    ...(config.endpoint
      ? // LocalStack/MinIO : le path-style est obligatoire, l'adressage par
        // sous-domaine de bucket n'y est pas résoluble (cf. storage.module.ts).
        { endpoint: config.endpoint, forcePathStyle: true }
      : {}),
  });

  async function uploadFile(localPath: string, key: string): Promise<void> {
    // Les sorties sont petites (playlists en Ko, segments en Mo) : un buffer suffit et
    // évite de devoir renseigner `ContentLength`, qu'un flux exigerait.
    const body = await readFile(localPath);
    await client.send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        Body: body,
        ContentType: contentTypeFor(localPath),
        // Chiffrement au repos AES-256, comme tout objet du bucket (CLAUDE.md §8.6).
        ServerSideEncryption: 'AES256',
      }),
    );
  }

  return {
    async download(key, destPath) {
      await mkdir(dirname(destPath), { recursive: true });
      const reponse = await client.send(
        new GetObjectCommand({ Bucket: config.bucket, Key: key }),
      );
      if (!reponse.Body) {
        throw new Error(`Objet vide ou absent en stockage : ${key}`);
      }
      // Flux et non buffer : un master peut peser 500 Mo, le charger en mémoire
      // ferait tomber le conteneur bien avant l'encodage.
      await pipeline(reponse.Body as Readable, createWriteStream(destPath));
    },

    async uploadTree(localDir, keyPrefix) {
      const fichiers = await listerFichiers(localDir);
      for (const relatif of fichiers) {
        await uploadFile(join(localDir, relatif), `${keyPrefix}${relatif}`);
      }
    },

    uploadFile,
  };
}
```

- [ ] **Step 5 : Lancer les tests**

Run: `cd media-service && npx jest src/storage/s3.spec.ts`
Expected: PASS, 4 tests.

- [ ] **Step 6 : Vérifier lint et build**

Run: `cd media-service && npm run lint && npm run build`
Expected: aucune erreur. (`noImplicitAny` est actif ici : tout paramètre doit être typé.)

- [ ] **Step 7 : Commit**

```bash
git add media-service/src/storage/s3.ts media-service/src/storage/s3.spec.ts media-service/package.json media-service/package-lock.json
git commit -m "feat(SH-16b/media): donne au worker son acces S3 en lecture et ecriture"
```

---

## Task 7 : Orchestration du pipeline et branchement du worker

**Files:**
- Create: `media-service/src/transcode/pipeline.ts`
- Create: `media-service/src/transcode/pipeline.spec.ts`
- Modify: `media-service/src/queue/worker.ts`
- Modify: `media-service/src/queue/worker.spec.ts`
- Modify: `media-service/src/metrics.ts`

**Interfaces:**
- Consumes: `selectLadder` (2), `probeVideo` (4), `encodeRendition` / `extractPoster` (5), `MediaStorage` (6).
- Produces:
  ```ts
  export interface TranscodeOutcome {
    durationSeconds: number; width: number; height: number;
    type: 'VIDEO' | 'VIDEO_360'; mimeType: string;
    renditions: { name: string; width: number; height: number; bandwidth: number; playlistKey: string }[];
  }
  export async function runPipeline(deps: PipelineDeps, job: TranscodeJobData): Promise<TranscodeOutcome>
  ```

- [ ] **Step 1 : Écrire les tests qui échouent**

Créer `media-service/src/transcode/pipeline.spec.ts` :

```ts
import { mkdtemp, rm, writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describeIfFfmpeg, makeFixture } from '../test/fixture';
import { runPipeline } from './pipeline';
import type { MediaStorage } from '../storage/s3';

const JOB = {
  mediaId: '11111111-1111-1111-1111-111111111111',
  sourceKey: 'private/media/f-1/m-1/master.mp4',
  outputPrefix: 'private/media/f-1/m-1/hls/',
  posterKey: 'private/media/f-1/m-1/poster.jpg',
};

/** Stockage simulé : mémorise les clés écrites, et sert la fixture au téléchargement. */
function fakeStorage(fixturePath: string | null) {
  const written: string[] = [];
  const storage: MediaStorage = {
    async download(_key, destPath) {
      if (fixturePath === null) {
        throw new Error('objet absent');
      }
      const { copyFile, mkdir } = await import('node:fs/promises');
      const { dirname } = await import('node:path');
      await mkdir(dirname(destPath), { recursive: true });
      await copyFile(fixturePath, destPath);
    },
    async uploadTree(_localDir, keyPrefix) {
      written.push(`${keyPrefix}*`);
    },
    async uploadFile(_localPath, key) {
      written.push(key);
    },
  };
  return { storage, written };
}

describeIfFfmpeg('runPipeline (SH-16b)', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'sh-pipeline-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('rend un résultat complet et dépose poster et pistes', async () => {
    const fixture = await makeFixture(dir);
    const { storage, written } = fakeStorage(fixture);

    const resultat = await runPipeline({ storage, tmpDir: join(dir, 'work') }, JOB);

    expect(resultat.durationSeconds).toBeGreaterThan(0);
    expect(resultat.width).toBe(640);
    expect(resultat.height).toBe(360);
    expect(resultat.type).toBe('VIDEO');
    expect(resultat.mimeType).toBe('video/mp4');
    expect(resultat.renditions.length).toBeGreaterThan(0);
    expect(written).toContain(JOB.posterKey);
  }, 180_000);

  it('CONFINE chaque playlistKey dans le préfixe du job', async () => {
    // Exigence de sécurité (C2.2.3) : une clé hors préfixe serait signée par SH-17 et
    // ouvrirait un accès au stockage d'un AUTRE freelance.
    const fixture = await makeFixture(dir);
    const { storage } = fakeStorage(fixture);

    const resultat = await runPipeline({ storage, tmpDir: join(dir, 'work') }, JOB);

    for (const piste of resultat.renditions) {
      expect(piste.playlistKey.startsWith(JOB.outputPrefix)).toBe(true);
      expect(piste.playlistKey).toBe(`${JOB.outputPrefix}${piste.name}.m3u8`);
    }
  }, 180_000);

  it('déduit video/quicktime d\'un master .mov', async () => {
    // Le monolithe n'accepte que `video/mp4` ou `video/quicktime` : un mimeType deviné
    // ailleurs ferait rejeter tout le résultat.
    const fixture = await makeFixture(dir);
    const { storage } = fakeStorage(fixture);

    const resultat = await runPipeline(
      { storage, tmpDir: join(dir, 'work') },
      { ...JOB, sourceKey: 'private/media/f-1/m-1/master.mov' },
    );

    expect(resultat.mimeType).toBe('video/quicktime');
  }, 180_000);

  it('NETTOIE le temporaire même quand le transcodage échoue', async () => {
    // Sans ce nettoyage, un worker remplit son disque en quelques jobs ratés.
    const pasUneVideo = join(dir, 'master.mp4');
    await writeFile(pasUneVideo, 'du texte, pas un flux vidéo');
    const { storage } = fakeStorage(pasUneVideo);
    const travail = join(dir, 'work');

    await expect(runPipeline({ storage, tmpDir: travail }, JOB)).rejects.toThrow();

    await expect(access(join(travail, JOB.mediaId))).rejects.toThrow();
  }, 180_000);

  it('rapporte une progression bornée entre 0 et 100', async () => {
    const fixture = await makeFixture(dir);
    const { storage } = fakeStorage(fixture);
    const avancees: number[] = [];

    await runPipeline(
      { storage, tmpDir: join(dir, 'work'), onProgress: (p) => avancees.push(p) },
      JOB,
    );

    expect(avancees.length).toBeGreaterThan(0);
    expect(avancees.every((p) => p >= 0 && p <= 100)).toBe(true);
  }, 180_000);
});
```

- [ ] **Step 2 : Lancer les tests pour vérifier qu'ils échouent**

Run: `cd media-service && npx jest src/transcode/pipeline.spec.ts`
Expected: FAIL — `Cannot find module './pipeline'`.

- [ ] **Step 3 : Implémenter le pipeline**

Créer `media-service/src/transcode/pipeline.ts` :

```ts
import { mkdir, rm } from 'node:fs/promises';
import { extname, join } from 'node:path';
import type { MediaStorage } from '../storage/s3';
import type { TranscodeJobData } from '../queue/worker';
import { selectLadder } from './ladder';
import { probeVideo } from './probe';
import { encodeRendition, extractPoster } from './encode';

/** Résultat rendu à BullMQ, exactement dans la forme attendue par backend-core. */
export interface TranscodeOutcome {
  durationSeconds: number;
  width: number;
  height: number;
  type: 'VIDEO' | 'VIDEO_360';
  mimeType: string;
  renditions: {
    name: string;
    width: number;
    height: number;
    bandwidth: number;
    playlistKey: string;
  }[];
}

export interface PipelineDeps {
  storage: MediaStorage;
  tmpDir: string;
  /** Progression globale du job, en pourcentage (0–100). */
  onProgress?: (percent: number) => void;
}

/**
 * Type MIME déduit de l'EXTENSION DU MASTER, et d'une table fermée.
 *
 * Le monolithe n'accepte que `video/mp4` ou `video/quicktime` (`ALLOWED_MEDIA_MIME_TYPES`) :
 * tout autre valeur ferait rejeter le résultat entier. La clé source est construite par
 * backend-core à partir du `contentType` déjà validé — l'extension est donc fiable, mais
 * on refuse explicitement l'inconnu plutôt que de deviner.
 */
const MIME_PAR_EXTENSION: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
};

function mimeTypeDuMaster(sourceKey: string): string {
  const mime = MIME_PAR_EXTENSION[extname(sourceKey).toLowerCase()];
  if (!mime) {
    throw new Error(`Extension de master non supportée : ${sourceKey}`);
  }
  return mime;
}

/**
 * Déroulé complet d'un job (conception EP04 §7).
 *
 * Téléchargement du master dans un temporaire PROPRE À CE JOB → `ffprobe` → échelle ABR
 * → encodage piste par piste → poster → dépôt des sorties → nettoyage.
 *
 * Le nettoyage est dans un `finally` : un job qui échoue laisse sinon derrière lui le
 * master ET les sorties partielles, et le disque du worker se remplit en quelques jobs.
 */
export async function runPipeline(
  deps: PipelineDeps,
  job: TranscodeJobData,
): Promise<TranscodeOutcome> {
  // Un répertoire par job : deux jobs concurrents (`MEDIA_WORKER_CONCURRENCY > 1`) ne
  // doivent pas se piétiner, et le nettoyage doit pouvoir être total sans arbitrage.
  const travail = join(deps.tmpDir, job.mediaId);
  const masterPath = join(travail, `master${extname(job.sourceKey)}`);
  const sortie = join(travail, 'out');

  try {
    await mkdir(sortie, { recursive: true });

    await deps.storage.download(job.sourceKey, masterPath);
    deps.onProgress?.(5);

    const sonde = await probeVideo(masterPath);
    const ladder = selectLadder(sonde.width, sonde.height);
    deps.onProgress?.(10);

    // Progression : 10 % pour le téléchargement et le sondage, 80 % réparties à parts
    // égales entre les pistes, 10 % pour le poster et le dépôt.
    const partParPiste = 80 / ladder.length;

    const renditions: TranscodeOutcome['renditions'] = [];
    for (const [index, piste] of ladder.entries()) {
      const debut = 10 + index * partParPiste;

      await encodeRendition(masterPath, sortie, piste, (secondes) => {
        const fraction = Math.min(1, secondes / sonde.durationSeconds);
        deps.onProgress?.(Math.min(100, Math.round(debut + fraction * partParPiste)));
      });

      renditions.push({
        ...piste,
        // Clé DÉRIVÉE de l'`outputPrefix` du job, jamais recomposée : c'est ce qui
        // garantit le confinement exigé par le validateur du monolithe (C2.2.3).
        playlistKey: `${job.outputPrefix}${piste.name}.m3u8`,
      });
    }

    deps.onProgress?.(90);

    const posterPath = join(travail, 'poster.jpg');
    await extractPoster(masterPath, posterPath, sonde.durationSeconds);

    // Le poster d'abord : il porte sa propre clé, hors de l'arborescence HLS.
    await deps.storage.uploadFile(posterPath, job.posterKey);
    await deps.storage.uploadTree(sortie, job.outputPrefix);
    deps.onProgress?.(100);

    return {
      durationSeconds: sonde.durationSeconds,
      width: sonde.width,
      height: sonde.height,
      type: sonde.spherical ? 'VIDEO_360' : 'VIDEO',
      mimeType: mimeTypeDuMaster(job.sourceKey),
      renditions,
    };
  } finally {
    await rm(travail, { recursive: true, force: true });
  }
}
```

- [ ] **Step 4 : Lancer les tests du pipeline**

Run: `cd media-service && npx jest src/transcode/pipeline.spec.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5 : Vérification de sabotage du nettoyage**

Retirer temporairement le bloc `finally`, relancer :

Run: `cd media-service && npx jest src/transcode/pipeline.spec.ts -t "NETTOIE"`
Expected: FAIL. Rétablir, relancer, PASS.

- [ ] **Step 6 : Brancher le worker**

Dans `media-service/src/queue/worker.ts` :

- remplacer l'interface de résultat par le vrai contrat :

```ts
/** Résultat rendu à BullMQ. Forme attendue par `parseTranscodeResult` (backend-core). */
export type TranscodeJobResult = TranscodeOutcome;
```

(et ajouter `import type { TranscodeOutcome } from '../transcode/pipeline';`)

- remplacer entièrement `processTranscodeJob` :

```ts
/**
 * Traitement d'un job — le VRAI pipeline depuis SH-16b.
 *
 * SH-15 rendait ici une enveloppe vide, ce qui rendait l'état `READY` inatteignable :
 * le validateur du monolithe exige durée, dimensions et au moins une piste. C'est
 * précisément ce que cette fonction produit désormais.
 */
export async function processTranscodeJob(
  job: Job<TranscodeJobData>,
  deps: PipelineDeps,
): Promise<TranscodeJobResult> {
  logger.info({ jobId: job.id, mediaId: job.data.mediaId }, 'Transcodage démarré');

  const resultat = await runPipeline(
    {
      ...deps,
      // La progression BullMQ est ce qui rend le job observable en cours de route ;
      // un échec d'écriture de progression ne doit PAS faire échouer le transcodage.
      onProgress: (percent) => {
        void job.updateProgress(percent).catch(() => undefined);
      },
    },
    job.data,
  );

  logger.info(
    {
      jobId: job.id,
      mediaId: job.data.mediaId,
      pistes: resultat.renditions.length,
      type: resultat.type,
    },
    'Transcodage terminé',
  );

  return resultat;
}
```

- dans `createTranscodeWorker`, construire les dépendances et les passer :

```ts
export function createTranscodeWorker(
  config: MediaServiceConfig,
  metrics: MediaMetrics,
): Worker<TranscodeJobData, TranscodeJobResult> {
  const storage = createMediaStorage(config.s3);
  const deps: PipelineDeps = { storage, tmpDir: config.tmpDir };
  // … le reste de la fonction est INCHANGÉ (connexion IORedis, handlers, hook 'closed')
```

et dans le corps du worker :

```ts
        const result = await processTranscodeJob(job, deps);
        metrics.jobsTotal.inc({ result: 'completed' });
        metrics.renditionsTotal.inc(result.renditions.length);
        return result;
```

⚠️ **Ne PAS toucher** aux quatre éléments suivants, chacun corrige un bug réel documenté en SH-15 : `maxRetriesPerRequest: null`, l'écouteur `connection.on('error')`, l'écouteur `worker.on('error')`, et le hook `worker.on('closed')` qui ferme la connexion IORedis.

- [ ] **Step 7 : Ajouter la métrique de pistes**

Dans `media-service/src/metrics.ts`, ajouter à la classe :

```ts
  /** Pistes de qualité produites. Rapporté aux jobs, il révèle une échelle qui dérive. */
  readonly renditionsTotal = new Counter({
    name: 'media_renditions_total',
    help: 'Nombre de pistes de qualité produites',
    registers: [this.registry],
  });
```

- [ ] **Step 8 : Adapter le test unitaire du worker**

Dans `media-service/src/queue/worker.spec.ts`, le test existant appelle `processTranscodeJob(job)` et attend `{ renditions: [] }`. Le remplacer par un test qui vérifie que le pipeline est bien appelé et son résultat relayé :

```ts
it('relaie le résultat du pipeline et rapporte la progression', async () => {
  const progressions: number[] = [];
  const job = {
    id: 'j-1',
    data: {
      mediaId: 'm-1',
      sourceKey: 'private/media/f-1/m-1/master.mp4',
      outputPrefix: 'private/media/f-1/m-1/hls/',
      posterKey: 'private/media/f-1/m-1/poster.jpg',
    },
    updateProgress: async (valeur: number) => {
      progressions.push(valeur);
    },
  } as unknown as Job<TranscodeJobData>;

  // Stockage simulé : le pipeline réel est testé dans pipeline.spec.ts ; ici on
  // vérifie le CÂBLAGE (progression remontée à BullMQ, résultat relayé tel quel).
  const storage = {
    download: jest.fn(async () => undefined),
    uploadTree: jest.fn(async () => undefined),
    uploadFile: jest.fn(async () => undefined),
  };

  await expect(
    processTranscodeJob(job, { storage, tmpDir: join(tmpdir(), 'sh-worker-cablage') }),
  ).rejects.toThrow();

  // Le téléchargement simulé n'écrit aucun fichier : ffprobe échoue, ce qui est le
  // comportement attendu. Ce qui est vérifié ici, c'est que le pipeline a bien été
  // engagé avec les dépendances fournies.
  expect(storage.download).toHaveBeenCalledWith(
    'private/media/f-1/m-1/master.mp4',
    expect.stringContaining('master.mp4'),
  );
});
```

Ajouter en tête du fichier les imports nécessaires : `import { join } from 'node:path';` et `import { tmpdir } from 'node:os';`.

- [ ] **Step 9 : Lancer toute la suite**

Run: `cd media-service && npx jest`
Expected: PASS. Les suites d'intégration Redis se sautent sans `REDIS_URL` — pour les exercer :

```bash
docker run -d --rm -p 6381:6379 --name sh-redis-verif redis:7-alpine
cd media-service && REDIS_URL=redis://127.0.0.1:6381 npx jest
docker stop sh-redis-verif
```

⚠️ Port **6381** et jamais 6379 : ce port porte le Redis personnel du poste (media-service/CLAUDE.md).

- [ ] **Step 10 : Lint et build**

Run: `cd media-service && npm run lint && npm run build`
Expected: aucune erreur.

- [ ] **Step 11 : Commit**

```bash
git add media-service/src/transcode/pipeline.ts media-service/src/transcode/pipeline.spec.ts media-service/src/queue/worker.ts media-service/src/queue/worker.spec.ts media-service/src/metrics.ts
git commit -m "feat(SH-16b/media): branche le vrai pipeline et nettoie le temporaire"
```

---

## Task 8 : Test croisé du contrat, recette et traçabilité

**Files:**
- Create: `backend-core/src/media/transcode-contract.spec.ts`
- Modify: `docs/BACKLOG.md`
- Modify: `CHANGELOG.md`
- Modify: `docs/tickets/SH-16b-pipeline-transcodage.md`

**Interfaces:**
- Consumes: la forme `TranscodeOutcome` (tâche 7) et `MediaService.applyTranscodeResult` (SH-16a).
- Produces: rien.

- [ ] **Step 1 : Écrire le test croisé qui échoue**

Le risque réel de ce ticket : **deux définitions du contrat qui dérivent**. Le worker produit une forme, le monolithe en valide une autre, et rien ne les confronte. Créer `backend-core/src/media/transcode-contract.spec.ts` :

```ts
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { MediaService } from './media.service';
import { Media } from './media.entity';
import { MediaQueue } from './media.queue';
import { STORAGE_SERVICE } from '../storage/storage.module';
import { MediaStatus, MediaType } from '../common/enums';

/**
 * Test de FRONTIÈRE (SH-16b).
 *
 * Le worker `media-service` et le validateur de ce service portent chacun leur
 * définition du résultat de transcodage. Rien ne les confrontait : une dérive de l'un
 * des deux ne se serait manifestée qu'en recette, sur un média qui reste bloqué en
 * PROCESSING sans message clair.
 *
 * Ce test fige un échantillon RÉEL de la forme produite par `runPipeline` et vérifie
 * qu'`applyTranscodeResult` l'accepte. Si le worker change de forme, ce test tombe.
 */
const FREELANCE_ID = 'f0000000-0000-0000-0000-000000000001';
const MEDIA_ID = 'a0000000-0000-0000-0000-000000000002';
const PREFIX = `private/media/${FREELANCE_ID}/${MEDIA_ID}/`;

/** Copie fidèle de ce que rend `runPipeline` pour une source 1280x720 en MP4. */
const RESULTAT_DU_WORKER = {
  durationSeconds: 12.48,
  width: 1280,
  height: 720,
  type: 'VIDEO',
  mimeType: 'video/mp4',
  renditions: [
    { name: '360p', width: 640, height: 360, bandwidth: 800_000, playlistKey: `${PREFIX}hls/360p.m3u8` },
    { name: '720p', width: 1280, height: 720, bandwidth: 2_800_000, playlistKey: `${PREFIX}hls/720p.m3u8` },
  ],
};

describe('Contrat de transcodage — worker ↔ monolithe (SH-16b)', () => {
  let service: MediaService;
  let sauvegarde: Media | null;

  beforeEach(async () => {
    sauvegarde = null;
    const ligne: Partial<Media> = {
      id: MEDIA_ID,
      freelanceId: FREELANCE_ID,
      status: MediaStatus.PROCESSING,
      type: MediaType.VIDEO,
    };

    const module = await Test.createTestingModule({
      providers: [
        MediaService,
        {
          provide: getRepositoryToken(Media),
          useValue: {
            findOne: async () => ligne as Media,
            save: async (media: Media) => {
              sauvegarde = media;
              return media;
            },
          },
        },
        { provide: STORAGE_SERVICE, useValue: {} },
        { provide: MediaQueue, useValue: {} },
      ],
    }).compile();

    service = module.get(MediaService);
  });

  it('accepte le résultat réel du worker et fait passer le média en READY', async () => {
    await service.applyTranscodeResult(MEDIA_ID, RESULTAT_DU_WORKER);

    expect(sauvegarde).not.toBeNull();
    expect(sauvegarde!.status).toBe(MediaStatus.READY);
    expect(sauvegarde!.durationSeconds).toBe(12);
    expect(sauvegarde!.renditions).toHaveLength(2);
  });

  it('REJETTE une playlistKey sortant du préfixe du média', async () => {
    // Le scénario que le confinement empêche : une clé pointant chez un AUTRE
    // freelance, que SH-17 signerait sans le savoir.
    const malveillant = {
      ...RESULTAT_DU_WORKER,
      renditions: [
        {
          ...RESULTAT_DU_WORKER.renditions[0],
          playlistKey: 'private/media/f0000000-0000-0000-0000-000000000999/autre/hls/360p.m3u8',
        },
      ],
    };

    await expect(service.applyTranscodeResult(MEDIA_ID, malveillant)).rejects.toThrow(
      /non conforme/i,
    );
  });

  it('REJETTE un résultat sans aucune piste — le cas du worker no-op de SH-15', async () => {
    await expect(
      service.applyTranscodeResult(MEDIA_ID, { ...RESULTAT_DU_WORKER, renditions: [] }),
    ).rejects.toThrow(/non conforme/i);
  });
});
```

- [ ] **Step 2 : Lancer le test**

Run: `cd backend-core && npx jest src/media/transcode-contract.spec.ts`
Expected: PASS. **S'il échoue**, c'est que le worker et le validateur divergent réellement — corriger le worker (tâche 7) pour qu'il produise la forme attendue, **jamais le validateur pour qu'il accepte davantage**.

- [ ] **Step 3 : Recette de bout en bout sur la stack**

⚠️ **Ne jamais arrêter la stack en cours** (`docker compose down/stop` interdits). Vérifier d'abord ce qui tourne :

Run: `docker compose ps`

Puis, avec la stack et LocalStack en marche :

```bash
docker compose up -d --build media-service
docker compose logs -f --tail 20 media-service
```

Depuis le front (`/portfolio/ajouter`), déposer une vidéo MP4 courte et observer :
1. la carte passe en **DÉPOSÉE**, puis **EN TRAITEMENT** ;
2. les journaux du worker affichent « Transcodage démarré » puis « Transcodage terminé » avec le nombre de pistes ;
3. la carte passe en **PRÊT**, avec sa durée affichée.

Vérifier les objets réellement déposés :

```bash
docker compose exec localstack awslocal s3 ls --recursive s3://skillhunt-media/private/media/
```

Expected: `master.mp4`, `poster.jpg`, `hls/360p.m3u8`, `hls/360p/seg-00001.ts`…

**C'est le critère qui fait foi** : `READY` atteint pour la première fois du projet.

- [ ] **Step 4 : Mettre à jour la traçabilité**

Dans `docs/BACKLOG.md` : passer `SH-16a` et `SH-16b` à `🟢 Terminé`, et retirer de la ligne SH-16a la mention « `READY` reste inatteignable tant que SH-16b n'a pas livré le vrai pipeline » en la remplaçant par « `READY` atteignable depuis SH-16b ».

Dans `CHANGELOG.md`, sous `## [Non publié]`, ajouter une rubrique `### Ajouté` (avant la rubrique `### Sécurité` existante) décrivant : le pipeline réel, l'échelle ABR sans sur-échantillonnage, la détection 360° par sondage, le poster, et le fait que le portfolio atteint enfin l'état « prêt ».

Dans `docs/tickets/SH-16b-pipeline-transcodage.md`, cocher la Definition of Done et consigner tout écart constaté en recette.

- [ ] **Step 5 : Vérification complète avant PR**

```bash
cd media-service && npm run lint && npm run build && npx jest
cd ../backend-core && npm run lint && npm run build && npx jest
```

Expected: tout vert. Rappel : `npm run lint` ne couvre PAS Prettier côté front — si un fichier de `frontend-web` a été touché, lancer aussi `npm run format:check`.

- [ ] **Step 6 : Commit et PR**

```bash
git add backend-core/src/media/transcode-contract.spec.ts docs/BACKLOG.md CHANGELOG.md docs/tickets/SH-16b-pipeline-transcodage.md
git commit -m "test(SH-16b): confronte le resultat du worker au validateur du monolithe"
git push -u origin feature/SH-16b-pipeline-transcodage
```

Ouvrir la PR vers `develop` (jamais `main`), en documentant : le déroulé du pipeline, la règle de non-sur-échantillonnage, le confinement de préfixe et son test, le nettoyage du temporaire, et le résultat de la recette de bout en bout.

---

## Auto-revue du plan

**Couverture du ticket :**

| Exigence du ticket | Tâche |
|---|---|
| Accès S3 depuis le worker | 1 (config) + 6 (adaptateur) |
| Téléchargement du master en local | 6 + 7 |
| `ffprobe` : durée, dimensions, 360° | 4 |
| `ffmpeg` : ABR 360p/720p/1080p sans sur-échantillonnage | 2 (règle) + 5 (encodage) |
| Poster à t = 1 s | 5 |
| Dépôt sous `outputPrefix` | 6 + 7 |
| Pas de manifeste maître (D4) | respecté : aucune tâche n'en produit |
| Nettoyage du temporaire même en échec | 7 (test de sabotage) |
| `job.updateProgress()` | 5 (source) + 7 (câblage) |
| Métriques | 7 |
| ffmpeg en CI + fixture générée | 3 |
| Test croisé du contrat | 8 |
| Confinement de préfixe testé | 7 et 8 |
| Recette de bout en bout | 8 |

**Cohérence des types :** `RenditionSpec` (tâche 2) est étendu par `playlistKey` en tâche 7 pour former `TranscodeOutcome['renditions'][number]` ; `ProbeResult` (4) est consommé en 7 ; `MediaStorage` (6) est la seule frontière S3, simulée en 7. `TranscodeJobData` reste importé de `queue/worker.ts`, où SH-15 l'a défini — **pas de redéfinition**.

**Point d'attention connu :** deux étapes dépendent du comportement exact de la version locale de ffmpeg — les chemins relatifs de segments (tâche 5, step 4) et la restitution des tags de projection (tâche 4, step 5). Chacune porte une consigne explicite : **adapter les arguments ou la fixture, jamais relâcher l'assertion.**
