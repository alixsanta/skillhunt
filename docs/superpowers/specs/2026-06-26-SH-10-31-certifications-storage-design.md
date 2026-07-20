# Design — Certifications upload (SH-10) + Abstraction de stockage objet (SH-31)

> Spec de conception issue d'un brainstorming (2026-06-26). Décrit le **pourquoi/comment**
> architectural commun aux deux tickets. Les tickets actionnables (INVEST + Gherkin + DoD)
> sont dans `docs/tickets/SH-31-storage-abstraction.md` et `docs/tickets/SH-10-certifications-upload.md`.
> Source de vérité projet : `CLAUDE.md` racine + `backend-core/CLAUDE.md`.

## 1. Contexte & objectif

Un Freelance doit pouvoir **uploader une certification** (brevet télépilote DGAC, habilitation
électrique…) au format **PDF**, afin de prouver sa légitimité et d'obtenir le badge « Vérifié ».
La donnée est **hautement sensible** (document d'identité) : la feature est donc autant un sujet
**RGPD** (minimisation, purge) qu'un sujet **anti-fraude** (R2, criticité 16 — le risque n°1 du dossier).

C'est la dernière brique de l'**EP02 — Monolithe & Authentification** (jalon J2).

### Compétences RNCP visées
- **C2.2.3** — sécurité des entrées (validation MIME réelle, anti-injection, RGPD).
- **C2.2.2** — harnais de tests (étanchéité RBAC, cycle de vie).
- **C2.4.1** — documentation technique (Swagger/OpenAPI).
- **C2.1.2** — qualité/structure du code (abstraction de stockage, SH-31).

### Risques du dossier adressés
- **R2** (fraude / fausses certifications, P4×I4=16) — workflow de validation + filtres automatiques.
- **R3** (fuite de PII / RGPD) — strip métadonnées, AES-256 au repos, purge.
- **R8** (exfiltration de médias) — bucket privé + Signed URL courte.
- **R7** (injections / fichiers malveillants) — magic bytes, validation stricte.

## 2. Décisions de cadrage (brainstorming)

| # | Décision | Justification |
|---|---|---|
| D1 | **PDF uniquement** (pas d'images) | Aligné cadrage §3.4.2 (« certification PDF ») + `TICKET_TEMPLATE`. Minimisation RGPD la plus défendable, surface de test réduite. |
| D2 | **Purge différée post-validation** | Réconcilie RGPD (minimisation) ↔ R2 (l'Admin doit voir le doc) ↔ Signed URL. Le doc d'identité n'existe que le temps de remplir sa finalité de vérification, puis il est détruit. |
| D3 | **`StorageService` abstrait + LocalStack** en dev/CI | Découple le code de l'infra AWS. Débloque le développement sans attendre un compte AWS, CI hermétique, coût cloud nul. Passage S3 réel = changement d'`.env`. |
| D4 | **Détection de doublon de n° de brevet** intégrée à SH-10 | Filtre anti-fraude quasi gratuit : un même numéro déclaré par deux comptes = signal de fraude fort (R2). |
| D5 | **Découpage en 2 tickets** | SH-31 (infra réutilisable, aussi consommée par SH-17 média) séparé de SH-10 (feature métier). Coupe nette infra/métier ; chaque unité testable seule. Ne PAS séparer upload/validation (état intermédiaire non démontrable). |

## 3. Périmètre anti-fraude — ce qui est DANS vs HORS SH-10

La validation manuelle par un humain **ne passe pas à l'échelle** : elle est traitée comme une
**exception** au bout d'un entonnoir. SH-10 ne livre que les deux premiers niveaux.

| Niveau | Mécanisme | SH-10 ? |
|---|---|---|
| 1. Filtres automatiques | magic bytes, strip, format n° brevet, date cohérente, **dedup** | ✅ Oui |
| 2. Revue humaine | file `pending` + review/purge (FIFO simple, **pas** de priorisation par score) | ✅ Oui |
| 3. Signaux post-hoc | signalement communautaire, « Preuve d'Activité » | ❌ Ticket futur (dépend des missions + score de fiabilité) |
| 4. Source officielle | croisement API DGAC AlphaTango | ❌ Ticket futur (API tierce à explorer) |

Les niveaux 3 et 4 sont **déjà cartographiés** dans le dossier (R2 §4.3) — argumentaire jury sans code.

## 4. SH-31 — Abstraction de stockage objet

### Architecture (port / adaptateur)
Module `backend-core/src/storage/` :

```
storage/
├── storage.service.ts        # interface StorageService (port) + token d'injection
├── s3-storage.service.ts     # adaptateur S3 (@aws-sdk) — prod & LocalStack
├── fake-storage.service.ts   # implémentation mémoire (Map) pour les tests unitaires
├── storage.module.ts         # provider : bind du token vers l'implémentation selon l'env
└── storage.spec.ts
```

### Interface (contrat minimal)
```ts
interface StorageService {
  put(key: string, body: Buffer, contentType: string): Promise<void>; // SSE AES-256
  getSignedUrl(key: string, ttlSeconds: number): Promise<string>;     // accès temporaire
  delete(key: string): Promise<void>;                                 // purge
}
```

- **`S3StorageService`** : `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`. Au `put`,
  `ServerSideEncryption: 'AES256'`. Lit `AWS_S3_ENDPOINT` (LocalStack `http://localhost:4566`
  en dev ; **vide ⇒ AWS réel**), `AWS_REGION`, `AWS_S3_BUCKET`, creds via env.
- **`FakeStorageService`** : `Map<string, Buffer>` en mémoire ; `getSignedUrl` renvoie une URL
  factice déterministe. Permet des tests unitaires **sans réseau**.
- **`StorageModule`** : associe le token `STORAGE_SERVICE` à l'implémentation. Les tests injectent
  le fake via override de provider.

### Infra
- `docker-compose.yml` : service **`localstack`** (image `localstack/localstack`, service `s3`,
  port 4566) à côté de Postgres.
- `.env.example` : `AWS_REGION`, `AWS_S3_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`,
  `AWS_S3_ENDPOINT`. **Aucune vraie valeur committée.**

### Tests
- Unitaires sur `FakeStorageService` (put/get/delete, idempotence).
- Intégration `S3StorageService` ↔ LocalStack : **manuelle/optionnelle** (non bloquante en CI pour
  garder la CI hermétique). Documentée dans le ticket.

## 5. SH-10 — Certifications

### Modèle de données (`user_certifications`)
Calque des conventions de `gear.entity.ts` (index, FK, enums, `@CreateDateColumn`).

| Colonne | Type | Note |
|---|---|---|
| `id` | uuid PK | |
| `freelanceId` | uuid FK→users | indexé, `onDelete: CASCADE` |
| `type` | enum `CertificationType` | `DGAC_DRONE`, `ELEC_HABILITATION`, `OTHER` |
| `number` | varchar | n° de brevet — **métadonnée de validité, conservée**. Sert au dedup. |
| `validUntil` | date | saisi par le Freelance (DTO), confirmable par l'Admin |
| `status` | enum `CertificationStatus` | `PENDING\|VALIDATED\|REJECTED`, indexé (file admin) |
| `s3Key` | varchar **nullable** | `null` après purge |
| `mimeType` | varchar | `application/pdf` |
| `uploadedAt` | timestamptz | `@CreateDateColumn` |
| `reviewedAt` | timestamptz nullable | horodatage de la décision |
| `purgedAt` | timestamptz nullable | **preuve technique de purge RGPD (traçabilité jury)** |

- Enums dans `common/enums.ts`. `CertificationStatus` **dédié** (mêmes valeurs que `GearStatus`
  mais découplé — on ne modifie pas SH-9).
- Nouvelle **migration TypeORM** (calque de la migration `gear`), index sur `status` et `freelanceId`.

### Cycle de vie (machine à états)
```
1. Freelance  POST /certifications  (multipart: file + {type, number, validUntil})
   ├─ magic bytes %PDF (octets 25 50 44 46)  +  taille ≤ CERT_MAX_FILE_MB  +  DTO validé
   ├─ DEDUP : rejet si un autre compte a déjà ce {type, number} validé/en attente (R2)
   ├─ strip métadonnées embarquées (XMP/Info : auteur, GPS, logiciel) via pdf-lib
   └─ StorageService.put (AES-256)  →  row status=PENDING, purgedAt=null
2. Admin  GET /certifications/pending          → file de validation (FIFO)
3. Admin  GET /certifications/:id/document      → StorageService.getSignedUrl(15 min)  (vérif visuelle)
4. Admin  PATCH /certifications/:id/review {decision, validUntil?}
   ├─ status=VALIDATED|REJECTED, reviewedAt=now
   └─ PURGE (sur les DEUX issues) : StorageService.delete → s3Key=null, purgedAt=now
   → il ne reste que les métadonnées structurées + (si validé) badge « Vérifié »
```
- Transition unique : `ConflictException` si la certif n'est plus `PENDING` (calque `reviewGear`).
- Purge **sur validation ET rejet** : on ne conserve jamais le document au-delà de sa finalité.

### Endpoints & RBAC
| Route | Rôle | Rôle métier |
|---|---|---|
| `POST /api/v1/certifications` | FREELANCE | upload (identité via `@CurrentUser()`) |
| `GET /api/v1/certifications/me` | FREELANCE | ses certifs (métadonnées + statut, pas de fichier) |
| `GET /api/v1/certifications/:id/document` | FREELANCE (propriétaire) **ou** ADMIN | Signed URL (si `s3Key` non nul) |
| `GET /api/v1/certifications/pending` | ADMIN | file de validation |
| `PATCH /api/v1/certifications/:id/review` | ADMIN | décision + purge |

### Sécurité / RGPD (non négociable, CLAUDE.md §8)
- **MIME réel par magic bytes** (`%PDF`), jamais l'extension (R7).
- **Identité via `@CurrentUser()`** — jamais d'`{id}` client (anti-usurpation, OWASP).
- **Bucket privé**, accès **uniquement par Signed URL ~15 min**, aucun lien permanent (R8).
- **AES-256 au repos** (SSE S3, fourni par `StorageService.put`).
- **Purge** = strip à l'upload + suppression du fichier post-décision ; `purgedAt` matérialise la
  minimisation (R3). *Nuance jury : strip ≠ purge — le strip retire les PII cachées, la purge
  supprime les PII visibles.*
- **Chiffrement en transit** (TLS 1.3) = responsabilité infra (SH-4/SH-5), hérité, hors code SH-10.
- **Étanchéité RBAC** : Recruiter interdit partout ; un Freelance ne voit/télécharge que SES
  certifs ; review réservé Admin.

### Dépendances ajoutées (`backend-core/package.json`)
`multer` + `@types/multer` (multipart via `FileInterceptor`), `pdf-lib` (strip métadonnées — pur JS,
pas de binaire natif → CI stable). **Pas** de `pdf-parse` (les métadonnées viennent du DTO).
`@aws-sdk/*` est apporté par SH-31.

### `.env.example` (SH-10)
`CERT_SIGNED_URL_TTL=900`, `CERT_MAX_FILE_MB=5`.

### Tests (Jest, `FakeStorageService` injecté)
- Upload OK → `PENDING` (+ `put` appelé, métadonnées strippées).
- Rejet non-PDF (magic bytes) ; rejet > `CERT_MAX_FILE_MB`.
- **Dedup** : rejet si `{type, number}` déjà présent sur un autre compte.
- Review `VALIDATED`/`REJECTED` → purge (`delete` appelé, `s3Key=null`, `purgedAt` set).
- `ConflictException` si double review.
- **Étanchéité RBAC** : Recruiter 403 ; Freelance ≠ propriétaire 403 sur `/:id/document`.

## 6. Hors périmètre (YAGNI — à tracer)
- Scan antivirus (UX progress bar §3.4.4) → `// TODO sécurité` explicite, ticket futur.
- OCR / extraction auto du `validUntil` depuis le PDF.
- Priorisation de la file admin par score de risque (niveau 2 avancé).
- Signalement communautaire & « Preuve d'Activité » (niveau 3) — tickets futurs.
- Intégration DGAC AlphaTango (niveau 4) — ticket futur.
- Purge cron des `PENDING` orphelins → règle de cycle de vie S3, `// TODO sécurité` explicite.
- CloudFront (c'est SH-17) ; composant front `FileUploader` (SH-20).

## 7. Ordre d'implémentation
1. **SH-31** d'abord (l'abstraction de stockage est un prérequis dur de SH-10).
2. **SH-10** ensuite, consomme `StorageService`.
