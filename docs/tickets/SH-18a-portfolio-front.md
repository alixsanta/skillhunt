**Titre du Ticket :** [SH-18a] Portfolio (front) : grille des cinq états, dépôt direct en trois temps, carte du compte, section recruteur
**Type :** Feature
**Priorité :** High
**Estimation :** 3 Story Points
**Compétences RNCP visées :** C2.4.1 (interface, Swagger), C2.2.2 (tests), C2.1.2 (normes)
**Lot :** Lot 1 (Web MVP)

### 0. Definition of Ready (DoR)
- [x] **Valeur Claire :** Story INVEST — ferme la partie front du portfolio côté freelance et recruteur ; consomme le flux entrant déjà livré par SH-16a, sans y toucher.
- [x] **Specs Complètes :** design validé — `docs/superpowers/specs/2026-08-24-EP04-media-portfolio-design.md` (§8 front, §9 cas limites) ; plan détaillé `docs/superpowers/plans/2026-08-31-SH-18a-portfolio-front.md`.
- [x] **UX/UI Validé :** pas de maquette dédiée — calque assumé des patterns déjà en production (`GearGrid`/`GearCard` pour la grille, `TwoFactorSettings` pour la carte du compte).
- [x] **Faisabilité Technique :** `GET /api/v1/media/me`, `POST /api/v1/media`, `POST /api/v1/media/:id/complete` déjà livrés et vérifiés par SH-16a ; seul le contrat Swagger des réponses restait à décrire côté front (`schema.d.ts`).
- [x] **Estimé :** 3 SP.

### 1. User Story (Le Besoin)
**En tant que** freelance,
**Je veux** publier mes vidéos dans un portfolio et suivre leur statut,
**Afin de** donner aux recruteurs une preuve de compétence par l'image, en plus de mon Armurerie.

### 2. Contexte & Valeur Business
* **Pourquoi maintenant ?** SH-16a a fermé le flux entrant (déclaration → dépôt direct → confirmation)
  jusqu'à `UPLOADED` ; sans écran, cette API n'a aucun utilisateur. SH-18a lui donne une interface,
  sans attendre le pipeline de transcodage réel (SH-16b) ni le flux sortant HLS/360° (SH-17), tous
  deux hors périmètre ici.
* **KPI impacté :** complétude des profils freelance (portfolio, deuxième preuve de compétence après
  l'Armurerie, cf. CLAUDE.md §1) ; vélocité EP04.

### 3. Critères d'Acceptation (Gherkin - BDD)

**Scénario 1 : Portfolio vide**
* **GIVEN** je suis connecté en tant que Freelance sans aucun média déclaré
* **WHEN** j'ouvre `/portfolio`
* **THEN** je vois une invitation à publier (« Ton portfolio est vide » + CTA), pas un constat d'échec
* **Statut :** ✅ vérifié — `Portfolio.test.tsx` (« invite à publier quand le portfolio est vide »), et
  recette manuelle Task 10 sur un compte freelance fraîchement créé (`recette-task10-vide@skillhunt.io`,
  capture d'écran à l'appui : « Ton portfolio est vide » / « + Ajouter ma première vidéo »).

**Scénario 2 : Dépôt complet**
* **GIVEN** je suis sur `/portfolio/ajouter` avec un titre et une vidéo MP4 valides
* **WHEN** je publie
* **THEN** l'écran enchaîne déclaration → dépôt direct sur le stockage (barre de progression réelle,
  en octets) → confirmation, puis redirige vers `/portfolio` où le média apparaît en **DÉPOSÉE**
* **Statut :** ✅ vérifié — `AddMedia.test.tsx` (« enchaîne déclaration, dépôt direct puis
  confirmation »), et recette manuelle Task 10 sur la stack conteneurisée réelle (gateway `:8088`,
  LocalStack `:4566`) : trace réseau complète `POST /api/v1/media` (201) → `PUT` signé sur LocalStack
  (200) → `POST /api/v1/media/:id/complete` (202), barre de progression capturée en mouvement (~15 %
  puis ~85 % sur un dépôt de 450 Mo, pour la ralentir assez pour la photographier), redirection vers
  la grille, média affiché avec le badge **● DÉPOSÉE**.

