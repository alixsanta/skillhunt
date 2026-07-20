**Titre du Ticket :** [SH-10] Certifications — upload sécurisé (PDF, magic bytes, Signed URL, purge PII) + validation Admin
**Type :** User Story / Feature
**Priorité :** High
**Estimation :** 5 Story Points (Fibonacci)
**Compétences RNCP visées :** C2.2.3 (sécurité des entrées + RGPD), C2.2.2 (tests RBAC), C2.4.1 (Swagger)
**Lot :** Lot 1 (Web MVP)

> **Dépend de [SH-31](SH-31-storage-abstraction.md)** (abstraction de stockage objet).
> Spec de design : `docs/superpowers/specs/2026-06-26-SH-10-31-certifications-storage-design.md`.

### 0. Definition of Ready (DoR)
- [x] **Valeur Claire :** prouver la légitimité d'un Freelance (badge « Vérifié »), socle anti-fraude.
- [x] **Specs Complètes :** critères Gherkin ci-dessous (cas passants + erreurs + RGPD).
- [x] **UX/UI Validé :** n/a backend (le composant front `FileUploader` est SH-20).
- [x] **Faisabilité Technique :** `StorageService` (SH-31), `multer` (multipart), `pdf-lib` (strip
      métadonnées), magic bytes, workflow calqué sur SH-9 (Armurerie).
- [x] **Estimé :** 5 SP.

### 1. User Story
**En tant que** Freelance (ex. télépilote drone),
**Je veux** uploader ma certification au format **PDF**,
**Afin de** prouver ma légitimité et obtenir le badge « Vérifié » après validation par un Admin.

### 2. Contexte & Valeur Business
* **Pourquoi maintenant ?** Complète l'**EP02** (jalon J2). Socle du **risque R2** (fraude, criticité
  16, le risque n°1 du dossier) et de la conformité **RGPD** (R3).
* **KPI impacté :** taux de profils vérifiés, confiance recruteurs, conformité RGPD.

### 3. Critères d'Acceptation (Gherkin - BDD)

**Scénario 1 : Upload réussi**
* **GIVEN** je suis connecté en tant que **Freelance**
* **WHEN** je dépose un **PDF valide ≤ 5 Mo** avec les métadonnées (`type`, `number`, `validUntil`)
* **THEN** le fichier est **assaini** (métadonnées embarquées retirées) puis stocké **chiffré (AES-256)**
* **AND** ma certification passe au statut **`PENDING`** (« en cours de vérification »).

