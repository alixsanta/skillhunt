**Titre du Ticket :** [SH-52] Photo de profil (upload S3, URL signée)
**Type :** Feature
**Priorité :** Low
**Estimation :** 5 Story Points (Fibonacci)
**Compétences RNCP visées :** C2.2.3 (validation d'entrée, accès fichier sécurisé), C2.4.1 (documentation/Swagger)
**Lot :** Lot 1 (Web MVP)

> **Hors périmètre de SH-51**, faute de temps avant la soutenance — pas faute d'intérêt. Demande
> initiale du porteur de projet, tracée ici pour ne pas être oubliée. Réutilise l'abstraction de
> stockage livrée par **SH-31** (`StorageService`, Signed URL, chiffrement au repos) : l'essentiel
> de la brique dure du ticket est déjà construit, ce qui restait à faire avant la soutenance était
> l'écran et l'endpoint — jugés d'un gain purement cosmétique au regard du budget restant.

### 0. Definition of Ready (DoR)

- [ ] **Valeur Claire :** aujourd'hui, chaque utilisateur est représenté par `InitialsAvatar`
      (initiales sur fond coloré) dans la recherche et le chat ; une vraie photo améliore
      l'identification humaine dans ces deux parcours, sans être bloquante pour aucun.
- [ ] **Specs Complètes :** critères Gherkin ci-dessous, cas passants et cas d'erreur.
- [ ] **UX/UI Validé :** pas de maquette dédiée — `InitialsAvatar` fixe déjà les dimensions et le
      point d'ancrage (avatar circulaire) ; la photo prend simplement sa place quand elle existe.
- [ ] **Faisabilité Technique :** `StorageService` (SH-31) fournit `put`/`getSignedUrl`/`delete`
      avec chiffrement AES-256 au repos ; il suffit d'un nouveau préfixe de clé et d'un endpoint.
      Aucune dépendance externe nouvelle.
- [ ] **Estimé :** 5 SP.

### 1. User Story (Le Besoin)

**En tant qu'**utilisateur (Freelance ou Recruteur),
**Je veux** déposer une photo de profil,
**Afin d'**être identifiable au premier coup d'œil dans la recherche et le chat, plutôt que
réduit à mes initiales.

### 2. Contexte & Valeur Business

* **Pourquoi maintenant ?** Ce n'est *pas* maintenant : ce ticket documente une demande écartée
  du périmètre de SH-51 faute de temps avant la soutenance. `InitialsAvatar` reste un repli
  honorable en attendant — la valeur n'est pas nulle, elle est simplement non prioritaire face
  au cœur métier (matching, Armurerie) que le jury évalue.
* **Pourquoi hors SH-51 ?** La brique dure (stockage, Signed URL, chiffrement) est déjà livrée
  par SH-31 ; ce qui restait à écrire — écran d'upload, endpoint, migration — représente un gain
  purement cosmétique au regard du budget contraint avant soutenance.
* **KPI impacté :** taux de complétion du profil ; reconnaissance visuelle dans le chat (aucun
  impact sur le score de matching, qui ne dépend ni de la photo ni de l'apparence).

### 3. Critères d'Acceptation (Gherkin - BDD)

**Scénario 1 : Upload réussi**
* **GIVEN** je suis connecté sur « Mon compte »
* **WHEN** je dépose une image JPEG ou PNG valide de moins de 5 Mo
* **THEN** le fichier est envoyé au serveur via l'URL signée obtenue en amont
* **AND** `avatarUrl` est mis à jour sur mon profil
* **AND** ma photo remplace `InitialsAvatar` partout où mon profil est affiché (recherche, chat,
  menu de compte).

**Scénario 2 : Type de fichier invalide**
* **GIVEN** je tente de déposer un fichier dont le contenu réel n'est pas une image supportée
  (ex. un exécutable renommé en `.jpg`)
* **WHEN** le serveur inspecte les **magic bytes** du fichier reçu
* **THEN** la requête est rejetée avec un message « Format d'image non supporté »
* **AND** aucun objet n'est déposé dans le stockage.

**Scénario 3 : Fichier trop volumineux**
* **GIVEN** je tente de déposer une image de plus de 5 Mo
* **THEN** le système refuse et affiche « Fichier trop volumineux (5 Mo max) »
* **AND** aucune URL signée d'upload n'est délivrée.

**Scénario 4 : Absence de photo**
* **GIVEN** un utilisateur qui n'a jamais déposé de photo
* **WHEN** son profil est affiché n'importe où dans l'application
* **THEN** `InitialsAvatar` reste affiché en repli, sans erreur ni image cassée.

**Scénario 5 : Étanchéité RBAC**
* **GIVEN** je suis connecté en tant qu'utilisateur A
* **WHEN** j'appelle `POST /api/v1/users/me/avatar`
* **THEN** seule **ma** fiche `users` est modifiée — l'identité est dérivée du token via
  `@CurrentUser()`, jamais d'un `{id}` fourni par le client (anti-usurpation, cf. CLAUDE.md §8).

### 4. Spécifications Techniques (Pour les Développeurs)

* **Backend (NestJS) :**
    * Endpoint : `POST /api/v1/users/me/avatar` — protégé par `@UseGuards(JwtAuthGuard)`,
      identité dérivée du token via `@CurrentUser()`.
    * Réutilise l'interface `StorageService` de **SH-31** (`STORAGE_SERVICE`, déjà injectable) :
      `put(key, body, contentType)` puis `getSignedUrl(key, ttlSeconds)` pour la lecture.
    * Préfixe de clé dédié : `/private/avatars/<userId>/<uuid>.<ext>`, cohérent avec
      `/private/certifications/` de SH-10.
    * DTO `class-validator` pour les métadonnées de la requête (nom de fichier, type MIME
      déclaré) — validé en complément de l'inspection serveur, jamais à sa place.
* **Sécurité & RGPD (non négociable, cf. CLAUDE.md §8) :**
    * Validation stricte du **type MIME réel** par inspection des **magic bytes** du contenu
      reçu — jamais la seule extension ni le `Content-Type` déclaré par le client.
    * Bucket **privé** ; accès en lecture **uniquement** par **Signed URL S3 à durée courte**
      (~15 min), comme pour les certifications (SH-10) et les médias (SH-17). Aucun lien
      permanent, aucune ACL publique.
    * Chiffrement au repos **AES-256**, porté nativement par `StorageService.put` (SH-31).
    * Remplacement d'une ancienne photo : purge de l'objet précédent (`delete`) pour éviter
      l'accumulation silencieuse d'objets orphelins dans le bucket.
* **Base de Données (PostgreSQL) :**
    * Colonne `avatarUrl` (nullable) sur l'entité `User` (`backend-core/src/users/user.entity.ts`)
      — migration TypeORM dédiée (`npm run migration:generate`), cohérente avec le pattern déjà
      en place pour les colonnes nullable de cette entité (ex. `twoFactorSecretEncrypted`).
    * Stocke la **clé** de l'objet (ou une URL relative stable), jamais une Signed URL en base :
      une URL signée expire, la régénérer est la responsabilité de la couche de lecture.
* **Frontend (React) :**
    * `InitialsAvatar` reste le composant de repli : il s'affiche tant que `avatarUrl` est
      absent ou en erreur de chargement — aucune régression visuelle pour les comptes sans photo.
    * Nouveau composant d'upload sur `pages/Account.tsx`, réutilisant le pattern de zone de dépôt
      + barre de progression déjà établi pour les certifications (cf. `FileUploader.tsx`).

### 5. Definition of Done (DoD)
- [ ] Code review effectuée et validée.
- [ ] Tests unitaires (Jest côté back, Vitest côté front) écrits et passants.
- [ ] **Tests RBAC d'étanchéité** : un utilisateur ne peut modifier que sa propre photo.
- [ ] **Tests de validation** : magic bytes rejetés, taille excessive rejetée, aucun appel réseau
      côté front tant que la validation cliente échoue.
- [ ] **CI verte** : lint + audit sécurité + build + tests.
- [ ] Swagger / OpenAPI mis à jour (C2.4.1).
- [ ] Aucun secret en dur ; variables sensibles en env (réutilise celles de SH-31).
- [ ] *(Front)* Audit accessibilité ≥ 90/100 — attribut `alt` explicite sur la photo, contraste
      inchangé du repli `InitialsAvatar`.
- [ ] Migration TypeORM appliquée en staging ; `docs/BACKLOG.md` mis à jour (SH-52 → 🟢).
