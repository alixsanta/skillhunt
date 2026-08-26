# EP04 — Microservice Médias & Portfolio interactif — Design

> Spec de conception issue d'un brainstorming (2026-08-24). Cibles : `media-service` (nouveau, Node + FFmpeg),
> `backend-core` (NestJS), `frontend-web` (React).
> Couvre les tickets **SH-15 → SH-18**. Dernier Epic non entamé du Lot 1.
> Compétences RNCP : **C2.1.2** (scaffolding, normes), **C2.2.2** (tests, pipeline asynchrone),
> **C2.2.3** (contrôle de contenu, Signed URLs, étanchéité RBAC), **C2.4.1** (Swagger, portfolio).

## 1. Objectif & valeur

EP04 livre la deuxième des trois fonctionnalités différenciantes du dossier : le **portfolio interactif**
(« preuve de compétence par l'image »). Un freelance dépose une vidéo 4K ou 360°, la plateforme la
transcode de façon asynchrone en HLS multi-débit, et un recruteur la visionne sans qu'aucun lien
permanent ni bucket public n'existe (R8).

Deux valeurs distinctes :

1. **Métier** — un télépilote prouve son savoir-faire par ses rushes, pas par un CV. C'est le pendant
   visuel de l'Armurerie (donnée technique).
2. **Architecturale** — c'est le seul chantier qui matérialise réellement le « traitement lourd isolé »
   qui justifie l'architecture hybride du CLAUDE.md §2. Jusqu'ici, l'asynchrone se limitait au bus
   d'événements de SH-14 (messages de quelques octets). Ici, un worker CPU-bound scalable
   horizontalement traite des fichiers de plusieurs centaines de Mo.

## 2. Périmètre (validé en brainstorming)

**Dans le périmètre** : dépôt vidéo par URL PUT présignée, transcodage HLS ABR (360p/720p/1080p) +
poster, détection de projection 360°, lecture par manifeste réécrit en segments signés, consultation
par un recruteur, portfolio front (3 pages) avec lecteur HLS et visionneuse 360° WebGL.

**Hors périmètre, explicitement (chacun mérite son propre ticket) :**

- **Photos.** Le MLD (`docs/conception/MLD-skillhunt.puml:82`) anticipait `IMAGE` dans l'enum `type`.
  Décision : **vidéo uniquement** (l'intitulé de SH-18 dit « exposition vidéos 4K/360° »). L'enum
  `MediaType` est néanmoins conçu extensible : ajouter `IMAGE` ne cassera pas la migration.
- **Pièces jointes du chat.** Le périmètre de SH-24 notait « partage de fichiers reporté avec EP04 »,
  et le MLD prévoit `messages.attachments[{s3Key, mimeType}]`. **Livrer EP04 ne le débloque pas** :
  aucun des 4 tickets n'y touche. Le port élargi de SH-16 lui fournira ses fondations ; l'implémentation
  reste à ticketer.
- **CloudFront réellement provisionné.** Décision tracée en §3 (D2) : LocalStack S3 en dev comme en
  staging, coût cloud nul. CloudFront reste une décision d'architecture documentée, non déployée.
- **Modération / validation admin des vidéos.** Contrairement au matériel (SH-9) et aux certifications
  (SH-10), un média `READY` est visible sans revue. À ticketer si le besoin apparaît.
- **Purge du master après transcodage.** Le master est conservé (ré-encodage possible si l'échelle ABR
  évolue). Pas d'argument RGPD ici : contrairement à une certification, une vidéo de portfolio a
  vocation à être vue. La réponse production serait une règle de cycle de vie S3 vers stockage froid.

## 3. Décisions de conception (validées en brainstorming)

| # | Décision | Choix retenu |
|---|---|---|
| D1 | Chemin d'upload | **PUT présigné, navigateur → S3 en direct.** backend-core délivre l'URL après contrôle RBAC + quota. Aucun octet vidéo ne traverse Node. Le pattern certifications (buffer 10 Mo en RAM) ne tient pas à 500 Mo. |
| D2 | Stockage / CDN | **LocalStack S3**, réutilisation de `StorageService` (SH-31). Coût nul, CI hermétique, Signed URLs réelles. CloudFront documenté, non provisionné. |
| D3 | Sortie du transcodage | **HLS multi-débit 360p/720p/1080p + poster.** Standard réel du streaming, justifie le découpage asynchrone. |
| D4 | Lecture d'un bucket privé | **Manifeste généré à la volée, chaque segment réécrit en Signed URL 15 min.** Le player attaque S3 en direct ; rien de permanent. Limite assumée : une session > 15 min recharge le manifeste. |
| D5 | 360° | **Sonde `ffprobe` des tags de projection + rendu WebGL côté front** (three.js sur texture `<video>`). Coût CPU serveur nul ; c'est le fonctionnement de YouTube/Vimeo. Pas de projection serveur (`v360`). |
| D6 | File de jobs | **BullMQ.** Retries, backoff exponentiel, dead-letter, concurrence et jobs bloqués fournis. Les Redis Streams de SH-14 imposeraient de tout réécrire à la main — c'est précisément la dette tracée en SH-35. |
| D7 | Propriété de la donnée | **backend-core producteur + écouteur `QueueEvents` ; `media-service` worker pur.** PostgreSQL reste la propriété exclusive du monolithe. Aucune API inter-services à authentifier, donc SH-4 (mTLS) n'est pas un prérequis. |
| D8 | `renditions` | **Colonne `jsonb`.** Jamais interrogée seule, toujours lue avec son parent pour fabriquer le manifeste maître. Une table fille coûterait une jointure et un repository pour zéro requête propre. |
| D9 | Endpoint public S3 | **Variable dédiée `AWS_S3_PUBLIC_ENDPOINT`.** `AWS_S3_ENDPOINT` est un nom Docker interne, invisible du navigateur. Second presigner configuré sur l'endpoint public. **Aucune modification de la gateway** : avec un vrai S3, le navigateur ne passe jamais par la gateway — c'est tout l'intérêt de D1. |
| D10 | Frontière SH-16 / SH-17 | **SH-16 = ce qui entre, SH-17 = ce qui sort** (voir §11). Écart assumé vis-à-vis des intitulés du backlog, qui seront ajustés. |
| D11 | Nom de table | **`user_media`**, aligné sur `user_certifications`. Le MLD dit `media` : c'est le `.puml` qui sera corrigé, pas le code. |

## 4. Architecture

```
Navigateur ──1. POST /api/v1/media (métadonnées)──▶ backend-core
           ◀─── { mediaId, upload:{ url PUT signé 15 min } } ───
           ──2. PUT master.mp4 ─────────────────▶ S3/LocalStack
                                                  private/media/<freelanceId>/<mediaId>/master.mp4
           ──3. POST /api/v1/media/:id/complete ▶ backend-core
                                                    │ head() : taille + type RÉELS
                                                    └─enqueue─▶ Redis (BullMQ « media-transcode »)
                                                                        │
                                              media-service (worker) ◀──┘
                                                ffprobe : durée, dimensions, projection 360°
                                                ffmpeg  : HLS 360p/720p/1080p + poster.jpg
                                                put S3  : .../hls/*.m3u8 | *.ts
                                                return  : { duration, width, height, type, renditions[] }
                                                                        │
           backend-core (QueueEvents) ◀──completed / failed────────────┘
                          └─ UPDATE user_media SET status = READY | FAILED

Lecture :  GET /media/:id/master.m3u8      → RBAC → manifeste généré DEPUIS LA BASE
           GET /media/:id/:rendition.m3u8  → RBAC → playlist lue en S3, chaque segment
                                              réécrit en Signed URL 15 min → hls.js
           GET /media/:id/poster           → RBAC → 302 vers Signed URL
```

**Frontières de service.** `media-service` est un **worker pur** : ni HTTP métier, ni PostgreSQL, ni JWT.
Il consomme un job typé, lit et écrit S3, rend un résultat typé. Il n'expose que `/health` (sonde Docker)
et `/metrics` (Prometheus, stack SH-29). Identité, autorisation et vérité métier restent au monolithe.

**Trois unités testables isolément** : `MediaService` (Nest — cycle de vie, RBAC, réécriture de manifeste,
testable sur `FakeStorageService`), `TranscodeWorker` (fonction `master → renditions`, testable sur une
fixture de 2 s), `MediaPlayer` (front, testable sur un manifeste simulé).

## 5. Modèle de données

### 5.1 Enums (`backend-core/src/common/enums.ts`)

```ts
export enum MediaStatus {
  DRAFT      = 'DRAFT',      // ligne créée, URL PUT délivrée, rien confirmé
  UPLOADED   = 'UPLOADED',   // dépôt confirmé + vérifié (head), job enfilé
  PROCESSING = 'PROCESSING', // worker démarré
  READY      = 'READY',      // HLS + poster disponibles
  FAILED     = 'FAILED',     // échec définitif après 3 tentatives
}

// Extensible à IMAGE sans migration de rupture (cf. §2).
export enum MediaType {
  VIDEO     = 'VIDEO',
  VIDEO_360 = 'VIDEO_360',
}
```

### 5.2 Entité `Media` → table `user_media`

Calquée sur `user_certifications` : UUID `gen_random_uuid()`, types enum PostgreSQL dédiés, FK `CASCADE`
indexée, `timestamptz`.

| Colonne | Type | Rôle |
|---|---|---|
| `id` | uuid PK | |
| `freelanceId` | uuid FK→`users`, **indexé** | étanchéité + jointure portfolio |
| `title` | varchar(120) | validé par DTO |
| `description` | text nullable | ≤ 2000 caractères |
| `type` | enum `MediaType`, défaut `VIDEO` | positionné par le worker après sonde |
| `status` | enum `MediaStatus`, **indexé** | cycle §5.3 |
| `sourceKey` | varchar | `private/media/<freelanceId>/<mediaId>/master.mp4` |
| `posterKey` | varchar nullable | vignette extraite à t = 1 s |
| `hlsPrefix` | varchar nullable | `private/media/<freelanceId>/<mediaId>/hls/` |
| `renditions` | **jsonb** nullable | `[{ name, width, height, bandwidth, playlistKey }]` |
| `durationSeconds`, `width`, `height` | int nullable | sondés par `ffprobe` |
| `sizeBytes` | bigint nullable | taille réelle du master (`head`) |
| `mimeType` | varchar | déclaré à la création, **confirmé** par `ffprobe` |
| `errorReason` | varchar nullable | message court utilisateur, **jamais de stack** |
| `createdAt` / `updatedAt` / `processedAt` | timestamptz | `processedAt` nullable |

### 5.3 Cycle de vie

```
DRAFT ──(complete + head OK)──▶ UPLOADED ──(worker démarre)──▶ PROCESSING ──▶ READY
  │                                                                  │
  │ (jamais confirmé > 24 h)                                         └──(3 échecs)──▶ FAILED
  └──▶ balayage : purge ligne + objet
```

### 5.4 Arborescence de stockage

Prolongement direct de `private/certifications/<freelanceId>/<id>.pdf` :

```
private/media/<freelanceId>/<mediaId>/master.mp4
                                     /poster.jpg
                                     /hls/720p.m3u8
                                     /hls/720p/seg-00001.ts …
```

### 5.5 Élargissement du port `StorageService` (SH-31)

SH-31 avait défini un port volontairement minimal (`put` / `getSignedUrl` / `delete`). Le média en
demande quatre de plus. Élargissement **assumé** : `FakeStorageService` et `S3StorageService` gagnent
quatre méthodes et leurs tests.

| Ajout | Justification |
|---|---|
| `getSignedUploadUrl(key, ttl, contentType)` | le PUT présigné de D1 |
| `head(key) → { size, contentType }` | une URL PUT signée **ne sait pas plafonner la taille** ; on vérifie le poids réel à la confirmation |
| `get(key) → Buffer` | lire la playlist variante (quelques Ko) pour y réécrire les segments |
| `deletePrefix(prefix)` | supprimer un média = master + poster + N segments, pas un objet |

### 5.6 Variables d'environnement introduites

Aucun secret : toutes vont dans `.env.example` et les deux fichiers compose (CLAUDE.md §8.4).

| Variable | Défaut | Service | Rôle |
|---|---|---|---|
| `AWS_S3_PUBLIC_ENDPOINT` | `http://localhost:4566` | backend-core | Endpoint signé **vu du navigateur** (D9) |
| `MEDIA_MAX_FILE_MB` | `500` | backend-core | Plafond de taille du master |
| `MEDIA_MAX_PER_FREELANCE` | `20` | backend-core | Quota de médias non `FAILED` |
| `MEDIA_SIGNED_URL_TTL` | `900` | backend-core | Durée de vie des URLs signées (upload et segments) |
| `MEDIA_DRAFT_TTL_HOURS` | `24` | backend-core | Seuil du balayage des `DRAFT` orphelines |
| `MEDIA_WORKER_CONCURRENCY` | `1` | media-service | Jobs simultanés par conteneur |
| `MEDIA_TMP_DIR` | `/tmp/media` | media-service | Répertoire de travail du transcodage |

## 6. APIs `api/v1/media` (backend-core)

Toutes sous `@UseGuards(JwtAuthGuard, RolesGuard)`, `@ApiTags('🎬 Médias')`, DTO `class-validator` —
conventions de `gear` et `certifications`.

| Verbe | Route | Rôle | Effet |
|---|---|---|---|
| `POST` | `/media` | FREELANCE | Ligne `DRAFT` → `{ media, upload:{ url, method:'PUT', headers, expiresIn:900 } }` |
| `POST` | `/media/:id/complete` | FREELANCE (propriétaire) | `head()` → contrôle réel → `UPLOADED` → enfile le job → **202** |
| `GET` | `/media/me` | FREELANCE | Liste paginée (filtre `status`) |
| `PATCH` | `/media/:id` | FREELANCE (propriétaire) | Titre / description uniquement |
| `DELETE` | `/media/:id` | FREELANCE (propriétaire) | `deletePrefix()` + suppression de ligne → **204** |
| `GET` | `/media/freelance/:freelanceId` | RECRUITER, ADMIN | Médias **`READY` uniquement**, vue publique — calque de `GET /gear/freelance/:id` (SH-39) |
| `GET` | `/media/:id/master.m3u8` | propriétaire, RECRUITER, ADMIN | Manifeste maître **généré depuis la base**, aucun appel S3 |
| `GET` | `/media/:id/:rendition.m3u8` | idem | Playlist variante lue en S3, segments réécrits en Signed URL |
| `GET` | `/media/:id/poster` | idem | **302** vers Signed URL courte |

`PublicMedia` exclut `sourceKey`, `posterKey`, `hlsPrefix` et les `playlistKey` : **aucune clé de stockage
interne ne sort de l'API**, comme `PublicCertification` exclut `s3Key`.

**Précisions levant deux ambiguïtés :**

- **Ordre de déclaration des routes.** `master.m3u8` correspond aussi au motif `:rendition.m3u8`.
  La route `master.m3u8` est donc déclarée **avant** dans le contrôleur (NestJS résout dans l'ordre de
  déclaration), et `master` n'appartient de toute façon pas à la liste blanche des renditions.
- **Statut exigé à la lecture.** Les trois routes de lecture (`master.m3u8`, `:rendition.m3u8`, `poster`)
  exigent `status = READY`, **sauf pour le propriétaire**, qui peut consulter le poster d'un média encore
  en traitement. Un `RECRUITER` sur un média non `READY` reçoit un **404** (et non un 403 : l'existence
  d'un média non publié ne lui est pas révélée).

**Deux écarts assumés** vis-à-vis des patterns existants :

- Le **poster répond en 302**, là où `GET /certifications/:id/document` renvoie `{ url }`. Un `<img src>`
  ne sait pas déréférencer un JSON.
- Le `:rendition` est un **paramètre de chemin validé par liste blanche** (`360p|720p|1080p`). C'est le
  vecteur de traversée de chemin de cette feature : il ne touche **jamais** une clé S3 par concaténation.

## 7. Contrat du worker (`media-service`)

```ts
// Job « media-transcode »
{ mediaId, sourceKey, outputPrefix, posterKey }

// Résultat rendu à BullMQ
{ durationSeconds, width, height, type, mimeType,
  renditions: [{ name: '720p', width, height, bandwidth, playlistKey }] }
```

**Déroulé** : URL GET signée → téléchargement du master dans un répertoire temporaire (plutôt que
`ffmpeg -i <url>` : le 4K supporte mal les aléas réseau en cours de seek) → `ffprobe` (durée, dimensions,
tags `spherical` / `equirectangular`) → `ffmpeg` échelle ABR + `poster.jpg` à t = 1 s → dépôt des sorties
→ **nettoyage du temporaire y compris en cas d'échec**.

- Exposition : `/health` (`node:http`, zéro framework) et `/metrics` (`prom-client`, déjà présent dans
  backend-core) — jobs traités, histogramme de durée, échecs. C'est ce qui rend SH-16 **mesurable** dans
  la stack SH-29 plutôt que déclaratif.
- Progression : `job.updateProgress()`, alimentée par la sortie `-progress` de ffmpeg.
- Scalabilité : `MEDIA_WORKER_CONCURRENCY` (défaut **1**, le transcodage est CPU-bound) et
  `docker compose up --scale media-service=2`, BullMQ répartit. C'est la démonstration concrète des
  « workers auto-scalables » de SH-16, à vérifier en recette.

## 8. Front — portfolio interactif (`features/media/`)

| Route | Rôle | Contenu |
|---|---|---|
| `/mon-portfolio` | FREELANCE | Grille de ses médias, statut vivant, CTA « Ajouter une vidéo » |
| `/mon-portfolio/ajouter` | FREELANCE | Formulaire + upload avec barre de progression |
| `/freelances/:freelanceId/portfolio` | RECRUITER | Médias `READY`, lecteur — calque de `/freelances/:id/armurerie` (SH-21b) |

- `MediaUploader` — orchestre les 3 étapes. **Le PUT vers S3 part d'une instance axios nue**, sans les
  intercepteurs d'auth de `api/client.ts` : un en-tête `Authorization` envoyé à S3 invalide la signature
  SigV4. Piège n° 1 de la feature, test dédié.
- `MediaPlayer` — `lazy()` sur `hls.js`, chargé **au clic**, pas au montage (pattern Leaflet de
  `Search.tsx`, SH-23). Le `<video>` garde ses **contrôles natifs** : accessibilité robuste et gratuite,
  plutôt qu'un lecteur maison à recâbler au clavier (SH-27 est bloquant < 90).
- `Media360Viewer` — `lazy()` sur `three`, chargé **uniquement si `type === VIDEO_360`**. Rotation
  automatique désactivée sous `prefers-reduced-motion`, navigation clavier en plus de la souris (SH-44).
- `useMediaStatus` — react-query, interrogation espacée tant que le média n'est ni `READY` ni `FAILED`,
  changement d'état annoncé en `aria-live`.
- `MediaCard` — poster, durée, badge 360°, état (« En traitement… » / « Échec » + raison).

`hls.js` et `three` sont deux dépendances non triviales mais **toutes deux hors du bundle initial** :
zéro impact sur les pages publiques auditées par Lighthouse.

**Piège technique** : `hls.js` récupère les manifestes en XHR sans en-têtes. Il faut un `xhrSetup` qui
pose le `Authorization: Bearer` **uniquement sur les URLs de notre origine** — l'envoyer vers S3
invaliderait la signature.

## 9. Cas limites & sécurité

### 9.1 Contrôle du contenu (R7) — la différence honnête avec les certifications

Pour un PDF de 5 Mo, on lit les magic bytes en RAM. Pour un master de 500 Mo qui ne transite jamais par
Node, c'est impossible. La chaîne devient :

1. **DTO** — `contentType` en liste blanche (`video/mp4`, `video/quicktime`), `sizeBytes` annoncé
   ≤ `MEDIA_MAX_FILE_MB` (défaut **500**), quota `MEDIA_MAX_PER_FREELANCE` (défaut **20**) → **409**.
   Le quota compte les lignes **non `FAILED`** : un échec ne consomme pas le quota du freelance.
2. **À la confirmation** — `head()` donne taille et type **réels** ; si l'annonce mentait : purge + **400**.
3. **Dans le worker** — `ffprobe` est le **vrai** contrôle de contenu. Pas de flux vidéo décodable ⇒
   `FAILED` + purge du prefix. Un `.exe` renommé `.mp4` meurt ici.
4. **À la lecture** — `:rendition` validé par liste blanche, jamais concaténé brut dans une clé S3.

### 9.2 Défaillances

| Situation | Comportement |
|---|---|
| Échec de transcodage | BullMQ : 3 tentatives, backoff exponentiel, `removeOnFail: false` (dead-letter inspectable) → `FAILED` + `errorReason` + purge des segments partiels |
| Worker tué en cours de job | Job bloqué détecté par BullMQ (renouvellement de verrou) et réenfilé |
| Redis indisponible à l'enfilement | **503 explicite**, pas de best-effort : le job **est** l'opération métier, contrairement au bus d'événements. Même distinction que celle tranchée en SH-36 pour le TokenStore |
| Ligne `DRAFT` orpheline (URL délivrée, dépôt jamais confirmé) | Balayage périodique > 24 h : purge ligne + objet. Nécessite `@nestjs/schedule` (dépendance Nest first-party) |
| Session de lecture > 15 min | Le manifeste est rechargé (limite assumée de D4) |

### 9.3 Étanchéité

Un `FREELANCE` n'accède qu'à ses propres médias (id issu du token, jamais d'un paramètre client).
Un `RECRUITER` ne voit que les médias `READY`, et jamais les clés de stockage. Tests dédiés en §10.

### 9.4 Pas de nouvel événement de bus

Un `media.published` a été écarté : **personne ne le consommerait**. Le 2ᵉ producteur du bus reste
l'objet de SH-37. On ne livre pas d'émetteur mort (même principe qu'en SH-14 pour `freelance.updated`).

## 10. Stratégie de tests

**backend-core (Jest)** — étanchéité RBAC (freelance A ↛ médias de B) ; quota → 409 ; `complete` sur une
annonce mensongère → 400 + purge ; Redis indisponible → 503 ; **réécriture de manifeste** (fixture `.m3u8`
→ chaque segment est une URL signée, aucun chemin brut ne fuit) ; `:rendition` hors liste blanche
(`../../etc/passwd`) → 400 ; `PublicMedia` à clés exactes ; les 4 nouvelles méthodes du port sur `Fake`
et sur `S3` (client mocké, comme `s3-storage.service.spec.ts`).

**media-service** — `probe.spec.ts` sur des JSON `ffprobe` capturés (dont un cas équirectangulaire) :
fonction pure, testable sans fichier. `transcode.spec.ts` sur une fixture **générée** au setup
(`ffmpeg -f lavfi -i testsrc=duration=2:size=320x240:rate=10`) plutôt qu'un binaire commité → assert
manifeste, segments, poster, durée. Plus un **test de bootstrap** (leçon directe de SH-41).

**frontend-web (vitest)** — uploader (3 étapes simulées + assertion « aucun en-tête d'auth vers S3 »),
carte, sondage de statut, lecteur avec `hls.js` simulé.

**CI** — workflow `media-ci.yml` calqué sur `node-ci.yml`, avec installation de ffmpeg ; 4ᵉ image Docker
ajoutée au build (SH-2).

**Recette** — vérification e2e sur la stack conteneurisée (gateway 8088), skill `verify`.

## 11. Découpage en tickets

| Ticket | Branche | Contenu | RNCP |
|---|---|---|---|
| **SH-15** | `feature/SH-15-scaffolding-media` | Service Node TS + Dockerfile ffmpeg, `/health`, `/metrics`, worker BullMQ à vide, compose dev + staging, CI, test de bootstrap | C2.1.2, C2.2.2 |
| **SH-16** | `feature/SH-16-transcodage-async` | **Le flux entrant** : port élargi (§5.5) + `AWS_S3_PUBLIC_ENDPOINT` + init LocalStack, entité `user_media` + migration + enums, `POST /media` & `/complete`, producteur + `QueueEvents`, worker `ffprobe`/`ffmpeg` réel, retries / dead-letter, balayage des `DRAFT` | C2.2.2, C2.2.3 |
| **SH-17** | `feature/SH-17-streaming-s3-cdn` | **Le flux sortant** : `master.m3u8` généré, variante réécrite en segments signés, poster 302, `GET /media/freelance/:id`, `DELETE` + `deletePrefix`, décision CloudFront tracée | C2.2.3, C2.4.1 |
| **SH-18** | `feature/SH-18-portfolio-interactif` | Les 3 pages, les composants, le lazy-loading, l'a11y, les tests front | C2.4.1, C2.2.2 |

Frontière 16/17 : voir D10. Les intitulés du backlog seront ajustés en conséquence.

**Bootstrap du bucket.** Aujourd'hui il se crée à la main (`awslocal s3 mb`, documenté dans
`storage/README.md`) — aucune création automatique nulle part. SH-16 ajoute un script d'init LocalStack
(`/etc/localstack/init/ready.d/`) qui **lit `AWS_S3_BUCKET`** (dev : `skillhunt-media`, staging :
`skillhunt-staging`) et pose **le bucket + sa configuration CORS** (PUT/GET depuis l'origine de l'app,
indispensable à D1). Effet de bord bienvenu : une étape manuelle qui traînait depuis SH-31 disparaît.

## 12. Fichiers concernés (indicatif)

**Nouveau service** — `media-service/` : `src/worker.ts`, `src/transcode.ts`, `src/probe.ts`,
`src/storage.ts`, `src/health.ts`, `src/metrics.ts`, `Dockerfile`, `CLAUDE.md`, `tests/`.

**backend-core** — `src/media/` (`media.controller.ts`, `media.service.ts`, `media.entity.ts`,
`media.queue.ts`, `media.sweeper.ts`, `dto/`, `*.spec.ts`) ; `src/common/enums.ts` (2 enums) ;
`src/storage/` (port + 2 adaptateurs + specs) ; `src/database/migrations/<ts>-AddMedia.ts` ;
`src/app.module.ts`.

**frontend-web** — `src/features/media/`, `src/pages/Portfolio.tsx`, `AddMedia.tsx`,
`FreelancePortfolio.tsx` (+ tests), `src/app/routes.tsx`, `src/api/schema.d.ts` (régénéré).

**Infra & docs** — `docker-compose.yml`, `docker-compose.staging.yml`, `localstack/init/`,
`.github/workflows/media-ci.yml`, `.env.example`, `docs/tickets/SH-15..18-*.md`, `docs/BACKLOG.md`,
`docs/conception/MLD-skillhunt.puml` + `.mocodo` + `2026-06-28-MCD-MLD-SkillHunt.md`, `CHANGELOG.md`.

## 13. Suites / liens

- **Amont** : SH-31 (port de stockage, élargi ici), SH-14 (Redis dans la stack), SH-29 (métriques),
  SH-39 (patron de consultation par un recruteur), SH-23 (patron de `lazy()`).
- **Aval à ticketer** : pièces jointes du chat (SH-24 §périmètre), photos dans le portfolio,
  modération des médias, purge du master vers stockage froid, mTLS inter-services (SH-4).
- **Backlog restant hors EP04** (rappel du cadrage du 2026-08-24) : SH-33, SH-35, SH-45, SH-37,
  SH-26, SH-4, SH-28.
