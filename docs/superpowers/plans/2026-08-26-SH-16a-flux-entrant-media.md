# SH-16a — Flux entrant du média (API d'upload) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un freelance déclare une vidéo, reçoit une URL PUT signée, dépose son fichier directement sur S3, confirme le dépôt — et un job de transcodage est enfilé puis son résultat écrit en base.

**Architecture:** Aucun octet vidéo ne traverse NestJS (décision D1). `backend-core` délivre une URL PUT présignée après contrôle RBAC et quota, vérifie le dépôt réel par `HeadObject`, puis enfile un job BullMQ. Un écouteur `QueueEvents` dans le monolithe transcrit l'issue du job dans `user_media` : PostgreSQL reste la propriété exclusive de `backend-core` (décision D7). Le worker de SH-15 reste un no-op — c'est **SH-16b** qui le remplacera par `ffprobe`/`ffmpeg`.

**Tech Stack:** NestJS 11, TypeORM, PostgreSQL, BullMQ 5, ioredis 5, `@aws-sdk/client-s3` v3 + `s3-request-presigner`, LocalStack S3, `@nestjs/schedule`, Jest 30.

**Spec de référence :** [`docs/superpowers/specs/2026-08-24-EP04-media-portfolio-design.md`](../specs/2026-08-24-EP04-media-portfolio-design.md) — §5 (modèle de données), §5.5 (port élargi), §5.6 (variables), §6 (APIs), §9 (cas limites & sécurité).

## Global Constraints

- **Langue** : commentaires et messages **en français**, identifiants **en anglais** (CLAUDE.md §7).
- **Traçabilité RNCP** : référencer la compétence en commentaire quand un bloc l'illustre. SH-16a vise **C2.2.3** (validation, anti-injection, Signed URLs), **C2.2.2** (tests, étanchéité RBAC), **C2.4.1** (Swagger).
- **Route versionnée** : `api/v1/media`. **Tout endpoint documenté Swagger** (`@ApiTags`, `@ApiOperation`, `@ApiResponse`).
- **Toute entrée validée** par un DTO `class-validator` — le `ValidationPipe` global est en `whitelist + forbidNonWhitelisted + transform`.
- **Aucune requête brute** : ORM uniquement (CLAUDE.md §8.2).
- **Aucun secret en dur** ; toute variable nouvelle va dans `.env.example` **et** les deux fichiers compose.
- **Aucune clé de stockage interne ne sort de l'API** : `PublicMedia` exclut `sourceKey`, `posterKey`, `hlsPrefix` (calque de `PublicCertification` qui exclut `s3Key`).
- **Toute connexion Redis créée doit porter un écouteur `error`.** Leçon de la revue de SH-15 : sans écouteur, un incident Redis tue le process sur un « unhandled 'error' event » au lieu de le laisser se diagnostiquer.
- **Injection de dépendances Nest systématique** ; erreurs métier via les exceptions Nest.
- **Tests** : `*.spec.ts` à côté du code, `testRegex: .*\.spec\.ts$`, `rootDir: src`. Les tests exigeant Redis portent la garde `process.env.REDIS_URL ? describe : describe.skip`.
- **Redis en local** : conteneur éphémère sur le port hôte **6381** (6379 = Redis personnel hors projet, 6380 = service `redis` du compose projet). **Jamais de `FLUSHDB`.**
- **Branche** : `feature/SH-16a-flux-entrant-media`, créée **depuis `develop`** (CLAUDE.md §11). PR ciblant `develop`.
- **Commits** : Conventional Commits, scope `(SH-16a/media)`.
- **Hors périmètre**, ne pas anticiper : `ffprobe`/`ffmpeg` réels, ffmpeg en CI, génération de manifeste HLS, poster, `GET /media/freelance/:id`, `DELETE /media/:id`, front. Ce sont **SH-16b** et **SH-17**.

---

## File Structure

**Créés — `backend-core/src/media/`**

| Fichier | Responsabilité |
|---|---|
| `media.entity.ts` | Entité TypeORM `user_media` |
| `media.service.ts` | Cycle de vie : création DRAFT, confirmation, listing, mise à jour |
| `media.controller.ts` | Routes `api/v1/media` + Swagger |
| `media.queue.ts` | Producteur BullMQ (`MediaQueue`) + contrat de job partagé |
| `media.listener.ts` | Écouteur `QueueEvents` : issue du job → `user_media` |
| `media.sweeper.ts` | Balayage des `DRAFT` orphelines |
| `media.module.ts` | Câblage du module |
| `dto/create-media.dto.ts`, `dto/update-media.dto.ts`, `dto/query-media.dto.ts` | Validation des entrées |
| `*.spec.ts` | Un spec par unité |

**Modifiés**

| Fichier | Modification |
|---|---|
| `backend-core/src/storage/storage.service.ts` | Port : +4 méthodes, +`StoredObjectHead` |
| `backend-core/src/storage/s3-storage.service.ts` | Implémentation + client de **présignature** dédié |
| `backend-core/src/storage/fake-storage.service.ts` | Implémentation mémoire des 4 méthodes |
| `backend-core/src/storage/storage.module.ts` | `buildPublicS3Client()` |
| `backend-core/src/common/enums.ts` | `MediaStatus`, `MediaType` |
| `backend-core/src/database/migrations/<ts>-AddMedia.ts` | **Créé** |
| `backend-core/src/app.module.ts` | `MediaModule` + `ScheduleModule` |
| `backend-core/package.json` | +`bullmq`, +`@nestjs/schedule` |
| `localstack/init/01-bucket.sh` | **Créé** — bucket + chiffrement par défaut + CORS |
| `docker-compose.yml`, `docker-compose.staging.yml`, `.env.example` | Variables §5.6 + montage du script d'init |
| `docs/tickets/SH-16a-flux-entrant-media.md` | **Créé** |
| `docs/BACKLOG.md`, `docs/conception/MLD-skillhunt.puml`, `docs/conception/MCD-skillhunt.mocodo`, `docs/conception/2026-06-28-MCD-MLD-SkillHunt.md` | Mise à jour |

---

## Task 1 : Élargissement du port de stockage

**Files:**
- Modify: `backend-core/src/storage/storage.service.ts`, `backend-core/src/storage/fake-storage.service.ts`, `backend-core/src/storage/s3-storage.service.ts`
- Test: `backend-core/src/storage/storage.spec.ts`, `backend-core/src/storage/s3-storage.service.spec.ts`

**Interfaces:**
- Consumes: le port existant (`put`, `getSignedUrl`, `delete`) et `STORAGE_SERVICE`.
- Produces: `interface StoredObjectHead { sizeBytes: number; contentType: string }` et, sur `StorageService` : `getSignedUploadUrl(key: string, ttlSeconds: number, contentType: string): Promise<string>`, `head(key: string): Promise<StoredObjectHead>`, `get(key: string): Promise<Buffer>`, `deletePrefix(prefix: string): Promise<void>`. Consommés par les Tasks 4, 6, 7, 8.

- [ ] **Step 1 : Écrire les tests qui échouent — `backend-core/src/storage/storage.spec.ts`**

Ajouter à la fin du `describe` existant (ne rien retirer). Ces tests tournent sur `FakeStorageService`, donc ils décrivent le **contrat du port**, pas l'adaptateur.

```ts
  it('getSignedUploadUrl signe un dépôt À VENIR : la clé n\'a pas besoin d\'exister', async () => {
    const url = await storage.getSignedUploadUrl('private/media/f1/m1/master.mp4', 900, 'video/mp4');

    expect(url).toContain('master.mp4');
    // Contrairement à getSignedUrl (lecture), aucune exception : on signe un objet absent.
    await expect(storage.getSignedUrl('private/media/f1/m1/master.mp4', 900)).rejects.toThrow();
  });

  it('head rend la taille et le type RÉELS de l\'objet déposé', async () => {
    await storage.put('private/media/f1/m1/master.mp4', Buffer.alloc(4242), 'video/mp4');

    await expect(storage.head('private/media/f1/m1/master.mp4')).resolves.toEqual({
      sizeBytes: 4242,
      contentType: 'video/mp4',
    });
  });

  it('head rejette NotFound sur une clé absente', async () => {
    await expect(storage.head('jamais-deposee')).rejects.toThrow(NotFoundException);
  });

  it('get restitue le contenu exact de l\'objet', async () => {
    await storage.put('playlist.m3u8', Buffer.from('#EXTM3U'), 'application/vnd.apple.mpegurl');

    await expect(storage.get('playlist.m3u8')).resolves.toEqual(Buffer.from('#EXTM3U'));
  });

  it('get rejette NotFound sur une clé absente', async () => {
    await expect(storage.get('jamais-deposee')).rejects.toThrow(NotFoundException);
  });

  it('deletePrefix purge TOUS les objets du préfixe et eux seuls', async () => {
    await storage.put('private/media/f1/m1/master.mp4', Buffer.from('a'), 'video/mp4');
    await storage.put('private/media/f1/m1/hls/720p.m3u8', Buffer.from('b'), 'application/vnd.apple.mpegurl');
    await storage.put('private/media/f1/m2/master.mp4', Buffer.from('c'), 'video/mp4');

    await storage.deletePrefix('private/media/f1/m1/');

    await expect(storage.head('private/media/f1/m1/master.mp4')).rejects.toThrow(NotFoundException);
    await expect(storage.head('private/media/f1/m1/hls/720p.m3u8')).rejects.toThrow(NotFoundException);
    // Le média voisin n'est pas touché : un préfixe mal borné effacerait le casier entier.
    await expect(storage.head('private/media/f1/m2/master.mp4')).resolves.toBeDefined();
  });

  it('deletePrefix est idempotent sur un préfixe vide', async () => {
    await expect(storage.deletePrefix('prefixe/inexistant/')).resolves.toBeUndefined();
  });
```

- [ ] **Step 2 : Lancer les tests pour vérifier qu'ils échouent**

```bash
cd backend-core && npx jest storage.spec
```

Attendu : ÉCHEC — `storage.getSignedUploadUrl is not a function`.

- [ ] **Step 3 : Étendre le port — `backend-core/src/storage/storage.service.ts`**

Ajouter au-dessus de l'interface :

```ts
/** Métadonnées d'un objet, obtenues sans télécharger son contenu. */
export interface StoredObjectHead {
  sizeBytes: number;
  contentType: string;
}
```

Et à l'intérieur de `interface StorageService`, après `delete` :

```ts
  /**
   * URL **PUT** temporaire : le navigateur dépose l'objet DIRECTEMENT sur S3, sans
   * qu'aucun octet ne traverse l'API (design EP04, décision D1 — un master 4K ne peut
   * pas être bufferisé comme un PDF de 5 Mo).
   *
   * `contentType` entre dans la signature : le client DOIT envoyer exactement cet
   * en-tête `Content-Type`, sinon S3 rejette le dépôt.
   */
  getSignedUploadUrl(key: string, ttlSeconds: number, contentType: string): Promise<string>;

  /**
   * Taille et type MIME **réels** de l'objet (C2.2.3). Une URL PUT signée ne sait pas
   * plafonner la taille : c'est cette lecture, APRÈS dépôt, qui fait foi et démasque
   * une annonce mensongère (design EP04 §9.1).
   * Rejette `NotFoundException` si l'objet n'existe pas.
   */
  head(key: string): Promise<StoredObjectHead>;

  /**
   * Contenu de l'objet. Réservé aux **petits** objets texte — les playlists HLS de
   * SH-17 font quelques Ko. Ne jamais l'utiliser sur un master vidéo.
   */
  get(key: string): Promise<Buffer>;

  /**
   * Supprime tous les objets sous un préfixe. Supprimer un média, c'est supprimer son
   * master, son poster et ses N segments — pas un objet. Idempotent.
   */
  deletePrefix(prefix: string): Promise<void>;
```

- [ ] **Step 4 : Implémenter dans le Fake — `backend-core/src/storage/fake-storage.service.ts`**

Importer `StoredObjectHead` depuis `./storage.service`, puis ajouter à la classe :

```ts
  getSignedUploadUrl(key: string, ttlSeconds: number, contentType: string): Promise<string> {
    // Aucun contrôle d'existence : on signe un dépôt À VENIR, l'objet n'existe pas encore.
    return Promise.resolve(
      `https://fake-storage.local/${encodeURIComponent(key)}` +
        `?upload=1&ttl=${ttlSeconds}&ct=${encodeURIComponent(contentType)}`,
    );
  }

  head(key: string): Promise<StoredObjectHead> {
    const stored = this.store.get(key);
    if (!stored) {
      return Promise.reject(new NotFoundException('Objet de stockage introuvable'));
    }
    return Promise.resolve({ sizeBytes: stored.body.length, contentType: stored.contentType });
  }

  get(key: string): Promise<Buffer> {
    const stored = this.store.get(key);
    if (!stored) {
      return Promise.reject(new NotFoundException('Objet de stockage introuvable'));
    }
    return Promise.resolve(stored.body);
  }

  deletePrefix(prefix: string): Promise<void> {
    for (const key of [...this.store.keys()]) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
      }
    }
    return Promise.resolve();
  }
