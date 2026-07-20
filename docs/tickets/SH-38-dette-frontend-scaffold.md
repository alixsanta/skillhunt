<!--
Ticket de dette technique issu de la revue de code de SH-19 (scaffold frontend-web).
Regroupe 5 findings non bloquants relevés après merge de la PR #16.
-->

**Titre du Ticket :** [SH-38] Dette technique du scaffold frontend-web (nettoyage post-revue SH-19)
**Type :** Dette technique (chore)
**Priorité :** Low
**Estimation :** 2 Story Points
**Compétences RNCP visées :** C2.1.2 (normes/qualité de code, outillage), C2.2.2 (harnais de tests)
**Lot :** Lot 1 (Web MVP)

### 0. Definition of Ready (DoR)
- [x] **Valeur Claire :** nettoyage ciblé, chaque item est indépendant et testable.
- [x] **Specs Complètes :** critères d'acceptation par finding ci-dessous.
- [ ] **UX/UI Validé :** sans objet (aucun impact visuel).
- [x] **Faisabilité Technique :** aucune dépendance nouvelle, périmètre `frontend-web/` uniquement.
- [x] **Estimé :** 2 SP.

### 1. User Story (Le Besoin)
**En tant que** développeur mainteneur du frontend SkillHunt,
**Je veux** résorber les scories de scaffolding et les petits pièges relevés en revue de SH-19,
**Afin de** garder `frontend-web/` propre, cohérent avec ses propres conventions, et sans dette silencieuse avant d'attaquer les écrans métier (SH-20+).

### 2. Contexte & Valeur Business
* **Pourquoi maintenant ?** SH-19 a été mergé (PR #16). Une relecture de code + sécurité a suivi : 0 vulnérabilité, 0 finding bloquant. Deux correctifs d'une ligne ont déjà été appliqués **avant** merge (commit `cb96039` : fallback `??`→`||` de `baseURL`, et exclusion ESLint de `schema.d.ts`). Ce ticket regroupe les **5 findings non bloquants restants**, laissés en suivi pour ne pas gonfler la PR de scaffold.
* **KPI impacté :** qualité/maintenabilité du code (dette maîtrisée), poids du build (asset mort supprimé).

### 3. Critères d'Acceptation (par finding)

**Finding 1 — Asset mort du template (`public/icons.svg`)**
* **GIVEN** le sprite `frontend-web/public/icons.svg` (icônes bluesky/discord/github/x…) hérité du template, référencé nulle part
* **WHEN** je le supprime
* **THEN** `grep -r "icons.svg" frontend-web/src frontend-web/index.html` ne renvoie rien **AND** le build reste vert (plus aucun octet mort copié dans `dist/`).

**Finding 2 — Littéral d'URL de fallback dupliqué**
* **GIVEN** `'http://localhost:3001'` est écrit en dur à la fois dans `src/api/client.ts` et dans `src/api/client.test.ts`
* **WHEN** j'extrais une constante exportée (ex. `DEFAULT_API_URL`) depuis `client.ts` et que le test l'importe
* **THEN** la valeur n'existe plus qu'à un seul endroit **AND** le test asserte la constante importée (plus de recopie du littéral).

**Finding 3 — Prettier configuré mais non exécuté**
* **GIVEN** `.prettierrc.json` est présent mais aucun script `format` n'existe et la CI ne lance jamais Prettier (aucun précédent côté `backend-core`)
* **WHEN** je tranche : soit ajouter des scripts `format` / `format:check` + une étape CI, soit retirer la config si le choix est « éditeur uniquement »
* **THEN** l'état du formatage est **soit** activement vérifié en CI, **soit** explicitement documenté comme non enforce (pas de config fantôme).

**Finding 4 — Effet de bord au chargement de `router.tsx`**
* **GIVEN** `export const router = createBrowserRouter(routes)` s'exécute au chargement du module (branche un listener `popstate` dès l'import, y compris quand un test n'importe que `routes`)
* **WHEN** j'extrais le tableau `routes` dans son propre module (ex. `src/app/routes.tsx`) et que `router.tsx` ne fait plus que `createBrowserRouter(routes)`
* **THEN** les tests important `routes` ne construisent plus de router browser-history jetable **AND** les 5 tests restent verts.

**Finding 5 — Formulation de la règle de tests (`frontend-web/CLAUDE.md`)**
* **GIVEN** la règle « tester du point de vue utilisateur (rôles/labels), pas les détails d'implémentation » est énoncée sans périmètre, alors que `client.test.ts` et `providers.test.tsx` testent légitimement des modules d'infrastructure (client Axios, provider) qui n'ont pas de surface rôle/label
* **WHEN** je précise la règle : elle s'applique aux **tests de composants UI** ; les modules d'infrastructure se testent sur leur **contrat/état**
* **THEN** le `CLAUDE.md` local n'est plus en contradiction avec les tests livrés par SH-19.

### 4. Spécifications Techniques
* **Périmètre strict :** `frontend-web/` uniquement. Aucune dépendance nouvelle, aucune techno structurante touchée (§14).
* **Fichiers concernés :** `public/icons.svg` (suppr.), `src/api/client.ts` + `src/api/client.test.ts` (constante), `package.json` + `.github/workflows/frontend-ci.yml` (± `.prettierrc.json`) pour le finding 3, `src/app/router.tsx` (+ `src/app/routes.tsx` nouveau) + `src/app/router.test.tsx` + `src/app/App.tsx` (import), `CLAUDE.md` local.
* **Langue :** commentaires/UI en français, identifiants en anglais (§7).
* **Rappels hors périmètre de ce ticket** (déjà tracés ailleurs, ne pas traiter ici) :
    * CORS backend `origin: '*'` vs `withCredentials: true` → **SH-20** (TODO déjà dans `client.ts`).
    * Régénération de `src/api/schema.d.ts` si les DTOs backend évoluent (SH-14/SH-34) avant le branchement des écrans → réflexe `npm run gen:api`.

### 5. Definition of Done (DoD)
- [ ] Les 5 findings traités (ou explicitement tranchés pour le finding 3).
- [ ] Tests unitaires (Vitest) toujours verts (≥ 5/5).
- [ ] **CI verte** : audit + lint + tests + build.
- [ ] Aucun secret en dur ; aucune dépendance lourde ajoutée.
- [ ] Code review effectuée et validée.
- [ ] `frontend-web/CLAUDE.md` cohérent avec le code livré.
