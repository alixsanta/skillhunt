**Titre du Ticket :** [SH-53] Vérification du compte par email
**Type :** Feature
**Priorité :** Low
**Estimation :** 8 Story Points (Fibonacci)
**Compétences RNCP visées :** C2.2.3 (sécurité des entrées, anti-abus), C2.4.1 (documentation/Swagger)
**Lot :** Lot 1 (Web MVP)

> **Hors périmètre de SH-51**, faute de temps avant la soutenance — pas faute d'intérêt. Demande
> initiale du porteur de projet, tracée ici pour ne pas être oubliée. Contrairement à SH-52, ce
> ticket introduit une **dépendance externe nouvelle** (service d'envoi d'email) : c'est le
> facteur qui pèse le plus dans la décision de l'écarter avant une démonstration en direct — voir
> §2 « Risque à consigner ».

### 0. Definition of Ready (DoR)

- [ ] **Valeur Claire :** aujourd'hui, `POST /api/v1/auth/register` crée un compte utilisable
      immédiatement sur simple déclaration d'un email, sans preuve qu'il est joignable. Un compte
      recruteur ou freelance injoignable dégrade la confiance de l'autre partie au moment du
      matching.
- [ ] **Specs Complètes :** critères Gherkin ci-dessous, cas passants et cas d'erreur — **y compris
      la panne du service d'email**, qui n'est pas un cas marginal ici (voir §2).
- [ ] **UX/UI Validé :** pas de maquette dédiée — écran d'attente « Vérifiez votre boîte mail » et
      bandeau de rappel calqués sur les patterns d'état existants (ex. badge `PENDING` de
      l'Armurerie, SH-43).
- [ ] **Faisabilité Technique :** **NON levée** — dépend du choix et du provisionnement d'un
      service d'envoi d'email (SES ou SMTP) et de ses secrets, hors du contrôle du code applicatif.
      C'est la principale raison pour laquelle ce ticket reste au Backlog plutôt qu'en Prêt.
- [ ] **Estimé :** 8 SP.

### 1. User Story (Le Besoin)

**En tant que** plateforme,
**Je veux** vérifier l'adresse email de chaque nouvel utilisateur à l'inscription,
**Afin de** garantir que tout compte actif correspond à une adresse joignable, condition de
confiance minimale entre un recruteur et un freelance mis en relation par le matching.

### 2. Contexte & Valeur Business

* **Pourquoi maintenant ?** Ce n'est *pas* maintenant : ce ticket documente une demande écartée
  du périmètre de SH-51 faute de temps avant la soutenance.
* **Pourquoi hors SH-51 ?** Contrairement à SH-52 (qui ne fait que consommer une brique déjà
  livrée par SH-31), ce ticket **introduit** une dépendance externe qui n'existe nulle part
  ailleurs dans le projet à ce jour : un service d'envoi d'email. La provisionner, la sécuriser
  et la tester correctement dépasse le budget restant avant la soutenance.
* **Risque à consigner :** un service d'envoi d'email externe (SES ou SMTP) est un point de
  défaillance supplémentaire, **hors du contrôle du code applicatif**, susceptible d'échouer
  pendant une démonstration en direct (quota, latence, filtrage anti-spam, connectivité). Deux
  décisions produit restent ouvertes et **doivent être tranchées avant le développement** :
    1. **Un compte non vérifié reste-t-il utilisable en lecture seule** (parcourir, être vu dans
       la recherche) le temps que l'email arrive, ou **est-il bloqué** jusqu'à vérification ?
    2. Si le service d'email est indisponible en démonstration, quel est le filet de secours
       (ex. lien de vérification affiché directement à l'écran en environnement de démo) ?
  Ce ticket ne préjuge pas de la réponse : il l'inscrit comme prérequis de la DoR, à traiter en
  amont du sprint qui le prendra.
* **KPI impacté :** taux de comptes joignables ; réduction des comptes fantômes qui polluent le
  matching sans jamais répondre à une mise en relation.

### 3. Critères d'Acceptation (Gherkin - BDD)

**Scénario 1 : Envoi du jeton à l'inscription**
* **GIVEN** je m'inscris via `POST /api/v1/auth/register` avec un email valide
* **WHEN** mon compte est créé
* **THEN** `emailVerifiedAt` est `null` sur ma fiche `users`
* **AND** un jeton de vérification à usage unique et à durée limitée m'est envoyé par email,
  jamais retourné en clair dans la réponse HTTP de l'API.

**Scénario 2 : Vérification réussie**
* **GIVEN** j'ai reçu mon lien de vérification
* **WHEN** j'appelle `GET /api/v1/auth/verify-email?token=...` avant son expiration
* **THEN** `emailVerifiedAt` est renseigné à la date courante
* **AND** le jeton est invalidé — un second appel avec le même jeton échoue.

**Scénario 3 : Jeton expiré ou déjà utilisé**
* **GIVEN** un jeton expiré, ou déjà consommé par le scénario 2
* **WHEN** j'appelle `GET /api/v1/auth/verify-email` avec ce jeton
* **THEN** la requête est rejetée (400) avec un message « Lien de vérification invalide ou
  expiré », sans indiquer si c'est l'expiration ou la réutilisation qui est en cause (anti-énumération).

**Scénario 4 : Abus par renvoi répété**
* **GIVEN** je viens de demander un renvoi du jeton de vérification
* **WHEN** je redemande un renvoi dans un intervalle rapproché (fenêtre de limitation à définir,
  ex. 1 renvoi / minute)
* **THEN** la requête est rejetée (429) plutôt que d'émettre un nouvel email — protection
  anti-abus du service d'envoi, qui a un coût et une réputation à préserver.

**Scénario 5 : Panne du service d'email**
* **GIVEN** le service d'envoi d'email externe est indisponible ou en erreur
* **WHEN** un utilisateur s'inscrit
* **THEN** la création du compte **n'échoue pas** à cause de cette panne — l'envoi de l'email est
  découplé de la transaction d'inscription (au minimum réessayé en tâche différée, jamais
  bloquant sur la réponse HTTP)
