**Titre du Ticket :** [SH-31] Abstraction de stockage objet — `StorageService` + adaptateur S3 + LocalStack
**Type :** Feature (infrastructure)
**Priorité :** High
**Estimation :** 3 Story Points (Fibonacci)
**Compétences RNCP visées :** C2.1.2 (qualité/structure), C2.2.3 (sécurité des accès — Signed URL)
**Lot :** Lot 1 (Web MVP)

> **Prérequis de SH-10** (Certifications) et réutilisé par **SH-17** (média). Découpe la brique
> d'infrastructure réutilisable hors de la feature métier. Voir la spec de design :
> `docs/superpowers/specs/2026-06-26-SH-10-31-certifications-storage-design.md`.

### 0. Definition of Ready (DoR)
- [x] **Valeur Claire :** fournir un accès stockage objet découplé, testable sans AWS réel.
- [x] **Specs Complètes :** critères Gherkin ci-dessous (cas passants + erreurs).
- [x] **UX/UI Validé :** n/a (couche infrastructure).
- [x] **Faisabilité Technique :** `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` ; LocalStack
      (conteneur Docker) pour le dev/test ; pattern port/adaptateur + provider NestJS.
- [x] **Estimé :** 3 SP.

### 1. User Story
**En tant que** développeur du backend-core,
**Je veux** un service de stockage objet abstrait (interface unique, implémentations interchangeables),
**Afin de** stocker/servir/supprimer des fichiers privés sans coupler le code métier à AWS, et tester
sans compte AWS réel.

### 2. Contexte & Valeur Business
* **Pourquoi maintenant ?** Bloquant pour **SH-10** (upload de certifications). Le seul point dur
  externe (AWS) est neutralisé par LocalStack → le développement avance sans attendre l'infra cloud.
* **KPI impacté :** vélocité (déblocage SH-10/SH-17), coût cloud nul en dev, CI hermétique.

### 3. Critères d'Acceptation (Gherkin - BDD)

**Scénario 1 : Dépôt et récupération via Signed URL**
* **GIVEN** un `StorageService` configuré
* **WHEN** je dépose un objet (`put`) puis demande une `getSignedUrl` avec un TTL
* **THEN** l'objet est stocké **chiffré au repos (AES-256)**
* **AND** je reçois une URL temporaire d'accès **expirant après le TTL**.

**Scénario 2 : Suppression (purge)**
* **GIVEN** un objet stocké
* **WHEN** j'appelle `delete(key)`
* **THEN** l'objet n'est plus accessible.

**Scénario 3 : Tests sans réseau**
* **GIVEN** la suite de tests unitaires
* **WHEN** elle s'exécute en CI
* **THEN** elle utilise `FakeStorageService` (mémoire) **sans aucun appel réseau ni AWS**.

**Scénario 4 : Bascule d'environnement**
* **GIVEN** `AWS_S3_ENDPOINT` renseigné (LocalStack) ou vide (AWS réel)
* **WHEN** l'application démarre
* **THEN** l'adaptateur S3 cible le bon endpoint **sans changement de code**.

### 4. Spécifications Techniques
* **Module :** `backend-core/src/storage/`.
* **Interface (port) :**
  ```ts
  interface StorageService {
    put(key: string, body: Buffer, contentType: string): Promise<void>; // SSE AES-256
    getSignedUrl(key: string, ttlSeconds: number): Promise<string>;
    delete(key: string): Promise<void>;
  }
  ```
* **`S3StorageService` :** `@aws-sdk/client-s3` (`PutObjectCommand` avec `ServerSideEncryption: 'AES256'`,
  `DeleteObjectCommand`) + `@aws-sdk/s3-request-presigner` (`getSignedUrl`). Endpoint/region/bucket/creds
  via env. `forcePathStyle: true` quand `AWS_S3_ENDPOINT` est défini (compat LocalStack).
* **`FakeStorageService` :** `Map<string, Buffer>` ; `getSignedUrl` → URL factice déterministe.
* **`StorageModule` :** provider liant le token `STORAGE_SERVICE` à l'implémentation choisie ; exporté
  pour injection dans les autres modules. Tests : override de provider vers le fake.
* **Sécurité :** aucun secret en dur ; bucket **privé** (jamais d'ACL publique). Pas de log du contenu.
* **Infra :** `docker-compose.yml` → service `localstack` (service `s3`, port 4566). `.env.example`
  documente `AWS_REGION`, `AWS_S3_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_ENDPOINT`
  (aucune vraie valeur).

### 5. Definition of Done (DoD)
- [x] Interface `StorageService` + `S3StorageService` + `FakeStorageService` + `StorageModule`.
- [x] Chiffrement au repos (AES-256) au `put` ; Signed URL avec TTL ; `delete` effectif.
- [x] Tests Jest unitaires sur le fake (put/get/delete) **sans réseau**.
- [x] Procédure d'intégration LocalStack documentée (manuelle, non bloquante en CI) — `src/storage/README.md`.
- [x] `npm run lint`, `npm run test`, `npm run build` verts.
- [x] Service `localstack` ajouté à `docker-compose.yml`.
- [x] Aucun secret en dur ; `.env.example` à jour (variables AWS, sans valeur).
- [x] Backlog mis à jour (SH-31 → 🟢).