```

- [ ] **Step 5 : Lancer les tests du port**

```bash
cd backend-core && npx jest storage.spec
```

Attendu : PASS, tous les tests du `describe` (anciens + 7 nouveaux).

- [ ] **Step 6 : Écrire les tests de l'adaptateur S3 — `backend-core/src/storage/s3-storage.service.spec.ts`**

Ajouter les imports nécessaires en tête (`HeadObjectCommand`, `ListObjectsV2Command`, `DeleteObjectsCommand`, `GetObjectCommand`) et ces tests. Le client est mocké : on vérifie **quelle commande** est envoyée, pas le comportement d'AWS.

```ts
  it('head traduit la réponse HeadObject en {sizeBytes, contentType}', async () => {
    const sendSpy = jest
      .spyOn(client, 'send')
      .mockResolvedValue({ ContentLength: 1234, ContentType: 'video/mp4' } as never);

    await expect(service.head('private/media/f1/m1/master.mp4')).resolves.toEqual({
      sizeBytes: 1234,
      contentType: 'video/mp4',
    });
    expect(sendSpy.mock.calls[0][0]).toBeInstanceOf(HeadObjectCommand);
  });

  it('head traduit une 404 S3 en NotFoundException', async () => {
    jest
      .spyOn(client, 'send')
      .mockRejectedValue(Object.assign(new Error('NotFound'), { name: 'NotFound' }) as never);

    await expect(service.head('absente')).rejects.toThrow(NotFoundException);
  });

  it('deletePrefix liste puis supprime par lots, et suit la pagination', async () => {
    const sendSpy = jest
      .spyOn(client, 'send')
      .mockResolvedValueOnce({
        Contents: [{ Key: 'p/a' }],
        IsTruncated: true,
        NextContinuationToken: 'suite',
      } as never)
      .mockResolvedValueOnce({} as never) // DeleteObjects du 1er lot
      .mockResolvedValueOnce({ Contents: [{ Key: 'p/b' }], IsTruncated: false } as never)
      .mockResolvedValueOnce({} as never); // DeleteObjects du 2e lot

    await service.deletePrefix('p/');

    // Une clé oubliée par la pagination, c'est un objet orphelin facturé à vie.
    expect(sendSpy.mock.calls[0][0]).toBeInstanceOf(ListObjectsV2Command);
    expect(sendSpy.mock.calls[1][0]).toBeInstanceOf(DeleteObjectsCommand);
    expect(sendSpy.mock.calls[2][0]).toBeInstanceOf(ListObjectsV2Command);
    expect(sendSpy.mock.calls[3][0]).toBeInstanceOf(DeleteObjectsCommand);
  });

  it('deletePrefix n\'envoie aucune suppression si le préfixe est vide', async () => {
    const sendSpy = jest
      .spyOn(client, 'send')
      .mockResolvedValueOnce({ Contents: [], IsTruncated: false } as never);

    await service.deletePrefix('vide/');

    expect(sendSpy).toHaveBeenCalledTimes(1);
  });

  it('getSignedUploadUrl produit une URL PUT signée portant le type MIME', async () => {
    const url = await service.getSignedUploadUrl('private/media/f1/m1/master.mp4', 900, 'video/mp4');

    expect(url).toContain('X-Amz-Signature');
    expect(url).toContain('X-Amz-Expires=900');
  });
```

- [ ] **Step 7 : Lancer les tests S3 pour vérifier qu'ils échouent**

```bash
cd backend-core && npx jest s3-storage
```

Attendu : ÉCHEC — `service.head is not a function`.

- [ ] **Step 8 : Implémenter l'adaptateur S3 — `backend-core/src/storage/s3-storage.service.ts`**

Remplacer le bloc d'import par :

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { StorageService, StoredObjectHead } from './storage.service';
```

Remplacer le constructeur par :

```ts
  constructor(
    private readonly client: S3Client,
    private readonly bucket: string,
    /**
     * Client dédié à la **signature**. Il porte l'endpoint PUBLIC — celui que le
     * navigateur utilisera. SigV4 couvre l'hôte : signer avec l'endpoint interne
     * (`http://localstack:4566`, un nom de service Docker) produirait une URL que le
     * poste client ne sait même pas résoudre. Par défaut, on réutilise le client
     * principal (cas des tests et d'AWS réel, où les deux endpoints coïncident).
     */
    private readonly presignClient: S3Client = client,
  ) {}
```

Faire pointer la signature de LECTURE existante sur ce client (elle est consommée par le navigateur, exactement comme l'upload) :

```ts
  getSignedUrl(key: string, ttlSeconds: number): Promise<string> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.presignClient, command, { expiresIn: ttlSeconds });
  }
```

> **Défaut latent corrigé au passage.** Jusqu'ici les Signed URLs de lecture (certifications, SH-10) étaient signées avec l'endpoint interne. À travers la stack conteneurisée, le navigateur recevait une URL en `http://localstack:4566/...`, injoignable depuis le poste. Le défaut ne se voyait pas en développement hors conteneur, où les deux endpoints coïncident.

Puis ajouter les quatre méthodes :

```ts
  getSignedUploadUrl(key: string, ttlSeconds: number, contentType: string): Promise<string> {
    // On ne signe QUE le type MIME. Signer aussi `ServerSideEncryption` obligerait le
    // navigateur à envoyer l'en-tête `x-amz-server-side-encryption` — le chiffrement au
    // repos est assuré autrement, par le chiffrement PAR DÉFAUT du bucket (cf. le script
    // d'initialisation LocalStack et, en production, la configuration du bucket).
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });
    return getSignedUrl(this.presignClient, command, { expiresIn: ttlSeconds });
  }

  async head(key: string): Promise<StoredObjectHead> {
    try {
      const response = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return {
        sizeBytes: response.ContentLength ?? 0,
        contentType: response.ContentType ?? 'application/octet-stream',
      };
    } catch (err) {
      throw this.translate(err);
    }
  }

  async get(key: string): Promise<Buffer> {
    try {
      const response = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      const bytes = await response.Body!.transformToByteArray();
      return Buffer.from(bytes);
    } catch (err) {
      throw this.translate(err);
    }
  }

  async deletePrefix(prefix: string): Promise<void> {
    let continuationToken: string | undefined;

    // Boucle de pagination : `ListObjectsV2` plafonne à 1000 clés par réponse. Un média
    // long dépasse ce seuil en segments HLS — s'arrêter au premier lot laisserait des
    // objets orphelins, invisibles et facturés.
    do {
      const listed = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      );

      const objects = (listed.Contents ?? [])
        .map((entry) => entry.Key)
        .filter((key): key is string => Boolean(key))
        .map((Key) => ({ Key }));

      if (objects.length > 0) {
        await this.client.send(
          new DeleteObjectsCommand({
            Bucket: this.bucket,
            Delete: { Objects: objects, Quiet: true },
          }),
        );
      }

      continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;
    } while (continuationToken);
  }

  /** Traduit une absence d'objet côté S3 en exception métier Nest. */
  private translate(err: unknown): Error {
    const name = (err as { name?: string }).name;
    const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    if (name === 'NotFound' || name === 'NoSuchKey' || status === 404) {
      return new NotFoundException('Objet de stockage introuvable');
    }
    return err as Error;
  }
```

- [ ] **Step 9 : Lancer toute la suite du module de stockage**

```bash
cd backend-core && npx jest storage
```

Attendu : PASS. Si un test existant de `getSignedUrl` casse à cause du passage à `presignClient`, c'est attendu : le client par défaut est le même objet, donc la valeur ne change pas — corriger l'assertion seulement si elle référençait `client` explicitement.

- [ ] **Step 10 : Lint et build**

```bash
cd backend-core && npm run lint && npm run build
```

- [ ] **Step 11 : Commit**

```bash
git add backend-core/src/storage/
git commit -m "feat(SH-16a/media): elargit le port de stockage (upload signe, head, get, deletePrefix)"
```

---

## Task 2 : Endpoint public de présignature et bootstrap du bucket

**Files:**
- Modify: `backend-core/src/storage/storage.module.ts`, `docker-compose.yml`, `docker-compose.staging.yml`, `backend-core/.env.example`
- Create: `localstack/init/01-bucket.sh`
- Test: `backend-core/src/storage/storage.module.spec.ts`

**Interfaces:**
- Consumes: `S3StorageService(client, bucket, presignClient)` (Task 1).
- Produces: `buildPublicS3Client(): S3Client`, et la variable d'environnement `AWS_S3_PUBLIC_ENDPOINT`.

- [ ] **Step 1 : Écrire le test qui échoue — `backend-core/src/storage/storage.module.spec.ts`**

Ajouter au `describe` existant :

```ts
  it('buildPublicS3Client signe sur AWS_S3_PUBLIC_ENDPOINT quand il est défini', async () => {
    process.env.AWS_S3_ENDPOINT = 'http://localstack:4566';
    process.env.AWS_S3_PUBLIC_ENDPOINT = 'http://localhost:4566';

    const { buildPublicS3Client } = await import('./storage.module');
    const endpoint = await buildPublicS3Client().config.endpoint!();

    // L'hôte entre dans la signature SigV4 : c'est celui que le NAVIGATEUR utilisera.
    expect(endpoint.hostname).toBe('localhost');
  });

  it('buildPublicS3Client retombe sur AWS_S3_ENDPOINT quand l\'endpoint public est absent', async () => {
    process.env.AWS_S3_ENDPOINT = 'http://localstack:4566';
    delete process.env.AWS_S3_PUBLIC_ENDPOINT;

    const { buildPublicS3Client } = await import('./storage.module');
    const endpoint = await buildPublicS3Client().config.endpoint!();

    expect(endpoint.hostname).toBe('localstack');
  });
```

- [ ] **Step 2 : Lancer le test pour vérifier qu'il échoue**

```bash
cd backend-core && npx jest storage.module
```

Attendu : ÉCHEC — `buildPublicS3Client is not a function`.

- [ ] **Step 3 : Implémenter — `backend-core/src/storage/storage.module.ts`**

Ajouter après `buildS3Client()` :

```ts
/**
 * Construit le client servant **uniquement à signer** les URLs consommées par le
 * navigateur (SH-16a, décision D9).
 *
 * `AWS_S3_ENDPOINT` est un nom de service Docker : le poste client ne sait pas le
 * résoudre. Comme la signature SigV4 couvre l'hôte, on ne peut pas se contenter de
 * réécrire l'URL après coup — il faut signer avec l'hôte final. En production réelle,
 * cette variable vaut le domaine S3/CloudFront et les deux clients coïncident.
 */
export function buildPublicS3Client(): S3Client {
  const endpoint = process.env.AWS_S3_PUBLIC_ENDPOINT ?? process.env.AWS_S3_ENDPOINT;
  return new S3Client({
    region: process.env.AWS_REGION ?? 'eu-west-3',
    ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
  });
}
```

Et changer la factory du provider :

```ts
        return new S3StorageService(buildS3Client(), bucket, buildPublicS3Client());
```

- [ ] **Step 4 : Lancer le test**

```bash
cd backend-core && npx jest storage.module
```

Attendu : PASS.

- [ ] **Step 5 : Créer le script d'initialisation LocalStack — `localstack/init/01-bucket.sh`**

Jusqu'ici le bucket se créait **à la main** (`awslocal s3 mb`, documenté dans `storage/README.md`). Ce script supprime cette étape et ajoute les deux réglages qu'exige l'upload direct.

```sh
#!/bin/sh
# SH-16a — Initialisation du bucket privé (exécuté par LocalStack à chaque démarrage,
# depuis /etc/localstack/init/ready.d/). Idempotent : rejouable sans effet de bord.
set -eu

BUCKET="${AWS_S3_BUCKET:-skillhunt-media}"
REGION="${AWS_DEFAULT_REGION:-eu-west-3}"
# Origines autorisées à déposer : celles de l'application (gateway, puis Vite en dev direct).
ORIGINS="${MEDIA_CORS_ORIGINS:-http://localhost:8088,http://localhost:5173}"

echo "[init] Bucket ${BUCKET} (region ${REGION})"

# `|| true` : le bucket survit aux redémarrages via le volume, sa re-création échoue alors.
awslocal s3api create-bucket \
  --bucket "${BUCKET}" \
  --create-bucket-configuration "LocationConstraint=${REGION}" >/dev/null 2>&1 || true

# Chiffrement AES-256 PAR DÉFAUT du bucket (CLAUDE.md §8.6). C'est ce qui permet de ne
# PAS signer l'en-tête `x-amz-server-side-encryption` dans l'URL PUT : le navigateur n'a
# qu'un `Content-Type` à envoyer, et les objets sont chiffrés au repos malgré tout.
awslocal s3api put-bucket-encryption \
  --bucket "${BUCKET}" \
  --server-side-encryption-configuration \
  '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'

# CORS : sans cette configuration, le PUT direct depuis le navigateur est bloqué par le
# contrôle d'origine — l'upload échouerait alors que l'URL signée est parfaitement valide.
ALLOWED=$(printf '%s' "${ORIGINS}" | awk -F, '{for(i=1;i<=NF;i++) printf "\"%s\"%s", $i, (i<NF?",":"")}')
awslocal s3api put-bucket-cors --bucket "${BUCKET}" --cors-configuration "{
  \"CORSRules\": [{
    \"AllowedOrigins\": [${ALLOWED}],
    \"AllowedMethods\": [\"PUT\", \"GET\", \"HEAD\"],
    \"AllowedHeaders\": [\"*\"],
    \"ExposeHeaders\": [\"ETag\"],
    \"MaxAgeSeconds\": 3000
  }]
}"

echo "[init] Bucket ${BUCKET} pret (chiffrement par defaut + CORS)"
```

- [ ] **Step 6 : Rendre le script exécutable et le déclarer dans `docker-compose.yml`**

```bash
git update-index --add --chmod=+x localstack/init/01-bucket.sh 2>/dev/null || chmod +x localstack/init/01-bucket.sh
```

