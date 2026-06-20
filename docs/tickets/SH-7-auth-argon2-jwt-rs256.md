**Titre du Ticket :** [SH-7] Authentification réelle — Argon2id + JWT RS256 + refresh tokens
**Type :** Feature
**Priorité :** High
**Estimation :** 5 Story Points (Fibonacci)
**Compétences RNCP visées :** C2.2.3 (sécurité des accès), C2.2.2 (harnais de tests)
**Lot :** Lot 1 (Web MVP)

### 0. Definition of Ready (DoR)
- [x] **Valeur Claire :** remplace les placeholders d'auth par une implémentation réelle et sécurisée.
- [x] **Specs Complètes :** critères Gherkin ci-dessous (cas passants + erreurs).
- [x] **UX/UI Validé :** n/a (couche backend).
- [x] **Faisabilité Technique :** `@node-rs/argon2` (Argon2id pré-compilé) + `@nestjs/jwt` (RS256). Refresh tokens stockés via un `TokenStore` en mémoire, **migrable vers Redis (SH-14)**.
- [x] **Estimé :** 5 SP.

### 1. User Story
**En tant qu'** utilisateur de SkillHunt (Freelance ou Recruteur),
**Je veux** m'inscrire et me connecter de façon sécurisée,
**Afin de** protéger mon compte et obtenir un jeton d'accès fiable pour utiliser la plateforme.

### 2. Contexte & Valeur Business
* **Pourquoi maintenant ?** Débloque le **Jalon J2** (sécurité JWT). Tout endpoint protégé (Armurerie, Certifs) en dépend.
* **KPI impacté :** sécurité (risque R7 — accès non autorisés), confiance utilisateur.

### 3. Critères d'Acceptation (Gherkin - BDD)

**Scénario 1 : Inscription sécurisée**
* **GIVEN** un email non encore enregistré
* **WHEN** je m'inscris avec un mot de passe valide (≥ 8 caractères)
* **THEN** mon mot de passe est stocké **haché en Argon2id** (jamais en clair)
* **AND** la réponse **n'expose pas** le hash.

**Scénario 2 : Connexion réussie**
* **GIVEN** un compte existant
* **WHEN** je me connecte avec le bon mot de passe
* **THEN** je reçois un **accessToken (JWT RS256, exp 15 min)** et un **refreshToken (exp 7 j)**.

**Scénario 3 : Mauvais mot de passe / email inconnu**
* **WHEN** le mot de passe est faux ou l'email inconnu
* **THEN** le système renvoie **401** avec un message générique (pas de fuite d'information).

**Scénario 4 : Rafraîchissement & révocation**
* **GIVEN** un refreshToken valide
* **WHEN** j'appelle `/refresh`
* **THEN** je reçois un nouveau couple de tokens **et l'ancien refreshToken est invalidé (rotation)**.
* **GIVEN** un refreshToken révoqué (logout)
* **WHEN** je tente de l'utiliser
* **THEN** le système renvoie **401**.

**Scénario 5 : Token d'accès invalide**
* **GIVEN** un accessToken absent, mal formé ou à la signature invalide
* **WHEN** j'appelle une route protégée
* **THEN** le système renvoie **401** (la signature est **vérifiée cryptographiquement**, pas seulement décodée).

### 4. Spécifications Techniques
* **Hachage :** `@node-rs/argon2`, algorithme **Argon2id**. Vérification au login.
* **JWT :** **RS256** (clés asymétriques). Clés chargées depuis `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY` (env, PEM ou base64). En dev sans clés → paire **éphémère** générée au boot (avertissement loggé). **Jamais de clé en dur dans le code.**
* **Access token :** payload `{ userId, email, role, type:'access' }`, `exp 15m`, `issuer: skillhunt`.
* **Refresh token :** `type:'refresh'`, `jti` unique, `exp 7j`, `jti` enregistré dans `TokenStore`.
* **TokenStore :** service en mémoire (`Map`), **API Redis-ready** (`save/isValid/revoke/revokeAllForUser`) — commentaire `→ Redis (SH-14)`. `revokeAllForUser` sert le PCA (invalidation globale).
* **Endpoints :** `POST /api/v1/auth/{register,login,refresh,logout}`.
* **Guard :** `JwtAuthGuard` vérifie la signature via `JwtService.verify` et n'accepte que `type:'access'`.
* **Anti-fuite :** les réponses ne renvoient jamais `passwordHash`.

### 5. Definition of Done (DoD)
- [ ] Hachage Argon2id + vérification au login.
- [ ] JWT RS256 signés/vérifiés, refresh + rotation + révocation.
- [ ] `JwtAuthGuard` vérifie réellement la signature.
- [ ] Tests Jest async passants (inscription, login OK/KO, refresh, révocation).
- [ ] `npm run lint`, `npm run test`, `npm run build` verts.
- [ ] Swagger à jour (nouveaux endpoints) (C2.4.1).
- [ ] Aucun secret en dur ; `.env.example` documente les clés.
- [ ] Backlog mis à jour (SH-7 → 🟢).
