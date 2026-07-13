**Titre du Ticket :** [SH-40] Authentification à deux facteurs (2FA TOTP) pour les comptes pro
**Type :** Feature
**Priorité :** Medium
**Estimation :** 5 Story Points (Fibonacci)
**Compétences RNCP visées :** C2.2.3 (secret TOTP chiffré AES-256, anti-brute-force, validation stricte), C2.2.2 (tests unitaires/intégration de l'enrôlement et de la vérification)
**Lot :** Lot 1 (Web MVP)

> **Origine du ticket.** Annoncée dans l'intitulé de `SH-20`, la 2FA n'avait **aucune brique backend**
> (pas de champ dédié sur `User`, pas de secret TOTP, pas d'endpoint d'enrôlement ni de vérification) :
> elle a été **sortie du périmètre de SH-20** pour ne pas bloquer le parcours d'auth de base, et tracée ici.
> Prérequis livrés : Auth Argon2id + JWT RS256 (SH-7/SH-14), cookie `httpOnly` de refresh (SH-20).

### 0. Definition of Ready (DoR)
- [ ] **Valeur Claire :** un compte `RECRUITER` (ou `ADMIN`) peut activer un second facteur pour réduire le risque de prise de contrôle de compte (accès aux données candidats).
- [ ] **Specs Complètes :** Gherkin ci-dessous couvre enrôlement, vérification au login, codes de secours et cas d'erreur.
- [ ] **UX/UI Validé :** écran d'enrôlement (QR code + saisie manuelle du secret) et écran de saisie du code à la connexion — maquettes à valider.
- [ ] **Faisabilité Technique :** librairie TOTP (RFC 6238) à choisir côté NestJS (ex. `otplib`), stockage du secret chiffré AES-256 (cf. CLAUDE.md §8) — mécanisme de chiffrement/déchiffrement à trancher (clé via variable d'env / Vault, pas de secret en dur).
- [ ] **Estimé :** 5 SP.

### 1. User Story
**En tant que** recruteur (compte pro),
**Je veux** activer une authentification à deux facteurs (application TOTP type Google Authenticator/Authy),
**Afin de** protéger mon compte contre un vol d'identifiants, mon compte donnant accès à des données candidats sensibles.

### 2. Contexte & Valeur Business
- **Pourquoi maintenant ?** Le parcours d'auth de base (SH-20) est terminé et stable (access token en mémoire, refresh en cookie `httpOnly`) : la 2FA est la couche de sécurité additionnelle logique pour les comptes à privilèges (`RECRUITER`, `ADMIN`).
- **KPI impacté :** taux d'adoption de la 2FA sur les comptes pro, réduction du risque de prise de contrôle de compte (0 incident visé).

### 3. Critères d'Acceptation (Gherkin - BDD)

**Scénario 1 : Enrôlement**
* **GIVEN** un utilisateur `RECRUITER` authentifié, 2FA non activée
* **WHEN** il démarre l'enrôlement depuis « Mon compte »
* **THEN** le backend génère un secret TOTP, le **chiffre (AES-256)** avant persistance, et renvoie un QR code (URI `otpauth://`) à scanner
* **AND** la 2FA n'est **pas encore active** tant que le premier code n'a pas été vérifié.

**Scénario 2 : Confirmation de l'enrôlement**
* **GIVEN** un secret TOTP généré mais non confirmé
* **WHEN** l'utilisateur saisit le code à 6 chiffres généré par son application
* **THEN** le code est vérifié côté serveur, la 2FA passe à **activée**
* **AND** une liste de **codes de secours** à usage unique est générée, affichée **une seule fois**, et stockée **hachée** (jamais en clair).

**Scénario 3 : Connexion avec 2FA activée**
* **GIVEN** un utilisateur avec la 2FA activée, identifiants (email/mot de passe) valides
* **WHEN** il se connecte
* **THEN** le backend renvoie un état intermédiaire (« code 2FA requis »), **sans** émettre l'access token ni le cookie de refresh
* **AND** un second appel avec un code TOTP valide complète la connexion normalement (access token + cookie `sh_refresh`).

**Scénario 4 : Code invalide**
* **GIVEN** un code TOTP erroné ou expiré (fenêtre de validité dépassée)
* **THEN** la connexion est rejetée (401), message générique en français, **sans révéler** si le compte a la 2FA activée ou non pour les identifiants non encore validés (anti-énumération).

**Scénario 5 : Anti-brute-force**
* **GIVEN** plusieurs tentatives de code TOTP échouées consécutives sur un même compte
* **THEN** un **rate-limiting/backoff** bloque temporairement les tentatives suivantes (le TOTP n'a que 10^6 combinaisons sur une fenêtre de 30 s : la protection anti-brute-force est non négociable).

**Scénario 6 : Codes de secours**
* **GIVEN** un utilisateur ayant perdu l'accès à son application d'authentification
* **WHEN** il saisit un **code de secours** valide et non encore utilisé à la place du code TOTP
* **THEN** la connexion aboutit, **et ce code de secours est immédiatement invalidé** (usage unique).

**Scénario 7 : Désactivation**
* **GIVEN** un utilisateur avec la 2FA activée
* **WHEN** il la désactive (après re-saisie du mot de passe, ou d'un code TOTP valide)
* **THEN** le secret chiffré et les codes de secours sont supprimés côté serveur.

**Scénario 8 : RBAC/périmètre**
* **GIVEN** un utilisateur `FREELANCE`
* **THEN** la 2FA reste **disponible mais non imposée** (le ticket cible en priorité les comptes pro `RECRUITER`/`ADMIN` — voir §5 pour la décision d'obligation ou non).

### 4. Spécifications Techniques

* **backend-core (NestJS) :**
    * Nouvelles colonnes sur `User` (`users/user.entity.ts`) : `twoFactorSecretEncrypted` (nullable), `twoFactorEnabled` (bool, défaut `false`), `twoFactorBackupCodesHashed` (tableau de hachages, nullable) — migration TypeORM dédiée.
    * Génération/vérification TOTP (RFC 6238) via une librairie éprouvée (ex. `otplib`) — ne pas réimplémenter l'algorithme.
    * **Chiffrement AES-256 au repos** du secret TOTP : clé de chiffrement applicative via variable d'env (jamais en dur, cf. CLAUDE.md §8), à distinguer des clés RSA JWT existantes (`keys.ts`).
    * Codes de secours : générés côté serveur, affichés une seule fois en clair au client, **stockés hachés** (Argon2id, cohérent avec le hachage des mots de passe SH-7).
    * Nouveaux endpoints `api/v1/auth/2fa` : `POST /enroll` (génère secret + QR), `POST /confirm` (active + renvoie les codes de secours), `POST /verify` (étape 2 du login), `POST /disable`, `POST /backup-codes/regenerate`. Tous protégés par `JwtAuthGuard` sauf `/verify` qui utilise un jeton temporaire d'étape intermédiaire (pas un access token complet) émis par `login` quand la 2FA est active.
    * `AuthService.login` : si `twoFactorEnabled`, ne renvoie **ni access token ni cookie refresh** à la première étape — renvoie un jeton d'étape courte durée (ex. 5 min) identifiant la session en attente de 2FA.
    * Rate-limiting sur `/verify` (compteur par compte, backoff exponentiel ou verrouillage temporaire) — anti-brute-force TOTP.
    * DTO `class-validator` pour chaque endpoint (code à 6 chiffres, format strict) ; messages d'erreur en français ; Swagger complet (`@ApiTags`, `@ApiOperation`, `@ApiResponse`).
* **frontend-web (React) :**
    * `src/features/auth/` : écran d'enrôlement (affichage QR code + secret en texte, saisie de confirmation), écran de saisie du code à la connexion (nouvel état du flow `login`), écran de gestion (désactivation, régénération des codes de secours) dans « Mon compte ».
    * Le state du login doit gérer l'étape intermédiaire « 2FA requise » sans toucher au `session-store.ts` (l'access token n'existe qu'après la vérification réussie).
    * Codes de secours affichés une seule fois avec incitation claire à les sauvegarder (pas de re-consultation possible ensuite).

### 5. Décisions à trancher (avant de passer 🟡 Prêt)
1. **La 2FA est-elle obligatoire pour `RECRUITER`/`ADMIN` ou seulement proposée ?** Impacte l'onboarding et les tests RBAC.
2. **Librairie TOTP retenue** côté NestJS et **mécanisme de gestion de la clé de chiffrement** AES-256 (variable d'env simple vs Vault/KMS, cf. `SH-4` hardening).
3. **Durée de vie et format du jeton d'étape intermédiaire** (entre `login` et `verify`) — JWT dédié à portée réduite, ou entrée Redis à courte TTL (cohérent avec `token-store.service.ts`).

### 6. Hors scope
- 2FA par SMS (dépendance à un fournisseur tiers non retenue actuellement) ; seul le TOTP applicatif est couvert.
- 2FA sur mobile (React Native, Lot 2).
- Politique d'obligation par organisation/équipe (gestion multi-comptes recruteur) — hors périmètre MVP.

### 7. Definition of Done (DoD)
- [ ] Migration `users` (colonnes 2FA) + secret chiffré AES-256 (jamais en clair en base).
- [ ] Endpoints d'enrôlement/confirmation/vérification/désactivation + régénération des codes de secours, tous documentés Swagger.
- [ ] Codes de secours : générés serveur, affichés une seule fois, stockés hachés, usage unique vérifié par test.
- [ ] Rate-limiting/anti-brute-force sur `/verify` testé.
- [ ] Tests backend : enrôlement, confirmation, login avec 2FA (succès/échec), codes de secours, désactivation, RBAC (un utilisateur ne peut pas gérer la 2FA d'un autre compte).
- [ ] Tests front : flow d'enrôlement, étape « 2FA requise » au login, gestion dans « Mon compte », aucun secret/QR ne fuit dans les logs ou le state persistant.
- [ ] CI verte (lint + audit sécurité + tests + build).
- [ ] Aucun secret en dur ; clé de chiffrement AES-256 via variable d'env ; messages en français.
- [ ] `docs/BACKLOG.md` mis à jour.
