**Titre du Ticket :** [SH-20] Parcours d'authentification Web (register/login, session, refresh automatique, CORS)
**Type :** Feature
**Priorité :** High
**Estimation :** 5 Story Points (Fibonacci)
**Compétences RNCP visées :** C2.2.3 (stockage du token, CORS, anti-CSRF, validation), C2.2.2 (tests intercepteur + routes protégées), C2.1.2 (lint/format CI)
**Lot :** Lot 1 (Web MVP)

> **Design validé :** `docs/superpowers/specs/2026-07-13-SH-20-parcours-auth-web-design.md` — **fait foi** pour les décisions techniques.
> **Bloquant pour SH-21a** (Armurerie, vue privée) : `GET /gear/me` exige un JWT que le front ne sait pas encore obtenir.
> **Backend d'auth déjà livré** (SH-7/SH-14) : Argon2id, JWT RS256, refresh tokens avec rotation, révocation Redis par `jti`.

### 0. Definition of Ready (DoR)
- [x] **Valeur Claire :** sans auth, aucune feature métier du front n'est atteignable — c'est la porte d'entrée du Lot 1.
- [x] **Specs Complètes :** Gherkin ci-dessous + spec de design.
- [x] **UX/UI Validé :** écrans standards (login/register) ; composants shadcn/ui.
- [x] **Faisabilité Technique :** endpoints d'auth existants ; emplacement des intercepteurs déjà réservé dans `src/api/client.ts` (SH-19).
- [x] **Estimé :** 5 SP.

### 1. User Story
**En tant que** visiteur (freelance ou recruteur),
**Je veux** créer un compte et me connecter, et **rester connecté** d'une page à l'autre,
**Afin d'** accéder aux fonctionnalités qui me sont réservées (Armurerie, matching, chat).

### 2. Contexte & Valeur Business
- **Pourquoi maintenant ?** Prérequis dur de toute la suite du front (SH-21, SH-22, SH-24). Résorbe aussi le **TODO CORS** laissé en SH-19.
- **KPI impacté :** taux de conversion visiteur → compte créé ; sans session persistante, aucune démo de bout en bout n'est possible.

### 3. Critères d'Acceptation (Gherkin - BDD)

**Scénario 1 : Inscription**
* **GIVEN** un visiteur sur `/register`
* **WHEN** il saisit un email, un nom d'utilisateur, un mot de passe (≥ 8 caractères) et choisit un rôle (`FREELANCE` ou `RECRUITER`)
* **THEN** le compte est créé
* **AND** le front **enchaîne automatiquement la connexion** → l'utilisateur arrive **connecté** (`register` ne renvoie pas de token).

**Scénario 2 : Connexion**
* **GIVEN** un utilisateur existant sur `/login`
* **WHEN** il saisit des identifiants valides
* **THEN** l'access token est conservé **en mémoire** et le refresh token dans un **cookie `httpOnly`**
* **AND** il est redirigé vers la route qu'il demandait (ou l'accueil).