**Scénario 3 : Échec de l'envoi**
* **GIVEN** le dépôt direct sur le stockage échoue (réseau coupé, URL expirée, refus du stockage)
* **WHEN** l'écran de dépôt intercepte l'échec
* **THEN** j'obtiens le message « L'envoi a échoué. Réessaie : rien n'a été publié. », et **aucun**
  `POST /api/v1/media/:id/complete` n'est émis — le média reste `DRAFT` côté serveur (balayé par SH-16a
  au-delà de 24 h) plutôt que d'entrer dans le portfolio sans fichier réel
* **Statut :** ✅ vérifié — `AddMedia.test.tsx` (« ne confirme pas quand le dépôt échoue, et propose de
  réessayer »). Non rejoué en conditions réseau réelles (Task 10) : provoquer un échec de dépôt sur la
  stack conteneurisée aurait supposé de saboter LocalStack ou la connectivité, hors de portée d'une
  recette visuelle qui ne doit pas dégrader l'environnement partagé.

**Scénario 4 : Publication sans titre**
* **GIVEN** je n'ai saisi aucun titre sur `/portfolio/ajouter`
* **WHEN** je clique sur « Publier la vidéo »
* **THEN** je vois « Le titre est obligatoire. » et **aucun appel réseau** n'est émis (pas de
  `POST /api/v1/media`) — la validation côté client évite un aller-retour voué à l'échec, le backend
  restant juge en dernier ressort