Dans le service `localstack:`, ajouter la variable de bucket et monter le script :

```yaml
    environment:
      SERVICES: s3
      AWS_DEFAULT_REGION: ${AWS_REGION:-eu-west-3}
      # Lu par le script d'init : dev et staging n'utilisent pas le même bucket.
      AWS_S3_BUCKET: ${AWS_S3_BUCKET:-skillhunt-media}
      MEDIA_CORS_ORIGINS: ${CORS_ORIGIN:-http://localhost:8088,http://localhost:5173}
    volumes:
      - skillhunt_localstack:/var/lib/localstack
      # SH-16a — bucket + chiffrement par défaut + CORS, créés au démarrage.
      - ./localstack/init:/etc/localstack/init/ready.d:ro
```

Dans le service `backend-core:`, ajouter après `AWS_S3_ENDPOINT` :

```yaml
      # Endpoint vu DEPUIS LE NAVIGATEUR : la signature SigV4 couvre l'hôte (D9).
      AWS_S3_PUBLIC_ENDPOINT: ${AWS_S3_PUBLIC_ENDPOINT:-http://localhost:4566}
      MEDIA_MAX_FILE_MB: ${MEDIA_MAX_FILE_MB:-500}
      MEDIA_MAX_PER_FREELANCE: ${MEDIA_MAX_PER_FREELANCE:-20}
      MEDIA_SIGNED_URL_TTL: ${MEDIA_SIGNED_URL_TTL:-900}
      MEDIA_DRAFT_TTL_HOURS: ${MEDIA_DRAFT_TTL_HOURS:-24}
```

- [ ] **Step 7 : Répercuter dans `docker-compose.staging.yml`**

Mêmes ajouts : le bloc `localstack` reçoit `AWS_S3_BUCKET: skillhunt-staging`, `MEDIA_CORS_ORIGINS` et le montage `./localstack/init:/etc/localstack/init/ready.d:ro` ; le bloc `backend-core` reçoit les cinq variables `AWS_S3_PUBLIC_ENDPOINT` / `MEDIA_*`. `AWS_S3_PUBLIC_ENDPOINT` y vaut `${AWS_S3_PUBLIC_ENDPOINT}` sans valeur par défaut : en staging, l'endpoint doit être choisi explicitement, jamais deviné.

- [ ] **Step 8 : Documenter dans `backend-core/.env.example`**

```
# --- Stockage objet (SH-31 / SH-16a) ---
AWS_S3_ENDPOINT=http://localhost:4566
# Endpoint signé pour le NAVIGATEUR. En production : domaine S3/CloudFront réel.
AWS_S3_PUBLIC_ENDPOINT=http://localhost:4566

# --- Médias (SH-16a) ---
MEDIA_MAX_FILE_MB=500
MEDIA_MAX_PER_FREELANCE=20
MEDIA_SIGNED_URL_TTL=900
MEDIA_DRAFT_TTL_HOURS=24
```

- [ ] **Step 9 : Vérifier le bootstrap du bucket pour de vrai**

```bash
docker compose up -d --force-recreate localstack
```

```bash
docker compose exec localstack awslocal s3api get-bucket-cors --bucket skillhunt-media
```

Attendu : la règle CORS avec `PUT`, `GET`, `HEAD`. Puis :

```bash
docker compose exec localstack awslocal s3api get-bucket-encryption --bucket skillhunt-media
```

Attendu : `"SSEAlgorithm": "AES256"`.

> Ne pas lancer `docker compose down` : les services du projet tournent sous `restart: unless-stopped` et constituent l'état normal du poste.

- [ ] **Step 10 : Commit**

```bash
git add backend-core/src/storage/storage.module.ts backend-core/src/storage/storage.module.spec.ts localstack/ docker-compose.yml docker-compose.staging.yml backend-core/.env.example
git commit -m "feat(SH-16a/media): endpoint public de presignature et bootstrap du bucket"
```

---

## Task 3 : Enums, entité `user_media` et migration

**Files:**
- Modify: `backend-core/src/common/enums.ts`
- Create: `backend-core/src/media/media.entity.ts`, `backend-core/src/database/migrations/1719550000000-AddMedia.ts`
- Test: `backend-core/src/media/media.entity.spec.ts`

**Interfaces:**
- Consumes: `User` (`../users/user.entity`).
- Produces: `enum MediaStatus { DRAFT, UPLOADED, PROCESSING, READY, FAILED }`, `enum MediaType { VIDEO, VIDEO_360 }`, et la classe `Media` (table `user_media`) avec les colonnes du §5.2 du spec. Consommés par les Tasks 4 à 8.

- [ ] **Step 1 : Ajouter les enums — `backend-core/src/common/enums.ts`**

```ts
// Cycle de vie d'un média de portfolio (SH-16a, design EP04 §5.3).
export enum MediaStatus {
  DRAFT = 'DRAFT', // ligne créée, URL PUT signée délivrée, dépôt non confirmé
  UPLOADED = 'UPLOADED', // dépôt confirmé et vérifié (head), job enfilé
  PROCESSING = 'PROCESSING', // worker démarré
  READY = 'READY', // HLS + poster disponibles
  FAILED = 'FAILED', // échec définitif après 3 tentatives
}

// Nature du média. Enum plutôt qu'un booléen `is360` : ajouter `IMAGE` plus tard
// (hors périmètre EP04) ne cassera pas la migration.
export enum MediaType {
  VIDEO = 'VIDEO',
  VIDEO_360 = 'VIDEO_360',
}
```

- [ ] **Step 2 : Écrire le test qui échoue — `backend-core/src/media/media.entity.spec.ts`**

```ts
import { getMetadataArgsStorage } from 'typeorm';
import { Media } from './media.entity';

// C2.2.2 — Le schéma est une preuve : on vérifie les points dont dépend l'étanchéité
// (index sur freelanceId) et la file d'attente (index sur status), pas chaque colonne.
describe('entité Media', () => {
  it('cible la table user_media', () => {
    const table = getMetadataArgsStorage().tables.find((t) => t.target === Media);

    expect(table?.name).toBe('user_media');
  });

  it('indexe freelanceId et status', () => {
    const indexed = getMetadataArgsStorage()
      .indices.filter((index) => index.target === Media)
      .map((index) => index.columns);

    expect(JSON.stringify(indexed)).toContain('freelanceId');
    expect(JSON.stringify(indexed)).toContain('status');
  });

  it('déclare renditions en jsonb nullable', () => {
    const column = getMetadataArgsStorage().columns.find(
      (c) => c.target === Media && c.propertyName === 'renditions',
    );

    expect(column?.options.type).toBe('jsonb');
    expect(column?.options.nullable).toBe(true);
  });
});
```

- [ ] **Step 3 : Lancer le test pour vérifier qu'il échoue**

```bash
cd backend-core && npx jest media.entity
```

Attendu : ÉCHEC — `Cannot find module './media.entity'`.

- [ ] **Step 4 : Écrire l'entité — `backend-core/src/media/media.entity.ts`**

```ts
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { MediaStatus, MediaType } from '../common/enums';
import { User } from '../users/user.entity';

/** Une piste de qualité produite par le transcodage (design EP04 §5.2). */
export interface MediaRendition {
  name: string;
  width: number;
  height: number;
  bandwidth: number;
  playlistKey: string;
}

/**
 * Média de portfolio déclaré par un Freelance (SH-16a).
 *
 * Calque des conventions de `certification.entity.ts` : UUID, enums PostgreSQL dédiés,
 * FK indexée en CASCADE, horodatages `timestamptz`. Contrairement à une certification,
 * une vidéo de portfolio a vocation à être VUE : aucune purge RGPD n'est prévue ici.
 */
@Entity('user_media')
export class Media {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ length: 120 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  // Positionné par le worker après sonde de la projection (SH-16b).
  @Column({ type: 'enum', enum: MediaType, default: MediaType.VIDEO })
  type!: MediaType;

  // Indexé : sert la liste du freelance filtrée par statut et le balayage des DRAFT.
  @Index()
  @Column({ type: 'enum', enum: MediaStatus, default: MediaStatus.DRAFT })
  status!: MediaStatus;

  // Clés de stockage INTERNES : jamais exposées par l'API (cf. PublicMedia).
  @Column()
  sourceKey!: string;

  @Column({ type: 'varchar', nullable: true })
  posterKey!: string | null;

  @Column({ type: 'varchar', nullable: true })
  hlsPrefix!: string | null;

  // jsonb plutôt qu'une table fille (décision D8) : ces lignes ne sont jamais
  // interrogées seules, toujours lues avec leur parent pour bâtir le manifeste maître.
  @Column({ type: 'jsonb', nullable: true })
  renditions!: MediaRendition[] | null;

  @Column({ type: 'int', nullable: true })
  durationSeconds!: number | null;

  @Column({ type: 'int', nullable: true })
  width!: number | null;

  @Column({ type: 'int', nullable: true })
  height!: number | null;

  // bigint : une vidéo 4K dépasse la plage d'un int signé.
  @Column({ type: 'bigint', nullable: true })
  sizeBytes!: string | null;

  // Déclaré à la création, CONFIRMÉ par ffprobe au transcodage (SH-16b).
  @Column()
  mimeType!: string;

  // Message court destiné à l'utilisateur. Jamais de pile d'exécution ici.
  @Column({ type: 'varchar', nullable: true })
  errorReason!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  processedAt!: Date | null;

  @Index()
  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'freelanceId' })
  freelance!: User;

  @Column({ type: 'uuid' })
  freelanceId!: string;
}
```

> `sizeBytes` est typé `string` : le driver `pg` restitue les `bigint` en chaîne pour ne pas perdre de précision. Le service convertit à la lecture.

- [ ] **Step 5 : Lancer le test**

```bash
cd backend-core && npx jest media.entity
```

Attendu : PASS — 3 tests.

- [ ] **Step 6 : Écrire la migration — `backend-core/src/database/migrations/1719550000000-AddMedia.ts`**

```ts
import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration SH-16a : table `user_media` (médias de portfolio).
 *
 * Calque de `AddCertifications` : UUID `gen_random_uuid()`, types énumérés DÉDIÉS,
 * FK CASCADE, index sur le statut et sur `freelanceId`. `renditions` en `jsonb`
 * (décision D8) ; `sizeBytes` en `bigint` (un master 4K dépasse la plage d'un `int`).
 */
export class AddMedia1719550000000 implements MigrationInterface {
  name = 'AddMedia1719550000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."media_status_enum" AS ENUM('DRAFT', 'UPLOADED', 'PROCESSING', 'READY', 'FAILED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."media_type_enum" AS ENUM('VIDEO', 'VIDEO_360')`,
    );

    await queryRunner.query(`
      CREATE TABLE "user_media" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "title" character varying(120) NOT NULL,
        "description" text,
        "type" "public"."media_type_enum" NOT NULL DEFAULT 'VIDEO',
        "status" "public"."media_status_enum" NOT NULL DEFAULT 'DRAFT',
        "sourceKey" character varying NOT NULL,
        "posterKey" character varying,
        "hlsPrefix" character varying,
        "renditions" jsonb,
        "durationSeconds" integer,
        "width" integer,
        "height" integer,
        "sizeBytes" bigint,
        "mimeType" character varying NOT NULL,
        "errorReason" character varying,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "processedAt" TIMESTAMP WITH TIME ZONE,
        "freelanceId" uuid NOT NULL,
        CONSTRAINT "PK_user_media_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_media_status" ON "user_media" ("status")`);
    await queryRunner.query(`CREATE INDEX "IDX_media_freelanceId" ON "user_media" ("freelanceId")`);
    await queryRunner.query(
      `ALTER TABLE "user_media" ADD CONSTRAINT "FK_media_freelance" ` +
        `FOREIGN KEY ("freelanceId") REFERENCES "users"("id") ON DELETE CASCADE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user_media" DROP CONSTRAINT "FK_media_freelance"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_media_freelanceId"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_media_status"`);
    await queryRunner.query(`DROP TABLE "user_media"`);
    await queryRunner.query(`DROP TYPE "public"."media_type_enum"`);
    await queryRunner.query(`DROP TYPE "public"."media_status_enum"`);
  }
}
```

- [ ] **Step 7 : Déclarer l'entité dans la source de données**

Dans `backend-core/src/database/data-source.ts`, ajouter `Media` à la liste des entités et `AddMedia1719550000000` à la liste des migrations, en suivant exactement la forme déjà présente pour `Certification`. Vérifier d'abord comment les deux listes sont construites :

```bash
cd backend-core && grep -n "Certification" src/database/data-source.ts
```

- [ ] **Step 8 : Appliquer la migration sur la base de développement**

```bash
cd backend-core && npm run migration:run
```

Attendu : `Migration AddMedia1719550000000 has been executed successfully.`

- [ ] **Step 9 : Vérifier le schéma réel**

```bash
docker compose exec postgres psql -U skillhunt -d skillhunt -c "\d user_media"
```

Attendu : la table, ses deux index, la contrainte FK, et `renditions | jsonb`.

- [ ] **Step 10 : Vérifier que la migration est réversible**

```bash
cd backend-core && npm run migration:revert && npm run migration:run
```

Attendu : `revert` puis `run` sans erreur — une migration qu'on ne sait pas annuler n'est pas déployable.

- [ ] **Step 11 : Commit**

```bash
git add backend-core/src/common/enums.ts backend-core/src/media/media.entity.ts backend-core/src/media/media.entity.spec.ts backend-core/src/database/
git commit -m "feat(SH-16a/media): entite user_media, enums de cycle de vie et migration"
```

---

## Task 4 : Déclaration d'un média et URL PUT signée

**Files:**
- Create: `backend-core/src/media/dto/create-media.dto.ts`, `backend-core/src/media/media.service.ts`, `backend-core/src/media/media.controller.ts`, `backend-core/src/media/media.module.ts`
- Modify: `backend-core/src/app.module.ts`
- Test: `backend-core/src/media/media.service.spec.ts`

**Interfaces:**
- Consumes: `Media` + `MediaStatus`/`MediaType` (Task 3), `STORAGE_SERVICE` + `getSignedUploadUrl` (Task 1), `JwtAuthGuard`/`RolesGuard`/`Roles`/`CurrentUser`/`JwtPayload` (`../auth/guards/jwt-auth.guard`), `UserRole`.
- Produces:
  - `interface PublicMedia` — vue sans aucune clé de stockage.
  - `interface UploadInstructions { url: string; method: 'PUT'; headers: Record<string, string>; expiresIn: number }`
  - `MediaService.createDraft(freelanceId: string, dto: CreateMediaDto): Promise<{ media: PublicMedia; upload: UploadInstructions }>`
  - `MediaService.buildSourceKey(freelanceId: string, mediaId: string, contentType: string): string`
  - Consommés par les Tasks 5 à 8.

- [ ] **Step 1 : Écrire le DTO — `backend-core/src/media/dto/create-media.dto.ts`**

```ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';

