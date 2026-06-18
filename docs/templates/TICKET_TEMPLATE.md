<!--
Format de ticket SkillHunt. Copier ce fichier pour chaque feature
(ex. docs/tickets/SH-42-upload-certification.md) ou coller dans une issue GitHub.
Un ticket = une feature. Donner CE fichier à l'assistant quand on implémente la feature.
-->

**Titre du Ticket :** [SH-XX] Titre court et explicite (ex : [SH-42] Upload de certification Drone)
**Type :** User Story / Feature / Bug
**Priorité :** High / Medium / Low
**Estimation :** [X] Story Points (Fibonacci)  <!-- garder UNE seule unité dans tout le backlog -->
**Compétences RNCP visées :** [ex : C2.2.3, C2.4.1]  <!-- traçabilité jury -->
**Lot :** Lot 1 (Web MVP) / Lot 2 (React Native)

### 0. Definition of Ready (DoR)
*Checklist obligatoire pour intégrer ce ticket dans un Sprint :*
- [ ] **Valeur Claire :** La User Story respecte le format INVEST (Independent, Negotiable, Valuable, Estimable, Small, Testable).
- [ ] **Specs Complètes :** Les critères d'acceptation (Gherkin) couvrent les cas passants ET les cas d'erreur.
- [ ] **UX/UI Validé :** Maquettes / wireframes liés (si applicable).
- [ ] **Faisabilité Technique :** Architecture validée, dépendances (API tierces, libs) identifiées.
- [ ] **Estimé :** Complexité évaluée.

### 1. User Story (Le Besoin)
**En tant que** [Rôle : ex. Freelance Drone],
**Je veux** [Action : ex. uploader mon certificat de télépilote au format PDF],
**Afin de** [Valeur : ex. prouver ma légitimité et obtenir le badge « Vérifié »].

### 2. Contexte & Valeur Business
* **Pourquoi maintenant ?** [ex. Bloquant pour la recherche sécurisée].
* **KPI impacté :** [ex. Taux de complétion des profils].

### 3. Critères d'Acceptation (Gherkin - BDD)
*Ces tests doivent passer pour validation PO.*

**Scénario 1 : Upload réussi**
* **GIVEN** je suis connecté en tant que Freelance sur « Mon Profil »
* **WHEN** je dépose un PDF valide de moins de 5 Mo dans la zone d'upload
* **THEN** le fichier est envoyé au serveur
* **AND** je vois une barre de progression puis « Document en cours de vérification »

**Scénario 2 : Format / taille invalide**
* **GIVEN** je tente d'uploader un `.exe` ou un fichier > 5 Mo
* **THEN** le système rejette le fichier et affiche « Format non supporté ».

### 4. Spécifications Techniques (Pour les Développeurs)

* **Backend (NestJS) :**
    * Endpoint : `POST /api/v1/certifications`  ⚠️ **identité dérivée du token JWT via `@CurrentUser()`**, jamais d'`{id}` client (anti-usurpation, cf. CLAUDE.md §8).
    * Protection : `@UseGuards(JwtAuthGuard)` + `RolesGuard([UserRole.FREELANCE])`.
    * DTO `class-validator` pour les métadonnées ; `ValidationPipe` global déjà actif.
* **Sécurité & RGPD (non négociable) :**
    * Validation stricte du **Mime-Type réel** (magic bytes), pas seulement l'extension.
    * Accès fichier **uniquement par Signed URL S3** (~15 min), bucket **privé**, aucun lien permanent.
    * **Extraction des métadonnées de validité puis purge des PII** du PDF d'origine (minimisation RGPD).
    * Données sensibles **chiffrées AES-256 au repos**.
* **Base de Données (PostgreSQL) :**
    * Table `user_certifications` : `file_url`, `status` (ENUM `PENDING|VALIDATED|REJECTED`), `uploaded_at`.
* **Stockage :** Bucket S3, préfixe `/private/certifications/`.
* **Frontend (React) :** réutiliser le composant générique `FileUploader.tsx`.

### 5. Definition of Done (DoD)
- [ ] Code review effectuée et validée.
- [ ] Tests unitaires (Jest / PyTest) écrits et passants.
- [ ] **Tests RBAC d'étanchéité** (un autre rôle ne peut pas accéder à la ressource).
- [ ] **CI verte** : lint + audit sécurité + build + tests.
- [ ] Swagger / OpenAPI mis à jour (C2.4.1).
- [ ] Aucun secret en dur ; variables sensibles en env.
- [ ] *(Front)* Audit accessibilité ≥ 90/100 (Lighthouse/Axe, risque R6).
- [ ] Déployé en environnement de Staging.
