**Titre du Ticket :** [SH-32] Hygiène des dépendances backend-core — résorber les vulnérabilités transitives (audit npm)
**Type :** Bug (dette technique / sécurité)
**Priorité :** Medium
**Estimation :** 2 Story Points (Fibonacci)
**Compétences RNCP visées :** C2.2.3 (sécurité des dépendances), C2.1.2 (qualité)
**Lot :** Lot 1 (Web MVP)

> Identifié en revue de **SH-31**. L'étape `npm audit --audit-level=high` de la CI
> (`node-ci.yml`) remonte des vulnérabilités **HIGH transitives** ; le step est en
> `continue-on-error: true` → **non bloquant**, mais il génère une annotation rouge
> « Process completed with exit code 1 » trompeuse sur chaque run. SH-31 (ajout d'`@aws-sdk`)
> **n'introduit aucune** nouvelle vulnérabilité (vérifié) : la dette est **préexistante**.

### 0. Definition of Ready (DoR)
- [x] **Valeur Claire :** CI lisible (plus de faux rouge) + réduction de la surface de vulnérabilités.
- [x] **Specs Complètes :** critères Gherkin ci-dessous.
- [x] **UX/UI Validé :** n/a (dette technique back).
- [x] **Faisabilité Technique :** bumps de versions NestJS / sous-dépendances ; pas de changement d'archi (§3).
- [x] **Estimé :** 2 SP.

### 1. User Story
**En tant que** mainteneur du backend-core,
**Je veux** résorber les vulnérabilités HIGH transitives signalées par `npm audit`,
**Afin de** garder une CI fiable (audit vert) et minimiser la surface d'attaque des dépendances (R7).

### 2. Contexte & Valeur Business
* **Pourquoi maintenant ?** L'annotation rouge de l'audit a déjà induit en erreur lors de SH-31
  (PR confondue avec un échec de build). Coût de confusion récurrent à chaque PR.
* **KPI impacté :** fiabilité/lisibilité CI, conformité sécurité (preuve jury C2.2.3).

### 3. Paquets concernés (constat SH-31)
Vulnérabilités **HIGH** réellement installées (audit `--omit=dev`) :
- **`lodash`** (≤ 4.17.23) — via `@nestjs/swagger`.
- **`multer`** (≤ 2.1.1) — via `@nestjs/platform-express` (DoS).
- **`qs`** / `body-parser` / `express` (modéré) — via `@nestjs/platform-express`.

> Le correctif passe par un **bump majeur** de `@nestjs/platform-express` (→ 11.x) et
> `@nestjs/swagger` (→ 11.x), signalés « breaking change » par `npm audit fix --force`.
> ⚠️ NestJS core est en 10.x : valider la cohérence de l'écosystème avant bump (cf. §3 CLAUDE.md,
> ne pas changer une techno structurante sans justification).

### 4. Critères d'Acceptation (Gherkin - BDD)

**Scénario 1 : Audit propre**
* **GIVEN** la branche à jour
* **WHEN** la CI exécute `npm audit --audit-level=high`
* **THEN** aucune vulnérabilité HIGH/CRITICAL n'est remontée (exit 0, plus d'annotation rouge).

**Scénario 2 : Non-régression**
* **GIVEN** les bumps de dépendances appliqués
* **WHEN** `npm run lint`, `npm run test`, `npm run build` s'exécutent
* **THEN** tout est vert (aucune régression fonctionnelle introduite par les montées de version).

### 5. Definition of Done (DoD)
- [x] `npm audit --audit-level=high` → **0 vulnérabilité HIGH/CRITICAL** (exit 0). Reste 19 *moderate* (js-yaml via outillage de test jest/ts-jest), sous le seuil CI.
- [x] Bumps cohérents : montée **NestJS 10 → 11** (common/core/platform-express/testing `^11.1.27`, swagger `^11.4.4`, `@types/express ^5`) + `overrides: { multer: ^2.2.0 }`. lodash → 4.18.1 (hors plage vulnérable), multer → 2.2.0.
- [x] `npm run lint`, `npm run test` (52/52), `npm run build` verts ; lockfile régénéré.
- [x] `continue-on-error` **retiré** de l'étape audit (`node-ci.yml`) → audit **bloquant** au niveau high.
- [x] Aucun secret en dur ; NestJS reste la techno structurante (§3) — montée de version mineure d'écosystème, pas de changement de stack.
- [x] Backlog mis à jour (SH-32 → 🟢).

> **Note technique.** lodash n'a aucune version patchée en 4.17.x (toutes ≤4.17.23 vulnérables) ;
> le seul remède est swagger ≥ 11.4.4 (lodash 4.18.1), qui exige NestJS 11 — d'où le bump majeur.
> platform-express 11 passe à **Express 5** (corrige aussi les *moderate* qs/body-parser).
> ⚠️ Non couvert : boot HTTP réel (Express 5). Les routes du projet sont simples (`:id`, segments
> statiques, aucun wildcard impacté) et `tsc`/tests/lint passent ; un **smoke test manuel**
> (`npm run start:dev` + appel d'un endpoint) reste recommandé avant mise en production.

> **Note opérationnelle — audit bloquant sans allowlist.** L'audit étant désormais bloquant et
> `npm audit` n'ayant **pas** de mécanisme natif d'exclusion, une future advisory tombant sur un
> paquet déjà installé **sans correctif disponible** (cas qu'a connu lodash) bloquerait **toutes**
> les PR vers `develop`, y compris des features sans rapport. Parades le jour venu :
> 1. ré-activer temporairement `continue-on-error` (retour à l'avertissement) ;
> 2. `overrides`/pin si un correctif existe ;
> 3. adopter un wrapper avec allowlist (`audit-ci` / `better-npm-audit`) pour ignorer **nommément**
>    une advisory tracée, sans baisser le seuil global. *(Option recommandée si le cas se présente.)*