**Scénario 2 : Format ou taille invalide**
* **GIVEN** je tente d'uploader un `.exe` renommé `.pdf`, ou un fichier > 5 Mo
* **WHEN** le serveur lit les **magic bytes** (et non l'extension)
* **THEN** le système **rejette** le fichier (400) avec un message « Format non supporté » / « Fichier trop volumineux ».

**Scénario 3 : Détection de doublon (anti-fraude)**
* **GIVEN** un numéro de brevet déjà déclaré (en attente ou validé) par **un autre compte**
* **WHEN** je tente de l'uploader
* **THEN** le système **rejette** (409) — signal de fraude (R2).

**Scénario 4 : Consultation Admin via Signed URL**
* **GIVEN** une certification `PENDING`
* **WHEN** l'Admin demande le document
* **THEN** il reçoit une **Signed URL valable ~15 min** pour un **seul fichier** (aucun lien permanent).

**Scénario 5 : Validation / rejet + purge RGPD**
* **GIVEN** une certification `PENDING`
* **WHEN** l'Admin la **valide** ou la **rejette**
* **THEN** le statut devient `VALIDATED`/`REJECTED`, `reviewedAt` est renseigné
* **AND** le **fichier d'origine est purgé** (supprimé du stockage, `s3Key=null`, `purgedAt` renseigné)
* **AND** seules les **métadonnées de validité** subsistent (+ badge « Vérifié » si validé).

**Scénario 6 : Double traitement**
* **GIVEN** une certification déjà traitée (non `PENDING`)
* **WHEN** l'Admin tente de la re-traiter
* **THEN** le système renvoie **409** (`ConflictException`).

**Scénario 7 : Étanchéité RBAC**
* **GIVEN** un **Recruiter**, ou un **Freelance** qui n'est pas le propriétaire
* **WHEN** il tente d'accéder au document d'une certification ou à la file de validation
* **THEN** le système renvoie **403**.

### 4. Spécifications Techniques
* **Backend (NestJS) — module `certifications/` :** controller + service + entité + DTOs (calque `gear/`).
* **Endpoints (identité via `@CurrentUser()`, jamais d'`{id}` client) :**
    * `POST /api/v1/certifications` — `FREELANCE` — multipart (`FileInterceptor`).
    * `GET /api/v1/certifications/me` — `FREELANCE` — ses certifs (métadonnées + statut).
    * `GET /api/v1/certifications/:id/document` — `FREELANCE` (propriétaire) **ou** `ADMIN` — Signed URL.
    * `GET /api/v1/certifications/pending` — `ADMIN` — file de validation (FIFO).
    * `PATCH /api/v1/certifications/:id/review` — `ADMIN` — décision + purge.
* **DTO `class-validator`** (messages en français, `@ApiProperty`) :
    * upload : `type` (enum), `number` (string non vide), `validUntil` (date future).
    * review : `decision` (`VALIDATED|REJECTED`), `validUntil?` (confirmation).
    * query : pagination (`page`, `limit`) + filtre `status`.
* **Sécurité & RGPD (non négociable, CLAUDE.md §8) :**
    * **MIME réel par magic bytes** (`%PDF` = `25 50 44 46`), pas l'extension.
    * **Strip des métadonnées embarquées** (XMP/Info : auteur, GPS, logiciel) via `pdf-lib` avant stockage.
    * Stockage **privé** + **AES-256 au repos** via `StorageService.put` (SH-31).
    * Accès fichier **uniquement par Signed URL ~15 min** (`StorageService.getSignedUrl`), bucket privé (R8).
    * **Purge** post-décision (validation **et** rejet) : `StorageService.delete` → `s3Key=null`,
      `purgedAt=now` (minimisation RGPD, R3).
* **Base de données (PostgreSQL) — table `user_certifications` :** `id`, `freelanceId` (FK indexée),
  `type` (enum `CertificationType`), `number`, `validUntil`, `status` (enum `CertificationStatus`
  `PENDING|VALIDATED|REJECTED`, indexé), `s3Key` (nullable), `mimeType`, `uploadedAt`, `reviewedAt`
  (nullable), `purgedAt` (nullable). Enums dans `common/enums.ts`. **Migration TypeORM** dédiée.
* **Stockage :** préfixe `private/certifications/{freelanceId}/{id}.pdf`.
* **Dépendances :** `multer` + `@types/multer`, `pdf-lib`. (`@aws-sdk/*` via SH-31.)
* **Env :** `CERT_SIGNED_URL_TTL=900`, `CERT_MAX_FILE_MB=5`.

### 5. Definition of Done (DoD)
- [x] Module `certifications/` (controller, service, entité, DTOs) + migration.
- [x] Enums `CertificationType` / `CertificationStatus` ajoutés.
- [x] Magic bytes + limite de taille + strip métadonnées + dedup numéro de brevet.
- [x] Stockage AES-256 + Signed URL 15 min + purge (`s3Key=null`, `purgedAt`).
- [x] Tests unitaires Jest (upload OK/KO, dedup, review+purge, conflit) — 14 specs.
- [x] **Tests RBAC d'étanchéité** : Freelance non-propriétaire 403 (service) ; Recruiter 403 (RolesGuard partagé, `roles.guard.spec`).
- [x] **CI verte** : lint + build + tests (51/51). *(audit : voir SH-32, dette transitive préexistante.)*
- [x] Swagger / OpenAPI à jour (`@ApiTags`, `@ApiConsumes('multipart/form-data')`, `@ApiBody`) — C2.4.1.
- [x] Aucun secret en dur ; variables sensibles en env (`CERT_*`, `AWS_*`).
- [x] `// TODO sécurité` explicites (scan antivirus, purge cron des `PENDING` orphelins).
- [x] Backlog mis à jour (SH-10 → 🟢).
