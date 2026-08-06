# 📋 Backlog — SkillHunt

> **Index** des features du projet, dérivé de la WBS du dossier de cadrage (EP01→EP06).
> Ceci n'est pas un cahier des charges : chaque ligne renvoie à **un ticket** au format `docs/templates/TICKET_TEMPLATE.md`, créé sous `docs/tickets/SH-XX-<slug>.md`.
> On donne **le ticket courant** à l'assistant quand on l'implémente — pas tout ce fichier.

## Légende

| Statut | Sens |
|---|---|
| 🔵 Backlog | Identifié, pas encore prêt (DoR incomplet) |
| 🟡 Prêt | Definition of Ready validée, prêt à entrer en sprint |
| 🟠 En cours | En développement |
| 🟢 Terminé | Definition of Done validée |
| ⚪ Lot 2 | Reporté à la V1.2 (React Native) |

**Estimation** : Story Points (Fibonacci), indicatifs au niveau ticket. La charge **J/H** par Epic est celle du dossier (faisant foi pour le budget).
**Périmètre** : sauf mention ⚪ Lot 2, tout est **Lot 1 (Web MVP, Mobile-First)**.

---

## 🗺️ Roadmap par jalon (Scrum — 6 sprints de 2 semaines)

| Jalon | Échéance | Contenu visé | Epics |
|---|---|---|---|
| **J1** | S2 | Specs techniques + architecture C4 validées | EP01 |
| **J2** | S6 | APIs Core (NestJS/FastAPI) + sécurité JWT | EP02, EP03 (init) |
| **J3** | S10 | Moteur de matching + pipeline vidéo | EP03, EP04 |
| **J4** | S14 | Beta Web fonctionnelle | EP05 (Web) |
| **J5** | S16 | Recette finale + mise en production V1.0 | EP06 |

---

## 🎯 Décision de cadrage — rendu MVP du 23/07/2026

