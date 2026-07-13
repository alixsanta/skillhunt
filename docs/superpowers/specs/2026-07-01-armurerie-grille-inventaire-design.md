# Design — Armurerie : grille d'inventaire gamifiée (contribue à SH-21)

> Spec UI/UX issue d'une session de brainstorming avec compagnon visuel. Couvre uniquement l'écran de **grille d'inventaire** de l'Armurerie. Le ticket [SH-21](../../BACKLOG.md) (« cartes, loadout, progression, badges ») est plus large ; ce document en traite une tranche verticale complète et livrable.

## 1. Contexte

L'Armurerie (Gear Locker) est une fonctionnalité différenciante de SkillHunt (cf. `CLAUDE.md` racine §1) : la qualité de la déclaration de matériel alimente le matching. L'entité `Gear` existe déjà côté backend (`backend-core/src/gear/gear.entity.ts`) avec les champs `brand`, `model`, `serialNumber`, `category` (`GearCategory`), `status` (`GearStatus`). Aucun front React n'est encore scaffoldé dans le repo — ce document sert de référence visuelle/comportementale pour le futur front Lot 1.

## 2. Portée

**Dans le scope :**
- L'écran "grille d'inventaire" (liste des équipements d'un freelance), en deux variantes :
  - **Vue privée** (le freelance consulte/gère son propre casier).
  - **Vue publique** (un recruteur consulte le casier d'un freelance sur son profil) — *design uniquement, pas d'implémentation backend, voir §6*.
- Le design du composant "fiche" représentant un équipement dans la liste.
- Le comportement responsive mobile (Lot 1, mobile-first) → desktop.
- L'état vide (freelance sans matériel déclaré).

**Hors scope (explicitement) :**
- Le design détaillé de la fiche individuelle en vue "plein écran" (photo grand format, historique, etc.) — écran séparé, non traité ici.
- Le flow d'ajout de matériel (formulaire de déclaration) — écran séparé.
- La couche "loadout" (setups équipés par mission), la progression/XP et les badges au sens propre — reportés à une itération ultérieure de SH-21.
- Le nouvel endpoint backend recruteur (voir §6) — noté comme dépendance, à traiter dans un ticket dédié.

## 3. Style visuel retenu

**Mise à jour (après revue) :** SkillHunt a déjà une identité de marque établie (logo, mockups existants pour le dashboard de matching et le chat des missions, réalisés sous Visily) — un thème sombre façon **HUD tactique** (fond marine quasi noir, vert signal, libellés en petites majuscules espacées, ambiance "opérations/geoloc" plutôt que gaming premier degré). Ce style résout naturellement la tension "ludique vs crédible recruteur" évoquée plus haut, donc on **aligne l'Armurerie sur ce système existant** plutôt que sur une réf. "loadout FPS" générique.

Principes repris de l'identité existante :
- Fond marine quasi noir, cartes légèrement plus claires avec bordure fine.
- **Le vert (`#2ee6a8`) est réservé exclusivement** au sens « positif / validé / actif » : CTA principal, statut `VALIDATED`, indicateurs live. Il n'est **jamais** utilisé pour coder une catégorie de matériel (éviterait de diluer sa signification).
- **La catégorie de matériel se différencie par l'icône, pas par la couleur** : dans les maquettes existantes (cartes candidats), les pastilles d'équipement/compétence sont toutes dans la même teinte bleue neutre, quel que soit le type — on reproduit ce pattern pour l'Armurerie plutôt que d'inventer une palette arc-en-ciel par catégorie.
- Libellés meta (titre d'écran, catégorie, statut) en petites majuscules, espacées (`letter-spacing`).

### Palette

| Usage | Couleur |
|---|---|
| Fond d'écran | `#0a0e14` |
| Fond de carte / fiche | `#111820` (bordure `#1e2732`) |
| Pastille icône équipement (neutre, toutes catégories) | fond `#152232`, bordure `#21384f`, icône `#4f9eff` |
| Signal positif (validé / CTA / live) | `#2ee6a8` |
| Statut « en attente » | `#f59e0b` (cohérent avec l'indicateur « away » déjà utilisé sur les avatars) |
| Statut « rejeté » | `#f43f5e` (cas non couvert par les maquettes existantes, introduit ici) |
| Texte secondaire / labels meta | `#7b8794` |

### Composant "fiche équipement" — catégorie et statut

- **Catégorie** (`GearCategory`) : icône dans la pastille neutre + label texte sous le nom (`brand` + `model`). Icônes : 🚁 `DRONE`, 📷 `CAMERA_360`, 🤖 `ROBOTICS`, 📡 `SENSOR`, ▫️ `OTHER`.
- **Statut** (`GearStatus`) : badge à droite de la fiche, point coloré + libellé en majuscules :

| `GearStatus` | Badge |
|---|---|
| `VALIDATED` | ● vert `#2ee6a8` « VALIDÉ » |
| `PENDING` | ● ambre `#f59e0b` « ATTENTE » |
| `REJECTED` | ● rose `#f43f5e` « REJETÉ » |

## 4. Composant "fiche équipement"

Style retenu après comparaison de 3 options (fiche pleine image, slot de casier compact, fiche technique horizontale) : **la fiche technique horizontale**, validée pour sa densité de lecture et son adéquation mobile-first.

Structure d'une fiche (gauche → droite) :
1. Pastille icône neutre (même teinte pour toutes les catégories, cf. palette §3) — la catégorie se lit dans l'icône, pas dans une couleur de bordure.
2. Nom + modèle (`brand` + `model`) en gras, catégorie en label texte sous le nom (petites majuscules, gris secondaire).
3. Badge de statut aligné à droite : point coloré + libellé (voir tableau §3).

## 5. Écran "grille d'inventaire"

### 5.1 Vue privée (freelance)

En-tête → barre de progression → filtres → liste :
1. **Titre** « Mon Armurerie » + compteur (« 12 équipements »).
2. **Barre de progression** : proportion de matériel `VALIDATED` sur le total déclaré (signal de fiabilité et petit ressort de gamification — motive à faire valider son matériel — sans introduire de nouveau champ, calculé côté front à partir de `status`).
3. **Chips de filtre** par catégorie : « Tous » + une chip par `GearCategory` présente dans le casier.
4. **Liste verticale** de fiches (composant §4), tous statuts visibles (`VALIDATED`, `PENDING`, `REJECTED`) — le freelance doit voir l'état de validation de tout son matériel.
5. **CTA** « + Ajouter du matériel » en bas de liste.

### 5.2 Vue publique (recruteur)

Même composants visuels, avec deux différences comportementales :
- **Seuls les équipements `VALIDATED` sont affichés** — un recruteur ne doit jamais voir du matériel en attente ou rejeté (crédibilité + le statut `PENDING`/`REJECTED` est une donnée de workflow interne, pas une donnée de profil public).
- **Pas de CTA d'ajout.** La barre de progression et les chips restent pertinentes mais ne portent que sur le sous-ensemble validé visible.

### 5.3 Responsive

- **Mobile (< 1024px)** : liste en une colonne, pleine largeur — priorité Lot 1 (mobile-first, cf. `CLAUDE.md` §6).
- **Desktop (≥ 1024px)** : la même fiche horizontale s'organise en **grille 2 colonnes** ; en-tête (titre, compteur, barre de progression, chips) reste en pleine largeur au-dessus de la grille.

### 5.4 État vide

Freelance sans matériel déclaré : illustration/icône, message « Ton arsenal est vide » + sous-texte expliquant l'impact sur le matching, CTA unique « + Ajouter mon premier équipement ». Ne s'applique qu'à la vue privée (une vue publique sans matériel validé affiche un message neutre sans CTA, ex. « Aucun équipement validé pour le moment »).

## 6. Dépendance backend identifiée (hors scope de ce document)

Aucun endpoint actuel ne permet à un recruteur de consulter le casier d'un autre utilisateur : `GearController` n'expose que `GET /api/v1/gear/me` (rôle `FREELANCE`, données de l'utilisateur du token) et `GET /api/v1/gear/pending` (rôle `ADMIN`). La vue publique décrite en §5.2 nécessitera un nouvel endpoint (ex. `GET /api/v1/gear/freelance/:id`, rôle `RECRUITER`, filtré strictement sur `status = VALIDATED`) — **à traiter dans un ticket dédié**, distinct de ce travail de design front.

## 7. Prochaines étapes

- Ce document sert de référence quand le scaffolding du front React (Lot 1) sera lancé.
- Créer un ticket backend dédié pour l'endpoint recruteur (§6) avant d'implémenter la vue publique.
- Les itérations suivantes de SH-21 (loadout, progression/XP, badges) restent à cadrer séparément.
- **À faire côté dépôt :** la palette et les principes du §3 sont retranscrits depuis des maquettes Visily et un logo déjà réalisés par ailleurs (dashboard de matching, chat des missions) mais pas encore versionnés dans le repo. Il serait utile d'ajouter les fichiers sources (logo, exports Visily) sous un dossier dédié (ex. `docs/design/brand/`) pour que ce document et les prochains restent alignés sur une source de vérité unique.
