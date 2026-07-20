<!--
Gabarit de PR de RELEASE SkillHunt — develop → main UNIQUEMENT (CLAUDE.md §11).
Usage : gh pr create --base main --head develop --template release.md
(ou via l'URL : ...&expand=1&template=release.md)
Une release = un incrément cohérent, validé et déployable, taggé en version.
Ne PAS utiliser ce gabarit pour une PR de feature (feature/* → develop).
-->

**Titre de la Release :** [vX.Y.Z] Intitulé (ex : [v1.0.0] MVP Web — mise en production)
**Type :** Release de jalon (J4 beta / J5 prod) · Release de sprint · Hotfix
**Jalon / Sprint :** [ex : J5 · Sprint 6 (S16)]
**Branche de base :** `main`  ⚠️ jamais de commit direct sur `main` ni `develop`
**Date de release visée :** [AAAA-MM-JJ]

---

### 0. Definition of Ready — Release (porte d'entrée)
*Checklist obligatoire AVANT d'ouvrir cette PR (sinon rester sur `develop`).*
- [ ] `develop` est **stable** : CI verte (lint + audit sécurité + tests + build) sur le dernier commit.
- [ ] L'incrément est **démontrable et déployable** (pas un simple empilement de features).
- [ ] Tous les tickets inclus ont leur **Definition of Done** validée.
- [ ] Numéro de version décidé (SemVer) et **note de release** rédigée.

### 1. Périmètre de la release (Le Contenu)
**Ce que cette release apporte :**
> [Résumé en 2-3 phrases de la valeur livrée. Ex : première beta Web fonctionnelle — parcours auth + armurerie + recherche matching.]

**Tickets inclus** (cf. [`docs/BACKLOG.md`](../../docs/BACKLOG.md)) :

| Epic | Tickets | Statut |
|---|---|---|
| EPxx — … | SH-…, SH-… | 🟢 Terminé |

**Hors périmètre (assumé / reporté) :**
- [ex : SH-25 (Mobile RN) → Lot 2 ; TODO SH-13 sur le stub de localisation, etc.]

### 2. Compétences RNCP couvertes par la release
*Traçabilité jury — agréger les compétences des tickets inclus.*
- [ ] C2.1.2 — Normes / qualité de code (lint, PEP 8)
- [ ] C2.2.2 — Harnais de tests (unitaires, intégration, RBAC)
- [ ] C2.2.3 — Sécurité des entrées (validation, anti-injection, OWASP)
- [ ] C2.4.1 — Documentation technique (Swagger / OpenAPI)

### 3. Porte de validation (Definition of Done — Release)
*Toutes les cases doivent être cochées avant le merge vers `main`.*

**Qualité & tests**
- [ ] **CI verte** sur la PR (lint + audit sécurité + tests + build) — preuve : lien run Actions.
- [ ] Tests d'intégration / E2E passants (SH-26).
- [ ] Couverture sur le cœur métier (matching, sécurité/RBAC, validation) non régressée.
- [ ] **Recette fonctionnelle (QA)** réalisée sur Staging — scénarios clés OK.

**Sécurité (non négociable — CLAUDE.md §8)**
- [ ] Aucun secret en dur (clés/JWT/API en variables d'env / Vault).
- [ ] Auth JWT RS256 + RBAC d'étanchéité testés (un rôle n'accède pas aux données d'un autre).
- [ ] Fichiers privés via **Signed URLs S3** courtes uniquement, aucun bucket public.
- [ ] Audit sécurité statique sans alerte HIGH/MEDIUM bloquante (Bandit / npm audit).
- [ ] TLS 1.3 / WSS et mTLS inter-services en place (selon périmètre déployé).

**Qualité non-fonctionnelle (EP06, si périmètre Web)**
- [ ] Accessibilité ≥ 90/100 (Lighthouse / Axe — risque R6).
- [ ] Éco-conception : poids des pages / requêtes maîtrisés (EcoIndex).
- [ ] Performance : KPI clés respectés (ex : `/match` < 250 ms — R4 ; API < 50 ms).

**Documentation & traçabilité**
- [ ] Swagger / OpenAPI à jour (C2.4.1).
- [ ] `docs/BACKLOG.md` à jour (statuts 🟢) et CHANGELOG / notes de release rédigés.

### 4. Plan de déploiement & rollback (PCA)
- **Migrations BDD :** [aucune / liste des migrations TypeORM à jouer, ordre, réversibilité].
- **Variables d'env / secrets :** [nouvelles clés à provisionner côté Staging/Prod].
- **Étapes de déploiement :** [build images Docker → push → déploiement Gateway/services].
- **Rollback :** procédure de retour arrière **< 5 min** validée (SH-30) — version précédente identifiée : `vX.Y.(Z-1)`.
- **Vérifications post-déploiement :** [healthchecks, smoke tests, monitoring ELK / alerting].

### 5. Après le merge (post-release)
- [ ] **Taguer la version** sur `main` : `git tag -a vX.Y.Z -m "Release vX.Y.Z" && git push origin vX.Y.Z`.
- [ ] Créer la **GitHub Release** associée au tag (notes de release).
- [ ] **Ne pas supprimer** la branche / l'historique (traçabilité jury RNCP — CLAUDE.md §11).
- [ ] Si la release contenait des correctifs nés sur `main` (hotfix), **reporter sur `develop`**.
- [ ] Vérifier que `develop` reste alignée (pas de divergence avec `main`).

---

> 🤖 Rappel Gitflow (CLAUDE.md §11) : cette PR cible **`main`** et ne doit contenir que `develop`.
> Aucun commit direct sur `main`/`develop`. Les branches ne sont jamais supprimées après merge.
