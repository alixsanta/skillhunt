**Titre du Ticket :** [SH-47] Politique de mise à jour des dépendances + automatisation Dependabot
**Type :** Feature (exploitation / MCO)
**Priorité :** High
**Estimation :** 2 Story Points (Fibonacci)
**Compétences RNCP visées :** **C4.1.1** (gérer les mises à jour des dépendances et bibliothèques tierces), C2.1.2, C2.2.3
**Lot :** Lot 1 (Web MVP)

> **Origine.** Le projet dispose déjà d'un **garde-fou** (`npm audit --audit-level=high` bloquant
> dans [node-ci.yml:61](../../.github/workflows/node-ci.yml#L61) et
> [frontend-ci.yml:38](../../.github/workflows/frontend-ci.yml#L38)) et d'une **remédiation
> ponctuelle** (SH-32, résorption des vulnérabilités transitives). Mais il n'a **aucune veille** :
> `.github/dependabot.yml` n'existe pas, aucune montée de version n'est proposée automatiquement,
> et la politique n'est écrite nulle part.
>
> C4.1.1 exige explicitement de préciser **la fréquence**, **le périmètre logiciel concerné** et
> **le type de mise à jour (automatique ou manuel)**. Aujourd'hui aucune des trois n'est
> documentée : la CI *détecte* les vulnérabilités connues, elle ne *surveille* pas les nouvelles
> versions.

---

### 0. Definition of Ready (DoR)

- [x] **Valeur Claire :** une CI qui échoue sur `npm audit` sans mécanisme de veille transforme chaque vulnérabilité publiée en blocage surprise. La veille automatisée déplace le coût du correctif d'urgence vers l'entretien régulier.
- [x] **Specs Complètes :** 5 écosystèmes inventoriés (§4.1), stratégie de regroupement et politique de merge définies (§4.2/§4.3).
- [x] **UX/UI Validé :** n/a (outillage).
- [x] **Faisabilité Technique :** Dependabot est natif GitHub, sans coût ni service tiers, cohérent avec la contrainte « zéro coût » du projet.
- [x] **Estimé :** 2 SP.

### 1. User Story

**En tant que** mainteneuse de SkillHunt,
**Je veux** que les nouvelles versions des dépendances me soient proposées automatiquement, testées par la CI et regroupées intelligemment,
**Afin de** maintenir la plateforme à jour et sécurisée sans y consacrer une veille manuelle, et de pouvoir décrire un processus de mise à jour reproductible.

### 2. Contexte & Valeur Business

* **Pourquoi maintenant ?** Livrable direct de **C4.1.1** pour le dossier BLOC 4 (rendu 17–21 août 2026). C'est aussi le ticket au meilleur rapport valeur/effort du lot : ~2 h de travail pour une compétence entièrement couverte.
* **KPI impacté :** nombre de vulnérabilités connues en attente (cible : 0 `high`/`critical`), délai entre publication d'un correctif amont et son intégration.
* **Contrainte à respecter :** l'hygiène acquise en SH-32 (0 vulnérabilité, `overrides` npm posés en SH-27) **ne doit pas régresser**.

### 3. Critères d'Acceptation (Gherkin - BDD)

**Scénario 1 : Veille automatique sur tous les écosystèmes**
* **GIVEN** `.github/dependabot.yml` mergé sur `develop`
* **WHEN** le cycle hebdomadaire s'exécute
* **THEN** Dependabot ouvre des PR pour les 5 écosystèmes du projet (npm ×2, pip, Docker, GitHub Actions)
* **AND** ces PR ciblent **`develop`**, jamais `main` (CLAUDE.md §11).

**Scénario 2 : Toute mise à jour est validée par la CI**
* **GIVEN** une PR ouverte par Dependabot
* **WHEN** la CI s'exécute
* **THEN** lint + audit sécurité + tests + build s'appliquent à cette PR comme à n'importe quelle autre
* **AND** une PR dont la CI échoue n'est pas mergeable.

**Scénario 3 : Regroupement — pas de noyade sous les PR**
* **GIVEN** plusieurs mises à jour `patch`/`minor` disponibles sur un même écosystème
* **THEN** elles sont regroupées dans **une seule PR** par écosystème
* **AND** les montées de version **`major`** font l'objet de PR **séparées** (impact à évaluer une par une).

**Scénario 4 : Plafond d'ouverture**
* **GIVEN** un retard de plusieurs semaines
* **THEN** le nombre de PR simultanément ouvertes par écosystème n'excède pas **5**.

**Scénario 5 : Non-régression de l'hygiène SH-32**
* **GIVEN** une PR Dependabot mergée
* **WHEN** `npm audit --audit-level=high` s'exécute
* **THEN** il ne remonte **aucune** vulnérabilité — les `overrides` posés en SH-27/SH-32 restent effectifs.

---

### 4. Spécifications Techniques

#### 4.1 Périmètre logiciel — inventaire des écosystèmes

| Écosystème | Répertoire | Manifeste | Justification |
|---|---|---|---|
| `npm` | `/backend-core` | `package.json` | Monolithe NestJS (Node 20) |
| `npm` | `/frontend-web` | `package.json` | SPA React/Vite |
| `pip` | `/matching-service` | `requirements.txt`, `requirements-dev.txt` | Microservice FastAPI (Python 3.11) |
| `docker` | `/backend-core`, `/frontend-web`, `/gateway`, `/matching-service` | `Dockerfile` | Images de base (`node:*`, `python:3.11-slim`, `nginx:*`) — vecteur de CVE souvent oublié |
| `github-actions` | `/` | `.github/workflows/*.yml` | Actions tierces épinglées : surface d'attaque supply-chain |

#### 4.2 `.github/dependabot.yml`

* `schedule.interval: weekly` (lundi) sur tous les écosystèmes.
* `target-branch: develop` — **obligatoire** : par défaut Dependabot cible la branche par défaut du dépôt ; laisser le défaut violerait le Gitflow du projet (CLAUDE.md §11).
* `open-pull-requests-limit: 5` par écosystème.
* **Regroupement** (`groups`) : un groupe `patch-et-minor` par écosystème (`update-types: [patch, minor]`) ; les `major` restent hors groupe donc en PR individuelles.
* `commit-message.prefix: "chore(deps)"` — conforme aux Conventional Commits du projet.
* `labels: ["dependencies"]` pour filtrer les PR de maintenance.
* `reviewers` : la mainteneuse (traçabilité de la revue humaine).

#### 4.3 Politique écrite — `docs/exploitation/POLITIQUE_DEPENDANCES.md`

Document livrable pour C4.1.1, structuré selon les trois critères exigés par le référentiel :

* **Fréquence** — veille automatisée **hebdomadaire** (Dependabot) ; revue humaine des PR groupées **à chaque début de sprint** ; traitement **immédiat** (hors cycle) de toute alerte de sécurité `high`/`critical`, puisque la CI devient bloquante dans ce cas.
* **Périmètre** — le tableau §4.1, avec la distinction dépendances directes / transitives (les transitives ne se corrigent pas par bump direct mais par `overrides` npm : mécanisme mis en place en SH-32 et SH-27, à documenter).
* **Type de mise à jour** :
  * **Automatique** — détection, ouverture de PR et exécution complète de la CI. Aucun merge automatique n'est activé : sur un projet mono-mainteneur sans harnais E2E complet (SH-26 encore au backlog), l'auto-merge ferait entrer du code non observé en production. **Décision assumée et argumentée** — c'est exactement le type d'arbitrage que la compétence attend.
  * **Manuel** — décision de merge par la mainteneuse, systématique pour les `major` (lecture du changelog amont, évaluation des ruptures d'API, test local).
* **Critères de merge** — CI verte (lint + audit + tests + build), `npm audit`/`pip-audit` sans `high`, changelog amont lu pour les `major`, aucune régression sur les tests d'étanchéité RBAC.
* **Évaluation d'impact** — grille : rupture d'API ? migration de données ? impact sur les images Docker ? sur le temps de build CI ?
* **Traçabilité** — historique consultable dans les PR `chore(deps)` et reporté au CHANGELOG (SH-48) sous la rubrique `Security` / `Changed`.

#### 4.4 Complément — audit Python

`npm audit` couvre les deux fronts Node, mais rien n'audite les dépendances Python. Ajouter une étape **`pip-audit`** au workflow `python-ci.yml`, en cohérence avec `npm audit --audit-level=high` côté Node — sans quoi le microservice reste le seul service sans garde-fou de vulnérabilités. Étape **bloquante** : la rendre tolérante reproduirait l'asymétrie de Bandit (`continue-on-error: true`) relevée en §4.3.

#### 4.5 Correction de la vulnérabilité révélée par la mise en place

Le premier passage de `pip-audit` (2026-08-04) a remonté **7 avis de sécurité sur `starlette 0.41.3`**,
dépendance transitive de `fastapi==0.115.5`, **en production depuis le 2026-07-23**.

Décision : **corriger dans ce ticket** plutôt que reporter — la vulnérabilité est en production, et
le correctif s'avère peu risqué après application de la grille d'évaluation d'impact (§4.3).

* `fastapi` : `0.115.5` → **`0.141.1`**.
* `starlette` : **épinglée explicitement à `1.3.1`** dans `requirements.txt`. `fastapi` ne déclare
  que `starlette>=0.46.0` (borne haute ouverte) : sans épinglage, la version installée dépendrait
  de la date de résolution, ce qui est inacceptable pour un correctif de sécurité. Équivalent
  Python du champ `overrides` de npm (SH-32/SH-27).
* `pydantic` : inchangée à `2.10.3` — `fastapi 0.141.1` exige `>=2.9.0`, contrainte satisfaite.
  Montée volontairement écartée pour limiter la surface de changement.
Une **seconde passe** de l'audit, une fois `starlette` corrigée, a révélé un deuxième avis —
`PYSEC-2026-1845` sur `pytest 8.3.4` (dépendance de développement, absente de l'image de
production, mais exécutée à chaque PR) :

* `pytest` : `8.3.4` → **`9.1.1`**.
* `pytest-asyncio` : `0.24.0` → **`1.4.0`** — montée **contrainte**, la 0.24.0 exigeant `pytest<9`.
* `pytest-cov` : `6.0.0` → **`7.1.0`**, aligné par cohérence.

* **Évaluation du risque avant application** :
  * *FastAPI* — surface utilisée limitée à `FastAPI()`, `lifespan`, `include_router`, `APIRouter`,
    `Depends` : les API les plus stables du framework.
  * *pytest-asyncio* — la rupture principale de la 1.0 est la suppression de la surcharge de la
    fixture `event_loop` : **aucun test du projet ne l'utilise**, et `pytest.ini` déclare déjà
    `asyncio_default_fixture_loop_scope`, l'option introduite en 0.24 pour préparer cette
    transition.
  * 73 tests couvrent le service, avec PostgreSQL et Redis provisionnés en CI. **La CI fait foi** :
    c'est elle qui valide les montées, pas une inspection visuelle.

---

### 5. Definition of Done (DoD)

- [x] `.github/dependabot.yml` créé : **8 entrées** couvrant les 4 écosystèmes du tableau §4.1 (npm ×2, pip, docker ×4, github-actions).
- [x] `target-branch: develop` présent sur **chaque** entrée (respect du Gitflow, CLAUDE.md §11).
- [x] Regroupement `patch`+`minor` actif ; `major` hors groupe donc en PR séparées ; limite de 5 PR par écosystème.
- [x] `pip-audit` ajouté à `python-ci.yml` en étape **bloquante**, et à `requirements-dev.txt` (`pip-audit==2.10.1`).
- [x] **Vulnérabilités révélées par la mise en place corrigées** (§4.5) : `starlette` (7 avis) via `fastapi` → `0.141.1` + épinglage `starlette==1.3.1` ; puis `pytest` (`PYSEC-2026-1845`) → `9.1.1`, entraînant `pytest-asyncio` → `1.4.0` et `pytest-cov` → `7.1.0`.
- [x] `pip-audit` sans aucun avis sur `requirements.txt` **et** `requirements-dev.txt` — vérifié en local le 2026-08-04 (`pip-audit 2.10.1` : « No known vulnerabilities found », code de sortie 0).
- [x] `docs/exploitation/POLITIQUE_DEPENDANCES.md` rédigé, couvrant explicitement **fréquence (§1) / périmètre (§2) / type automatique ou manuel (§3)**, plus critères de merge, grille d'impact et axes d'amélioration.
- [x] **Suite de tests validée en local sous Python 3.11** (même version que la CI), dans un environnement isolé reconstruit depuis les nouveaux `requirements` : **73 tests collectés sans erreur**, puis **67 passés / 6 ignorés / 0 échec**. Les 6 ignorés sont les tests d'intégration qui s'auto-skippent sans PostgreSQL/Redis — la CI les provisionne et les exécutera.
- [x] **Dépréciation relevée et tracée** (politique §7) : `starlette 1.3.1` déprécie `httpx` au profit de `httpx2` dans son `TestClient`, utilisé par `tests/conftest.py`. Non bloquant, mais à traiter avant la prochaine montée majeure de `starlette`.
- [x] **CI verte** — run [`30904983219`](https://github.com/alixsanta/skillhunt/actions/runs/30904983219) sur la PR #45, conclusion `success` : `pip-audit` → « No known vulnerabilities found », PyTest → **73 passés** en 1,09 s. Les 6 tests d'intégration ignorés en local (PostGIS, bus Redis) ont bien tourné avec les services provisionnés : aucune régression de la montée `fastapi`/`starlette`/`pytest-asyncio`. L'étape `pip-audit` s'exécute en ~12 s, sans alourdir la pipeline.
- [x] `npm audit --audit-level=high` : **sans objet ici** — ce ticket ne modifie aucun `package.json` ni `package-lock.json`, les workflows `node-ci`/`frontend-ci` ne se sont donc pas déclenchés (filtres `paths`). L'hygiène SH-32 est préservée par construction. *Le critère reste actif pour les futures PR Dependabot npm, où il devra être vérifié réellement.*
- [ ] **Preuve d'exécution Dependabot** : au moins un cycle réellement déclenché, des PR ouvertes, CI passée — capture d'écran archivée. *Nécessite que le fichier soit mergé sur `develop` : à faire après la PR.* Le dossier doit montrer le processus **en fonctionnement**, pas seulement sa configuration.
- [ ] Entrée `Sécurité` au `CHANGELOG.md` pour la correction `starlette` — *à ajouter après le merge de SH-48, qui crée le fichier.*
- [x] `docs/BACKLOG.md` mis à jour.
