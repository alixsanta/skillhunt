**Titre du Ticket :** [SH-19] Setup Web React (TS, Tailwind, routing, design system de base)
**Type :** Feature
**Priorité :** High
**Estimation :** 5 Story Points
**Compétences RNCP visées :** C2.1.2
**Lot :** Lot 1 (Web MVP)

### 0. Definition of Ready (DoR)
- [x] **Valeur Claire :** poser les fondations techniques du frontend pour débloquer les tickets écrans (SH-20 → SH-24) en parallèle du backend.
- [x] **Specs Complètes :** voir design [docs/superpowers/specs/2026-07-07-frontend-web-setup-design.md](../superpowers/specs/2026-07-07-frontend-web-setup-design.md).
- [x] **UX/UI Validé :** pas de maquette nécessaire — aucun écran métier dans ce ticket (coquille uniquement).
- [x] **Faisabilité Technique :** stack validée (Vite, React 18, TS, Tailwind, shadcn/ui, TanStack Query, Axios, Vitest, React Router). Dépendance : Swagger backend-core déjà exposé sur `/api/docs-json`.
- [x] **Estimé :** 5 SP.

### 1. User Story (Le Besoin)
**En tant que** développeur SkillHunt,
**Je veux** un projet frontend React scaffoldé avec routing, design system de base et client API typé,
**Afin de** pouvoir développer les écrans métier (auth, Armurerie, matching…) sur une base cohérente et testée, en parallèle du backend.

### 2. Contexte & Valeur Business
* **Pourquoi maintenant ?** Le backend-core est fonctionnel (Auth, Armurerie, Certifications) mais aucun frontend n'existe encore ; le développer en parallèle réduit le délai global du MVP (jalon J4 — Beta Web).
* **KPI impacté :** vélocité de développement des tickets EP05 suivants.

### 3. Critères d'Acceptation (Gherkin - BDD)

**Scénario 1 : Démarrage du projet**
* **GIVEN** le dépôt cloné et `npm ci` exécuté dans `frontend-web/`
* **WHEN** je lance `npm run dev`
* **THEN** l'application démarre sur `http://localhost:5173` sans erreur console

**Scénario 2 : Routing de base**
* **GIVEN** l'application démarrée
* **WHEN** je navigue vers une route inconnue
* **THEN** une page 404 s'affiche (pas de crash, pas de page blanche)

**Scénario 3 : Design system**
* **GIVEN** Tailwind et shadcn/ui configurés
* **WHEN** j'affiche la page d'accueil
* **THEN** un composant `Button` shadcn/ui stylé est visible, preuve que la chaîne Tailwind → shadcn fonctionne

**Scénario 4 : Client API typé**
* **GIVEN** le backend-core démarré et son Swagger exposé sur `/api/docs-json`
* **WHEN** j'exécute `npm run gen:api`
* **THEN** `src/api/schema.d.ts` est régénéré avec les types à jour des DTOs NestJS (RegisterDto, AddGearDto…)

**Scénario 5 : CI**
* **GIVEN** une pull request modifiant `frontend-web/**`
* **WHEN** la CI GitHub Actions se déclenche
* **THEN** lint, tests (Vitest) et build passent sans erreur

### 4. Spécifications Techniques (Pour les Développeurs)

* **Frontend (React + Vite) :**
    * `frontend-web/` : projet standalone, TypeScript strict.
    * Structure par feature (miroir backend-core §7 CLAUDE.md racine) : `app/`, `pages/`, `components/ui/`, `features/` (vide), `api/`, `lib/`.
    * Routing : React Router, pages `Home` (`/`) + `NotFound` (fallback `*`).
    * Design system : Tailwind CSS + shadcn/ui (composants copiés dans `components/ui/`, pas une dépendance npm noire) + Lucide pour les icônes.
    * Data fetching : TanStack Query (QueryClientProvider dans `app/`) + instance Axios unique dans `api/client.ts`, `baseURL` lue depuis `VITE_API_URL` (`.env.example` fourni).
    * Types API : `openapi-typescript` sur `${VITE_API_URL}/api/docs-json` (convention NestJS Swagger : `{path}-json`, ici `api/docs` → `api/docs-json`), script `npm run gen:api`, sortie committée dans `src/api/schema.d.ts`.
* **Tests :** Vitest + React Testing Library, au moins un test smoke sur la page `Home`.
* **CI/CD :** nouveau workflow `.github/workflows/frontend-ci.yml`, calqué sur `node-ci.yml` (`paths: frontend-web/**`, `working-directory: frontend-web`), étapes `npm ci` → `npm audit --audit-level=high` → `npm run lint` → `npm run test` → `npm run build`.
* **Sécurité :** aucune donnée sensible dans ce ticket (pas d'écran auth) ; `.env` frontend git-ignoré comme le reste du projet (cf. `.gitignore` racine).

### 5. Definition of Done (DoD)
- [ ] Code review effectuée et validée.
- [ ] Tests unitaires (Vitest) écrits et passants.
- [ ] CI verte : lint + audit sécurité + build + tests (`frontend-ci.yml`).
- [ ] `frontend-web/CLAUDE.md` créé (conventions locales, pattern `backend-core/CLAUDE.md`).
- [ ] Aucun secret en dur ; `VITE_API_URL` en variable d'environnement.
- [ ] `docs/BACKLOG.md` mis à jour (🔵 Backlog → 🟢 Terminé).
- [ ] *(Front)* Audit accessibilité — reporté à SH-27 (non bloquant pour ce ticket, aucun écran métier).