> Actée le 2026-07-16 (contrainte : soirées uniquement jusqu'au rendu ; livrable = dossier + dépôt Git).
> Périmètre resserré sur **(1) la boucle démo de bout en bout** (déclaration matériel → validation → consultation recruteur → matching) et **(2) les preuves RNCP bloc 2** (harnais de tests, sécurité, accessibilité, Swagger).

**Priorisé pour le rendu** : `SH-43` ✅ · `SH-39` ✅ · `SH-41` ✅ · `SH-27` ✅ · puis `SH-21b` (vue publique) · `SH-22` (UI matching) · `SH-2` (Docker, si le temps le permet).

**Explicitement dé-priorisé** (hors périmètre du rendu, reste au backlog — ni abandonné, ni oublié) :
- **EP04 complet** (`SH-15` à `SH-18`, média/portfolio) : infrastructure lourde (S3/CloudFront/FFmpeg) sans impact sur la démonstration du cœur différenciant.
- **`SH-24`** (chat temps réel), **`SH-23`** (cartographie Mapbox), **`SH-40`** (2FA), **`SH-37`** (offres/bus, 8 pts). — *Marge dégagée depuis : `SH-40`, `SH-23` puis `SH-24` ont finalement été livrés avant le rendu.*
- **`SH-26`** (harnais E2E complet) : couvert *a minima* par les smoke tests de `SH-41`.
- **Dette non bloquante** : `SH-35`, `SH-36`, `SH-44` (fenêtres de risque bornées, documentées dans leurs tickets) ; `SH-33`/`SH-34` si le temps le permet uniquement.

---

## 🎯 Décision de cadrage — dossier BLOC 4 (rendu 17–21/08/2026)

> Actée le 2026-08-04. Bloc évalué : **« Maintenir l'application logicielle en condition
> opérationnelle »** (RNCP 39583). Livrable = dossier écrit, 20 pages max, 7 compétences
> dont **3 éliminatoires** (C4.1.2, C4.2.1, C4.3.2).

**Périmètre fonctionnel GELÉ jusqu'au rendu.** Aucune compétence C4.x ne demande de
fonctionnalité supplémentaire : le bloc évalue l'exploitation d'un logiciel *déjà développé*.
**EP04 (média/portfolio, `SH-15`→`SH-18`) reste donc hors périmètre** — 14 J/H pour 13 jours
de soirées, et sa seule plus-value pour le dossier (métriques de traitement asynchrone) est
déjà couverte par le bus Redis Streams de `SH-14`. Ajouter de la surface non instrumentée à
T-13 jours irait contre l'objet même du bloc.

**Priorisé pour le rendu** : `SH-48` (éliminatoire, acquis nul → à faire en premier) ·
`SH-47` (meilleur rapport valeur/effort) · `SH-29` (éliminatoire, cœur du dossier) ·
puis un ticket `fix/` sur l'anomalie IPv6 de `SH-30` (support de C4.2.1 + C4.2.2).

**Hors code, à lancer immédiatement** (temps calendaire, pas temps de dev) : collecte de
retours utilisateurs réels sur la démo publique (C4.3.1) et traçabilité d'une situation de
support (C4.3.3) — ce sont les deux compétences sans aucun acquis à ce jour.

**Actif à préserver :** la VM OVHcloud reste active jusqu'à fin août. C'est ce qui permet à
C4.2.1 de porter sur des anomalies réellement *détectées en production*, et non simulées.

---

## EP01 — Architecture, DevOps & Sécurité · *14 J/H* · 🎯 J1

| ID | Titre | Statut | Est. | Compétences | Risque |
|---|---|---|---|---|---|
| [SH-1](tickets/SH-1-init-monorepo-backend.md) | Init monorepo + squelette backend-core NestJS | 🟢 Terminé | 3 | C2.1.2 | — |
| [SH-2](tickets/SH-2-dockerisation.md) | Dockerisation + environnements Dev/Staging/Prod — *3 images durcies, profil `app` du compose, migrations au boot, matching sans port hôte, CI docker* | 🟢 Terminé | 5 | C2.1.2, C2.2.3 | — |
| [SH-3](tickets/SH-3-cicd-github-actions.md) | Pipelines CI/CD GitHub Actions (lint, audit, tests, build) | 🟢 Terminé | 3 | C2.2.2 | — |
| [SH-4](tickets/SH-4-securite-hardening.md) | Hardening : TLS 1.3, gestion des secrets (Vault/env), mTLS inter-services | 🔵 Backlog | 5 | C2.2.3 | R9 |
| [SH-5](tickets/SH-5-api-gateway.md) | API Gateway (nginx, décision tracée) : point d'entrée unique du profil `app` + rate-limiting anti-brute-force sur l'auth (429 prouvé) | 🟢 Terminé | 5 | C2.2.3, C2.1.2 | R7, R9 |
| [SH-32](tickets/SH-32-audit-deps-transitives.md) | Hygiène des dépendances backend-core : résorber les vulnérabilités transitives (audit npm) — dette relevée en SH-31 | 🟢 Terminé | 2 | C2.2.3, C2.1.2 | R7 |

## EP02 — Monolithe & Authentification · *18 J/H* · 🎯 J2

| ID | Titre | Statut | Est. | Compétences | Risque |
|---|---|---|---|---|---|
| [SH-6](tickets/SH-6-persistance-reelle.md) | Persistance réelle : `DbState` → PostgreSQL+PostGIS / MongoDB / Redis | 🟢 Terminé | 8 | C2.2.3 | — |
| [SH-7](tickets/SH-7-auth-argon2-jwt-rs256.md) | Auth réelle : Argon2id + JWT RS256 + refresh tokens (Redis) | 🟢 Terminé | 5 | C2.2.3 | R7 |
| [SH-8](tickets/SH-8-rbac-guards.md) | RBAC durci : vérification cryptographique JWT + tests d'étanchéité | 🟢 Terminé | 3 | C2.2.2, C2.2.3 | R7 |
| [SH-9](tickets/SH-9-armurerie-backend.md) | Armurerie (Gear Locker) : déclaration matériel + filtres + workflow validation | 🟢 Terminé | 5 | C2.2.3 | R10 |
| [SH-31](tickets/SH-31-storage-abstraction.md) | Abstraction de stockage objet (`StorageService` + adaptateur S3 + LocalStack) — prérequis SH-10, réutilisé SH-17 | 🟢 Terminé | 3 | C2.1.2, C2.2.3 | R8 |
| [SH-10](tickets/SH-10-certifications-upload.md) | Certifications : upload sécurisé (PDF, magic bytes, Signed URL, purge PII, dedup) + validation Admin — *dépend de SH-31* | 🟢 Terminé | 5 | C2.2.3, C2.2.2, C2.4.1 | R2, R3 |
| [SH-36](tickets/SH-36-tokenstore-failsafe-atomicite.md) | TokenStore Redis : cohérence du fail-safe (`save`/`revoke` → 503 explicite) + écriture atomique (`MULTI`) — dette relevée en revue SH-14 | 🟢 Terminé | 2 | C2.2.3, C2.2.2 | R7 |
| [SH-34](tickets/SH-34-position-freelance-onboarding.md) | Position freelance obligatoire à l'onboarding (validation DTO conditionnelle + CHECK PostgreSQL par rôle + ville d'activité au Register front) — qualité de donnée pour le matching géo SH-13 | 🟢 Terminé | 3 | C2.2.3, C2.2.2 | R4 |
| [SH-39](tickets/SH-39-gear-consultation-recruteur.md) | Armurerie : consultation du casier d'un freelance par un recruteur (`GET /gear/freelance/:id`, filtré `VALIDATED`, sans `serialNumber`) — débloque SH-21b | 🟢 Terminé | 3 | C2.2.3, C2.2.2, C2.4.1 | R10 |
| [SH-40](tickets/SH-40-2fa-comptes-pro.md) | 2FA TOTP opt-in (secret AES-256-GCM, login 2 étapes, codes de secours Argon2id à usage unique, anti-brute-force Redis 429) — backend + front | 🟢 Terminé | 5 | C2.2.3, C2.2.2 | R7 |

