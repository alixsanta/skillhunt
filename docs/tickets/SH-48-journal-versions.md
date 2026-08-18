**Titre du Ticket :** [SH-48] Journal des versions déployées (CHANGELOG + tags Git + process de release)
**Type :** Feature (exploitation / MCO)
**Priorité :** **Critical** — compétence éliminatoire, aucun acquis existant
**Estimation :** 2 Story Points (Fibonacci)
**Compétences RNCP visées :** **C4.3.2** (établir un journal des versions déployées — *éliminatoire*), C4.2.2 (documentation du correctif déployé), C2.4.1
**Lot :** Lot 1 (Web MVP)

> **Origine.** Constat brut du dépôt au 2026-08-04 : **`git tag` ne renvoie rien** et **aucun
> `CHANGELOG.md` n'existe**. La seule notion de version tracée est le double tag d'image GHCR
> (`latest` + SHA) mis en place en [SH-30](SH-30-mise-en-production.md) pour permettre le rollback.
>
> C4.3.2 est **éliminatoire** et exige « un exemplaire réel du journal de version » contenant
> « les différentes améliorations amenées par cette version (ex : anomalies corrigées, nouvelles
> fonctionnalités) ». C'est aujourd'hui le trou le plus grave du dossier BLOC 4 — et paradoxalement
> le moins coûteux à combler.

---

### 0. Definition of Ready (DoR)