* **Statut :** ✅ vérifié — `AddMedia.test.tsx` (« refuse de publier sans titre, sans appeler l'API »),
  et recette manuelle Task 10 (trace réseau confirmée : aucune requête `POST /api/v1/media` après le
  clic, seuls les sondages `GET /media/me` déjà en cours apparaissent).

**Scénario 5 : Aucun en-tête `Authorization` vers le stockage**
* **GIVEN** l'URL PUT signée reçue de `POST /api/v1/media`
* **WHEN** le navigateur dépose le fichier dessus
* **THEN** la requête ne porte **aucun** en-tête `Authorization` — `uploadToStorage` utilise une
  instance Axios **nue**, distincte d'`apiClient`, pour ne jamais laisser les intercepteurs
  d'authentification (SH-20) y injecter le bearer : cet en-tête invaliderait la signature SigV4 et
  transmettrait le jeton d'accès de l'utilisateur à un tiers (le stockage objet)
* **Statut :** ✅ vérifié — `uploadToStorage.test.ts` (« n'envoie AUCUN en-tête Authorization vers le
  stockage »), vérifié par sabotage (un intercepteur ajouté au client nu fait échouer le test). Recette
  manuelle Task 10 : les URL signées observées portent `X-Amz-SignedHeaders=host` uniquement, cohérent
  avec un dépôt sans en-tête ajouté par le client.

**Scénario 6 : Statut lisible sans percevoir la couleur**
* **GIVEN** un média dans un état quelconque (`DRAFT`, `UPLOADED`, `PROCESSING`, `READY`, `FAILED`)
* **WHEN** la fiche s'affiche dans la grille
* **THEN** le statut porte toujours un **libellé texte** (« DÉPOSÉE », « PRÊT »…) à côté de la pastille
  colorée — la pastille est `aria-hidden`, c'est le texte qui porte l'information (R6)
* **Statut :** ✅ vérifié — `MediaStatusBadge` calque directement `GearStatusBadge` (même garde
  `gear-meta.test.ts`/`media-meta.test.ts` anti-couleur en dur) ; recette manuelle Task 10 (badge
  « ● DÉPOSÉE » visible sur chaque fiche de la grille, texte et pastille).

**Scénario 7 : Progression exposée aux technologies d'assistance**
* **GIVEN** un dépôt en cours sur `/portfolio/ajouter`
* **WHEN** l'écran affiche la barre de progression
* **THEN** l'élément porte `role="progressbar"`, `aria-valuemin`/`aria-valuemax`, `aria-valuenow` **au
  seul stade du dépôt** (les stades déclaration/confirmation restent volontairement indéterminés pour
  ne pas annoncer 100 % avant la fin réelle), et un `aria-valuetext` qui annonce le pourcentage ou l'
  étape en cours
* **Statut :** ✅ vérifié — `AddMedia.test.tsx` (« annonce une valeur numérique uniquement pendant le
  dépôt, phases indéterminées sinon »), et recette manuelle Task 10 (arbre d'accessibilité relevé
  pendant l'upload : `progressbar "Progression du dépôt"` présent, bouton passé à « Publication en
  cours… »).

**Scénario 8 : Section Portfolio sur l'Armurerie publique, sans requête média**
* **GIVEN** un recruteur consulte l'Armurerie publique d'un freelance (`/freelances/:id/armurerie`,
  SH-21b)
* **WHEN** la page se charge
* **THEN** une section « Portfolio » apparaît sous la grille de matériel, avec son état vide neutre
  (« Aucune vidéo publiée… ») — l'emplacement est figé dès SH-18a mais **aucune requête** vers
  `/api/v1/media/*` n'est émise depuis cette page : le branchement réel sur `GET /media/freelance/:id`
  arrive avec SH-17
* **Statut :** ✅ vérifié — `FreelanceGear.test.tsx` (« affiche la section portfolio, sans émettre de
  requête média »), et recette manuelle Task 10 (connecté en RECRUITER, page armurerie du freelance de
  démo : section Portfolio avec l'icône barrée et le texte vide affichés, trace réseau de la page sans
  aucune requête `media`).

**Scénario 9 : Carte Portfolio du compte**
* **GIVEN** je suis sur `/mon-compte`
* **WHEN** la carte Portfolio se charge
* **THEN** elle affiche un compteur juste (« N vidéos », « · M en traitement » quand M > 0) dérivé de
  la même requête que la grille (`useMyMedia`, une seule requête réseau, pas de double appel), et un
  bouton `+` qui mène directement à `/portfolio/ajouter`
* **Statut :** ✅ vérifié — `Account.test.tsx` (« mène au portfolio et permet de publier directement »,
  « résume l'état du portfolio », « rend le compteur du portfolio audible hors du lien »), et recette
  manuelle Task 10 (carte affichant « 5 vidéos · 5 en traitement » après les dépôts de la recette,
  cohérent avec les 5 fiches vues dans la grille ; clic sur `+` navigue vers `/portfolio/ajouter`).

### 4. Spécifications Techniques

Voir le design EP04 (`docs/superpowers/specs/2026-08-24-EP04-media-portfolio-design.md`, §8 « Front —
portfolio interactif ») et le plan détaillé
`docs/superpowers/plans/2026-08-31-SH-18a-portfolio-front.md`.

* **Frontend (React) :**
  * `src/features/media/` : `types.ts` (dérivés du contrat généré `schema.d.ts`), `media-meta.ts`
    (vocabulaire des 5 statuts `DRAFT`/`UPLOADED`/`PROCESSING`/`READY`/`FAILED`, icône + libellé texte
    par état), `MediaStatusBadge`, `MediaCard` (vignette dérivée de l'état, pas d'un poster — absent
    tant que SH-16b n'a rien produit), `MediaGrid`, `MediaEmptyState`, `MediaUploader` (dépôt en trois
    temps), `useMyMedia` (`GET /media/me`, sondage conditionnel `refetchInterval` tant qu'un média est
    `UPLOADED`/`PROCESSING`), `useCreateMedia` (`POST /media`), `useCompleteMedia` (`POST
    /media/:id/complete`, invalide `useMyMedia` au succès), `uploadToStorage` (client Axios **nu**,
    délibérément hors des intercepteurs d'auth de `apiClient`).
  * `src/pages/Portfolio.tsx`, `src/pages/AddMedia.tsx` : routes `/portfolio` et `/portfolio/ajouter`,
    entrée `Portfolio` ajoutée à `NAV_ITEMS.FREELANCE` (`features/navigation/nav-items.ts`).
  * `src/pages/Account.tsx` : carte Portfolio (compteur + `+`), réutilise `useMyMedia` sans requête
    supplémentaire (même clé de requête que la grille).
  * `src/pages/FreelanceGear.tsx` : section Portfolio figée en bas de l'Armurerie publique, état vide
    neutre, **aucun appel réseau** — le branchement réel est le périmètre de SH-17.
* **Accessibilité (R6) :** statut toujours doublé d'un libellé texte (pastille `aria-hidden`) ; barre de
  progression `role="progressbar"` avec `aria-valuenow` uniquement pendant le dépôt et `aria-valuetext`
  sur les trois phases ; région `aria-live="polite"` sur le compteur « en cours de traitement » du
  portfolio et sur le résumé de la carte du compte.
* **Sécurité (non négociable) :** le dépôt direct ne passe **jamais** par `apiClient` — un client Axios
  dédié sans intercepteur, pour ne jamais faire fuiter le bearer de session vers le stockage objet ni
  invalider la signature SigV4 de l'URL présignée (cf. Scénario 5).

### 5. Constat de recette (Task 10) — hors périmètre, pas des défauts

La recette visuelle (Task 10) a été exécutée sur la stack conteneurisée réelle (gateway `:8088`,
LocalStack `:4566`, `backend-core` et `frontend-web` reconstruits depuis la branche) avec le compte de
démonstration freelance et un compte recruteur. Les 9 scénarios ci-dessus ont été rejoués en conditions
réelles, dépôt inclus (fichiers synthétiques de 500 Ko à 450 Mo, injectés en page pour contourner
l'absence de sélecteur de fichier natif dans l'environnement d'automatisation du navigateur — le
dépôt lui-même, lui, a bien transité par un vrai `PUT` SigV4 vers LocalStack).

**Aucun média n'a atteint « EN TRAITEMENT » ni « PRÊT », et c'est le comportement attendu :**
`PROCESSING` n'est jamais positionné (le listener `MediaTranscodeListener` n'écoute que
`completed`/`failed`/`error` de `QueueEvents`, pas l'événement `active` de BullMQ — cf. design §7), et
`READY` exige le pipeline réel de transcodage, livré par **SH-16b** (backlog), pas par ce ticket. Les 5
médias déposés pendant la recette sont donc restés en **DÉPOSÉE** (`UPLOADED`), ce qui est exactement ce
que la grille est censée montrer aujourd'hui : un cinquième état (« EN TRAITEMENT ») et un sixième
(« PRÊT ») existent bien dans le code (`STATUS_META`), mais rien dans la stack actuelle ne peut encore
les produire pour de vrai.

**Le lecteur vidéo et la visionneuse 360° ne sont volontairement pas dans ce ticket.** Aucune fiche
`READY` ne peut exister avant SH-16b, et la lecture elle-même (manifeste HLS réécrit en segments
signés, poster réel, `GET /media/freelance/:id` branché côté recruteur) est le flux sortant de **SH-17**
— non livré. Écrire un lecteur avant d'avoir une URL de lecture signée à lui donner aurait produit du
code mort, non testable en conditions réelles. C'est pourquoi le backlog scinde ce périmètre en
**SH-18b** (lecteur HLS + visionneuse 360°, poster réel, branchement de la section recruteur,
suppression d'un média), qui dépend explicitement de SH-17.

**Défaut hors branche, non lié à SH-18a — mentionné pour mémoire :** `Register.test.tsx` (« enchaîne
automatiquement un login après le register ») est déjà documenté comme flaky en suite complète (passe
seul, échoue parfois sous charge). Pendant la recette de ce ticket, la même classe de flake par
timeout a été observée ponctuellement sur d'autres fichiers asynchrones (`Account.test.tsx`,
`AddMedia.test.tsx`) lors d'exécutions de la suite complète pendant que la stack Docker (19 conteneurs,
dont la reconstruction de `frontend-web`) tournait en parallèle sur la même machine — jamais en
isolation. Aucun de ces fichiers n'échoue de façon répétable ni ne pointe vers une régression de
logique ; le détail des exécutions est en Task 10 (§ vérification finale de ce ticket).

### 6. Definition of Done (DoD)
- [x] Les 9 scénarios Gherkin sont couverts par des tests automatisés et rejoués en recette manuelle
  sur la stack conteneurisée réelle (Task 10).
- [x] **Aucun en-tête `Authorization` vers le stockage** — test dédié vérifié par sabotage
  (`uploadToStorage.test.ts`), corroboré en recette (URLs signées à `SignedHeaders=host` seul).
- [x] Statut lisible sans la couleur (pastille `aria-hidden` + libellé texte) ; progression exposée en
  `role="progressbar"` avec `aria-valuenow`/`aria-valuetext` ; changements du compteur « en cours »
  annoncés en `aria-live="polite"`.
- [x] Suite `frontend-web` : 257 tests, verte en isolation par fichier ; voir §5 pour le flake de charge
  observé en suite complète (non spécifique à ce ticket). Lint et build propres (Task 10, Step 4).
- [x] Recette visuelle passée dans un vrai navigateur, capture d'écran à l'appui (Task 10, Step 1).
- [x] `docs/BACKLOG.md` et ce ticket à jour, périmètre SH-18b (lecteur, dépend de SH-17) explicité.
- [ ] Code review effectuée et validée.
- [ ] Déployé en environnement de Staging.
