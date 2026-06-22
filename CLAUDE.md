# CLAUDE.md — SkillHunt

> Fichier de contexte lu automatiquement par l'assistant à chaque session.
> Il décrit **ce qu'est SkillHunt**, **comment le code est organisé** et **les règles non négociables** à respecter quand tu écris du code ici.
> En cas de doute, ce fichier fait foi. S'il contredit le code existant, signale-le au lieu de deviner.

---

## 1. Contexte du projet

**SkillHunt** est une plateforme de mise en relation entre **freelances de métiers techniques de niche** (télépilotes de drone DGAC, ingénieurs robotique, opérateurs 360°…) et **recruteurs** (sociétés de production, industrie).

La proposition de valeur : la **« preuve de compétence par l'image et la donnée technique »**.
Trois fonctionnalités différenciantes :
- **L'Armurerie (Gear Locker)** : déclaration gamifiée du matériel possédé (cartes visuelles, loadout, badges). La donnée saisie ici alimente l'algorithme de matching — sa qualité est *critique*.
- **Le Portfolio interactif** : vidéos 4K / 360° servies via CDN.
- **Le Chat contextuel** : messagerie temps réel avec partage de fichiers lourds.

Le cœur métier différenciant à protéger : **l'algorithme de matching multicritères** (Skills + Matériel + Localisation) et **l'UX de l'Armurerie**. Tout le reste s'appuie sur des briques tierces éprouvées.

> ⚠️ **Contexte académique.** Ce dépôt est le support d'un projet de titre **RNCP 39583 — Expert en Développement Logiciel** (Ynov, 2025/2026). Les choix techniques doivent rester **justifiables** et **alignés sur le dossier professionnel**. Les commentaires de code référencent volontairement des compétences (`C2.2.3`, `C2.4.1`…) : conserve cette pratique, elle sert de preuve pour le jury (voir §9).

---

## 2. Architecture cible

Architecture **hybride : monolithe + microservices**. Le monolithe gère le transactionnel ; les traitements lourds sont isolés dans des microservices scalables indépendamment.

```
                         ┌──────────────────────┐
   Web (React) ─────────▶│   API Gateway        │  Rate-limiting, TLS,
   Mobile (RN, Lot 2) ──▶│   (Kong / Nginx)     │  point d'entrée unique
                         └──────────┬───────────┘
                                    │ (réseau Docker privé, mTLS)
              ┌─────────────────────┼─────────────────────┐
              ▼                     ▼                     ▼
     ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
     │  backend-core   │   │ matching-service│   │  media-service  │
     │  NestJS (TS)    │   │  FastAPI (Py)   │   │  Node + FFmpeg  │
     │  Auth, CRUD,    │   │  Scoring multi- │   │  Transcodage    │
     │  Armurerie,     │   │  critères +     │   │  4K/360° async  │
     │  Certifs, Chat  │   │  géo PostGIS    │   │  → S3/CloudFront│
     └────────┬────────┘   └────────┬────────┘   └────────┬────────┘
              │                     │                     │
              ▼                     ▼                     ▼
       PostgreSQL + PostGIS   (lecture PostGIS)      S3 + CloudFront
       MongoDB (chat/logs)         Redis (cache + bus d'événements)
```

**Communication asynchrone** entre services via **Redis** (cache + bus d'événements). Ex. : quand une offre est publiée, le `backend-core` émet un événement, le `matching-service` le consomme.

---

## 3. Stack technique (et *pourquoi*)

| Couche | Techno retenue | Justification (dossier) |
|---|---|---|
| **Backend Core** | **NestJS** (Node 20, TypeScript) | I/O non-bloquant, structure modulaire DDD-ready, < 50 ms |
| **Microservice Matching** | **FastAPI** (Python 3.11) | Écosystème Data (pandas, scikit-learn, NumPy), asynchrone, typé |
| **Microservice Média** | **Node + FFmpeg** | Transcodage async des flux 4K/360° |
| **Front Web** | **React.js** (TypeScript, Tailwind, Lucide) | ~30 % de code partagé avec le mobile |
| **Front Mobile** | **React Native** | **Reporté au Lot 2 / V1.2** (voir §6) |
| **BDD relationnelle/spatiale** | **PostgreSQL + PostGIS** | Géo-fencing natif, ACID, **zéro coût d'API carto tierce** |
| **BDD documentaire** | **MongoDB** | Chat, logs, Gear Locker — schémas flexibles |
| **Cache / Broker** | **Redis** | < 1 ms, cache résultats de recherche + bus d'événements |
| **Stockage / CDN** | **AWS S3 + CloudFront** | Fichiers lourds, **Signed URLs** uniquement |
| **Gateway** | **Kong / Nginx** | Point d'entrée unique, rate-limiting, SSL |
| **CI/CD** | **GitHub Actions** + Docker | SAST (Bandit/npm audit), lint, tests, build |

**Choix structurants à ne pas remettre en question sans raison forte :**
- PostGIS **plutôt que** l'API Google Maps (coût d'API nul à long terme).
- React Native **plutôt que** PWA (accès caméra + géoloc arrière-plan fiables).
- Hybride **plutôt que** monolithe pur (isolation des traitements lourds vidéo/matching).