## EP03 — Microservice Matching · *17 J/H* · 🎯 J2–J3

| ID | Titre | Statut | Est. | Compétences | Risque |
|---|---|---|---|---|---|
| [SH-11](tickets/SH-11-scaffolding-fastapi.md) | Scaffolding `matching-service` FastAPI (structure, requirements, tests, Pydantic) | 🟢 Terminé | 3 | C2.1.2 | — |
| [SH-12](tickets/SH-12-moteur-scoring.md) | Moteur de scoring multicritères (Skills + Matériel + Localisation) | 🟢 Terminé | 8 | C2.2.2 | R4 |
| [SH-13](tickets/SH-13-geolocalisation-postgis.md) | Géolocalisation : indexation spatiale PostGIS + requêtes rayon d'action | 🟢 Terminé | 5 | C2.2.3 | R4 |
| [SH-14](tickets/SH-14-bus-evenements-redis.md) | Bus d'événements Redis (consommation offre/profil) + cache résultats — *périmètre réel : 4 sous-chantiers (A infra, B TokenStore→Redis, C événements Streams, D consumer + cache versionné)* | 🟢 Terminé | 5 → ~8–13 | C2.2.2 | R4 |
| [SH-33](tickets/SH-33-resolveur-besoin-criteres.md) | Résolveur besoin→critères : catalogue de cas d'usage (recruteur non-expert B2C) — *dépend de SH-12* | 🟡 Prêt | 5 | C2.2.2, C2.2.3, C2.4.1 | R4, R10 |
| [SH-35](tickets/SH-35-durcissement-cache-consumer-redis.md) | Durcissement cache `/match` & consumer Redis (course d'invalidation, PEL, scaling) — dette relevée en revue SH-14 | 🟡 Prêt | 3 | C2.2.2, C2.2.3 | R4 |
| [SH-37](tickets/SH-37-offres-publication-bus.md) | Offres/Missions : publication recruteur + événement `offer.published` (2ᵉ producteur du bus, scénario archi §2) — constat post-revue SH-14 | 🔵 Backlog | 8 | C2.2.3, C2.2.2, C2.4.1 | R4 |

## EP04 — Microservice Médias & Portfolio · *14 J/H* · 🎯 J3

| ID | Titre | Statut | Est. | Compétences | Risque |
|---|---|---|---|---|---|
| [SH-15](tickets/SH-15-scaffolding-media.md) | Scaffolding `media-service` (Node + FFmpeg) | 🔵 Backlog | 3 | C2.1.2 | — |
| [SH-16](tickets/SH-16-transcodage-async.md) | Pipeline de transcodage asynchrone 4K/360° (files Redis, workers auto-scalables) | 🔵 Backlog | 8 | C2.2.2 | R1 |
| [SH-17](tickets/SH-17-streaming-s3-cdn.md) | Streaming & stockage : S3 + CloudFront + Signed URLs | 🔵 Backlog | 5 | C2.2.3 | R8, R3 |
| [SH-18](tickets/SH-18-portfolio-interactif.md) | Portfolio interactif (exposition vidéos 4K/360°) | 🔵 Backlog | 5 | C2.4.1 | — |

## EP05 — Frontend Multi-support · *38 J/H* · 🎯 J4

| ID | Titre | Statut | Est. | Compétences | Risque |
|---|---|---|---|---|---|
| [SH-19](tickets/SH-19-setup-web-react.md) | Setup Web React (TS, Tailwind, routing, design system de base) | 🟢 Terminé | 5 | C2.1.2 | — |
| [SH-38](tickets/SH-38-dette-frontend-scaffold.md) | Dette technique scaffold frontend-web (nettoyage post-revue SH-19 : asset mort, littéral dupliqué, Prettier CI, side-effect router, wording tests) | 🟢 Terminé | 2 | C2.1.2, C2.2.2 | — |
| [SH-20](tickets/SH-20-parcours-auth-web.md) | Parcours Auth Web (register/login, access token en mémoire, refresh en cookie `httpOnly`, CORS à origines explicites) — *2FA sortie du périmètre, voir `SH-40`* | 🟢 Terminé | 5 | C2.2.3, C2.2.2 | — |
| [SH-21](tickets/SH-21-armurerie-gamifiee.md) | Armurerie gamifiée (grille d'inventaire, cartes, loadout, progression, badges) — *[design validé](superpowers/specs/2026-07-01-armurerie-grille-inventaire-design.md) ; **21a 🟢** (vue privée, 2026-07-15) / **21b 🟢** (vue publique recruteur, 2026-07-16) / **21c 🟢** (loadout+badges, 2026-07-17)* | 🟢 Terminé | 8 | C2.4.1, C2.1.2, C2.2.2 | R10 |
| [SH-43](tickets/SH-43-armurerie-declaration-materiel.md) | Armurerie : écran de déclaration de matériel (`POST /api/v1/gear`) — active les CTA « + Ajouter … » de SH-21a | 🟢 Terminé | 3 | C2.2.3, C2.2.2, C2.4.1 | R10 |
| [SH-22](tickets/SH-22-recherche-matching-ui.md) | Recherche & affichage du score de matching — *proxy backend-core (`POST /matching/search`, RBAC RECRUITER) + page `/recherche` ; boucle démo fermée jusqu'à SH-21b* | 🟢 Terminé | 5 | C2.4.1, C2.2.3, C2.2.2 | R4 |
| [SH-23](tickets/SH-23-cartographie-mapbox.md) | Cartographie des résultats de recherche — *décision Mapbox→**Leaflet+OSM** tracée (zéro token/coût) ; lazy-loading éco-conçu ; position portée par le proxy SH-22* | 🟢 Terminé | 5 | C2.4.1, C2.2.2, C2.1.2 | — |
| [SH-24](tickets/SH-24-chat-temps-reel.md) | Chat contextuel temps réel (WebSocket + MongoDB) — *périmètre acté 2026-07-17 : texte, 1-à-1 RECRUITER↔FREELANCE ; partage de fichiers reporté avec EP04 ; e2e vérifié à travers la gateway* | 🟢 Terminé | 8 | C2.2.3, C2.2.2, C2.4.1 | R5, R9 |
| [SH-25](tickets/SH-25-mobile-react-native.md) | App Mobile React Native + notifications Push | ⚪ Lot 2 | 13 | C2.2.3 | — |

## EP06 — Qualité & Déploiement · *20 J/H* · 🎯 J5

| ID | Titre | Statut | Est. | Compétences | Risque |
|---|---|---|---|---|---|
| [SH-26](tickets/SH-26-tests-integration-e2e.md) | Harnais de tests d'intégration & end-to-end | 🔵 Backlog | 8 | C2.2.2 | — |
| [SH-41](tickets/SH-41-smoke-tests-bootstrap.md) | Smoke test de bootstrap (backend) + tests front sous `StrictMode` — *angle mort : 2 bugs bloquants de SH-20 (serveur qui ne démarrait pas, déconnexion à chaque F5) ont échappé aux 103 tests verts* | 🟢 Terminé | 3 | C2.2.2, C2.1.2 | — |
| [SH-42](tickets/SH-42-gitattributes-fins-de-ligne.md) | `.gitattributes` (`* text=auto eol=lf`) — *`format:check` mentait en local sous Windows (13 faux positifs) ; il dit désormais la vérité* | 🟢 Terminé | 1 | C2.1.2 | — |
| [SH-44](tickets/SH-44-armurerie-durcissement-tests-revue.md) | Armurerie : durcissement des tests + polissage (garde anti-hex étendu, contrat à clés exactes, serialNumber balayé attributs compris, 401/403, a11y aria-live/valuetext/reduced-motion) — *item contrat-vs-HTTP requalifié vers SH-26* | 🟢 Terminé | 2 | C2.2.2, C2.1.2, C2.4.1 | — |
| [SH-27](tickets/SH-27-audit-accessibilite.md) | Audit accessibilité WCAG en CI (Lighthouse, bloquant < 90) — *pages publiques à 100/100 au merge* | 🟢 Terminé | 3 | C2.1.2 | R6 |
| [SH-45](tickets/SH-45-dette-gamification-loadout.md) | Dette gamification/loadout post-revue SH-21c (TOCTOU max-4, sweep Swagger 400, test frontière de seuil, nettoyage types, PublicLevelBadge) — tous différables, décision « épinglés visibles 2× » actée | 🟡 Prêt | 2 | C2.2.2, C2.4.1, C2.1.2 | — |
| [SH-28](tickets/SH-28-eco-conception-ci.md) | Éco-conception en CI (EcoIndex, poids des pages, requêtes HTTP) | 🔵 Backlog | 3 | C2.1.2 | — |
| [SH-29](tickets/SH-29-monitoring-supervision.md) | Système de supervision et d'alerte (Grafana + Loki + Prometheus, signalement mail) — *décision tracée **Loki plutôt qu'ELK** (empreinte mémoire de la VM) ; 3 chantiers : instrumentation, stack `obs`, sondes & alerting* | 🟠 En cours | 5 → **8** | **C4.1.2** ⚠️, C4.2.1, C4.3.1, C2.2.2 | R5 |
| [SH-47](tickets/SH-47-politique-dependances.md) | Politique de mise à jour des dépendances + Dependabot (8 entrées, 4 écosystèmes) + `pip-audit` bloquant + **résorption de la dérive npm des 3 services (25 avis, dont 7 en production)** — *a révélé que `node-ci`/`frontend-ci` échouaient déjà sur `develop` sans que rien ne le signale ; mécanisme d'exception outillé via `audit-ci`* | 🟢 Terminé | 2 → **3** | **C4.1.1**, C2.1.2, C2.2.3 | R7 |
| [SH-48](tickets/SH-48-journal-versions.md) | Journal des versions déployées (`CHANGELOG.md` + table de correspondance + process de release) — *acquis nul avant : `git tag` vide, aucun changelog. Reste à poser le tag `v1.0.0` sur `main`* | 🟢 Terminé | 2 | **C4.3.2** ⚠️, C4.2.2, C2.4.1 | — |
| [SH-30](tickets/SH-30-mise-en-production.md) | Mise en production V1.0 (staging démo jury, VM OVHcloud Public Cloud) + PCA (rollback < 5 min) — *déployé sur `147.135.230.140`, images GHCR publiques, boucle démo vérifiée en prod* | 🟢 Terminé | 5 | C2.2.2 | — |

---

## ⚪ Lot 2 (V1.2 — après le MVP)

- **SH-25** — App Mobile React Native + Push (reportée pour sécuriser le délai du MVP, cf. CLAUDE.md §6).

---

## 📊 Récapitulatif de charge (dossier)

| Epic | Charge | Lot |
|---|---|---|
| EP01 Architecture DevOps & Sécurité | 14 J/H | 1 |
| EP02 Monolithe & Authentification | 18 J/H | 1 |
| EP03 Microservice Matching | 17 J/H | 1 |
| EP04 Microservice Médias & Portfolio | 14 J/H | 1 |
| EP05 Frontend Multi-support | 38 J/H | 1 (Web) + 2 (Mobile) |
| EP06 Qualité & Déploiement | 20 J/H | 1 |
| **Total MVP** | **119 J/H** | |

> Décision de cadrage : le **Lot 1 se concentre sur la Web App responsive** ; l'app React Native (≈ 18 J/H de EP05) passe en **Lot 2** pour tenir le calendrier.

---

## Prochaines actions suggérées

1. **✅ Socle livré** : EP02 & EP03 (auth/RBAC, Armurerie backend, certifications, scoring géospatial, bus Redis) + boucle démo front fermée (`SH-19`→`SH-23`, `SH-39`, `SH-41`, `SH-27`, `SH-43`, `SH-44`).
2. **✅ `SH-24` livré** (2026-07-17) : chat contextuel temps réel (MongoDB + socket.io + gateway WS + pages `/messages`) — branche `feature/SH-24-chat-temps-reel`, e2e vérifié sur la stack conteneurisée.
3. **✅ `SH-21c` livré** (2026-07-17) : gamification de l'Armurerie (XP dérivé, 6 niveaux, 7 badges, loadout 4 emplacements) — **EP05 Lot 1 complet**. Dette tracée non bloquante : `SH-35` ; `SH-33` si le temps le permet.
4. **▶️ En cours — dossier BLOC 4** (rendu 17–21/08/2026, cf. décision de cadrage ci-dessus) : `SH-48` → `SH-47` → `SH-29`, puis correctif de l'anomalie IPv6 de `SH-30`. Périmètre fonctionnel gelé.
5. Mettre à jour le statut ici à chaque changement (🔵 → 🟡 → 🟠 → 🟢).