- [x] **Valeur Claire :** un rollback est déjà possible techniquement (tags GHCR par SHA), mais **rien ne dit ce que contient chaque version** — donc rien ne permet de décider *vers quoi* revenir ni de communiquer ce qui a changé.
- [x] **Specs Complètes :** format (Keep a Changelog + SemVer), périmètre historique et process de release définis en §4.
- [x] **UX/UI Validé :** n/a (documentation d'exploitation).
- [x] **Faisabilité Technique :** aucune dépendance, aucun outillage à installer. L'historique Git et les runs `publish-staging` fournissent la matière.
- [x] **Estimé :** 2 SP.

### 1. User Story

**En tant que** mainteneuse de SkillHunt,
**Je veux** un journal des versions qui associe chaque déploiement à un tag Git, à une image publiée et à la liste des évolutions et correctifs qu'il apporte,
**Afin de** savoir précisément ce qui tourne en production, décider d'un rollback en connaissance de cause, et tracer les actions de maintenance.

### 2. Contexte & Valeur Business

* **Pourquoi maintenant ?** C4.3.2 est **éliminatoire**, rendu le 17–21 août 2026, et l'acquis est nul. À faire **en début de plan**, pas en fin : le journal doit exister *avant* le déploiement de SH-29 et *avant* le correctif de C4.2.2, sinon ces deux évènements ne pourront pas y être consignés au fil de l'eau — et un journal reconstitué après coup se voit.
* **KPI impacté :** capacité à identifier la version en production (aujourd'hui : uniquement par SHA opaque), délai de décision de rollback.
* **Dépendance aval :** C4.2.2 (« présentation du traitement d'une anomalie ») s'appuie sur une entrée de ce journal pour prouver que le correctif a bien été **versionné et déployé**.

### 3. Critères d'Acceptation (Gherkin - BDD)

**Scénario 1 : Le journal existe et couvre la production réelle**
* **GIVEN** le dépôt cloné
* **WHEN** j'ouvre `CHANGELOG.md`
* **THEN** j'y trouve l'entrée **`v1.0.0` datée du 2026-07-23**, correspondant à la mise en production réelle de SH-30
* **AND** elle liste les fonctionnalités livrées, les correctifs et les limitations connues.

**Scénario 2 : Chaque version est identifiable dans Git**
* **GIVEN** le dépôt
* **WHEN** j'exécute `git tag -l`
* **THEN** chaque version du CHANGELOG a un tag Git annoté correspondant (`v1.0.0`, …)
* **AND** `git show v1.0.0` pointe sur le commit **effectivement publié** sur GHCR.

**Scénario 3 : Traçabilité bout en bout d'un déploiement**
* **GIVEN** une entrée du journal
* **THEN** elle porte : la date de déploiement, le tag Git, le **SHA de l'image GHCR**, l'environnement cible et les tickets `SH-XX` inclus
* **AND** ces informations suffisent à rejouer le rollback décrit dans le runbook SH-30 sans consulter une autre source.

**Scénario 4 : Une version corrective est consignée comme telle**
* **GIVEN** le correctif de l'anomalie IPv6 (`unhealthy` sur `frontend-web`/`gateway`, [SH-30 §4](SH-30-mise-en-production.md#L125)) déployé
* **THEN** une entrée `Fixed` du journal décrit **l'anomalie corrigée**, renvoie à sa fiche de consignation et à la PR
* **AND** le numéro de version est incrémenté conformément à SemVer (`PATCH`).

**Scénario 5 : Le process est écrit, pas seulement appliqué**
* **GIVEN** une PR de release `develop` → `main`
* **THEN** la checklist du process impose : entrée CHANGELOG complétée, tag annoté posé, images republiées, journal mis à jour après vérification en production.

---

### 4. Spécifications Techniques

#### 4.1 Format retenu

* **`CHANGELOG.md`** à la racine, au format **[Keep a Changelog](https://keepachangelog.com)** — rubriques `Added`, `Changed`, `Fixed`, `Security`, `Removed`, `Deprecated` — avec versionnage **SemVer**.
* Justification à porter au dossier : format standard de l'industrie, lisible par un humain comme par un outil, et ses rubriques recouvrent exactement ce qu'exige C4.3.2 (« anomalies corrigées, nouvelles fonctionnalités »). Rédigé **en français**, conformément à CLAUDE.md §7.
* Règle SemVer appliquée au projet : `MAJOR` = rupture d'API publique · `MINOR` = nouvelle fonctionnalité · `PATCH` = correctif sans nouveauté.

#### 4.2 Table de correspondance des déploiements

Chaque entrée du CHANGELOG est complétée par une ligne dans un tableau récapitulatif — c'est ce qui transforme un changelog de développement en **journal des versions déployées** :

| Version | Date de déploiement | Tag Git | Image GHCR (SHA) | Environnement | Tickets |
|---|---|---|---|---|---|
| `v1.0.0` | 2026-07-23 | `v1.0.0` | `a94568ab5e564cc64ad71b43cefa92e776802b60` | Production (VM OVHcloud `147.135.230.140`) | SH-1 → SH-46 |
| … | | | | | |

> ✅ **SHA vérifié** (2026-08-04, `gh run list --workflow=publish-staging.yml`) : run
> `29958054529` du 2026-07-22 21:08 UTC, conclusion `success`, `headSha` =
> **`a94568ab5e564cc64ad71b43cefa92e776802b60`** — soit `a94568a`, le merge de la **PR #42**
> (`develop` → `main`). Le déploiement a donc été fait **depuis `main`**, et non depuis `develop` :
> le tag `v1.0.0` doit être posé sur `main`.
>
> Deux constats relevés au passage, intégrés au journal :
> - la release `de135d1` (PR #40, 2026-07-20) a été fusionnée sur `main` **sans jamais être publiée
>   ni déployée** — elle ne reçoit donc pas de numéro de version (un merge n'est pas un déploiement) ;
> - `publish-staging.yml` étiquette les images avec `${{ github.sha }}`, soit le **SHA complet sur
>   40 caractères** — c'est cette forme entière qu'il faut reporter pour un rollback, pas l'abrégée.

#### 4.3 Périmètre historique — honnêteté du journal

* **Une seule version a réellement été déployée à ce jour** : la mise en production du 2026-07-23. Le journal démarre donc à **`v1.0.0`**, tag annoté posé rétroactivement sur le SHA effectivement publié — ce qui est légitime, puisque cette version *a bien été déployée*.
* **Ne pas fabriquer** une série de versions antérieures (`v0.1.0`, `v0.2.0`…) qui n'ont jamais été déployées nulle part : ce serait un journal fictif, et le référentiel demande un **exemplaire réel**.
* En revanche, une section annexe **« Historique des jalons de développement »** peut retracer les 6 sprints à partir de l'historique Git et de `docs/BACKLOG.md`, **explicitement identifiée comme pré-production**. Elle documente le chemin parcouru sans prétendre à des déploiements qui n'ont pas eu lieu.

**Versions attendues d'ici le rendu** (le journal doit en compter au moins trois, dont une corrective — c'est ce qui prouve qu'il *vit*) :

| Version | Contenu prévu |
|---|---|
| `v1.0.0` | Mise en production initiale (rétroactif, 2026-07-23) |
| `v1.1.0` | Supervision et exploitation : SH-29, SH-47, SH-48 |
| `v1.1.1` | Correctif de l'anomalie IPv6 des HEALTHCHECK (support de C4.2.2) |

#### 4.4 Process de release — `docs/exploitation/PROCESS_RELEASE.md`

1. PR de release `develop` → `main` (jamais de commit direct, CLAUDE.md §11).
2. Compléter la section `[Unreleased]` du CHANGELOG → la figer sous le numéro de version, avec la date.
3. Après merge : `git tag -a v1.x.y -m "…"` puis `git push origin v1.x.y`.
4. Déclencher `publish-staging.yml` → relever le SHA des images publiées.
5. Déployer (runbook SH-30 §4) et **vérifier en production**.
6. Compléter la table §4.2 avec la date de déploiement effective et le SHA — *le journal enregistre ce qui est déployé, pas ce qui est mergé*.
7. En cas de rollback : le consigner aussi (version, motif, version de repli) — un rollback est un évènement d'exploitation, pas un non-évènement.

#### 4.5 Alimentation automatisable

Les Conventional Commits sont déjà en place (CLAUDE.md §11) : `git log v1.0.0..HEAD --pretty=format:"- %s"` produit une première ébauche de section, à trier ensuite par rubrique. À mentionner au dossier comme axe d'amélioration (génération automatique via `release-please` ou `git-cliff`) — matière pour **C4.3.1**, sans l'implémenter maintenant.

---

### 5. Definition of Done (DoD)

- [x] `CHANGELOG.md` créé à la racine, format Keep a Changelog + SemVer, rédigé en français.
- [x] Entrée **`v1.0.0`** complète et fidèle à la mise en production du 2026-07-23 (fonctionnalités, correctifs, **limitations connues** — dont l'anomalie IPv6 non corrigée à cette date).
- [x] **SHA de l'image publiée relevé dans le run `publish-staging`** (vérifié, non supposé) : run `29958054529` du 2026-07-22 21:08 UTC, `headSha` `a94568ab5e564cc64ad71b43cefa92e776802b60` — le merge de la PR #42 sur `main`.
- [x] Table de correspondance §4.2 renseignée (version ↔ date ↔ tag ↔ commit ↔ image ↔ environnement ↔ tickets).
- [x] `docs/exploitation/PROCESS_RELEASE.md` rédigé, incluant le cas du rollback et ses trois limites vérifiées (ref du `workflow_dispatch`, migrations non réversibles par un rollback d'images, URL d'API cuite dans le bundle frontend).
- [x] Section `[Unreleased]` en place et alimentée au fil des tickets suivants.
- [x] Section annexe « historique des jalons » clairement marquée **pré-production** (aucune version fictive présentée comme déployée).
- [x] **CI** — *sans objet* : cette branche ne touche que `CHANGELOG.md` et `docs/**`, qui ne correspondent à aucun filtre `paths` des 4 workflows. Aucun run ne se déclenche sur la PR #44 ; le « all checks passed » y serait vert par vacuité et ne constitue pas une preuve.
- [x] **Tag annoté `v1.0.0` posé sur `main` et poussé** — le 2026-08-06. `git ls-remote --tags origin` confirme les deux références : `refs/tags/v1.0.0` → `75c87dd` (objet tag) et `refs/tags/v1.0.0^{}` → `a94568a`, soit **le commit effectivement publié sur GHCR**, relevé dans le run `publish-staging` et non déduit de l'historique. Tag **annoté** et non léger : il porte message, auteur et date, subsiste dans `git describe` et se documente lui-même.
  > Le message du tag mentionne explicitement qu'il a été **posé rétroactivement**. L'omettre aurait été indétectable, mais un lecteur comparant la date du tag à celle du déploiement verrait l'écart : une explication déjà présente vaut mieux qu'une justification improvisée. C'est légitime — la version *a bien été* déployée le 2026-07-23, seule sa traçabilité manquait.

**C4.3.2 est dès lors complète** : `git tag -l` renvoie `v1.0.0`, le `CHANGELOG.md` porte l'entrée de version et la table de correspondance, et `PROCESS_RELEASE.md` décrit la procédure pour les versions suivantes. Le critère « **un exemplaire réel** du journal de version » du référentiel est satisfait de bout en bout.
- [x] `docs/BACKLOG.md` mis à jour.
