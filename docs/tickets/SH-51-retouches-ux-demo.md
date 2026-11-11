**Titre du Ticket :** [SH-51] Retouches UX avant la soutenance (rôles, identité, inscription, recherche, catalogue matériel)
**Type :** Feature
**Priorité :** High
**Estimation :** 5 Story Points
**Compétences RNCP visées :** C2.1.2, C2.2.2, C2.2.3, C2.4.1
**Lot :** Lot 1 (Web MVP)

> **Nature du ticket.** Exception assumée à la règle « un ticket = une feature » : ce ticket
> regroupe douze retouches d'interface issues d'une relecture de la démonstration. Elles sont
> indépendantes les unes des autres et organisées en **quatre lots livrables séparément**.
> Le lot 2 est explicitement sacrifiable si le temps manque.

---

### 0. Definition of Ready (DoR)

- [x] **Valeur Claire :** chaque lot corrige une incohérence constatée sur l'application déployée.
- [x] **Specs Complètes :** critères Gherkin ci-dessous, cas passants et cas d'erreur.
- [x] **UX/UI Validé :** maquette de l'écran de recherche validée (option « retouche ciblée ») ;
      logo fourni par le porteur du projet, à revectoriser.
- [x] **Faisabilité Technique :** aucune dépendance nouvelle. `username` est déjà en base
      (`users.username`) et déjà saisi à l'inscription — il suffit de le porter dans le JWT.
- [x] **Estimé :** ~8 h avec les tests. Détail par lot en §4.

---

### 1. User Story (Le Besoin)

**En tant que** visiteur de la démonstration (recruteur ou freelance),
**Je veux** une interface qui parle ma langue, qui ne me propose que ce que mon rôle autorise,
et qui m'amène directement sur mon écran de travail,
**Afin de** juger le produit sur sa valeur métier plutôt que sur ses scories d'interface.

---

### 2. Contexte & Valeur Business

* **Pourquoi maintenant ?** Le périmètre fonctionnel est gelé ; ce qui reste jouable avant la
  soutenance est la **qualité perçue**. Chacun des points ci-dessous est visible dans les trois
  premières minutes de la démonstration.
* **KPI impacté :** qualité de la donnée du Gear Locker (lot 4 : le matériel saisi librement
  produit des doublons orthographiques qui dégradent le score de matching, cœur différenciant
  du projet) et taux de complétion de l'inscription (lot 3).

**Hors périmètre, tracés ailleurs :** photo de profil (`SH-52`), vérification du compte par
email (`SH-53`), endpoint `GET /auth/me` exposant ville et date d'inscription (non retenu).

---

### 3. Critères d'Acceptation (Gherkin - BDD)

#### Lot 1 — Justesse des rôles

**Scénario 1 : Le rôle s'affiche en français**
* **GIVEN** je suis connecté avec un compte `RECRUITER`
* **WHEN** j'ouvre « Mon compte »
* **THEN** je lis « Recruteur » et jamais la chaîne technique `RECRUITER`.

**Scénario 2 : L'Armurerie ne fuit pas chez le recruteur**
* **GIVEN** je suis connecté avec un compte `RECRUITER`
* **WHEN** j'ouvre « Mon compte »
* **THEN** aucun lien vers « Mon Armurerie » n'est présent
* **AND** les actions proposées sont exactement celles de `NAV_ITEMS['RECRUITER']`.

**Scénario 3 : Plus de cloche redondante**
* **GIVEN** je suis connecté, quel que soit mon rôle
* **WHEN** j'observe l'en-tête
* **THEN** il n'y a plus qu'un seul chemin vers les messages, l'entrée de navigation.

**Scénario 4 : Identité de l'onglet**
* **WHEN** l'application est ouverte dans un navigateur
* **THEN** l'onglet porte le titre « SkillHunt » et l'icône SkillHunt
* **AND** plus jamais `frontend-web` ni l'éclair violet de Vite.

#### Lot 2 — Identité visuelle

**Scénario 5 : Un seul logo, partout**
* **GIVEN** le composant `BrandMark`
* **WHEN** l'en-tête applicatif et la page d'accueil affichent la marque
* **THEN** les deux consomment `BrandMark` — le tracé n'est plus recopié dans deux fichiers
* **AND** le logo reste lisible à 16 px comme à 64 px.

#### Lot 3 — Compte et inscription

**Scénario 6 : Mon nom, pas mon email**
* **GIVEN** je me suis inscrit avec le nom d'utilisateur `PiloteJury`
* **WHEN** j'ouvre « Mon compte » ou le menu déroulant du compte
* **THEN** je lis `PiloteJury` en identité principale, l'email passant en information secondaire.