---

## 4. Structure du monorepo

```
skillhunt/
├── backend-core/         # Monolithe NestJS (Auth, Armurerie, Certifs, Chat) — port 3001
│   └── src/
│       ├── auth/         # IAM : register/login, guards JWT, RBAC
│       ├── gear/         # Armurerie (Gear Locker)
│       ├── media/        # (placeholder) intégration média/portfolio
│       ├── db/           # db-state.ts : état EN MÉMOIRE (placeholder, voir §5)
│       ├── app.module.ts
│       └── main.ts       # bootstrap, CORS, ValidationPipe global, Swagger /api/docs
├── matching-service/     # Microservice FastAPI (scoring + PostGIS) — À DÉMARRER
├── .github/workflows/    # node-ci.yml (NestJS), python-ci.yml (FastAPI)
└── CLAUDE.md             # ce fichier
```

Chaque service a (ou aura) son propre `CLAUDE.md` avec les conventions locales.

---

## 5. État actuel vs. cible — **À LIRE AVANT DE CODER**

Le code actuel est un **squelette de démonstration**. Plusieurs briques sont des **placeholders volontaires** à remplacer par la vraie implémentation :

| Sujet | État actuel (placeholder) | Cible à implémenter |
|---|---|---|
| Persistance (SQL) | ✅ **PostgreSQL + PostGIS réel** via **TypeORM** (entités `User`/`Gear`, migrations, index GiST) — *fait, SH-6* | — |
| Persistance (NoSQL) | pas encore branchée | MongoDB (chat/logs) — à venir |
| Hash mot de passe | ✅ **Argon2id réel** (`@node-rs/argon2`) — *fait, SH-7* | — |
| JWT | ✅ **RS256** + refresh tokens avec rotation — *fait, SH-7* | refresh store à migrer en Redis (SH-14) |
| Guard JWT | ✅ vérification cryptographique réelle de la signature — *fait, SH-7* | — |
| matching-service | dossier vide | Projet FastAPI + `requirements.txt` + `tests/` |

➡️ Quand tu touches à l'un de ces points, **migre vers la cible** plutôt que d'étendre le placeholder, et mets à jour ce tableau. Ne réintroduis jamais de secret/signature en dur.

---

## 6. Périmètre & priorités (MVP)

- **Lot 1 (en cours)** : Web App **responsive Mobile-First** uniquement. Backend Core + Matching + Média + Web React.
- **Lot 2 (V1.2)** : application **React Native** — *reportée* pour sécuriser le délai du MVP.

Budget/délai cadrés : MVP ~4 mois, 6 sprints de 2 semaines, méthodologie Scrum. Ne pas élargir le périmètre du Lot 1 sans le signaler.

Jalons : J1 archi validée · J2 APIs Core + sécurité JWT · J3 matching + pipeline vidéo · J4 beta Web · J5 recette + prod.

---

## 7. Conventions de code

**Général**
- **Langue** : commentaires et messages utilisateur **en français** ; identifiants (variables, fonctions, classes) **en anglais**.
- Référencer la compétence RNCP en commentaire quand un bloc en illustre une (ex. `// Validation stricte des entrées (C2.2.3)`).
- Pas de secret en dur : tout passe par variables d'environnement (`.env` est git-ignoré).

**backend-core (NestJS)**
- Organisation **par feature** : un dossier = `*.controller.ts` + `*.service.ts` + `dto/` (+ `*.spec.ts`).
- Préfixe de route versionné : **`api/v1/<feature>`**.
- **Tout endpoint documenté Swagger** : `@ApiTags`, `@ApiOperation`, `@ApiResponse`.
- **Toute entrée validée** par un DTO `class-validator` (le `ValidationPipe` global est en `whitelist + forbidNonWhitelisted + transform`).
- Injection de dépendances NestJS systématique (pas de `new` manuel des services).
- Erreurs métier via les exceptions Nest (`UnauthorizedException`, `NotFoundException`, …).

**matching-service (FastAPI)**
- Style **PEP 8** (flake8, `max-line-length=127`), code typé.
- Validation des I/O via **modèles Pydantic**.
- Tests dans `matching-service/tests/` (pytest + couverture).

**Tests**
- Backend : Jest, fichiers `*.spec.ts` à côté du code (`testRegex: .*\.spec\.ts$`).
- Couvrir en priorité : matching, sécurité/RBAC, validation d'entrée.