**Scénario 3 : Identifiants invalides**
* **GIVEN** un mot de passe erroné
* **THEN** un message d'erreur **en français** est affiché, sans révéler si l'email existe (pas d'énumération de comptes).

**Scénario 4 : Session survivant au rechargement**
* **GIVEN** un utilisateur connecté
* **WHEN** il recharge la page (F5) — l'access token en mémoire est **perdu**
* **THEN** l'app tente un `/auth/refresh` **silencieux** (le cookie a survécu), affiche un état de chargement, puis restaure la session
* **AND** elle **ne le renvoie pas** vers `/login` entre-temps.

**Scénario 5 : Expiration de l'access token (refresh automatique)**
* **GIVEN** un access token expiré (15 min)
* **WHEN** une requête API renvoie **401**
* **THEN** l'intercepteur rafraîchit le token et **rejoue** la requête initiale, de façon transparente pour l'utilisateur.

**Scénario 6 : Requêtes concurrentes — une seule rotation**
* **GIVEN** plusieurs requêtes en vol qui prennent toutes un **401**
* **THEN** **un seul** appel à `/auth/refresh` est émis (*single-flight*), les autres attendent puis sont rejouées
* *(Sans cela, N rotations parallèles se révoqueraient mutuellement et déconnecteraient l'utilisateur — piège n°1 de ce ticket.)*

**Scénario 7 : Refresh expiré ou révoqué**
* **GIVEN** un refresh token invalide (7 jours écoulés, ou logout ailleurs)
* **THEN** la session est purgée et l'utilisateur est redirigé vers `/login`.

**Scénario 8 : Route protégée**
* **GIVEN** un visiteur **non authentifié**
* **WHEN** il ouvre une route protégée
* **THEN** il est redirigé vers `/login`, et **revient sur la route demandée** après connexion.

**Scénario 9 : Déconnexion**
* **GIVEN** un utilisateur connecté
* **WHEN** il se déconnecte
* **THEN** `/auth/logout` révoque le `jti` **en Redis**, le cookie est expiré, la session est vidée
* **AND** rejouer l'ancien refresh token échoue (**401**).

### 4. Spécifications Techniques
*(Détail complet dans la spec de design — résumé ici.)*

* **backend-core :**
    * **CORS** : origine **explicite** via `CORS_ORIGIN` (défaut `http://localhost:5173`), `credentials: true`. ⚠️ Supprimer `origin: '*'` — `'*'` + `credentials` est **rejeté par le navigateur** sur requête créditée (le front pose déjà `withCredentials`).
    * **Cookie `sh_refresh`** posé par `login`/`refresh` : `httpOnly`, `secure` (prod), `sameSite=Lax`, `path=/api/v1/auth`, `maxAge` 7 j.
    * `refresh`/`logout` lisent le token **cookie en priorité, sinon body** (le body reste pour le **mobile Lot 2**) ; `RefreshDto.refreshToken` devient optionnel ; **ni l'un ni l'autre → 401**.
    * Rotation et révocation Redis **inchangées** : on change le *transport*, pas la gestion.
* **frontend-web :**
    * `src/features/auth/` : contexte de session (`useReducer`, **pas de nouvelle lib d'état**), pages `/login` et `/register`, `ProtectedRoute`.
    * **Aucune écriture dans `localStorage`/`sessionStorage`.**
    * Intercepteurs sur `apiClient` : injection du bearer ; sur 401 → refresh *single-flight* + rejeu (une seule fois) ; `/auth/refresh` exclu de l'intercepteur (pas de boucle).
    * Identité (`userId`, `email`, `role`) obtenue en **décodant le payload de l'access token** — ⚠️ **affichage/routage uniquement**, l'autorité reste la vérification de signature serveur.
    * Nouvelle dépendance **dev** : `msw` (simulation réseau, indispensable pour tester l'intercepteur ; resservira en SH-21/SH-22).

### 5. Hors scope
- **2FA comptes pro** — annoncée au backlog mais **aucune brique backend** n'existe (TOTP, secret chiffré, enrôlement) → **ticket dédié à créer**.
- Mot de passe oublié (aucun service d'envoi d'email dans le projet à ce stade).
- Onboarding de la position freelance (**SH-34**).

### 6. Definition of Done (DoD)
- [ ] CORS à origine explicite ; `origin: '*'` supprimé ; `CORS_ORIGIN` dans `.env.example`.
- [ ] Cookie `httpOnly` posé/expiré ; `refresh` et `logout` fonctionnent **via le cookie seul** ET **via le body seul** (mobile).
- [ ] Tests backend : attributs du cookie, rotation (rejeu de l'ancien → 401), logout (Redis + cookie), ni cookie ni body → 401.
- [ ] Tests front : formulaires, `ProtectedRoute`, restauration de session, **401 → refresh → rejeu**, **concurrence → un seul refresh**, échec de refresh → déconnexion.
- [ ] Aucun token en `localStorage` (vérifié par un test).
- [ ] Accessibilité : erreurs de formulaire liées aux champs (`aria-describedby`), navigables au clavier.
- [ ] CI verte (backend + frontend : lint, `format:check`, audit, tests, build).
- [ ] Swagger à jour (cookie documenté) ; messages en français ; aucun secret en dur.
- [ ] `docs/BACKLOG.md` mis à jour + ticket 2FA créé.
