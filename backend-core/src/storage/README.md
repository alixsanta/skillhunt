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
