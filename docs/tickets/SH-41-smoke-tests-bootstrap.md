**Titre du Ticket :** [SH-41] Combler l'angle mort des tests : le vrai chemin de démarrage n'est jamais exécuté
**Type :** Feature (dette technique / qualité)
**Priorité :** High
**Estimation :** 3 Story Points (Fibonacci)
**Compétences RNCP visées :** C2.2.2 (harnais de tests), C2.1.2 (qualité)
**Lot :** Lot 1 (Web MVP)

> **Origine — deux bugs bloquants, une seule cause.** Pendant SH-20, **deux** défauts qui rendaient
> l'application inutilisable ont échappé à **l'intégralité** des suites de tests (73 backend + 30 frontend,
> toutes vertes). Ils partagent la même racine : **aucun test n'exécute le vrai chemin de démarrage.**

### 0. Definition of Ready (DoR)
- [x] **Valeur Claire :** deux bugs bloquants sont passés au travers ; sans ce filet, le troisième passera aussi.
- [x] **Specs Complètes :** les deux scénarios ci-dessous sont des **cas réels**, pas des hypothèses.
- [x] **UX/UI Validé :** n/a.
- [x] **Faisabilité Technique :** `@nestjs/testing` permet de booter l'application ; React Testing Library accepte un wrapper `<StrictMode>`.
- [x] **Estimé :** 3 SP.

### 1. User Story
**En tant que** développeur mainteneur de SkillHunt,
**Je veux** qu'au moins un test exécute le **vrai chemin de démarrage** de chaque application (bootstrap NestJS côté backend, double montage `StrictMode` côté front),
**Afin qu'** une CI verte **signifie réellement que l'application démarre et que la session tient** — et non simplement que les unités testées se comportent bien isolément.

### 1 bis. Les deux bugs qui motivent ce ticket

**Bug 1 — le backend ne démarrait pas** *(corrigé en `a748fa3`)*
`main.ts` faisait `import cookieParser from 'cookie-parser'`. Le projet compile en **CommonJS** avec
`allowSyntheticDefaultImports` mais **sans** `esModuleInterop` : l'import par défaut **passe la compilation
TypeScript** puis émet un accès à `.default` **inexistant à l'exécution**.
→ `TypeError: cookie_parser_1.default is not a function`, le serveur refusait de booter.
**Les 73 tests étaient verts** : aucun n'exécute `main.ts`. Trouvé en lançant réellement le serveur.

**Bug 2 — l'utilisateur était déconnecté à chaque F5** *(corrigé en `588d56d`)*
`AuthProvider` appelait `/auth/refresh` **en direct** au lieu de la promesse partagée (*single-flight*).
Sous `<StrictMode>` (donc en `npm run dev`), le double montage lançait **deux rotations du même cookie** ;
le backend révoquant l'ancien `jti`, la seconde recevait un 401 et purgeait la session.
**Les 30 tests étaient verts** : `AuthProvider.test.tsx` rendait le provider **sans `<StrictMode>`**, et le
handler MSW répondait 200 à *tous* les refresh — un backend qui rotationne n'était jamais simulé.

### 2. Contexte & Valeur Business
- **Pourquoi maintenant ?** Le coût est déjà payé deux fois. Ces deux bugs n'ont été trouvés que parce qu'on
  a lancé le serveur et relu la branche à la main — un filet automatique aurait coûté quelques minutes.
- **KPI impacté :** fiabilité de la CI (une CI verte doit *signifier* que l'application démarre), et crédibilité
  du harnais de tests devant le jury (C2.2.2).

### 3. Critères d'Acceptation (Gherkin - BDD)

**Scénario 1 : L'application backend démarre réellement**
* **GIVEN** la suite de tests backend
* **WHEN** le smoke test de bootstrap s'exécute
* **THEN** l'application NestJS est **réellement instanciée** (tous les modules, middlewares et pipes résolus)
* **AND** un appel HTTP simple aboutit
* **AND** si un middleware est mal importé (cas du bug 1), le test **échoue**.

**Scénario 2 : Le front supporte le double montage de StrictMode**
* **GIVEN** les tests d'intégration du parcours d'authentification
* **WHEN** `AuthProvider` est rendu **sous `<StrictMode>`**
* **THEN** la restauration de session n'émet **qu'un seul** appel à `/auth/refresh`
* **AND** si l'appel contourne le *single-flight* (cas du bug 2), le test **échoue**.

**Scénario 3 : Le backend qui rotationne est simulé**
* **GIVEN** un handler MSW de `/auth/refresh` qui **révoque l'ancien jeton** (2ᵉ appel du même cookie → 401),
  reproduisant le comportement réel du backend
* **WHEN** la suite de tests d'authentification s'exécute
* **THEN** les tests restent verts — et **rougissent** si une rotation concurrente réapparaît.

### 4. Spécifications Techniques

* **backend-core (Jest) :** `src/main.spec.ts` (ou `test/bootstrap.spec.ts`) — booter l'app via
  `Test.createTestingModule({ imports: [AppModule] })` **puis** `createNestApplication()` + `app.init()`,
  en appliquant **les mêmes middlewares/pipes que `main.ts`** (c'est le point clé : sans `cookieParser`,
  le bug 1 ne serait pas détecté). Idéalement, **extraire la configuration de `bootstrap()` dans une fonction
  réutilisable** (`configureApp(app)`) appelée par `main.ts` **et** par le test — sinon le test et la production
  divergeront de nouveau.
  ⚠️ Le boot exige Postgres et Redis : soit on mocke les modules d'infrastructure, soit on marque le test comme
  test d'intégration (comme `token-store.integration.spec.ts`, déjà `skipped` sans conteneur).
* **frontend-web (Vitest + RTL) :** rendre les tests d'intégration d'auth sous `<StrictMode>` (au minimum
  `AuthProvider.test.tsx`, déjà fait en SH-20 — **généraliser**), et ajouter un handler MSW qui **simule la
  rotation** (révocation de l'ancien refresh token).
* **CI :** ces tests entrent dans les suites existantes ; aucun nouveau job.

### 5. Definition of Done (DoD)
- [ ] Smoke test de bootstrap backend : l'app s'instancie avec **la même configuration que `main.ts`**.
- [ ] Le test **échoue** si l'on rétablit l'import fautif de `cookie-parser` (vérifié par mutation).
- [ ] Tests d'intégration front d'auth rendus sous `<StrictMode>`.
- [ ] Handler MSW simulant un backend qui **rotationne** (2ᵉ usage du même refresh → 401).
- [ ] Le test **échoue** si l'on rétablit l'appel direct à `/auth/refresh` (vérifié par mutation).
- [ ] CI verte (2 services) ; aucun test rendu instable (*flaky*).
- [ ] `docs/BACKLOG.md` mis à jour.