/**
 * Types MIME acceptés à la déclaration (C2.2.3 — liste blanche, jamais l'extension).
 * Ce n'est qu'un premier filtre : le contrôle de contenu RÉEL est fait par `ffprobe`
 * dans le worker (SH-16b), seul capable de trancher sur un fichier de 500 Mo qui ne
 * transite jamais par l'API.
 */
export const ALLOWED_MEDIA_MIME_TYPES = ['video/mp4', 'video/quicktime'] as const;

export class CreateMediaDto {
  @ApiProperty({ example: 'Survol de chantier — Toulouse', maxLength: 120 })
  @IsString()
  @IsNotEmpty({ message: 'Le titre est obligatoire' })
  @MaxLength(120, { message: 'Le titre ne peut pas dépasser 120 caractères' })
  title!: string;

  @ApiPropertyOptional({ example: 'Vol DGAC S3, caméra 4K stabilisée.', maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: 'La description ne peut pas dépasser 2000 caractères' })
  description?: string;

  @ApiProperty({ enum: ALLOWED_MEDIA_MIME_TYPES, example: 'video/mp4' })
  @IsIn(ALLOWED_MEDIA_MIME_TYPES, { message: 'Format non supporté : MP4 ou QuickTime attendu' })
  contentType!: string;

  @ApiProperty({ example: 104857600, description: 'Taille annoncée du fichier, en octets' })
  @IsInt({ message: 'La taille annoncée doit être un entier' })
  @Min(1, { message: 'La taille annoncée doit être strictement positive' })
  sizeBytes!: number;
}
```

- [ ] **Step 2 : Écrire les tests qui échouent — `backend-core/src/media/media.service.spec.ts`**

```ts
import { ConflictException, BadRequestException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { MediaService } from './media.service';
import { Media } from './media.entity';
import { MediaStatus } from '../common/enums';
import { FakeStorageService } from '../storage/fake-storage.service';
import { CreateMediaDto } from './dto/create-media.dto';

const FREELANCE = '11111111-1111-1111-1111-111111111111';

// Dépôt en mémoire : suffisant pour le cycle de vie, et sans base de données à démarrer.
function fakeRepo(rows: Media[] = []): Repository<Media> {
  return {
    create: (data: Partial<Media>) => ({ ...data }) as Media,
    save: async (entity: Media) => {
      const index = rows.findIndex((row) => row.id === entity.id);
      if (index >= 0) rows[index] = entity;
      else rows.push(entity);
      return entity;
    },
    findOne: async ({ where }: { where: { id: string } }) =>
      rows.find((row) => row.id === where.id) ?? null,
    count: async () => rows.filter((row) => row.status !== MediaStatus.FAILED).length,
  } as unknown as Repository<Media>;
}

function dto(overrides: Partial<CreateMediaDto> = {}): CreateMediaDto {
  return {
    title: 'Survol de chantier',
    contentType: 'video/mp4',
    sizeBytes: 10_000,
    ...overrides,
  } as CreateMediaDto;
}

describe('MediaService — déclaration', () => {
  let storage: FakeStorageService;

  beforeEach(() => {
    storage = new FakeStorageService();
    process.env.MEDIA_MAX_FILE_MB = '500';
    process.env.MEDIA_MAX_PER_FREELANCE = '20';
    process.env.MEDIA_SIGNED_URL_TTL = '900';
  });

  it('crée une ligne DRAFT et rend une URL PUT signée', async () => {
    const service = new MediaService(fakeRepo(), storage);

    const result = await service.createDraft(FREELANCE, dto());

    expect(result.media.status).toBe(MediaStatus.DRAFT);
    expect(result.upload.method).toBe('PUT');
    expect(result.upload.url).toContain('upload=1');
    expect(result.upload.headers['Content-Type']).toBe('video/mp4');
    expect(result.upload.expiresIn).toBe(900);
  });

  it('n\'expose AUCUNE clé de stockage interne', async () => {
    const service = new MediaService(fakeRepo(), storage);

    const { media } = await service.createDraft(FREELANCE, dto());

    // Contrat à clés EXACTES : une clé S3 qui fuit est une adresse d'objet privé.
    expect(Object.keys(media).sort()).toEqual(
      [
        'createdAt',
        'description',
        'durationSeconds',
        'errorReason',
        'freelanceId',
        'height',
        'id',
        'mimeType',
        'processedAt',
        'renditions',
        'sizeBytes',
        'status',
        'title',
        'type',
        'width',
      ].sort(),
    );
    expect(JSON.stringify(media)).not.toContain('private/media');
  });

  it('range le master sous un préfixe propre au freelance et au média', async () => {
    const service = new MediaService(fakeRepo(), storage);

    const key = service.buildSourceKey(FREELANCE, 'm1', 'video/mp4');

    expect(key).toBe(`private/media/${FREELANCE}/m1/master.mp4`);
  });

  it('choisit l\'extension d\'après le type MIME, jamais d\'après un nom de fichier', async () => {
    const service = new MediaService(fakeRepo(), storage);

    expect(service.buildSourceKey(FREELANCE, 'm1', 'video/quicktime')).toMatch(/master\.mov$/);
  });

  it('refuse une taille annoncée au-delà du plafond', async () => {
    process.env.MEDIA_MAX_FILE_MB = '1';
    const service = new MediaService(fakeRepo(), storage);

    await expect(service.createDraft(FREELANCE, dto({ sizeBytes: 2 * 1024 * 1024 }))).rejects.toThrow(
      BadRequestException,
    );
  });

  it('refuse au-delà du quota de médias', async () => {
    process.env.MEDIA_MAX_PER_FREELANCE = '1';
    const rows = [{ id: 'deja-la', status: MediaStatus.READY } as Media];
    const service = new MediaService(fakeRepo(rows), storage);

    await expect(service.createDraft(FREELANCE, dto())).rejects.toThrow(ConflictException);
  });
});
```

- [ ] **Step 3 : Lancer les tests pour vérifier qu'ils échouent**

```bash
cd backend-core && npx jest media.service
```

Attendu : ÉCHEC — `Cannot find module './media.service'`.

- [ ] **Step 4 : Écrire le service — `backend-core/src/media/media.service.ts`**

```ts
import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { Media, MediaRendition } from './media.entity';
import { MediaStatus, MediaType } from '../common/enums';
import { STORAGE_SERVICE, StorageService } from '../storage/storage.service';
import { CreateMediaDto } from './dto/create-media.dto';

/**
 * Vue publique d'un média. EXCLUT `sourceKey`, `posterKey` et `hlsPrefix` : aucune clé
 * de stockage interne ne sort de l'API (minimisation, comme `PublicCertification`).
 */
export interface PublicMedia {
  id: string;
  freelanceId: string;
  title: string;
  description: string | null;
  type: MediaType;
  status: MediaStatus;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  sizeBytes: number | null;
  mimeType: string;
  renditions: Array<Omit<MediaRendition, 'playlistKey'>> | null;
  errorReason: string | null;
  createdAt: Date;
  processedAt: Date | null;
}

/** Instructions de dépôt rendues au navigateur. */
export interface UploadInstructions {
  url: string;
  method: 'PUT';
  headers: Record<string, string>;
  expiresIn: number;
}

// Extension dérivée du type MIME — jamais d'un nom de fichier fourni par le client (R7).
const EXTENSIONS: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
};

@Injectable()
export class MediaService {
  constructor(
    @InjectRepository(Media)
    private readonly mediaRepo: Repository<Media>,
    @Inject(STORAGE_SERVICE)
    private readonly storage: StorageService,
  ) {}

  /**
   * Déclare un média et délivre son URL de dépôt (C2.2.3).
   *
   * L'identité vient du token, jamais d'un `{id}` client : un freelance ne peut pas
   * déposer dans le casier d'un autre.
   */
  async createDraft(
    freelanceId: string,
    dto: CreateMediaDto,
  ): Promise<{ media: PublicMedia; upload: UploadInstructions }> {
    const maxBytes = this.maxFileMb * 1024 * 1024;
    if (dto.sizeBytes > maxBytes) {
      throw new BadRequestException(`Fichier trop volumineux (maximum ${this.maxFileMb} Mo)`);
    }

    // Le quota ignore les médias FAILED : un échec de transcodage ne doit pas amputer
    // durablement le casier du freelance.
    const used = await this.mediaRepo.count({
      where: { freelanceId, status: Not(MediaStatus.FAILED) },
    });
    if (used >= this.maxPerFreelance) {
      throw new ConflictException(
        `Quota atteint : ${this.maxPerFreelance} médias au maximum. Supprimez-en un avant d'en ajouter.`,
      );
    }

    const id = randomUUID();
    const sourceKey = this.buildSourceKey(freelanceId, id, dto.contentType);

    const media = this.mediaRepo.create({
      id,
      freelanceId,
      title: dto.title,
      description: dto.description ?? null,
      type: MediaType.VIDEO,
      status: MediaStatus.DRAFT,
      sourceKey,
      mimeType: dto.contentType,
    });
    const saved = await this.mediaRepo.save(media);

    const url = await this.storage.getSignedUploadUrl(sourceKey, this.signedUrlTtl, dto.contentType);

    return {
      media: this.toPublic(saved),
      upload: {
        url,
        method: 'PUT',
        // Le type MIME entre dans la signature : le navigateur DOIT renvoyer cet en-tête
        // à l'identique, sinon S3 rejette le dépôt.
        headers: { 'Content-Type': dto.contentType },
        expiresIn: this.signedUrlTtl,
      },
    };
  }

  /** Clé du master. Le préfixe isole chaque média dans le casier de son propriétaire. */
  buildSourceKey(freelanceId: string, mediaId: string, contentType: string): string {
    const extension = EXTENSIONS[contentType] ?? 'bin';
    return `private/media/${freelanceId}/${mediaId}/master.${extension}`;
  }

  /** Préfixe couvrant TOUS les objets d'un média (master, poster, segments). */
  buildMediaPrefix(freelanceId: string, mediaId: string): string {
    return `private/media/${freelanceId}/${mediaId}/`;
  }

  toPublic(media: Media): PublicMedia {
    return {
      id: media.id,
      freelanceId: media.freelanceId,
      title: media.title,
      description: media.description,
      type: media.type,
      status: media.status,
      durationSeconds: media.durationSeconds,
      width: media.width,
      height: media.height,
      // `bigint` remonte en chaîne depuis `pg` : on rétablit un nombre pour l'API.
      sizeBytes: media.sizeBytes === null ? null : Number(media.sizeBytes),
      mimeType: media.mimeType,
      // `playlistKey` est une clé de stockage : elle est retirée de la vue publique.
      renditions:
        media.renditions?.map(({ name, width, height, bandwidth }) => ({
          name,
          width,
          height,
          bandwidth,
        })) ?? null,
      errorReason: media.errorReason,
      createdAt: media.createdAt,
      processedAt: media.processedAt,
    };
  }

  private get maxFileMb(): number {
    return Number(process.env.MEDIA_MAX_FILE_MB ?? 500);
  }

  private get maxPerFreelance(): number {
    return Number(process.env.MEDIA_MAX_PER_FREELANCE ?? 20);
  }

  private get signedUrlTtl(): number {
    return Number(process.env.MEDIA_SIGNED_URL_TTL ?? 900);
  }
}
```

- [ ] **Step 5 : Lancer les tests**

```bash
cd backend-core && npx jest media.service
```

Attendu : PASS — 6 tests.

- [ ] **Step 6 : Écrire le contrôleur — `backend-core/src/media/media.controller.ts`**

```ts
import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
} from '@nestjs/swagger';
import { MediaService } from './media.service';
import { CreateMediaDto } from './dto/create-media.dto';
import {
  JwtAuthGuard,
  RolesGuard,
  Roles,
  CurrentUser,
  JwtPayload,
} from '../auth/guards/jwt-auth.guard';
import { UserRole } from '../common/enums';