* **AND** l'incident est journalisé pour supervision (cf. SH-29), sans exposer de détail
  technique à l'utilisateur.

**Scénario 6 : Compte non vérifié — comportement à trancher (DoR)**
* **GIVEN** un compte dont `emailVerifiedAt` est `null`
* **WHEN** son titulaire tente d'utiliser la plateforme
* **THEN** le comportement suit la décision actée en DoR (§2) — soit un accès en lecture seule
  avec bandeau de rappel, soit un blocage explicite invitant à vérifier l'email — **et non un
  choix arbitraire pris au fil de l'implémentation**.

### 4. Spécifications Techniques (Pour les Développeurs)

* **Backend (NestJS) :**
    * Endpoint : `GET /api/v1/auth/verify-email` — public (non authentifié : l'utilisateur n'a
      pas nécessairement de session active au moment de cliquer le lien reçu par email), DTO
      `class-validator` sur le paramètre `token`.
    * Endpoint de renvoi (`POST /api/v1/auth/verify-email/resend`) — protégé par un
      **rate-limit** dédié (anti-abus), au même titre que les autres endpoints sensibles.
* **Sécurité (non négociable, cf. CLAUDE.md §8) :**
    * Le jeton de vérification est **haché en base** (Argon2id, cohérent avec le hachage des
      mots de passe de SH-7 et des codes de secours 2FA de SH-40) — jamais stocké ni journalisé
      en clair. Seul le jeton en clair transite par email, jamais par l'API.
    * Jeton à **usage unique** (invalidé après consommation) et à **durée limitée** (TTL court,
      ex. 24 h, à définir en DoR).
    * Réponse **anti-énumération** : un jeton invalide, expiré ou déjà utilisé produit le même
      message générique, sans distinguer les cas (évite de révéler l'existence d'un compte ou
      l'état d'un jeton à un tiers).
    * Aucun secret en dur : identifiants et clés du service d'email (SES ou SMTP) exclusivement
      en variables d'environnement, jamais commités (`.env.example` documente les clés sans
      valeur, comme pour SH-31).
* **Base de Données (PostgreSQL) :**
    * Colonne `emailVerifiedAt` (nullable, `timestamptz`) sur l'entité `User`
      (`backend-core/src/users/user.entity.ts`) — migration TypeORM dédiée.
    * Jeton de vérification : nouvelle table (ou Redis avec TTL natif, cohérent avec le pattern
      déjà retenu pour les refresh tokens de SH-14) — à trancher en conception détaillée selon
      qu'on veut ou non un historique persistant des jetons émis.
* **Dépendance externe nouvelle :**
    * Un service d'envoi d'email (AWS **SES**, ou **SMTP** générique) : à provisionner, avec
      ses secrets en variables d'environnement. C'est une brique **absente du projet à ce jour**
      — aucun autre ticket ne l'introduit — d'où l'estimation à 8 SP plutôt que 5, et le
      classement en risque (§2).
    * L'envoi doit être **asynchrone et non bloquant** vis-à-vis de la transaction d'inscription
      (scénario 5) : envisager un découplage par événement (bus Redis, cohérent avec l'archi
      hybride du projet, cf. CLAUDE.md §2), plutôt qu'un appel synchrone dans
      `auth.service.ts`.
* **Frontend (React) :** écran d'attente post-inscription et bandeau de rappel pour les comptes
  non vérifiés, dont le comportement exact (bloquant ou non) dépend de la décision actée en DoR.

### 5. Definition of Done (DoD)
- [ ] **Préalable :** décision produit actée sur le comportement des comptes non vérifiés
      (lecture seule vs blocage) et sur le filet de secours en environnement de démonstration.
- [ ] Code review effectuée et validée.
- [ ] Tests unitaires (Jest) écrits et passants, y compris la panne simulée du service d'email
      (scénario 5) et le renvoi limité en fréquence (scénario 4).
- [ ] **Tests RBAC / anti-abus d'étanchéité** : un jeton d'un autre utilisateur ne vérifie jamais
      un compte qui n'est pas le sien ; le rate-limit de renvoi est effectif.
- [ ] **CI verte** : lint + audit sécurité + build + tests.
- [ ] Swagger / OpenAPI mis à jour (C2.4.1), y compris la documentation de la dépendance externe.
- [ ] Aucun secret en dur ; secrets du service d'email exclusivement en variables d'environnement.
- [ ] Jeton de vérification haché en base, jamais journalisé en clair.
- [ ] Déployé en environnement de Staging, avec un service d'email réellement configuré (pas
      seulement mocké) pour valider le scénario 5 en conditions proches du réel.
- [ ] `docs/BACKLOG.md` mis à jour (SH-53 → 🟢).
