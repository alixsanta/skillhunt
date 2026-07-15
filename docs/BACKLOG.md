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

## EP01 — Architecture, DevOps & Sécurité · *14 J/H* · 🎯 J1

| ID | Titre | Statut | Est. | Compétences | Risque |
|---|---|---|---|---|---|
| [SH-1](tickets/SH-1-init-monorepo-backend.md) | Init monorepo + squelette backend-core NestJS | 🟢 Terminé | 3 | C2.1.2 | — |
| [SH-2](tickets/SH-2-dockerisation.md) | Dockerisation + environnements Dev/Staging/Prod | 🔵 Backlog | 5 | C2.1.2 | — |
| [SH-3](tickets/SH-3-cicd-github-actions.md) | Pipelines CI/CD GitHub Actions (lint, audit, tests, build) | 🟢 Terminé | 3 | C2.2.2 | — |
| [SH-4](tickets/SH-4-securite-hardening.md) | Hardening : TLS 1.3, gestion des secrets (Vault/env), mTLS inter-services | 🔵 Backlog | 5 | C2.2.3 | R9 |
| [SH-5](tickets/SH-5-api-gateway.md) | API Gateway (Kong/Nginx) : point d'entrée unique + rate-limiting | 🔵 Backlog | 5 | C2.2.3 | R7, R9 |
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
| [SH-36](tickets/SH-36-tokenstore-failsafe-atomicite.md) | TokenStore Redis : cohérence du fail-safe (`save`/`revoke`) + écriture atomique (`MULTI`) — dette relevée en revue SH-14 | 🟡 Prêt | 2 | C2.2.3, C2.2.2 | R7 |
| [SH-34](tickets/SH-34-position-freelance-onboarding.md) | Position freelance obligatoire à l'onboarding (validation DTO conditionnelle + CHECK PostgreSQL par rôle) — qualité de donnée pour le matching géo SH-13 | 🟡 Prêt | 3 | C2.2.3, C2.2.2 | R4 |
| [SH-39](tickets/SH-39-gear-consultation-recruteur.md) | Armurerie : consultation du casier d'un freelance par un recruteur (`GET /gear/freelance/:id`, filtré `VALIDATED`, sans `serialNumber`) — dépendance du design SH-21b | 🟡 Prêt | 3 | C2.2.3, C2.2.2, C2.4.1 | R10 |
| [SH-40](tickets/SH-40-2fa-comptes-pro.md) | 2FA comptes pro (TOTP, secret chiffré AES-256, codes de secours) — sortie du périmètre SH-20 | 🔵 Backlog | 5 | C2.2.3, C2.2.2 | R7 |

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
| [SH-21](tickets/SH-21-armurerie-gamifiee.md) | Armurerie gamifiée (grille d'inventaire, cartes, loadout, progression, badges) — *[design validé](superpowers/specs/2026-07-01-armurerie-grille-inventaire-design.md) ; **21a 🟢 livrée le 2026-07-15** (vue privée) / 21b (vue publique, dép. SH-39) / 21c (loadout+badges, à cadrer)* | 🟠 En cours | 8 | C2.4.1, C2.1.2, C2.2.2 | R10 |
| [SH-43](tickets/SH-43-armurerie-declaration-materiel.md) | Armurerie : écran de déclaration de matériel (`POST /api/v1/gear`) — active les CTA « + Ajouter … » aujourd'hui désactivés en SH-21a | 🔵 Backlog | 3 | C2.2.3, C2.2.2, C2.4.1 | R10 |
| [SH-22](tickets/SH-22-recherche-matching-ui.md) | Recherche & affichage du score de matching | 🔵 Backlog | 5 | C2.4.1 | R4 |
| [SH-23](tickets/SH-23-cartographie-mapbox.md) | Cartographie Mapbox (visualisation géographique des experts) | 🔵 Backlog | 5 | C2.4.1 | — |
| [SH-24](tickets/SH-24-chat-temps-reel.md) | Chat contextuel temps réel (WebSocket / WSS, partage de fichiers) | 🔵 Backlog | 8 | C2.2.3 | R5, R9 |
| [SH-25](tickets/SH-25-mobile-react-native.md) | App Mobile React Native + notifications Push | ⚪ Lot 2 | 13 | C2.2.3 | — |

## EP06 — Qualité & Déploiement · *20 J/H* · 🎯 J5

| ID | Titre | Statut | Est. | Compétences | Risque |
|---|---|---|---|---|---|
| [SH-26](tickets/SH-26-tests-integration-e2e.md) | Harnais de tests d'intégration & end-to-end | 🔵 Backlog | 8 | C2.2.2 | — |
| [SH-41](tickets/SH-41-smoke-tests-bootstrap.md) | Smoke test de bootstrap (backend) + tests front sous `StrictMode` — *angle mort : 2 bugs bloquants de SH-20 (serveur qui ne démarrait pas, déconnexion à chaque F5) ont échappé aux 103 tests verts* | 🟡 Prêt | 3 | C2.2.2, C2.1.2 | — |
| [SH-42](tickets/SH-42-gitattributes-fins-de-ligne.md) | `.gitattributes` (`* text=auto eol=lf`) — *`format:check` mentait en local sous Windows (13 faux positifs) ; il dit désormais la vérité* | 🟢 Terminé | 1 | C2.1.2 | — |
| [SH-44](tickets/SH-44-armurerie-durcissement-tests-revue.md) | Armurerie : durcissement des tests + polissage (dette de revue SH-21a : garde anti-hex sur `pages/`, contrat OpenAPI à clés exactes, assertion serialNumber sur attributs, couleur message 403) | 🔵 Backlog | 2 | C2.2.2, C2.1.2, C2.4.1 | — |
| [SH-27](tickets/SH-27-audit-accessibilite.md) | Audit accessibilité WCAG en CI (Lighthouse/Axe, bloquant < 90) | 🔵 Backlog | 3 | C2.1.2 | R6 |
| [SH-28](tickets/SH-28-eco-conception-ci.md) | Éco-conception en CI (EcoIndex, poids des pages, requêtes HTTP) | 🔵 Backlog | 3 | C2.1.2 | — |
| [SH-29](tickets/SH-29-monitoring-elk.md) | Monitoring & alerting (stack ELK + webhooks) | 🔵 Backlog | 5 | C2.2.2 | R5 |
| [SH-30](tickets/SH-30-mise-en-production.md) | Mise en production V1.0 + PCA (rollback < 5 min) | 🔵 Backlog | 5 | C2.2.2 | — |

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

1. **✅ EP02 & EP03 livrés** : auth/RBAC, Armurerie backend, certifications, moteur de scoring géospatial et **bus d'événements Redis** (`SH-14`, PR [#15](https://github.com/alixsanta/skillhunt/pull/15) mergée).
2. **✅ Front amorcé** : `SH-19` (scaffold React), `SH-38` (dette post-revue) puis **`SH-20` (parcours d'authentification web)** — access token en mémoire, refresh token en cookie `httpOnly`, CORS à origines explicites.
3. **Dette de revue tracée** (non bloquante) : `SH-35` (cache/consumer matching), `SH-36` (TokenStore) — fenêtres bornées par le TTL 60 s.
4. **Armurerie front : design validé** ([spec](superpowers/specs/2026-07-01-armurerie-grille-inventaire-design.md)) :
   - 🟢 **`SH-21a` (grille d'inventaire, vue privée) est LIVRÉE** (2026-07-15) — branchée sur l'API réelle via le JWT de `SH-20`. Le CTA d'ajout est désactivé → suivi en **`SH-43`**.
   - 🔵 **`SH-43` (écran de déclaration de matériel)** — active les CTA « + Ajouter … » ; suite naturelle côté saisie.
   - 🟡 **`SH-39` (endpoint recruteur)** — reste bloquant pour la **vue publique** (`SH-21b`) uniquement ; ticket rédigé, prêt à démarrer.
5. **Chemin recommandé :** `SH-43` (saisie) et/ou `SH-39` → `SH-21b` (vue publique).
6. **Autres pistes prêtes :** 🟡 `SH-34` (position freelance à l'onboarding), 🔵 `SH-40` (2FA comptes pro, sortie du périmètre SH-20), puis **EP04 (média)** avec `SH-15` (scaffolding `media-service`).
7. Mettre à jour le statut ici à chaque changement (🔵 → 🟡 → 🟠 → 🟢).