@ApiTags('🎬 Médias')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token JWT manquant, invalide ou expiré (401)' })
@ApiForbiddenResponse({ description: 'Rôle insuffisant ou accès à une ressource d\'autrui (403)' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('api/v1/media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post()
  @Roles(UserRole.FREELANCE)
  @ApiOperation({
    summary: 'Déclarer une vidéo et obtenir son URL de dépôt (Freelance)',
    description:
      'Crée la ligne au statut DRAFT et renvoie une URL PUT signée de courte durée. ' +
      'Le navigateur dépose le fichier DIRECTEMENT sur le stockage objet : aucun octet ' +
      'vidéo ne transite par l\'API. Confirmer ensuite via POST /media/{id}/complete.',
  })
  @ApiResponse({ status: 201, description: 'Média déclaré, URL de dépôt délivrée.' })
  @ApiResponse({ status: 400, description: 'Entrée invalide ou taille annoncée hors plafond.' })
  @ApiResponse({ status: 409, description: 'Quota de médias atteint.' })
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateMediaDto) {
    // Identité issue du token : aucun {id} client n'est accepté (anti-usurpation, OWASP).
    return this.mediaService.createDraft(user.userId, dto);
  }
}
```

- [ ] **Step 7 : Écrire le module — `backend-core/src/media/media.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Media } from './media.entity';
import { MediaService } from './media.service';
import { MediaController } from './media.controller';
import { StorageModule } from '../storage/storage.module';

/** Module média (EP04). Le stockage objet est injecté par son port, jamais construit ici. */
@Module({
  imports: [TypeOrmModule.forFeature([Media]), StorageModule],
  controllers: [MediaController],
  providers: [MediaService],
  exports: [MediaService],
})
export class MediaModule {}
```

- [ ] **Step 8 : Câbler dans `backend-core/src/app.module.ts`**

Ajouter l'import `import { MediaModule } from './media/media.module';`, ajouter `Media` à la liste d'entités TypeORM du module racine (aux côtés de `Certification`), et `MediaModule` au tableau `imports`.

- [ ] **Step 9 : Vérifier que l'application démarre réellement**

Le smoke test de bootstrap de SH-41 existe précisément pour ça — un module mal câblé casse le démarrage sans casser un seul test unitaire.

```bash
cd backend-core && npx jest app.bootstrap
```

Attendu : PASS.

- [ ] **Step 10 : Lancer toute la suite, lint et build**

```bash
cd backend-core && npm test && npm run lint && npm run build
```

- [ ] **Step 11 : Commit**

```bash
git add backend-core/src/media/ backend-core/src/app.module.ts
git commit -m "feat(SH-16a/media): declaration d'un media et URL PUT signee"
```

---

## Task 5 : Consultation et mise à jour de ses propres médias

**Files:**
- Create: `backend-core/src/media/dto/query-media.dto.ts`, `backend-core/src/media/dto/update-media.dto.ts`
- Modify: `backend-core/src/media/media.service.ts`, `backend-core/src/media/media.controller.ts`
- Test: `backend-core/src/media/media.service.spec.ts`

**Interfaces:**
- Consumes: `PublicMedia`, `MediaService.toPublic` (Task 4).
- Produces: `interface PaginatedMedia { items: PublicMedia[]; total: number; page: number; limit: number }`, `MediaService.getMine(freelanceId, query): Promise<PaginatedMedia>`, `MediaService.updateOwn(mediaId, freelanceId, dto): Promise<PublicMedia>`.

- [ ] **Step 1 : Écrire les DTOs**

`backend-core/src/media/dto/query-media.dto.ts` :

```ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { MediaStatus } from '../../common/enums';

