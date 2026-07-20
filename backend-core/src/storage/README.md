# Module `storage` — Abstraction de stockage objet (SH-31)

Port/adaptateur découplant le code métier d'AWS. Réutilisé par les certifications (SH-10)
et les médias (SH-17).

| Fichier | Rôle |
|---|---|
| `storage.service.ts` | Interface (port) `StorageService` + token d'injection `STORAGE_SERVICE` |
| `s3-storage.service.ts` | Adaptateur S3 (`@aws-sdk`) — AWS réel **et** LocalStack |
| `fake-storage.service.ts` | Implémentation mémoire pour les tests unitaires (sans réseau) |
| `storage.module.ts` | Provider liant `STORAGE_SERVICE` à l'adaptateur S3 (configuré par l'env) |

## Utilisation dans un autre module

```ts
// Dans le module consommateur (ex. CertificationsModule)
@Module({ imports: [StorageModule], /* ... */ })

// Dans le service
constructor(@Inject(STORAGE_SERVICE) private readonly storage: StorageService) {}
```

En test, surcharger le provider vers le fake (aucun appel réseau) :

```ts
Test.createTestingModule({ imports: [StorageModule] })
  .overrideProvider(STORAGE_SERVICE)
  .useClass(FakeStorageService)
  .compile();
```

## Divergence fake ↔ S3 réel sur `getSignedUrl`

⚠️ À connaître pour écrire les tests des modules consommateurs (SH-10/SH-17) :

- **`FakeStorageService.getSignedUrl`** **rejette** (`NotFoundException`) si la clé est absente.
  Choix assumé : il permet d'attester l'inaccessibilité d'un objet après purge dans des tests
  unitaires hermétiques.
- **`S3StorageService.getSignedUrl`** (et S3 réel) **signe l'URL sans vérifier l'existence** de
  l'objet : le presigner calcule la signature hors-ligne. Une clé inexistante produit donc une URL
  valide qui renverra `404 NoSuchKey` seulement **à l'accès**.

Conséquence : ne pas écrire de logique métier qui s'appuie sur une exception de `getSignedUrl`
pour détecter une clé absente. Côté SH-10, l'inexistence se détecte en amont via `s3Key === null`
(positionné à la purge) **avant** d'appeler `getSignedUrl`.

## Améliorations identifiées (suivi, non bloquant)

Pistes relevées en revue de SH-31, à arbitrer ultérieurement :

1. **Envelopper les erreurs `@aws-sdk`** de `put`/`delete`/`getSignedUrl` dans une
   `InternalServerErrorException` (message FR, sans fuiter les internes AWS) — défense en
   profondeur (CLAUDE.md §8).
2. **Healthcheck LocalStack** : préférer l'endpoint natif
   `curl -sf http://localhost:4566/_localstack/health` (plus léger, indépendant du CLI/creds)
   au `awslocal s3 ls` actuel.
3. **Borne du TTL** : `getSignedUrl` pourrait clamper `ttlSeconds` au plafond SigV4 (604800 s /
   7 jours) pour échouer proprement plutôt que de laisser AWS rejeter.

> Hygiène des dépendances (audit `npm` rouge en CI sur des vulns transitives NestJS/swagger/multer)
> est traitée hors de ce module : voir le ticket **SH-32**.

## Bascule d'environnement (Scénario 4 du ticket)

Le choix AWS réel ↔ LocalStack se fait **uniquement par configuration** (cf. `.env.example`) :

- `AWS_S3_ENDPOINT=http://localhost:4566` → LocalStack (`forcePathStyle` activé).
- `AWS_S3_ENDPOINT` vide → AWS S3 réel.

## Procédure d'intégration LocalStack (manuelle, non bloquante en CI)

Les tests unitaires (`*.spec.ts`) sont **hermétiques** (aucun réseau) : ils tournent en CI.
La validation contre un vrai S3 émulé est **manuelle** et reste hors CI.

1. Démarrer LocalStack :
   ```bash
   docker compose up -d localstack
   ```
2. Créer le bucket privé de dev (via le conteneur, pas besoin d'AWS CLI sur l'hôte) :
   ```bash
   docker exec skillhunt-localstack awslocal s3 mb s3://skillhunt-media
   ```
3. Renseigner `.env` (copie de `.env.example`) avec `AWS_S3_ENDPOINT=http://localhost:4566`,
   `AWS_S3_BUCKET=skillhunt-media`, `AWS_ACCESS_KEY_ID=test`, `AWS_SECRET_ACCESS_KEY=test`.
4. Le code métier (SH-10) consommera alors `StorageService` sur LocalStack, chiffrement
   AES-256 et Signed URL compris, sans aucun appel à AWS réel.

> Note : LocalStack émule l'API S3 (y compris `ServerSideEncryption`) ; le chiffrement au
> repos est réellement appliqué par AWS en production.