**Scénario 7 : Session ouverte avant le déploiement**
* **GIVEN** je détiens un access token émis **avant** cette évolution, donc sans `username`
* **WHEN** l'application décode ce token
* **THEN** ma session reste valide et l'interface se rabat sur la partie locale de mon email
* **AND** je ne suis **jamais** déconnecté par l'absence du champ.

**Scénario 8 : Mot de passe refusé**
* **GIVEN** je remplis le formulaire d'inscription
* **WHEN** je saisis `motdepasse` (12 caractères, aucune majuscule, aucun chiffre)
* **THEN** le formulaire refuse l'envoi et me montre laquelle des règles n'est pas respectée
* **AND** aucun appel réseau n'est émis
* **AND** le même mot de passe envoyé directement à `POST /api/v1/auth/register` est refusé en 400.

**Scénario 9 : Confirmation divergente**
* **GIVEN** j'ai saisi un mot de passe valide
* **WHEN** la confirmation ne correspond pas
* **THEN** le formulaire refuse l'envoi et signale la divergence.

#### Lot 4 — Écrans métier

**Scénario 10 : La carte accueille le recruteur**
* **GIVEN** je suis connecté en tant que `RECRUITER`
* **WHEN** j'arrive sur l'application
* **THEN** je suis mené à `/recherche`, pas à `/mon-compte`
* **AND** la carte est déjà affichée, centrée sur la ville par défaut et cerclée du rayon
  courant, **avant même** ma première recherche.

**Scénario 11 : Le freelance arrive sur son Armurerie**
* **GIVEN** je suis connecté en tant que `FREELANCE`
* **WHEN** j'arrive sur l'application
* **THEN** je suis mené à `/mon-armurerie`.

**Scénario 12 : Compétences en puces**
* **GIVEN** je suis sur l'écran de recherche
* **WHEN** je clique une compétence suggérée
* **THEN** elle est ajoutée aux critères, et un second clic la retire
* **AND** je peux toujours saisir une compétence absente des suggestions.

**Scénario 13 : Matériel proposé**
* **GIVEN** je déclare un équipement de catégorie « Drone »
* **WHEN** je saisis « dj » dans le champ Marque
* **THEN** « DJI » m'est proposé, et le choisir propose ensuite les modèles DJI connus.

**Scénario 14 : Matériel hors catalogue**
* **GIVEN** je possède un matériel absent du catalogue
* **WHEN** je saisis une marque et un modèle libres
* **THEN** la déclaration aboutit exactement comme aujourd'hui — le catalogue **assiste**,
  il ne contraint jamais.

---

### 4. Spécifications Techniques

#### Lot 1 — Justesse des rôles · ~1 h 05

* **Front :** nouvelle table `ROLE_LABELS: Record<UserRole, string>` dans
  `features/auth/role-labels.ts`. Consommée par `pages/Account.tsx`.
* **Front :** `pages/Account.tsx` dérive ses actions de `NAV_ITEMS[user.role]`
  (`features/navigation/nav-items.ts`) au lieu de les coder en dur. La navigation reste la
  **source unique** de ce qu'un rôle a le droit de voir — la régression ne peut plus se
  reproduire d'un seul côté.
* **Front :** suppression de `features/navigation/NotificationBell.tsx`,
  `features/navigation/useUnreadMessages.ts` et de leurs tests ; retrait de l'appel dans
  `AppHeader.tsx`. ⚠️ vérifier au préalable qu'aucun autre module ne consomme `markAllRead`.
* **Front :** `index.html` — `<title>SkillHunt — Recrutement technique de niche</title>`.

#### Lot 2 — Identité visuelle · ~1 h · *sacrifiable*

* **Front :** `components/ui/BrandMark.tsx` — revectorisation SVG du logo fourni
  (engrenage, réticule à quatre équerres, curseur). Props `size` et `className`,
  `aria-hidden` (le mot-symbole textuel porte déjà le nom accessible).
* **Contrainte de thème :** le tracé utilise `currentColor` et des classes de tokens, **jamais
  une couleur hexadécimale** — `features/gear/gear-meta.test.ts` scanne les composants et
  ferait échouer la CI.
* **Front :** `public/favicon.svg` reprend le même tracé. Fichier statique hors composants :
  la couleur y est écrite en dur, c'est le seul endroit où c'est admis.
* **Consommateurs :** `features/navigation/AppHeader.tsx` et `pages/Home.tsx` remplacent
  l'icône `Crosshair` de Lucide.
* **Rédactionnel :** la baseline s'écrit « RECRUTEMENT TECHNIQUE DE NICHE » — sans accent
  sur le premier E, contrairement au fichier source fourni.

#### Lot 3 — Compte et inscription · ~1 h 30

