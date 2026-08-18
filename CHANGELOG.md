# Journal des versions — SkillHunt

Toutes les évolutions notables de SkillHunt sont consignées ici.

Format : [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) · Versionnage : [SemVer](https://semver.org/lang/fr/).
Règle appliquée au projet : `MAJOR` = rupture d'API publique · `MINOR` = nouvelle fonctionnalité · `PATCH` = correctif sans nouveauté.

> **Périmètre : les versions _déployées_.** Ce fichier n'est pas un historique de développement.
> Une version n'y figure qu'à partir du moment où elle tourne sur un environnement réel. Un merge
> sur `main` ne vaut pas déploiement : la release `de135d1` (PR #40, 2026-07-20) a été fusionnée
> sur `main` sans jamais être publiée ni déployée — elle n'a donc pas de numéro de version.
> L'historique des jalons de développement est en **annexe**, explicitement marqué pré-production.

---

## Table de correspondance des déploiements

| Version | Déployée le | Tag Git | Commit publié | Image GHCR | Environnement | Tickets |
|---|---|---|---|---|---|---|
| [1.0.0](#100--2026-07-23) | 2026-07-23 | `v1.0.0` | [`a94568a`](https://github.com/alixsanta/skillhunt/commit/a94568ab5e564cc64ad71b43cefa92e776802b60) (PR #42, `develop` → `main`) | `ghcr.io/alixsanta/skillhunt/{backend-core,matching-service,frontend-web,gateway}:a94568ab5e564cc64ad71b43cefa92e776802b60` (+ `:latest`) | Production — VM OVHcloud `147.135.230.140` | SH-1 → SH-46 |

| [1.0.1](#101--2026-08-18) | *à compléter après déploiement* | `v1.0.1` | *à compléter* | *à compléter* | Production — VM OVHcloud `147.135.230.140` | SH-47, SH-48, SH-49 |

> ℹ️ Le workflow `publish-staging.yml` étiquette les images avec `${{ github.sha }}`, c'est-à-dire
> le **SHA complet sur 40 caractères** — pas la forme abrégée. Le tag d'image à reporter dans un
> `docker-compose` de rollback est donc celui indiqué ci-dessus en entier.

**Procédure de retour arrière (PCA, < 5 min)** — repointer `docker-compose.staging.yml` sur le tag
d'image de la version cible, puis `docker compose --env-file .env.staging -f docker-compose.staging.yml up -d`.
Aucun rebuild. Runbook détaillé : [`docs/tickets/SH-30-mise-en-production.md`](docs/tickets/SH-30-mise-en-production.md) §4.

---

## [Non publié]

*Rien pour le moment.*

---

## [1.0.1] — 2026-08-18

Version **corrective** : aucune nouveauté fonctionnelle. Elle résorbe une anomalie de
production consignée et deux vagues de dérive de dépendances, et outille la veille pour
que la troisième ne passe plus inaperçue.

> ⚠️ **AN-01 n'est pas encore confirmée.** Le correctif est écrit et la CI est verte, mais
> l'anomalie **ne se manifeste que sur l'Ubuntu 22.04 de la VM** — sous Docker Desktop les
> conteneurs sont `healthy` avant même le correctif, et `docker-ci` construit les images
> sans exécuter leurs sondes. La ligne correspondante des limitations connues de la
> `v1.0.0` ne sera retirée qu'après vérification par `docker compose ps` en production.

### Corrigé
- **AN-01 — `gateway` et `frontend-web` marqués `unhealthy` alors qu'ils servaient le
  trafic** (SH-49). `wget` (BusyBox/Alpine) résolvait `localhost` en IPv6 `::1` quand les
  `nginx.conf` ne déclarent que `listen 80;`. Les `HEALTHCHECK` ciblent désormais
  explicitement `127.0.0.1`. Fiche : [`AN-01`](docs/anomalies/AN-01-healthcheck-ipv6.md).
  L'alternative `listen [::]:80;` a été écartée : un correctif de sonde ne doit pas
  modifier le comportement réseau du service qu'il surveille.
  *Impact diagnostique et non fonctionnel — aucun utilisateur affecté — mais un état de
  santé faux désensibilise l'exploitant, interdit tout `depends_on: service_healthy` et
  fausserait toute supervision lisant l'état Docker.*

### Sécurité
- **25 avis de sécurité résorbés sur les trois services** (SH-47), dont **7 qui tournaient en
  production** depuis le 2026-07-23 :
  - `matching-service` — `starlette` 0.41.3 → **1.3.1** (7 avis : PYSEC-2026-161/248/249/1941/1942/
    2280/2281), via `fastapi` 0.115.5 → 0.141.1. `starlette` est désormais **épinglée
    explicitement**, `fastapi` ne déclarant qu'une borne basse. Puis `pytest` 8.3.4 → 9.1.1
    (PYSEC-2026-1845), entraînant `pytest-asyncio` → 1.4.0 et `pytest-cov` → 7.1.0.
  - `backend-core` — 5 avis (dont 2 `high`) résorbés : `typeorm` 1.0.0 → 1.1.0, `body-parser`
    2.2.2 → 2.3.0, `js-yaml` 4.1.1 → 4.3.1, `brace-expansion` 1.1.15 → 1.1.18, plus un override
    **scopé** `@nestjs/swagger → js-yaml ^5.2.3` (un override large n'atteignait pas la copie
    imbriquée).
  - `frontend-web` — 12 avis (dont 9 `high`) résorbés sur 14 paquets, dont `react-router`,
    `undici`, `postcss` et `nanoid`.
- **Troisième vague de dérive résorbée** (SH-49), douze jours après la précédente, sur
  `nanoid`, `brace-expansion`, `@redocly>js-yaml` et `@hono/node-server`. Elle est apparue
  sur une PR ne touchant que deux Dockerfiles — illustration datée du phénomène décrit au
  §0 de la [politique](docs/exploitation/POLITIQUE_DEPENDANCES.md) : *une CI reste verte
  jusqu'à ce qu'une CVE paraisse sur une dépendance figée, et le blocage tombe sur une PR
  sans rapport*.
- **Exception de sécurité ouverte** : `GHSA-jmr9-qjv8-65gv` (`extract-zip`, sans version
  corrigée). Dépendance de développement, absente de l'image de production, et l'unique
  archive extraite est le Chrome téléchargé depuis les serveurs Google — non contrôlable
  par un tiers. *Réexamen le 2026-11-18.*
- **Exception de sécurité LEVÉE** : `GHSA-qwww-vcr4-c8h2` (`react-router`) — plus aucun
  chemin vulnérable après montée. Retirée plutôt que conservée « au cas où » : une
  exception devenue inutile masque la réapparition de l'avis. Elle aura tenu 14 jours sur
  les 3 mois prévus.

### Ajouté
- Journal des versions déployées : ce fichier, table de correspondance et process de release (SH-48).
- **Veille automatisée des dépendances** (SH-47) : `.github/dependabot.yml`, 8 entrées couvrant
  npm ×2, pip, docker ×4 et github-actions, toutes ciblant `develop`.
- **`pip-audit` bloquant** dans `python-ci` — le `matching-service` était jusque-là le seul service
  sans garde-fou sur ses dépendances.
- **Mécanisme d'exception documenté** pour les avis non exploitables (SH-47) : `frontend-web` passe
  de `npm audit` à `audit-ci`, qui conserve le seuil `high` bloquant tout en acceptant des
  exceptions nommées, justifiées et **datées**, journalisées à chaque exécution.
- Politique de mise à jour des dépendances : `docs/exploitation/POLITIQUE_DEPENDANCES.md`.

### Modifié
- `docs/BACKLOG.md` — décision de cadrage du dossier BLOC 4 : périmètre fonctionnel gelé,
  EP04 maintenu hors scope.

> ⚠️ **Exception de sécurité active** : `GHSA-qwww-vcr4-c8h2` (`react-router`) est allowlistée.
> L'avis vise le mode RSC, non utilisé par cette SPA ; aucune version corrigée n'existe vers
> l'avant et le seul correctif proposé serait une redescente de 7 versions mineures.
> **Réexamen au 2026-11-04.** Détail : `docs/exploitation/POLITIQUE_DEPENDANCES.md` §3.3.

---

## [1.0.0] — 2026-07-23

Première mise en production de SkillHunt. Couvre la boucle métier complète : inscription →
déclaration de matériel → validation → consultation par un recruteur → recherche par matching
multicritères → mise en relation par messagerie.

*Images publiées sur GHCR le 2026-07-22 à 21:08 UTC (run `publish-staging` `29958054529`, 4 jobs
`success`) ; stack démarrée et boucle démo vérifiée depuis un poste externe le 2026-07-23.*

### Ajouté

**Authentification et gestion des accès**
- Inscription et connexion, hachage des mots de passe en **Argon2id**, JWT **RS256** et refresh
  tokens rotatifs invalidables, stockés dans Redis avec TTL natif (SH-7).
- **RBAC** : guards NestJS avec vérification cryptographique réelle de la signature, et tests
  d'étanchéité entre rôles (un `FREELANCE` ne peut pas atteindre les données d'un autre) (SH-8).
- **Double authentification TOTP** en option : secret chiffré AES-256-GCM, connexion en deux
  étapes, codes de secours Argon2id à usage unique, anti-brute-force Redis (SH-40).
- Parcours d'authentification web : access token conservé en mémoire, refresh en cookie
  `httpOnly`, CORS restreint à des origines explicites (SH-20).

**Armurerie (Gear Locker)**
- Déclaration de matériel, filtres et workflow de validation côté API (SH-9), puis écran de
  déclaration côté web (SH-43).
- Grille d'inventaire et cartes visuelles du casier personnel (SH-21a).
- Casier public d'un freelance consultable par un recruteur, filtré aux équipements `VALIDATED`
  et **expurgé des numéros de série** (SH-39, SH-21b).
- Gamification : XP dérivé de l'inventaire, 6 niveaux, 7 badges, loadout à 4 emplacements (SH-21c).

**Matching**
- Microservice `matching-service` en FastAPI (SH-11).
- Moteur de scoring multicritères **Compétences + Matériel + Localisation** (SH-12).
- Géolocalisation **PostGIS** : indexation spatiale GiST et requêtes par rayon d'action (SH-13).
- Bus d'événements **Redis Streams** avec consumer dédié et cache de résultats versionné (SH-14).
- Position d'activité rendue obligatoire à l'inscription d'un freelance, avec contrainte `CHECK`
  par rôle en base — qualité de donnée indispensable au matching géographique (SH-34).
- Recherche côté web : proxy `POST /api/v1/matching/search` restreint au rôle `RECRUITER`, et
  page `/recherche` affichant les scores (SH-22).
- Cartographie des résultats en **Leaflet + OpenStreetMap** (SH-23).

**Certifications**
- Upload sécurisé de PDF : contrôle du type réel par **magic bytes**, accès exclusivement par
  **Signed URL S3** à durée courte, **purge des PII** du fichier d'origine, déduplication, et
  workflow de validation par un administrateur (SH-10).
- Abstraction de stockage objet (`StorageService`, adaptateur S3, LocalStack en local) (SH-31).

**Messagerie**
- Chat contextuel temps réel 1-à-1 entre recruteur et freelance, WebSocket + MongoDB, proxyfié
  par la gateway (SH-24).

**Interface web**
- Socle React / TypeScript / Tailwind, routing et design system (SH-19).
- Refonte de l'interface au thème HUD : header applicatif, menu de compte accessible au clavier,
  cloche de notifications adossée au socket, recherche en vue scindée liste + carte (SH-46).

**Infrastructure et exploitation**
- Monorepo et squelette du monolithe NestJS (SH-1).
- Persistance réelle : **PostgreSQL + PostGIS** via TypeORM avec migrations versionnées,
  **MongoDB** via Mongoose, **Redis** (SH-6).
- Conteneurisation : images durcies, profil `app`, migrations appliquées au démarrage (SH-2).
- **API Gateway nginx** : point d'entrée unique du profil `app` et rate-limiting par IP sur
  l'authentification (SH-5).
- Pipelines CI GitHub Actions : lint, audit de sécurité, tests et build sur chaque PR (SH-3).
- Publication des images sur GHCR et déploiement sur VM OVHcloud (SH-30).
- Documentation OpenAPI complète exposée sur `/api/docs`.

### Sécurité
- Validation systématique des entrées : `ValidationPipe` global en `whitelist` +
  `forbidNonWhitelisted` + `transform` côté NestJS, modèles Pydantic côté FastAPI.
- Aucune requête brute : tout passe par l'ORM/ODM (anti-injection).
- Fichiers privés uniquement : aucun bucket public, aucun lien permanent.
- Secrets hors du code, injectés par variables d'environnement.
- Rate-limiting anti-brute-force sur `/api/v1/auth` avec réponse `429` vérifiée (SH-5).
- Résorption des vulnérabilités transitives de `backend-core` — `npm audit` ramené à zéro (SH-32),
  et audit rendu bloquant en CI.

### Corrigé
- **Élévation de privilèges à l'inscription** : le rôle utilisateur était accepté depuis le corps
  de la requête, permettant à un compte de se créer avec des droits qu'il n'aurait pas dû obtenir.
  Corrigé côté DTO et service, couvert par des tests (PR #4, `fix/SH-8-register-role-escalation`).
- **Serveur qui ne démarrait pas** (`cookie_parser_1.default is not a function`, compilation
  CommonJS sans `esModuleInterop`) et **déconnexion à chaque rafraîchissement de page** — deux
  bugs bloquants qui avaient échappé à 103 tests verts. Corrigés, et désormais couverts par un
  smoke test de démarrage qui exécute exactement le chemin de production (SH-41).
- **`format:check` renvoyait 13 faux positifs en local sous Windows** (fins de ligne). Corrigé par
  `.gitattributes` (`* text=auto eol=lf`) (SH-42).
- **TokenStore Redis** : fail-safe incohérent entre `save` et `revoke`, et écriture non atomique.
  Corrigé par une réponse `503` explicite et une transaction `MULTI` (SH-36).
- Dette du scaffold frontend : asset mort, littéral dupliqué, effet de bord du routeur,
  vérification Prettier en CI (SH-38).
- Durcissement des tests de l'Armurerie : garde anti-hexadécimal étendu, contrat à clés exactes,
  balayage du numéro de série attributs compris, couverture des cas `401`/`403`, accessibilité
  (`aria-live`, `aria-valuetext`, `prefers-reduced-motion`) (SH-44).

### Qualité
- Audit d'accessibilité **Lighthouse bloquant sous 90/100** en CI ; les trois pages publiques
  sont mesurées à **100/100** (SH-27).
- Rapport Lighthouse publié en artefact de CI, y compris en cas d'échec.

### Limitations connues à la date de publication

| Limitation | Impact | Suite prévue |
|---|---|---|
| Les conteneurs `frontend-web` et `gateway` sont marqués `unhealthy` alors qu'ils servent le trafic. Leur HEALTHCHECK interroge `http://localhost:80`, que `wget` (BusyBox) résout d'abord en IPv6 `::1`, alors que leurs `nginx.conf` ne déclarent que `listen 80;` (IPv4). | Cosmétique — aucun `depends_on: service_healthy` ne s'appuie sur ces deux services. Mais l'état de santé réel est masqué. | **Anomalie ouverte**, à consigner et corriger. Correctif identifié : `listen [::]:80;` ou cibler `127.0.0.1`. |
| Pas de TLS : accès en HTTP nu sur l'IP publique | Trafic non chiffré. Dégradation assumée (aucun nom de domaine possédé au moment du déploiement). | SH-4 (hardening TLS 1.3, secrets, mTLS inter-services) |
| Aucune supervision : ni logs structurés, ni métriques, ni sondes, ni alerte | Toute anomalie est découverte par hasard, pas détectée. | SH-29 |
| `backend-core` n'expose aucun endpoint de santé et n'a pas de `healthcheck:` | La disponibilité du monolithe n'est pas mesurable. | SH-29 |
| Aucune veille sur les dépendances (pas de Dependabot, pas d'audit Python) | Les nouvelles versions et CVE ne sont pas surveillées. | SH-47 |
| EP04 (médias, transcodage 4K/360°, portfolio) non livré | Le portfolio vidéo, l'une des trois fonctionnalités différenciantes, n'est pas dans cette version. | SH-15 → SH-18 |
| Harnais de tests end-to-end incomplet | Couvert *a minima* par les smoke tests de SH-41. | SH-26 |

---

## Annexe — Historique des jalons de développement (pré-production)

> ⚠️ **Aucune de ces étapes n'a été déployée.** Elles retracent la construction de la `v1.0.0`
> et ne constituent pas des versions au sens de ce journal. Conservées pour la traçabilité :
> chaque ligne correspond à une PR réellement fusionnée sur `main`.

| Date | PR | Contenu |
|---|---|---|
| 2026-06-20 | #1 | SH-1 monorepo et squelette NestJS ; SH-7 Argon2id + JWT RS256 |
| 2026-06-22 | #2, #3 | SH-6 persistance réelle ; SH-8 guards RBAC |
| 2026-06-25 | #4, #5 | Correctif d'élévation de privilèges à l'inscription ; SH-9 Armurerie backend |
| 2026-06-26 | #6, #7 | SH-11 scaffolding FastAPI ; SH-31 abstraction de stockage |
| 2026-06-27 | #8, #9 | SH-10 upload de certifications ; SH-32 vulnérabilités transitives |
| 2026-06-29 | #12, #13 | SH-12 moteur de scoring ; gabarit de PR de release |
| 2026-07-01 | #14 | SH-13 géolocalisation PostGIS |
| 2026-07-05 | #15 | SH-14 bus d'événements Redis |
| 2026-07-07 | #16 | SH-19 socle web React |
| 2026-07-13 | #17, #18, #19 | SH-38 dette scaffold ; design de l'Armurerie ; SH-20 parcours d'authentification web |
| 2026-07-14 | #10, #11, #20, #21 | MCD/MLD ; ticket SH-33 ; SH-41/SH-42 dette tests et fins de ligne |
| 2026-07-15 | #22 | SH-21a grille d'inventaire |
| 2026-07-16 | #23 → #34 | SH-43 déclaration de matériel ; SH-39 consultation recruteur ; SH-41 smoke tests ; SH-27 audit d'accessibilité ; cadrage MVP ; SH-21b vue publique ; SH-22 recherche ; SH-2 dockerisation ; SH-34 position freelance ; SH-36 TokenStore ; SH-40 2FA ; SH-5 API Gateway |
| 2026-07-17 | #35, #36, #37 | SH-44 durcissement Armurerie ; SH-23 cartographie ; SH-24 chat temps réel |
| 2026-07-18 | #38 | SH-21c gamification et loadout |
| 2026-07-20 | #39, #40 | SH-46 refonte UI HUD ; release sur `main` **non déployée** |
| 2026-07-22 | #41, #42 | SH-30 mise en production — **release publiée et déployée : `v1.0.0`** |
| 2026-07-23 | #43 | Finalisation documentaire de SH-30 (postérieure au déploiement, non incluse dans `v1.0.0`) |

[Non publié]: https://github.com/alixsanta/skillhunt/compare/v1.0.0...develop
[1.0.0]: https://github.com/alixsanta/skillhunt/releases/tag/v1.0.0
