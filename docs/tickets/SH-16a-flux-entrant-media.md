**Titre du Ticket :** [SH-16a] Flux entrant du média (déclaration, upload présigné, enfilement, transcription du résultat)
**Type :** Feature
**Priorité :** High
**Estimation :** 5 Story Points
**Compétences RNCP visées :** C2.2.3 (validation des entrées, Signed URLs, étanchéité), C2.2.2 (tests, RBAC), C2.4.1 (Swagger)
**Lot :** Lot 1 (Web MVP)

### 0. Definition of Ready (DoR)
- [x] **Valeur Claire :** Story INVEST — isole le flux entrant (dépôt) du flux sortant (portfolio, SH-17/18), lui-même prérequis au pipeline réel de transcodage (SH-16b).
- [x] **Specs Complètes :** design validé — `docs/superpowers/specs/2026-08-24-EP04-media-portfolio-design.md` (§7 contrat de job, §9.1 vérification du dépôt, décision D1/D7/D9).
- [x] **UX/UI Validé :** N/A pour ce ticket — pas d'écran, seulement l'API consommée plus tard par le portfolio front.
- [x] **Faisabilité Technique :** `StorageService` (SH-31) élargi de 4 méthodes ; BullMQ + `QueueEvents` déjà éprouvés côté `media-service` (SH-15, worker no-op délibéré).
- [x] **Estimé :** 5 SP.

### 1. User Story (Le Besoin)
**En tant que** freelance,
**Je veux** déclarer un média, le déposer directement sur le stockage objet et être informé du résultat du transcodage,
**Afin de** constituer mon portfolio interactif sans qu'aucun octet vidéo ne transite par le monolithe.

### 2. Contexte & Valeur Business
* **Pourquoi maintenant ?** EP04 est le dernier Epic non entamé du Lot 1 ; le scaffolding `media-service`
  (SH-15) prouve que la file est consommée, mais rien ne produisait encore de job réel. SH-16a ferme ce
  chaînon avant que SH-16b (le vrai `ffprobe`/`ffmpeg`) n'ait quoi que ce soit à consommer.
