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
- [ ] `npm audit --audit-level=high` → 0 vulnérabilité HIGH/CRITICAL (ou exceptions documentées et justifiées).
- [ ] Bumps appliqués de façon cohérente avec l'écosystème NestJS (pas de mélange de majeures cassé).
- [ ] `npm run lint`, `npm run test`, `npm run build` verts ; lockfile à jour (`npm ci` reproductible).
- [ ] Décider du sort de `continue-on-error` sur l'étape audit (le retirer une fois l'audit propre, pour rendre l'audit **bloquant** et tirer parti de la garantie).
- [ ] Aucun secret en dur ; aucune techno structurante (§3) changée sans justification au dossier.
- [ ] Backlog mis à jour (SH-32 → 🟢).