---

## 8. Sécurité — règles non négociables (Defense in Depth)

Approche **Security by Design**. Ces règles s'appliquent à *tout* code écrit ici :

1. **Validation systématique des entrées** (class-validator / Pydantic). Jamais de données externes non validées.
2. **Aucune requête brute** (`raw query`) : passer par l'ORM/ODM. Pas de concaténation SQL/NoSQL → anti-injection (R7).
3. **Fichiers privés uniquement** : médias et certifications servis via **Signed URLs S3 à durée courte (~15 min)**. Aucun bucket public, aucun lien permanent (R8).
4. **Secrets hors du code** : clés API, secrets JWT → variables d'env / Vault. Jamais commités.
5. **Auth** : JWT **RS256**, refresh tokens invalidables via Redis, **RBAC strict** (un `FREELANCE` ne voit jamais les données d'un autre — tester l'étanchéité).
6. **Chiffrement** : données sensibles **AES-256 au repos** ; transport **TLS 1.3 / WSS** pour le chat.
7. **RGPD / minimisation** : à l'upload d'une certif, n'extraire que les métadonnées de validité, **purger les PII** du fichier original.
8. **Inter-services** : réseau Docker privé + **mTLS**, point d'entrée unique via la Gateway (rate-limiting).

Tout `// TODO sécurité` doit être explicite, jamais silencieux.

---

## 9. Compétences RNCP référencées (bloc BC02 / développement)

Garder la traçabilité dans les commentaires et les PR :

| Réf. | Intitulé (résumé) |
|---|---|
| C2.1.2 | Respect des normes/qualité de code (PEP 8, lint) |
| C2.2.2 | Harnais de tests (unitaires, intégration, RBAC) |
| C2.2.3 | Sécurité des entrées (anti-injection, OWASP, validation) |
| C2.4.1 | Documentation technique (Swagger/OpenAPI) |

(Le dossier de cadrage couvre le BC01 : C1.1.1 → C1.6.)

---

## 10. Commandes utiles

**backend-core/**
```bash
npm ci                 # install reproductible
npm run start:dev      # dev (ts-node-dev, hot reload) → http://localhost:3001
npm run lint           # ESLint
npm run test           # Jest
npm run build          # compilation TypeScript (tsc → dist/)
```
Swagger : http://localhost:3001/api/docs

**matching-service/** (cible)
```bash
python -m venv venv && source venv/bin/activate   # (Windows : venv\Scripts\activate)
pip install -r requirements.txt
uvicorn main:app --reload      # à adapter selon le point d'entrée
pytest --cov=. tests/
```

---

## 11. Git & workflow

- Branches : `feature/SH-<id>-<slug>` (ex. `feature/SH-1-backend-init`).
- Commits **Conventional Commits** (`feat:`, `fix:`, `ci:`, `chore:`, `docs:`, `test:`).
- La CI (GitHub Actions) tourne sur `main` et `develop` : lint + audit + tests + build doivent passer.
- Ne committe/push **que sur demande explicite**. Jamais directement sur `main`.

---

## 12. Workflow par feature (tickets)

Le **contexte projet** (ce fichier) est permanent ; les **features** se décrivent **un ticket à la fois**, pas dans un fichier fourre-tout.
- Index des features et statuts : `docs/BACKLOG.md`.
- Format de référence : `docs/templates/TICKET_TEMPLATE.md` (User Story INVEST + critères Gherkin + specs + DoR/DoD).
- Un ticket = un fichier `docs/tickets/SH-XX-<slug>.md` (ou une issue GitHub).
- Quand on implémente une feature, **se référer au ticket courant** + à ce CLAUDE.md. Respecter sa Definition of Done avant de considérer le travail terminé.
- Tout ticket doit porter ses **compétences RNCP visées** (traçabilité jury).

## 13. Multi-assistant

Le contexte est partagé : `GEMINI.md` **importe** ce fichier (`@CLAUDE.md`). **Source de vérité unique = `CLAUDE.md`** ; ne jamais dupliquer le contenu ailleurs, tout modifier ici.

## 14. Garde-fous pour l'assistant

- **Ne pas** réintroduire de secrets, signatures factices ou hash en dur (le code de démo en contient — ils sont à remplacer, pas à copier).
- **Ne pas** ajouter une dépendance lourde ou changer une techno structurante (§3) sans le signaler et le justifier.
- **Ne pas** élargir le périmètre du Lot 1 (pas de React Native maintenant).
- **Privilégier** : petites étapes vérifiables, tests à l'appui, cohérence avec le code voisin (mêmes patterns, mêmes conventions de commentaires).
- En cas d'ambiguïté entre ce fichier et le dossier RNCP : **demander** plutôt que supposer.