* **KPI impacté :** vélocité EP04 ; qualité de la donnée du portfolio (le cœur différenciant reste
  l'Armurerie, mais le portfolio vidéo est la seconde preuve de compétence, cf. CLAUDE.md §1).

### 3. Critères d'Acceptation (Gherkin - BDD)

**Scénario 1 : Déclaration**
* **GIVEN** je suis connecté en tant que Freelance
* **WHEN** je `POST /api/v1/media` avec un titre, un `contentType` autorisé et une taille annoncée
* **THEN** je reçois `201`, une ligne `DRAFT` et une `upload.url` signée en méthode `PUT`
* **Statut :** ✅ vérifié — `media.service.spec.ts` (« crée une ligne DRAFT et rend une URL PUT signée »,
  « n'expose AUCUNE clé de stockage interne »), et recette manuelle Task 9 (§ ci-dessous, `201` réel obtenu).

**Scénario 2 : Dépôt direct sur S3 avec l'URL signée**
* **GIVEN** l'URL PUT signée du Scénario 1
* **WHEN** le navigateur dépose directement le fichier dessus (CORS + signature SigV4)
* **THEN** S3 répond `200`
* **Statut :** ❌ **NON vérifié en l'état — défaut bloquant.** La recette manuelle Task 9 obtient `400
  InvalidRequest` sur tout dépôt de contenu non vide. Voir « Défauts découverts en recette » ci-dessous
  (Défaut A). Le mécanisme de signature et le CORS du bucket sont corrects (un dépôt de **0 octet**
  passe en `200`) ; c'est la validation de somme de contrôle ajoutée par défaut par le SDK qui bloque
  tout contenu réel.

**Scénario 3 : Confirmation du dépôt**
* **GIVEN** un média `DRAFT` dont l'objet a été réellement déposé
* **WHEN** je `POST /api/v1/media/:id/complete`
* **THEN** je reçois `202`, le statut passe à `UPLOADED` (taille et type MIME **réels**, via `HeadObject`)
  et un job de transcodage est enfilé sur BullMQ
* **Statut :** ✅ vérifié — `media.service.spec.ts` (« vérifie le dépôt réel, passe en UPLOADED et enfile
  le job »), et recette manuelle Task 9 (`202` réel obtenu, statut `UPLOADED` confirmé par `GET /media/me`).

**Scénario 4 : Job terminé → transcription du résultat**
* **GIVEN** un média `UPLOADED` dont le job de transcodage complète côté `media-service`
* **WHEN** le résultat remonte via `QueueEvents`
* **THEN** le statut passe à `READY` et les métadonnées (durée, dimensions, pistes) sont transcrites
* **Statut :** ❌ **NON vérifié en conditions réelles — défaut bloquant.** Couvert au niveau **unitaire**
  par `media.listener.spec.ts` (le listener est câblé sur un `EventEmitter` de test, avec un
  `returnvalue` fourni **déjà sous forme de chaîne** — `'{"ok":true}'`). Contre le **vrai** BullMQ
  (5.81.x) et un **vrai** worker (`media-service`, SH-15), la recette manuelle Task 9 échoue
  systématiquement : `MediaTranscodeListener` journalise `Résultat de transcodage inexploitable :
  Résultat de transcodage illisible`, et le média reste bloqué en `UPLOADED`. Voir Défaut B ci-dessous.

**Scénario 5 : Dépôt mensonger (taille réelle > plafond)**
* **GIVEN** un média dont l'objet réellement déposé dépasse `MEDIA_MAX_FILE_MB`
* **WHEN** je confirme le dépôt
* **THEN** je reçois `400` **et** l'objet est purgé du stockage
* **Statut :** ✅ vérifié — `media.service.spec.ts` (« purge et refuse quand la taille RÉELLE dépasse
  le plafond », « purge et refuse quand le type RÉEL n'est pas dans la liste blanche »).

**Scénario 6 : Confirmation d'un média d'autrui**
* **GIVEN** un média appartenant à un autre freelance
* **WHEN** je tente de le confirmer
* **THEN** je reçois `404` (jamais `403` — ne pas révéler l'existence de la ressource)
* **Statut :** ✅ vérifié — `media.service.spec.ts` (« refuse la confirmation d'un média d'autrui »).

**Scénario 7 : Quota atteint**
* **GIVEN** j'ai déjà `MEDIA_MAX_PER_FREELANCE` médias non `FAILED`
* **WHEN** je déclare un média supplémentaire
* **THEN** je reçois `409`
* **Statut :** ✅ vérifié — `media.service.spec.ts` (« refuse au-delà du quota de médias », « interroge
  le quota sur les seuls médias non FAILED du freelance »).

**Scénario 8 : Redis indisponible à la confirmation**
* **GIVEN** la file BullMQ est injoignable
* **WHEN** je confirme un dépôt par ailleurs valide
* **THEN** je reçois `503`, sans perdre la vérification déjà faite du dépôt réel
* **Statut :** ✅ vérifié — `media.service.spec.ts` (« remonte un 503 quand la file est indisponible,
  sans perdre le dépôt déjà vérifié »), `media.queue.integration.spec.ts` (Redis réel).

**Scénario 9 : `DRAFT` de plus de 24 h**
* **GIVEN** une déclaration `DRAFT` plus ancienne que `MEDIA_DRAFT_TTL_HOURS`
* **WHEN** le balayage périodique s'exécute
* **THEN** la ligne et les objets associés sont purgés
* **Statut :** ✅ vérifié — `media.sweeper.spec.ts` (« purge la ligne ET les objets d'un DRAFT abandonné »,
  « ne cible que les déclarations DRAFT plus anciennes que le délai »).

### 4. Spécifications Techniques

Voir le design EP04 (`docs/superpowers/specs/2026-08-24-EP04-media-portfolio-design.md`), en particulier
§7 (contrat de job BullMQ, figé depuis SH-15), §9.1 (vérification `HeadObject` après dépôt) et la
décision D9 (double client S3 : `AWS_S3_ENDPOINT` interne pour l'API, `AWS_S3_PUBLIC_ENDPOINT` pour la
signature vue du navigateur).

* **Backend (NestJS) :**
  * `POST /api/v1/media`, `GET /api/v1/media/me`, `PATCH /api/v1/media/:id`,
    `POST /api/v1/media/:id/complete` — `@UseGuards(JwtAuthGuard)` + `RolesGuard([UserRole.FREELANCE])`,
    identité dérivée du token via `@CurrentUser()`.
  * `MediaService.createDraft` : quota, plafond de taille annoncée, extension dérivée du `contentType`
    (jamais d'un nom de fichier client), clé `private/media/<freelanceId>/<mediaId>/master.<ext>`.
  * `MediaService.completeUpload` : `storage.head()` fait foi (taille et type RÉELS) ; purge + `400` si
    hors plafond ou hors liste blanche ; sinon `UPLOADED` + `MediaQueue.enqueueTranscode`.
  * `MediaQueue` (producteur) : connexions Redis dédiées (`maxRetriesPerRequest: null`), `jobId = mediaId`
    (idempotence, pas de table de correspondance), `503` explicite si l'enfilement échoue.
  * `MediaTranscodeListener` (`QueueEvents`) : écrit en base sur `completed`/`failed`/`error` — seul le
    monolithe touche PostgreSQL, `media-service` reste un worker pur (décision D7).
  * `media.sweeper.ts` : purge périodique des `DRAFT` abandonnés (`MEDIA_DRAFT_TTL_HOURS`).
* **Sécurité (non négociable) :**
  * Aucune clé de stockage (`sourceKey`/`posterKey`/`hlsPrefix`) ne sort de l'API (`PublicMedia`).
  * `playlistKey` d'une rendition validée doit rester confinée au préfixe du média (anti-accès croisé).
  * Bucket privé, chiffrement AES-256 par défaut, Signed URL à durée courte (`MEDIA_SIGNED_URL_TTL`).
* **Base de données (PostgreSQL) :** table `user_media` (cf. `docs/conception/MLD-skillhunt.puml`) —
  migration TypeORM avec `up`/`down` réversible.
* **Stockage :** bucket `skillhunt-media`, préfixe `private/media/<freelanceId>/<mediaId>/`.

### 5. Défauts découverts en recette (Task 9) — NON corrigés dans ce ticket

La recette de bout en bout (Task 9) a été exécutée sur la stack conteneurisée réelle (gateway `:8088`,
LocalStack `:4566`, Redis + `media-service` du profil `app`) avec un compte freelance de démonstration.
Elle a mis en évidence **deux défauts structurels et déterministes** — reproductibles à 100 %, pas des
anomalies ponctuelles — qui empêchent la boucle `DRAFT → UPLOADED → READY` de se fermer via un client
réel. Par consigne du chantier de recette, ils ne sont **pas corrigés ici** : ce ticket documente les
preuves et la piste de correction pour un ticket dédié.

#### Défaut A — l'URL PUT signée rejette tout dépôt non vide

`@aws-sdk/client-s3`/`@aws-sdk/s3-request-presigner` en version `3.1075.0` calculent, par défaut
(`requestChecksumCalculation: 'WHEN_SUPPORTED'`, comportement par défaut du SDK depuis la ≈ 3.729),
une somme de contrôle CRC32 flexible pour `PutObjectCommand` — y compris lors de la **signature hors
ligne** d'une URL présignée, où le corps réel n'est pas encore connu. Le SDK embarque alors dans l'URL
un couple `x-amz-checksum-crc32=AAAAAA==` / `x-amz-sdk-checksum-algorithm=CRC32` correspondant au
CRC32 d'un contenu **vide**. Tout dépôt d'un contenu réellement non vide est donc rejeté par
S3/LocalStack :

```
400 InvalidRequest — Value for x-amz-checksum-crc32 header is invalid.
```

Preuve : un `PUT` du fichier de recette (1024 octets aléatoires) échoue en `400` ; un `PUT` à **0 octet**
sur la **même** URL signée réussit en `200` — confirmant que c'est bien le CRC32 figé à zéro, et non la
signature SigV4 ou le CORS du bucket, qui bloque le dépôt.

**Piste de correction (non appliquée) :** configurer `requestChecksumCalculation: 'WHEN_REQUIRED'` sur
le client S3 utilisé pour la signature (`buildPublicS3Client` dans `storage.module.ts`), pour retrouver
le comportement historique (pas de somme de contrôle ajoutée sans demande explicite).

#### Défaut B — le résultat du worker n'est jamais transcrit (double parsing JSON)

`bullmq@5.81.4` **parse déjà** `returnvalue` en JSON avant d'émettre l'événement `completed` de
`QueueEvents` (cf. `node_modules/bullmq/dist/cjs/classes/queue-events.js`, ligne
`args.returnvalue = JSON.parse(args.returnvalue);`) — malgré la déclaration de type de la librairie qui
documente encore `returnvalue` comme une chaîne. `MediaTranscodeListener` (et
`MediaService.applyTranscodeResult` → `parseTranscodeResult`) sont écrits en supposant recevoir une
**chaîne** à parser eux-mêmes. Résultat : `JSON.parse(<objet déjà parsé>)` échoue systématiquement
(`JSON.parse` convertit l'objet en la chaîne `"[object Object]"`, qui n'est pas du JSON valide), et
`MediaTranscodeListener` journalise, pour **chaque** job terminé, sans exception :

```
Résultat de transcodage inexploitable (<mediaId>) : Résultat de transcodage illisible
```

Le média reste bloqué en `UPLOADED` indéfiniment. Ce défaut est **indépendant du contenu** renvoyé par
le worker : il se serait produit aussi bien avec le worker no-op de SH-15 (`{"renditions":[]}`, confirmé
en recette) qu'avec un futur worker réel de SH-16b.

Pourquoi les tests unitaires ne l'ont pas détecté : `media.listener.spec.ts` câble le listener sur un
`EventEmitter` de test et lui fait `emit('completed', { jobId, returnvalue: '<chaîne JSON>' })` — un
mock fidèle à la documentation de type de `bullmq`, mais pas au comportement réel observé à l'exécution.
Le test d'intégration Redis existant (`media.queue.integration.spec.ts`) couvre l'enfilement, pas la
consommation par un vrai worker `media-service` distinct.

**Piste de correction (non appliquée) :** dans `MediaTranscodeListener`, ne plus `JSON.parse` un
`returnvalue` déjà objet — soit adapter `parseTranscodeResult` pour accepter directement un `unknown`
(en le passant tel quel si ce n'est pas une chaîne), soit `JSON.stringify` puis re-parser côté listener
pour rester compatible si un futur upgrade de `bullmq` revient au comportement chaîne. Compléter aussi
`media.listener.spec.ts` avec un test contre une **vraie** `QueueEvents`/Redis pour empêcher ce blind
spot de se reproduire (le même type de garde que celui déjà en place pour Redis dans
`media.queue.integration.spec.ts`).

### 6. Definition of Done (DoD)
- [x] Les 9 scénarios Gherkin sont couverts par des tests automatisés (7/9 verts en conditions réelles ;
  scénarios 2 et 4 verts uniquement en isolation — voir Défauts A et B, non corrigés dans ce ticket).
- [ ] Recette de bout en bout passée `DRAFT → UPLOADED → READY` à travers la gateway — **NON atteinte**
  (bloquée successivement par le Défaut A puis, en contournant celui-ci pour le diagnostic, par le
  Défaut B). Voir `.superpowers/sdd/task-9-report.md` pour le détail des appels et des réponses réelles.
- [x] Suite backend verte avec Redis, **zéro test `skipped`** ; lint et build verts (Task 9, Step 7).
- [x] Migration `user_media` appliquée et annulable (Task 3).
- [x] Bucket créé automatiquement (`localstack/init/01-bucket.sh`), chiffrement par défaut et CORS
  vérifiés (Task 2, Step 9).
- [x] Aucune clé de stockage dans une réponse d'API (test à clés exactes, Task 4).
- [x] `docs/BACKLOG.md`, MLD/MCD et ce ticket à jour.
- [ ] Code review effectuée et validée.
- [ ] Déployé en environnement de Staging.