export class QueryMediaDto {
  @ApiPropertyOptional({ enum: MediaStatus })
  @IsOptional()
  @IsEnum(MediaStatus, { message: 'Le statut demandé est invalide' })
  status?: MediaStatus;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  // Plafonné : sans borne, `limit=100000` transforme une liste en déni de service.
  @Max(100)
  limit?: number;
}
```

`backend-core/src/media/dto/update-media.dto.ts` :

```ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** Seules les métadonnées éditables. Ni le statut, ni les clés de stockage. */
export class UpdateMediaDto {
  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'Le titre ne peut pas être vide' })
  @MaxLength(120, { message: 'Le titre ne peut pas dépasser 120 caractères' })
  title?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: 'La description ne peut pas dépasser 2000 caractères' })
  description?: string;
}
```

- [ ] **Step 2 : Écrire les tests qui échouent — ajouter à `media.service.spec.ts`**

Étendre le `fakeRepo` avec `findAndCount`, puis ajouter ce `describe` :

```ts
describe('MediaService — consultation et mise à jour', () => {
  const AUTRE = '22222222-2222-2222-2222-222222222222';

  function repoAvec(rows: Media[]): Repository<Media> {
    return {
      findAndCount: async ({ where, skip, take }: any) => {
        const filtered = rows.filter(
          (row) =>
            row.freelanceId === where.freelanceId &&
            (where.status === undefined || row.status === where.status),
        );
        return [filtered.slice(skip, skip + take), filtered.length];
      },
      findOne: async ({ where }: any) => rows.find((row) => row.id === where.id) ?? null,
      save: async (entity: Media) => entity,
    } as unknown as Repository<Media>;
  }

  const rows = [
    { id: 'a', freelanceId: FREELANCE, status: MediaStatus.READY, title: 'A', renditions: null, sizeBytes: null } as Media,
    { id: 'b', freelanceId: FREELANCE, status: MediaStatus.DRAFT, title: 'B', renditions: null, sizeBytes: null } as Media,
    { id: 'c', freelanceId: AUTRE, status: MediaStatus.READY, title: 'C', renditions: null, sizeBytes: null } as Media,
  ];

  it('ne rend QUE les médias du freelance du token', async () => {
    const service = new MediaService(repoAvec(rows), new FakeStorageService());

    const page = await service.getMine(FREELANCE, {});

    // Étanchéité (C2.2.2) : le média du voisin ne doit jamais apparaître.
    expect(page.items.map((m) => m.id).sort()).toEqual(['a', 'b']);
    expect(page.total).toBe(2);
  });

  it('filtre par statut', async () => {
    const service = new MediaService(repoAvec(rows), new FakeStorageService());

    const page = await service.getMine(FREELANCE, { status: MediaStatus.READY });

    expect(page.items.map((m) => m.id)).toEqual(['a']);
  });

  it('met à jour le titre de son propre média', async () => {
    const service = new MediaService(repoAvec(rows), new FakeStorageService());

    const updated = await service.updateOwn('a', FREELANCE, { title: 'Nouveau titre' });

    expect(updated.title).toBe('Nouveau titre');
  });

  it('refuse de modifier le média d\'un autre freelance', async () => {
    const service = new MediaService(repoAvec(rows), new FakeStorageService());

    // 404 et non 403 : l'existence d'un média d'autrui ne doit pas être révélée.
    await expect(service.updateOwn('c', FREELANCE, { title: 'Pirate' })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('rejette un média inconnu', async () => {
    const service = new MediaService(repoAvec(rows), new FakeStorageService());

    await expect(service.updateOwn('inconnu', FREELANCE, { title: 'X' })).rejects.toThrow(
      NotFoundException,
    );
  });
});
```

Ajouter `NotFoundException` aux imports du fichier de test.

- [ ] **Step 3 : Lancer les tests pour vérifier qu'ils échouent**

```bash
cd backend-core && npx jest media.service
```

Attendu : ÉCHEC — `service.getMine is not a function`.

- [ ] **Step 4 : Implémenter — ajouter à `backend-core/src/media/media.service.ts`**

Ajouter `NotFoundException` (`@nestjs/common`), `FindOptionsWhere` (`typeorm`), `QueryMediaDto` et `UpdateMediaDto` aux imports, puis l'interface et les deux méthodes :

```ts
export interface PaginatedMedia {
  items: PublicMedia[];
  total: number;
  page: number;
  limit: number;
}
```

```ts
  /** Liste paginée des médias d'UN freelance. Étanchéité : filtrée sur l'id du token. */
  async getMine(freelanceId: string, query: QueryMediaDto): Promise<PaginatedMedia> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: FindOptionsWhere<Media> = { freelanceId };
    if (query.status) {
      where.status = query.status;
    }

    const [rows, total] = await this.mediaRepo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { items: rows.map((row) => this.toPublic(row)), total, page, limit };
  }

  /**
   * Met à jour les métadonnées éditables d'un média dont on est propriétaire.
   * Un média d'autrui donne 404 et non 403 : son existence n'a pas à être révélée.
   */
  async updateOwn(
    mediaId: string,
    freelanceId: string,
    dto: UpdateMediaDto,
  ): Promise<PublicMedia> {
    const media = await this.mediaRepo.findOne({ where: { id: mediaId } });
    if (!media || media.freelanceId !== freelanceId) {
      throw new NotFoundException('Média introuvable');
    }

    if (dto.title !== undefined) {
      media.title = dto.title;
    }
    if (dto.description !== undefined) {
      media.description = dto.description;
    }

    return this.toPublic(await this.mediaRepo.save(media));
  }
```

- [ ] **Step 5 : Lancer les tests**

```bash
cd backend-core && npx jest media.service
```

Attendu : PASS — 11 tests.

- [ ] **Step 6 : Ajouter les routes — `backend-core/src/media/media.controller.ts`**

```ts
  @Get('me')
  @Roles(UserRole.FREELANCE)
  @ApiOperation({ summary: 'Lister ses propres médias (filtres + pagination)' })
  @ApiResponse({ status: 200, description: 'Liste paginée des médias du freelance.' })
  getMine(@CurrentUser() user: JwtPayload, @Query() query: QueryMediaDto) {
    // Étanchéité garantie par l'id du token : un Freelance ne voit que SES médias.
    return this.mediaService.getMine(user.userId, query);
  }

  @Patch(':id')
  @Roles(UserRole.FREELANCE)
  @ApiOperation({ summary: 'Modifier le titre ou la description de son média' })
  @ApiResponse({ status: 200, description: 'Média mis à jour.' })
  @ApiResponse({ status: 404, description: 'Média introuvable ou appartenant à un autre compte.' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateMediaDto,
  ) {
    return this.mediaService.updateOwn(id, user.userId, dto);
  }
```

Compléter les imports Nest (`Get`, `Patch`, `Param`, `Query`, `ParseUUIDPipe`) et les DTOs.

- [ ] **Step 7 : Suite, lint et build**

```bash
cd backend-core && npm test && npm run lint && npm run build
```

- [ ] **Step 8 : Commit**

```bash
git add backend-core/src/media/
git commit -m "feat(SH-16a/media): consultation paginee et mise a jour de ses medias"
```

---

## Task 6 : Confirmation du dépôt et enfilement du job

**Files:**
- Create: `backend-core/src/media/media.queue.ts`
- Modify: `backend-core/src/media/media.service.ts`, `backend-core/src/media/media.controller.ts`, `backend-core/src/media/media.module.ts`, `backend-core/package.json`
- Test: `backend-core/src/media/media.service.spec.ts`, `backend-core/src/media/media.queue.integration.spec.ts`

**Interfaces:**
- Consumes: `StorageService.head` + `deletePrefix` (Task 1), `MediaService.buildMediaPrefix` (Task 4).
- Produces:
  - `const MEDIA_QUEUE_NAME = 'media-transcode'`
  - `interface TranscodeJobData { mediaId: string; sourceKey: string; outputPrefix: string; posterKey: string }`
  - `interface TranscodeJobResult { durationSeconds: number; width: number; height: number; type: MediaType; mimeType: string; renditions: MediaRendition[] }`
  - `class MediaQueue` avec `enqueueTranscode(data: TranscodeJobData): Promise<void>` et `readonly events: QueueEvents`
  - `MediaService.completeUpload(mediaId, freelanceId): Promise<PublicMedia>`
  - Consommés par la Task 7.

> **Le contrat de sortie est déclaré ici à sa forme complète du spec §7**, et non réduit à `{ renditions }` comme en SH-15 : c'est cette tâche qui écrit le consommateur, il lui faut le type réel. `media-service` alignera son `TranscodeJobResult` en SH-16b.

- [ ] **Step 1 : Ajouter BullMQ à `backend-core`**

```bash
cd backend-core && npm install bullmq@^5
```

- [ ] **Step 2 : Écrire le producteur — `backend-core/src/media/media.queue.ts`**

```ts
import { Injectable, Logger, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { Queue, QueueEvents } from 'bullmq';
import IORedis from 'ioredis';
import { MediaRendition } from './media.entity';
import { MediaType } from '../common/enums';

/** Nom de la file, partagé mot pour mot avec `media-service` (design EP04 §7). */
export const MEDIA_QUEUE_NAME = 'media-transcode';

/** Charge utile du job. Contrat d'entrée figé depuis SH-15. */
export interface TranscodeJobData {
  mediaId: string;
  sourceKey: string;
  outputPrefix: string;
  posterKey: string;
}

/** Résultat rendu par le worker (design EP04 §7). Rempli par SH-16b. */
export interface TranscodeJobResult {
  durationSeconds: number;
  width: number;
  height: number;
  type: MediaType;
  mimeType: string;
  renditions: MediaRendition[];
}

/**
 * Producteur BullMQ du monolithe (SH-16a).
 *
 * Connexions DÉDIÉES plutôt que le `REDIS_CLIENT` partagé : `QueueEvents` est un client
 * bloquant, et BullMQ exige `maxRetriesPerRequest: null` sur ce type de connexion —
 * réglage incompatible avec le client applicatif partagé.
 */
@Injectable()
export class MediaQueue implements OnModuleDestroy {
  private readonly logger = new Logger(MediaQueue.name);
  private readonly connection: IORedis;
  private readonly eventsConnection: IORedis;
  private readonly queue: Queue<TranscodeJobData, TranscodeJobResult>;
  readonly events: QueueEvents;

  constructor() {
    const url = process.env.REDIS_URL ?? 'redis://localhost:6379';

    this.connection = new IORedis(url, { maxRetriesPerRequest: null });
    this.eventsConnection = new IORedis(url, { maxRetriesPerRequest: null });

    // Toute connexion Redis DOIT porter un écouteur `error` : sans lui, un incident
    // réseau tue le process sur un « unhandled 'error' event » au lieu de le laisser se
    // diagnostiquer. Défaut relevé en revue de SH-15.
    for (const [nom, client] of [
      ['file', this.connection],
      ['événements', this.eventsConnection],
    ] as const) {
      client.on('error', (err: Error) => {
        this.logger.error(`Connexion Redis (${nom}) en erreur : ${err.message}`);
      });
    }

    this.queue = new Queue<TranscodeJobData, TranscodeJobResult>(MEDIA_QUEUE_NAME, {
      connection: this.connection,
    });
    this.events = new QueueEvents(MEDIA_QUEUE_NAME, { connection: this.eventsConnection });
  }

  /**
   * Enfile un transcodage.
   *
   * **503 explicite** si Redis est indisponible, et non une dégradation silencieuse : ce
   * job EST l'opération métier, contrairement au bus d'événements de SH-14 qui reste
   * best-effort. Même distinction que celle tranchée en SH-36 pour le TokenStore.
   */
  async enqueueTranscode(data: TranscodeJobData): Promise<void> {
    try {
      await this.queue.add('transcode', data, {
        // `jobId = mediaId` : une double confirmation ne crée pas un second transcodage,
        // et l'écouteur retrouve le média sans table de correspondance.
        jobId: data.mediaId,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        // Les échecs restent inspectables (dead-letter) ; les succès sont bornés.
        removeOnFail: false,
        removeOnComplete: 100,
      });
    } catch (err) {
      this.logger.error(`Échec d'enfilement du transcodage : ${(err as Error).message}`);
      throw new ServiceUnavailableException(
        'Le service de transcodage est momentanément indisponible. Réessayez dans quelques instants.',
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.events.close();
    await this.queue.close();
    // BullMQ ne ferme JAMAIS une connexion fournie par l'appelant : à nous de le faire.
    await Promise.all([this.connection.quit(), this.eventsConnection.quit()]).catch(() => {
      this.connection.disconnect();
      this.eventsConnection.disconnect();
    });
  }
}
```

- [ ] **Step 3 : Écrire les tests de `completeUpload` — ajouter à `media.service.spec.ts`**

```ts
describe('MediaService — confirmation du dépôt', () => {
  const MEDIA_ID = '33333333-3333-3333-3333-333333333333';

  function contexte(overrides: Partial<Media> = {}) {
    const media = {
      id: MEDIA_ID,
      freelanceId: FREELANCE,
      status: MediaStatus.DRAFT,
      sourceKey: `private/media/${FREELANCE}/${MEDIA_ID}/master.mp4`,
      mimeType: 'video/mp4',
      renditions: null,
      sizeBytes: null,
      ...overrides,
    } as Media;

    const repo = {
      findOne: async () => media,
      save: async (entity: Media) => entity,
    } as unknown as Repository<Media>;

    const storage = new FakeStorageService();
    const queue = { enqueueTranscode: jest.fn().mockResolvedValue(undefined) };
    const service = new MediaService(repo, storage, queue as never);

    return { media, storage, queue, service };
  }

  it('vérifie le dépôt réel, passe en UPLOADED et enfile le job', async () => {
    const { media, storage, queue, service } = contexte();
    await storage.put(media.sourceKey, Buffer.alloc(2048), 'video/mp4');

    const result = await service.completeUpload(MEDIA_ID, FREELANCE);

    expect(result.status).toBe(MediaStatus.UPLOADED);
    expect(result.sizeBytes).toBe(2048);
    expect(queue.enqueueTranscode).toHaveBeenCalledWith({
      mediaId: MEDIA_ID,
      sourceKey: media.sourceKey,
      outputPrefix: `private/media/${FREELANCE}/${MEDIA_ID}/hls/`,
      posterKey: `private/media/${FREELANCE}/${MEDIA_ID}/poster.jpg`,
    });
  });

  it('refuse si aucun objet n\'a été déposé', async () => {
    const { service, queue } = contexte();

    await expect(service.completeUpload(MEDIA_ID, FREELANCE)).rejects.toThrow(BadRequestException);
    expect(queue.enqueueTranscode).not.toHaveBeenCalled();
  });

  it('purge et refuse quand la taille RÉELLE dépasse le plafond', async () => {
    process.env.MEDIA_MAX_FILE_MB = '1';
    const { media, storage, service } = contexte();
    // L'annonce disait 10 Ko à la déclaration ; le dépôt réel fait 2 Mo.
    await storage.put(media.sourceKey, Buffer.alloc(2 * 1024 * 1024), 'video/mp4');

    await expect(service.completeUpload(MEDIA_ID, FREELANCE)).rejects.toThrow(BadRequestException);
    // L'objet mensonger ne doit pas rester à occuper le stockage.
    await expect(storage.head(media.sourceKey)).rejects.toThrow();
  });

  it('purge et refuse quand le type RÉEL n\'est pas dans la liste blanche', async () => {
    const { media, storage, service } = contexte();
    await storage.put(media.sourceKey, Buffer.alloc(16), 'application/x-msdownload');

    await expect(service.completeUpload(MEDIA_ID, FREELANCE)).rejects.toThrow(BadRequestException);
    await expect(storage.head(media.sourceKey)).rejects.toThrow();
  });

  it('refuse la confirmation d\'un média d\'autrui', async () => {
    const { service } = contexte({ freelanceId: '99999999-9999-9999-9999-999999999999' });

    await expect(service.completeUpload(MEDIA_ID, FREELANCE)).rejects.toThrow(NotFoundException);
  });

  it('refuse de reconfirmer un média déjà traité', async () => {
    const { storage, media, service } = contexte({ status: MediaStatus.READY });
    await storage.put(media.sourceKey, Buffer.alloc(16), 'video/mp4');

    await expect(service.completeUpload(MEDIA_ID, FREELANCE)).rejects.toThrow(ConflictException);
  });
});
```

- [ ] **Step 4 : Lancer les tests pour vérifier qu'ils échouent**

```bash
cd backend-core && npx jest media.service
```

Attendu : ÉCHEC — `service.completeUpload is not a function`.

- [ ] **Step 5 : Implémenter — `backend-core/src/media/media.service.ts`**

Ajouter `MediaQueue` au constructeur :

```ts
    private readonly queue: MediaQueue,
```

et la méthode :

```ts
  /**
   * Confirme le dépôt (C2.2.3).
   *
   * Une URL PUT signée ne sait pas plafonner la taille : c'est ICI, par lecture des
   * métadonnées réelles, qu'une annonce mensongère est démasquée. Le contrôle de contenu
   * définitif reste `ffprobe`, côté worker — seul capable de trancher sur un fichier qui
   * ne transite jamais par l'API.
   */
  async completeUpload(mediaId: string, freelanceId: string): Promise<PublicMedia> {
    const media = await this.mediaRepo.findOne({ where: { id: mediaId } });
    if (!media || media.freelanceId !== freelanceId) {
      throw new NotFoundException('Média introuvable');
    }
    if (media.status !== MediaStatus.DRAFT) {
      throw new ConflictException('Ce média a déjà été confirmé');
    }

    let head: StoredObjectHead;
    try {
      head = await this.storage.head(media.sourceKey);
    } catch {
      throw new BadRequestException('Aucun fichier déposé pour ce média');
    }

    const prefix = this.buildMediaPrefix(freelanceId, mediaId);
    const maxBytes = this.maxFileMb * 1024 * 1024;

    if (head.sizeBytes > maxBytes) {
      await this.storage.deletePrefix(prefix);
      throw new BadRequestException(`Fichier trop volumineux (maximum ${this.maxFileMb} Mo)`);
    }
    if (!ALLOWED_MEDIA_MIME_TYPES.includes(head.contentType as never)) {
      await this.storage.deletePrefix(prefix);
      throw new BadRequestException('Format non supporté : MP4 ou QuickTime attendu');
    }

    media.status = MediaStatus.UPLOADED;
    media.sizeBytes = String(head.sizeBytes);
    media.mimeType = head.contentType;
    const saved = await this.mediaRepo.save(media);

    // Après la sauvegarde : si l'enfilement échoue (503), le média reste UPLOADED et
    // pourra être réenfilé, plutôt que de perdre la trace d'un fichier bien déposé.
    await this.queue.enqueueTranscode({
      mediaId,
      sourceKey: media.sourceKey,
      outputPrefix: `${prefix}hls/`,
      posterKey: `${prefix}poster.jpg`,
    });

    return this.toPublic(saved);
  }
```

Compléter les imports : `StoredObjectHead`, `ALLOWED_MEDIA_MIME_TYPES`, `MediaQueue`.

- [ ] **Step 5 bis : Réparer les tests des Tasks 4 et 5**

Le constructeur gagne un **troisième paramètre obligatoire** : tous les `new MediaService(repo, storage)` écrits aux Tasks 4 et 5 cessent de compiler. Leur ajouter le même bouchon que celui des nouveaux tests, en tête du fichier de spec :

```ts
// Bouchon de file : les tests de déclaration et de listing n'enfilent aucun job.
const queueBouchon = { enqueueTranscode: jest.fn() } as never;
```

puis remplacer chaque `new MediaService(x, y)` par `new MediaService(x, y, queueBouchon)`. Vérifier qu'il n'en reste aucun :

```bash
cd backend-core && grep -n "new MediaService(" src/media/*.spec.ts
```

Attendu : chaque occurrence porte trois arguments.

- [ ] **Step 6 : Lancer les tests**

```bash
cd backend-core && npx jest media.service
```

Attendu : PASS — 17 tests.

- [ ] **Step 7 : Écrire le test d'intégration Redis — `backend-core/src/media/media.queue.integration.spec.ts`**

```ts
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { MediaQueue, MEDIA_QUEUE_NAME } from './media.queue';

// C2.2.2 — Redis réel : on prouve que le job est RÉELLEMENT déposé sur la file que
// `media-service` consomme, et pas seulement qu'une méthode a été appelée.
const url = process.env.REDIS_URL;
const describeIf = url ? describe : describe.skip;

describeIf('MediaQueue (intégration Redis)', () => {
  let mediaQueue: MediaQueue;
  let inspector: Queue;
  let connection: IORedis;

  beforeAll(() => {
    mediaQueue = new MediaQueue();
    connection = new IORedis(url as string, { maxRetriesPerRequest: null });
    inspector = new Queue(MEDIA_QUEUE_NAME, { connection });
  });

  afterAll(async () => {
    await mediaQueue.onModuleDestroy();
    // File dédiée au test, jamais de FLUSHDB : le Redis de dev peut être partagé.
    await inspector.obliterate({ force: true });
    await inspector.close();
    await connection.quit();
  });

  it('dépose un job identifié par le mediaId', async () => {
    const mediaId = '44444444-4444-4444-4444-444444444444';

    await mediaQueue.enqueueTranscode({
      mediaId,
      sourceKey: 'private/media/f1/m1/master.mp4',
      outputPrefix: 'private/media/f1/m1/hls/',
      posterKey: 'private/media/f1/m1/poster.jpg',
    });

    const job = await inspector.getJob(mediaId);
    expect(job).toBeDefined();
    expect(job!.data.sourceKey).toBe('private/media/f1/m1/master.mp4');
    expect(job!.opts.attempts).toBe(3);
  });

  it('une double confirmation ne crée pas un second transcodage', async () => {
    const mediaId = '55555555-5555-5555-5555-555555555555';
    const data = {
      mediaId,
      sourceKey: 'private/media/f1/m2/master.mp4',
      outputPrefix: 'private/media/f1/m2/hls/',
      posterKey: 'private/media/f1/m2/poster.jpg',
    };

    await mediaQueue.enqueueTranscode(data);
    await mediaQueue.enqueueTranscode(data);

    const counts = await inspector.getJobCounts('waiting');
    // `jobId = mediaId` rend l'enfilement idempotent : BullMQ ignore le doublon.
    expect(counts.waiting).toBeLessThanOrEqual(2);
    expect(await inspector.getJob(mediaId)).toBeDefined();
  });
}, 20_000);
```

- [ ] **Step 8 : Lancer le test d'intégration avec un Redis éphémère**

```bash
docker run -d --rm -p 6381:6379 --name sh-redis-verif redis:7-alpine
```

```bash
cd backend-core && REDIS_URL=redis://127.0.0.1:6381 npx jest media.queue
```

Attendu : PASS — 2 tests, aucun `skipped`.

```bash
docker stop sh-redis-verif
```

- [ ] **Step 9 : Ajouter la route et câbler le module**

Dans `media.controller.ts` :

```ts
  @Post(':id/complete')
  @HttpCode(202)
  @Roles(UserRole.FREELANCE)
  @ApiOperation({
    summary: 'Confirmer le dépôt du fichier et lancer le transcodage (Freelance)',
    description:
      'Vérifie la taille et le type RÉELS de l\'objet déposé, puis enfile le job de ' +
      'transcodage. Un dépôt ne correspondant pas à sa déclaration est purgé.',
  })
  @ApiResponse({ status: 202, description: 'Dépôt vérifié, transcodage enfilé.' })
  @ApiResponse({ status: 400, description: 'Aucun fichier déposé, ou dépôt non conforme (purgé).' })
  @ApiResponse({ status: 404, description: 'Média introuvable ou appartenant à un autre compte.' })
  @ApiResponse({ status: 409, description: 'Média déjà confirmé.' })
  @ApiResponse({ status: 503, description: 'File de transcodage indisponible.' })
  complete(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.mediaService.completeUpload(id, user.userId);
  }
```

Dans `media.module.ts`, ajouter `MediaQueue` aux `providers` et aux `exports`.

- [ ] **Step 10 : Suite complète, lint et build**

```bash
docker run -d --rm -p 6381:6379 --name sh-redis-verif redis:7-alpine
```

```bash
cd backend-core && REDIS_URL=redis://127.0.0.1:6381 npm test && npm run lint && npm run build
```

```bash
docker stop sh-redis-verif
```

Attendu : suite verte, **aucun test `skipped`**.

- [ ] **Step 11 : Commit**

```bash
git add backend-core/src/media/ backend-core/package.json backend-core/package-lock.json
git commit -m "feat(SH-16a/media): confirmation du depot verifiee et enfilement BullMQ"
```

---

## Task 7 : Transcription de l'issue du job en base

**Files:**
- Create: `backend-core/src/media/media.listener.ts`
- Modify: `backend-core/src/media/media.service.ts`, `backend-core/src/media/media.module.ts`
- Test: `backend-core/src/media/media.listener.spec.ts`

**Interfaces:**
- Consumes: `MediaQueue.events` + `TranscodeJobResult` (Task 6), `MediaService` (Tasks 4-6).
- Produces: `MediaService.applyTranscodeResult(mediaId, raw)`, `MediaService.markFailed(mediaId, reason)`, et `class MediaTranscodeListener`.

- [ ] **Step 1 : Écrire les tests qui échouent — `backend-core/src/media/media.listener.spec.ts`**

```ts
import { Repository } from 'typeorm';
import { MediaService } from './media.service';
import { Media } from './media.entity';
import { MediaStatus, MediaType } from '../common/enums';
import { FakeStorageService } from '../storage/fake-storage.service';

const MEDIA_ID = '66666666-6666-6666-6666-666666666666';
const FREELANCE = '11111111-1111-1111-1111-111111111111';

function contexte(status = MediaStatus.UPLOADED) {
  const media = {
    id: MEDIA_ID,
    freelanceId: FREELANCE,
    status,
    sourceKey: `private/media/${FREELANCE}/${MEDIA_ID}/master.mp4`,
    mimeType: 'video/mp4',
    renditions: null,
    sizeBytes: null,
  } as Media;

  const repo = {
    findOne: async () => media,
    save: async (entity: Media) => entity,
  } as unknown as Repository<Media>;

  const storage = new FakeStorageService();
  const queue = { enqueueTranscode: jest.fn() };
  return { media, storage, service: new MediaService(repo, storage, queue as never) };
}

// C2.2.3 — Le résultat du worker est une donnée EXTERNE au monolithe : elle traverse
// Redis et n'est produite par aucun code de ce service. Elle se valide comme une entrée.
describe('MediaService — issue du transcodage', () => {
  const resultatValide = JSON.stringify({
    durationSeconds: 42,
    width: 3840,
    height: 2160,
    type: 'VIDEO_360',
    mimeType: 'video/mp4',
    renditions: [
      { name: '720p', width: 1280, height: 720, bandwidth: 2800000, playlistKey: 'p/720p.m3u8' },
    ],
  });

  it('passe en READY et transcrit les métadonnées sondées', async () => {
    const { service } = contexte();

    const media = await service.applyTranscodeResult(MEDIA_ID, resultatValide);

    expect(media.status).toBe(MediaStatus.READY);
    expect(media.durationSeconds).toBe(42);
    expect(media.type).toBe(MediaType.VIDEO_360);
    expect(media.processedAt).not.toBeNull();
    // La vue publique ne laisse pas fuir la clé de playlist.
    expect(JSON.stringify(media.renditions)).not.toContain('playlistKey');
  });

  it('rejette un résultat non conforme plutôt que d\'écrire n\'importe quoi en base', async () => {
    const { service } = contexte();

    await expect(service.applyTranscodeResult(MEDIA_ID, '{"width":"beaucoup"}')).rejects.toThrow();
    await expect(service.applyTranscodeResult(MEDIA_ID, 'pas du json')).rejects.toThrow();
  });

  it('markFailed enregistre la raison et purge les sorties partielles', async () => {
    const { service, storage, media } = contexte();
    await storage.put(`private/media/${FREELANCE}/${MEDIA_ID}/hls/720p.m3u8`, Buffer.from('x'), 'text/plain');

    const failed = await service.markFailed(MEDIA_ID, 'ffprobe: aucun flux vidéo');

    expect(failed.status).toBe(MediaStatus.FAILED);
    expect(failed.errorReason).toBe('ffprobe: aucun flux vidéo');
    // Les segments à moitié écrits n'ont plus rien à faire là.
    await expect(storage.head(`private/media/${FREELANCE}/${MEDIA_ID}/hls/720p.m3u8`)).rejects.toThrow();
    // Le master est CONSERVÉ : il permet de rejouer le transcodage après correction.
    expect(media.sourceKey).toBeDefined();
  });

  it('markFailed tronque une raison trop longue et ne stocke jamais de pile', async () => {
    const { service } = contexte();

    const failed = await service.markFailed(MEDIA_ID, 'x'.repeat(500));

    expect(failed.errorReason!.length).toBeLessThanOrEqual(255);
  });
});
```

- [ ] **Step 2 : Lancer les tests pour vérifier qu'ils échouent**

```bash
cd backend-core && npx jest media.listener
```

Attendu : ÉCHEC — `service.applyTranscodeResult is not a function`.

- [ ] **Step 3 : Implémenter dans `backend-core/src/media/media.service.ts`**

Compléter d'abord les imports du fichier : `MediaType` depuis `../common/enums`, et `TranscodeJobResult` depuis `./media.queue`.

```ts
const MAX_ERROR_REASON = 255;

/** Valide la forme du résultat rendu par le worker. Donnée externe : jamais de confiance. */
function parseTranscodeResult(raw: string): TranscodeJobResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new BadRequestException('Résultat de transcodage illisible');
  }

  const candidate = parsed as Partial<TranscodeJobResult>;
  const nombres = [candidate.durationSeconds, candidate.width, candidate.height];
  const typeValide =
    candidate.type === MediaType.VIDEO || candidate.type === MediaType.VIDEO_360;

  if (
    !nombres.every((valeur) => typeof valeur === 'number' && Number.isFinite(valeur)) ||
    !typeValide ||
    typeof candidate.mimeType !== 'string' ||
    !Array.isArray(candidate.renditions)
  ) {
    throw new BadRequestException('Résultat de transcodage non conforme');
  }

  return candidate as TranscodeJobResult;
}
```

```ts
  /** Transcrit un transcodage réussi. Le média devient consultable. */
  async applyTranscodeResult(mediaId: string, raw: string): Promise<PublicMedia> {
    const result = parseTranscodeResult(raw);

    const media = await this.mediaRepo.findOne({ where: { id: mediaId } });
    if (!media) {
      throw new NotFoundException('Média introuvable');
    }

    media.status = MediaStatus.READY;
    media.durationSeconds = Math.round(result.durationSeconds);
    media.width = result.width;
    media.height = result.height;
    media.type = result.type;
    media.mimeType = result.mimeType;
    media.renditions = result.renditions;
    media.hlsPrefix = `${this.buildMediaPrefix(media.freelanceId, media.id)}hls/`;
    media.posterKey = `${this.buildMediaPrefix(media.freelanceId, media.id)}poster.jpg`;
    media.errorReason = null;
    media.processedAt = new Date();

    return this.toPublic(await this.mediaRepo.save(media));
  }

  /**
   * Enregistre un échec définitif et purge les sorties partielles.
   * Le MASTER est conservé : il permet de rejouer le transcodage après correction.
   */
  async markFailed(mediaId: string, reason: string): Promise<PublicMedia> {
    const media = await this.mediaRepo.findOne({ where: { id: mediaId } });
    if (!media) {
      throw new NotFoundException('Média introuvable');
    }

    const prefix = this.buildMediaPrefix(media.freelanceId, media.id);
    await this.storage.deletePrefix(`${prefix}hls/`);

    media.status = MediaStatus.FAILED;
    // Message court destiné à l'utilisateur : jamais une pile d'exécution.
    media.errorReason = reason.slice(0, MAX_ERROR_REASON);
    media.processedAt = new Date();

    return this.toPublic(await this.mediaRepo.save(media));
  }
```

- [ ] **Step 4 : Lancer les tests**

```bash
cd backend-core && npx jest media.listener
```

Attendu : PASS — 4 tests.

- [ ] **Step 5 : Écrire l'écouteur — `backend-core/src/media/media.listener.ts`**

```ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MediaQueue } from './media.queue';
import { MediaService } from './media.service';

/**
 * Écouteur `QueueEvents` (SH-16a, décision D7).
 *
 * C'est le monolithe — et lui seul — qui écrit dans PostgreSQL : `media-service` reste
 * un worker pur, sans accès à la base et sans API à authentifier. `jobId = mediaId`,
 * donc aucune table de correspondance n'est nécessaire.
 */
@Injectable()
export class MediaTranscodeListener implements OnModuleInit {
  private readonly logger = new Logger(MediaTranscodeListener.name);

  constructor(
    private readonly queue: MediaQueue,
    private readonly mediaService: MediaService,
  ) {}

  onModuleInit(): void {
    this.queue.events.on('completed', ({ jobId, returnvalue }) => {
      void this.mediaService.applyTranscodeResult(jobId, returnvalue).catch((err: Error) => {
        // On ne relance pas : un résultat illisible ne deviendra pas lisible en réessayant.
        this.logger.error(`Résultat de transcodage inexploitable (${jobId}) : ${err.message}`);
      });
    });

    this.queue.events.on('failed', ({ jobId, failedReason }) => {
      void this.mediaService
        .markFailed(jobId, failedReason ?? 'Échec du transcodage')
        .catch((err: Error) => {
          this.logger.error(`Impossible de marquer l'échec de ${jobId} : ${err.message}`);
        });
    });

    // Sans écouteur, une erreur de la connexion d'événements remonterait en exception
    // non captée — même défaut que celui relevé en revue de SH-15.
    this.queue.events.on('error', (err: Error) => {
      this.logger.error(`Flux d'événements BullMQ en erreur : ${err.message}`);
    });
  }
}
```

- [ ] **Step 5 bis : Tester le câblage de l'écouteur — ajouter à `media.listener.spec.ts`**

Sans ce test, un nom d'événement mal orthographié passerait inaperçu : le média resterait indéfiniment en `UPLOADED` sans qu'aucun test ne bronche.

```ts
import { MediaTranscodeListener } from './media.listener';
import { EventEmitter } from 'node:events';

describe('MediaTranscodeListener — câblage', () => {
  function ecouteur() {
    const events = new EventEmitter();
    const service = {
      applyTranscodeResult: jest.fn().mockResolvedValue({}),
      markFailed: jest.fn().mockResolvedValue({}),
    };
    const listener = new MediaTranscodeListener({ events } as never, service as never);
    listener.onModuleInit();
    return { events, service };
  }

  it('un job terminé déclenche la transcription du résultat', async () => {
    const { events, service } = ecouteur();

    events.emit('completed', { jobId: 'm1', returnvalue: '{"ok":true}' });
    await Promise.resolve();

    expect(service.applyTranscodeResult).toHaveBeenCalledWith('m1', '{"ok":true}');
  });

  it('un job en échec marque le média FAILED avec sa raison', async () => {
    const { events, service } = ecouteur();

    events.emit('failed', { jobId: 'm2', failedReason: 'ffmpeg: exit 1' });
    await Promise.resolve();

    expect(service.markFailed).toHaveBeenCalledWith('m2', 'ffmpeg: exit 1');
  });

  it('un résultat inexploitable est journalisé, pas propagé en rejet non géré', async () => {
    const { events, service } = ecouteur();
    service.applyTranscodeResult.mockRejectedValue(new Error('non conforme'));

    events.emit('completed', { jobId: 'm3', returnvalue: 'nawak' });
    await Promise.resolve();

    // Le test échouerait sur un rejet non capté ; l'absence de bruit EST l'assertion.
    expect(service.applyTranscodeResult).toHaveBeenCalled();
  });
});
```

Lancer `cd backend-core && npx jest media.listener` — attendu : PASS, 7 tests au total.

- [ ] **Step 6 : Câbler dans `media.module.ts`**

Ajouter `MediaTranscodeListener` aux `providers`.

- [ ] **Step 7 : Vérifier le démarrage, la suite, le lint et le build**

```bash
docker run -d --rm -p 6381:6379 --name sh-redis-verif redis:7-alpine
```

```bash
cd backend-core && REDIS_URL=redis://127.0.0.1:6381 npm test && npm run lint && npm run build
```

```bash
docker stop sh-redis-verif
```

- [ ] **Step 8 : Commit**

```bash
git add backend-core/src/media/
git commit -m "feat(SH-16a/media): transcrit l'issue du transcodage en base via QueueEvents"
```

---

## Task 8 : Balayage des déclarations orphelines

**Files:**
- Create: `backend-core/src/media/media.sweeper.ts`
- Modify: `backend-core/src/media/media.module.ts`, `backend-core/src/app.module.ts`, `backend-core/package.json`
- Test: `backend-core/src/media/media.sweeper.spec.ts`

**Interfaces:**
- Consumes: le dépôt `Media`, `STORAGE_SERVICE`, `MediaService.buildMediaPrefix`.
- Produces: `MediaSweeper.purgeStaleDrafts(): Promise<number>` — rend le nombre de lignes purgées.

- [ ] **Step 1 : Installer `@nestjs/schedule`**

```bash
cd backend-core && npm install @nestjs/schedule
```

- [ ] **Step 2 : Écrire le test qui échoue — `backend-core/src/media/media.sweeper.spec.ts`**

```ts
import { Repository } from 'typeorm';
import { MediaSweeper } from './media.sweeper';
import { Media } from './media.entity';
import { MediaStatus } from '../common/enums';
import { FakeStorageService } from '../storage/fake-storage.service';

const FREELANCE = '11111111-1111-1111-1111-111111111111';

// C2.2.2 — Une URL de dépôt délivrée puis abandonnée laisse une ligne et parfois un objet
// à moitié déposé. Sans balayage, ils s'accumulent et amputent le quota du freelance.
describe('MediaSweeper', () => {
  function contexte(rows: Media[]) {
    const supprimes: string[] = [];
    const repo = {
      find: async () => rows,
      remove: async (entities: Media[]) => {
        entities.forEach((entity) => supprimes.push(entity.id));
        return entities;
      },
    } as unknown as Repository<Media>;

    const storage = new FakeStorageService();
    return { supprimes, storage, sweeper: new MediaSweeper(repo, storage) };
  }

  it('purge la ligne ET les objets d\'un DRAFT abandonné', async () => {
    const perime = {
      id: 'vieux',
      freelanceId: FREELANCE,
      status: MediaStatus.DRAFT,
      sourceKey: `private/media/${FREELANCE}/vieux/master.mp4`,
    } as Media;
    const { supprimes, storage, sweeper } = contexte([perime]);
    await storage.put(perime.sourceKey, Buffer.from('partiel'), 'video/mp4');

    const count = await sweeper.purgeStaleDrafts();

    expect(count).toBe(1);
    expect(supprimes).toEqual(['vieux']);
    await expect(storage.head(perime.sourceKey)).rejects.toThrow();
  });

  it('ne fait rien quand aucune déclaration n\'est périmée', async () => {
    const { supprimes, sweeper } = contexte([]);

    await expect(sweeper.purgeStaleDrafts()).resolves.toBe(0);
    expect(supprimes).toEqual([]);
  });
});
```

- [ ] **Step 3 : Lancer le test pour vérifier qu'il échoue**

```bash
cd backend-core && npx jest media.sweeper
```

Attendu : ÉCHEC — `Cannot find module './media.sweeper'`.

- [ ] **Step 4 : Implémenter — `backend-core/src/media/media.sweeper.ts`**

```ts
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { Media } from './media.entity';
import { MediaStatus } from '../common/enums';
import { STORAGE_SERVICE, StorageService } from '../storage/storage.service';

/**
 * Balayage des déclarations abandonnées (SH-16a, design EP04 §9.2).
 *
 * Une URL PUT est délivrée puis, parfois, jamais suivie d'un dépôt confirmé : onglet
 * fermé, réseau coupé, upload interrompu. La ligne `DRAFT` resterait à consommer le
 * quota du freelance, et l'objet à moitié déposé à occuper le stockage.
 */
@Injectable()
export class MediaSweeper {
  private readonly logger = new Logger(MediaSweeper.name);

  constructor(
    @InjectRepository(Media)
    private readonly mediaRepo: Repository<Media>,
    @Inject(STORAGE_SERVICE)
    private readonly storage: StorageService,
  ) {}

  /** Toutes les heures : le seuil se compte en heures, inutile de balayer plus souvent. */
  @Cron(CronExpression.EVERY_HOUR)
  async handleCron(): Promise<void> {
    const purged = await this.purgeStaleDrafts();
    if (purged > 0) {
      this.logger.log(`${purged} déclaration(s) de média abandonnée(s) purgée(s)`);
    }
  }

  async purgeStaleDrafts(): Promise<number> {
    const seuil = new Date(Date.now() - this.draftTtlHours * 3600 * 1000);

    const stale = await this.mediaRepo.find({
      where: { status: MediaStatus.DRAFT, createdAt: LessThan(seuil) },
    });
    if (stale.length === 0) {
      return 0;
    }

    for (const media of stale) {
      // Objets d'abord : si la suppression de ligne échouait après, le balayage suivant
      // rattraperait la ligne — l'inverse laisserait un objet sans référence.
      await this.storage.deletePrefix(`private/media/${media.freelanceId}/${media.id}/`);
    }
    await this.mediaRepo.remove(stale);

    return stale.length;
  }

  private get draftTtlHours(): number {
    return Number(process.env.MEDIA_DRAFT_TTL_HOURS ?? 24);
  }
}
```

- [ ] **Step 5 : Lancer le test**

```bash
cd backend-core && npx jest media.sweeper
```

Attendu : PASS — 2 tests.

- [ ] **Step 6 : Câbler**

Dans `media.module.ts`, ajouter `MediaSweeper` aux `providers`. Dans `app.module.ts`, ajouter `import { ScheduleModule } from '@nestjs/schedule';` et `ScheduleModule.forRoot()` au tableau `imports` — sans lui, le décorateur `@Cron` est inerte.

- [ ] **Step 7 : Vérifier le démarrage, la suite, le lint et le build**

```bash
docker run -d --rm -p 6381:6379 --name sh-redis-verif redis:7-alpine
```

```bash
cd backend-core && REDIS_URL=redis://127.0.0.1:6381 npm test && npm run lint && npm run build
```

```bash
docker stop sh-redis-verif
```

- [ ] **Step 8 : Commit**

```bash
git add backend-core/src/media/ backend-core/src/app.module.ts backend-core/package.json backend-core/package-lock.json
git commit -m "feat(SH-16a/media): balaye les declarations de media abandonnees"
```

---

## Task 9 : Recette de bout en bout et documentation

**Files:**
- Create: `docs/tickets/SH-16a-flux-entrant-media.md`
- Modify: `docs/BACKLOG.md`, `docs/conception/MLD-skillhunt.puml`, `docs/conception/MCD-skillhunt.mocodo`, `docs/conception/2026-06-28-MCD-MLD-SkillHunt.md`, `backend-core/src/storage/README.md`

**Interfaces:**
- Consumes: tout le reste.
- Produces: rien pour d'autres tâches — c'est la clôture.

- [ ] **Step 1 : Régénérer le contrat d'API du front**

Le backend doit tourner pour que la génération lise le Swagger réel.

```bash
docker compose --profile app up -d --build backend-core
```

```bash
cd frontend-web && npm run gen:api
```

Vérifier que `src/api/schema.d.ts` contient bien `/api/v1/media`. Committer le fichier régénéré avec cette tâche.

- [ ] **Step 2 : Recette manuelle du flux complet**

Récupérer un token freelance via le compte de démo, puis :

```bash
curl -s -X POST http://localhost:8088/api/v1/media -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"title":"Recette SH-16a","contentType":"video/mp4","sizeBytes":1024}'
```

Attendu : `201`, un `media.status = "DRAFT"` et une `upload.url` pointant sur `localhost:4566`.

```bash
head -c 1024 /dev/urandom > /tmp/faux.mp4 && curl -s -X PUT -H 'Content-Type: video/mp4' --upload-file /tmp/faux.mp4 "<upload.url>" -o /dev/null -w '%{http_code}\n'
```

Attendu : `200` — le dépôt direct navigateur→S3 fonctionne, CORS et signature compris.

```bash
curl -s -X POST http://localhost:8088/api/v1/media/<id>/complete -H "Authorization: Bearer $TOKEN" -o /dev/null -w '%{http_code}\n'
```

Attendu : `202`. Puis, quelques secondes plus tard :

```bash
curl -s http://localhost:8088/api/v1/media/me -H "Authorization: Bearer $TOKEN"
```

Attendu : le média en `READY` — le worker no-op de SH-15 a consommé le job et l'écouteur a transcrit l'issue. **C'est la preuve que la boucle complète est fermée.**

> Si le média reste en `UPLOADED`, le worker ne consomme pas : vérifier `docker compose logs media-service`.

- [ ] **Step 3 : Écrire le ticket — `docs/tickets/SH-16a-flux-entrant-media.md`**

Suivre `docs/templates/TICKET_TEMPLATE.md`, en reprenant la forme de `docs/tickets/SH-15-scaffolding-media.md`. En-tête : `**Compétences RNCP visées :** C2.2.3 (validation des entrées, Signed URLs, étanchéité), C2.2.2 (tests, RBAC), C2.4.1 (Swagger)`. Scénarios Gherkin, un par comportement vérifié :

1. Déclaration → `201` + URL PUT signée + ligne `DRAFT`.
2. Dépôt direct sur S3 avec l'URL signée → `200`.
3. Confirmation → `202`, statut `UPLOADED`, job enfilé.
4. Job terminé → statut `READY` et métadonnées transcrites.
5. Dépôt mensonger (taille réelle > plafond) → `400` **et objet purgé**.
6. Confirmation d'un média d'autrui → `404`.
7. Quota atteint → `409`.
8. Redis indisponible à la confirmation → `503`.
9. `DRAFT` de plus de 24 h → purgée par le balayage.

- [ ] **Step 4 : Mettre à jour `docs/BACKLOG.md`**

Remplacer la ligne SH-16 de la table **EP04** par deux lignes :

```markdown
| [SH-16a](tickets/SH-16a-flux-entrant-media.md) | Flux entrant du média : port de stockage élargi, entité `user_media`, upload par URL PUT présignée, producteur BullMQ + `QueueEvents`, balayage des déclarations abandonnées | 🟢 Terminé | 5 | C2.2.3, C2.2.2, C2.4.1 | R1, R8 |
| [SH-16b](tickets/SH-16b-pipeline-transcodage.md) | Pipeline de transcodage réel : `ffprobe` (durée, dimensions, projection 360°), `ffmpeg` échelle ABR + poster, dépôt S3, métriques, ffmpeg en CI | 🔵 Backlog | 3 | C2.2.2, C2.1.2 | R1 |
```

- [ ] **Step 5 : Mettre à jour la conception**

Dans `docs/conception/MLD-skillhunt.puml`, remplacer l'entité `media` esquissée (ligne ~82) par la table réelle :

```
entity "user_media" as media #C8E6C9 {
  * id : uuid <<PK>>
  --
  * freelanceId : uuid <<FK>>
  * title : varchar(120)
  description : text
  * type : enum (VIDEO|VIDEO_360)
  * status : enum (DRAFT|UPLOADED|PROCESSING|READY|FAILED)
  * sourceKey : varchar
  posterKey : varchar
  hlsPrefix : varchar
  renditions : jsonb
  durationSeconds : integer
  width / height : integer
  sizeBytes : bigint
  * mimeType : varchar
  errorReason : varchar
  * createdAt / updatedAt : timestamptz
  processedAt : timestamptz
}
```

La couleur passe au vert (implémenté). Répercuter le nom `user_media` dans `MCD-skillhunt.mocodo`, et dans `2026-06-28-MCD-MLD-SkillHunt.md` : le paragraphe `media` (ligne ~217) et la table de traçabilité (ligne ~255, `media` → **SH-16a ✅**).

- [ ] **Step 6 : Mettre à jour `backend-core/src/storage/README.md`**

La procédure d'intégration LocalStack décrit une création de bucket manuelle qui n'a plus lieu d'être : remplacer l'étape 2 par une mention du script `localstack/init/01-bucket.sh`, et documenter les quatre nouvelles méthodes du port ainsi que `AWS_S3_PUBLIC_ENDPOINT`.

- [ ] **Step 7 : Vérification finale**

```bash
docker run -d --rm -p 6381:6379 --name sh-redis-verif redis:7-alpine
```

```bash
cd backend-core && REDIS_URL=redis://127.0.0.1:6381 npm test && npm run lint && npm run build
```

```bash
docker stop sh-redis-verif
```

Attendu : suite verte, **aucun test `skipped`**.

- [ ] **Step 8 : Commit**

```bash
git add docs/ backend-core/src/storage/README.md frontend-web/src/api/schema.d.ts
git commit -m "docs(SH-16a/media): ticket, backlog, conception et contrat d'API regenere"
```

---

## Vérification de la Definition of Done

- [ ] Les 9 scénarios Gherkin du ticket sont vérifiés
- [ ] Recette de bout en bout passée : `DRAFT → UPLOADED → READY` à travers la gateway (Task 9, Step 2)
- [ ] Suite backend verte avec Redis, **zéro test `skipped`** ; lint et build verts
- [ ] Migration appliquée **et** annulable (Task 3, Step 10)
- [ ] Bucket créé automatiquement, chiffrement par défaut et CORS vérifiés (Task 2, Step 9)
- [ ] Aucune clé de stockage dans une réponse d'API (test à clés exactes, Task 4)
- [ ] `docs/BACKLOG.md`, MLD/MCD et le ticket à jour

**PR** : base `develop`, **jamais `main`** (CLAUDE.md §11). Ne pas supprimer la branche après merge (traçabilité jury).
