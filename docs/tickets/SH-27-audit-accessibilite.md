**Titre du Ticket :** [SH-27] Audit d'accessibilité WCAG en CI (Lighthouse, bloquant < 90)
**Type :** Feature (qualité / conformité)
**Priorité :** High
**Estimation :** 3 Story Points (Fibonacci)
**Compétences RNCP visées :** C2.1.2 (normes/qualité), C2.2.2 (harnais automatisé)
**Lot :** Lot 1 (Web MVP)

> **Origine.** L'accessibilité (risque R6) est traitée au fil de l'eau depuis SH-19 (composants
> Radix/shadcn, revues a11y de SH-21a : libellés texte en plus des couleurs, `aria-describedby`,
> contraste des bordures HUD). Mais **rien ne l'empêche de régresser** : aucun garde-fou automatisé.
> Ce ticket rend l'accessibilité **mesurée et bloquante** en CI.

### 0. Definition of Ready (DoR)
- [x] **Valeur Claire :** sans gate CI, chaque nouvel écran peut faire régresser l'accessibilité en silence (R6) ; exigence forte du référentiel qualité (RNCP).
- [x] **Specs Complètes :** pages publiques auditables sans backend (`/`, `/login`, `/register`) ; seuil bloquant : score Lighthouse accessibilité **≥ 90**.
- [x] **UX/UI Validé :** n/a (outillage).
- [x] **Faisabilité Technique :** `@lhci/cli` + `vite preview` (fallback SPA natif) ; Chrome préinstallé sur `ubuntu-latest`.
- [x] **Estimé :** 3 SP.

### 1. User Story
**En tant que** mainteneur de SkillHunt,
**Je veux** qu'un audit d'accessibilité s'exécute à chaque PR et **échoue sous 90/100**,
**Afin que** l'accessibilité soit une propriété **garantie** du produit, pas une intention.

### 2. Contexte & Valeur Business
- **Pourquoi maintenant ?** Les écrans front s'accumulent (SH-19/20/21a/43) ; le coût d'une régression détectée tard croît à chaque sprint.
- **KPI impacté :** score Lighthouse accessibilité (≥ 90 exigé), conformité WCAG (R6).

### 3. Critères d'Acceptation (Gherkin - BDD)

**Scénario 1 : Audit automatique à chaque PR**
* **GIVEN** une PR qui modifie `frontend-web/`
* **WHEN** la CI s'exécute
* **THEN** Lighthouse audite les pages publiques (`/`, `/login`, `/register`) sur le build de production
* **AND** le job **échoue** si le score accessibilité d'une page passe sous **90**.

**Scénario 2 : Rapport consultable**
* **GIVEN** un audit exécuté (succès ou échec)
* **THEN** le rapport HTML Lighthouse est publié en **artefact** de la CI (preuve jury, C2.2.2).

**Scénario 3 : Reproductible en local**
* **GIVEN** un développeur sur son poste
* **WHEN** il lance `npm run audit:a11y`
* **THEN** le même audit s'exécute sur le build local avec les mêmes seuils.

### 4. Spécifications Techniques
* **Outillage :** `@lhci/cli` (Lighthouse CI) en devDependency de `frontend-web`.
* **Config `lighthouserc.json` :** `startServerCommand: vite preview` (fallback SPA natif), émulation **mobile par défaut** (cohérent Mobile-First), 1 run par page, assertion `categories:accessibility >= 0.9` en `error`.
* **CI :** nouveau job `audit-accessibilite` dans `frontend-ci.yml` (build → `lhci autorun` → upload artefact `lighthouse-report`, même en échec).
* **Périmètre :** pages publiques uniquement (les routes protégées exigent une session ; l'audit authentifié pourra s'ajouter avec les tests E2E de SH-26).

### 5. Definition of Done (DoD)
- [x] `lighthouserc.json` + script `npm run audit:a11y` reproductible en local (vérifié : autorun complet, assertions passées).
- [x] Job CI bloquant : assertion `categories:accessibility >= 0.9` en `error` ⇒ échec du job sous 90.
- [x] Rapport Lighthouse publié en artefact CI (`if: always()` — succès comme échec).
- [x] Les 3 pages publiques passent le seuil : `/` **100**, `/login` **100**, `/register` **100** (mesuré le 2026-07-16).
- [x] Dépendances : `@lhci/cli` ajouté SANS réintroduire de vulnérabilité (`overrides` npm `tmp@^0.2.6` + `uuid@^11.1.1` → `npm audit` : 0 vulnérabilité, hygiène SH-32 préservée).
- [x] `docs/BACKLOG.md` mis à jour.