* **Backend (NestJS) :** `auth.service.ts` — ajout de `username` au `JwtPayload` émis
  (méthode d'émission de la paire de jetons, ~ligne 184). Le champ est une **donnée
  d'affichage** : aucune décision d'autorisation ne doit s'y adosser.
* **Backend (NestJS) :** `RegisterDto.password` — durcissement en 12 caractères minimum
  avec au moins une minuscule, une majuscule et un chiffre (`@MinLength(12)` + `@Matches`),
  message d'erreur en français. La règle ne s'applique qu'à l'inscription : **aucun compte
  existant n'est invalidé**, les comptes de démonstration continuent de fonctionner.
* **Swagger (C2.4.1) :** `@ApiProperty` de `password` mis à jour, sinon la documentation
  annonce une règle que l'API ne respecte plus.
* **Front :** `AuthUser.username?: string` — **optionnel**. `decodeAccessToken` ne doit
  **pas** rejeter un token dépourvu du champ (sinon toute session ouverte au moment du
  déploiement est fermée) ; repli sur `email.split('@')[0]`, comme le fait déjà
  `AccountMenu.tsx`.
* **Front :** `pages/Register.tsx` — liste de règles cochées en direct pendant la saisie et
  champ de confirmation. Validation cliente strictement identique au DTO (C2.2.3).
* **Documentation :** `docs/soutenance/GUIDE_DEMO_JOUR_J.md` ligne 226 annonce « huit
  caractères minimum » — à corriger, sans quoi le déroulé de démonstration devient faux.

#### Lot 4 — Écrans métier · ~2 h 30

* **Front — routage :** `/` mène l'utilisateur connecté vers l'écran de son rôle
  (`RECRUITER` → `/recherche`, `FREELANCE` → `/mon-armurerie`, `ADMIN` → `/messages`),
  la page d'accueil publique restant inchangée pour le visiteur anonyme. La table des
  destinations dérive de `NAV_ITEMS` — même source unique qu'au lot 1. `Register.tsx` et
  la redirection post-connexion suivent la même règle au lieu de viser `/mon-compte`.
* **Front — recherche :** `features/matching/SearchFilters.tsx` — titre court
  « Trouver un freelance », suppression de la phrase sur le score multicritères (l'explication
  reste sur chaque carte de résultat), compétences en puces sélectionnables adossées à une
  constante `SKILL_SUGGESTIONS`, saisie libre conservée, rayon en curseur (`<input
  type="range">`, bornes 1–500 km inchangées).
* **Front — recherche :** `pages/Search.tsx` — `submittedArea` initialisé sur la ville et le
  rayon par défaut au lieu de `null`, afin que la carte soit visible dès l'arrivée. Le
  chargement paresseux de Leaflet est **conservé** : il devient simplement immédiat sur cet
  écran, et l'éco-conception de `SH-28` reste vraie pour les autres écrans.
* **Front — catalogue :** `features/gear/gear-catalog.ts` — marques par catégorie et modèles
  par marque, données statiques et typées. Champ combiné dans `pages/AddGear.tsx` : liste
  filtrable **plus** saisie libre. La validation reste celle du `AddGearDto` — le catalogue
  n'ajoute **aucune** contrainte serveur, sans quoi tout matériel légitime absent de la liste
  deviendrait indéclarable.

#### Sécurité (non négociable)

* Le RBAC affiché n'est **jamais** une protection : le backend reste seul juge (`RolesGuard`).
  Masquer l'Armurerie chez le recruteur évite un 403 à l'écran, rien de plus.
* Aucun secret introduit. Aucune requête brute. Aucune donnée non validée.
* `decodeAccessToken` ne vérifie toujours aucune signature, et le commentaire qui l'explique
  doit rester en place.

---

### 5. Definition of Done (DoD)

- [ ] Code review effectuée et validée.
- [ ] Tests unitaires écrits et passants (Vitest côté front, Jest côté backend).
- [ ] **Test d'étanchéité RBAC** : un compte `RECRUITER` ne voit aucune entrée Armurerie,
      un compte `FREELANCE` aucune entrée Recherche — vérifié sur « Mon compte » comme sur
      la navigation.
- [ ] **Test de non-régression de session** : un token sans `username` ouvre toujours une
      session valide (scénario 7).
- [ ] **CI verte** : lint + `format:check` + audit sécurité + build + tests, front et back.
- [ ] Swagger à jour pour la nouvelle règle de mot de passe (C2.4.1).
- [ ] Aucun secret en dur ; aucune couleur hexadécimale dans un composant.
- [ ] *(Front)* Audit accessibilité ≥ 90/100 — les puces de compétences sont des boutons
      réels, avec un état `aria-pressed`, et le curseur de rayon annonce sa valeur.
- [ ] `docs/BACKLOG.md` mis à jour, tickets `SH-52` et `SH-53` créés pour le hors-périmètre.
