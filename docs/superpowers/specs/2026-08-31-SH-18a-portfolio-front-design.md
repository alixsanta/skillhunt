# SH-18a — Portfolio (front web) — Design

> Spec de conception issue d'un brainstorming (2026-08-31). Cible : `frontend-web`.
> Premier lot de SH-18 : les écrans du portfolio **sans le lecteur**, qui dépend des routes
> de lecture de SH-17 et fera l'objet de SH-18b.
> Compétences RNCP : **C2.4.1** (interface, documentation), **C2.2.2** (tests), **C2.1.2** (normes).

## 1. Objectif & valeur

SH-16a a livré le flux entrant côté API : un freelance déclare une vidéo, reçoit une URL PUT
signée, dépose son fichier directement sur le stockage objet, confirme, et un job de
transcodage part sur la file. Rien de tout cela n'est visible dans l'application.

SH-18a rend ce flux **utilisable et démontrable** : trois points d'entrée pour publier, une
grille qui dit honnêtement où en est chaque média, et l'emplacement figé de la vue recruteur.

**Valeur de démonstration.** L'écran de dépôt est le seul moment où l'architecture devient
visible pour l'utilisateur : la barre de progression avance **en octets réels**, parce que le
navigateur envoie directement à S3 sans passer par l'API. C'est la meilleure illustration de
la décision D1 du design EP04.

## 2. Périmètre

**Dans le périmètre**

| Écran | Contenu |
|---|---|
| `/portfolio` | Grille de cartes, les cinq états du cycle de vie, sondage tant qu'un média n'est ni `READY` ni `FAILED` |
| `/portfolio/ajouter` | Formulaire de déclaration + dépôt en trois temps avec progression réelle |
| `/mon-compte` | Carte « Portfolio » avec compteur et bouton `+` de publication directe |
| `/freelances/:freelanceId/armurerie` | Section « Portfolio » sous le matériel |
| `features/navigation/nav-items.ts` | Entrée « Portfolio » pour le rôle `FREELANCE` |

**Hors périmètre, explicitement**

- **Le lecteur HLS et la visionneuse 360° WebGL.** Ils consomment `GET /media/:id/master.m3u8`,
  la playlist variante réécrite et la route poster — toutes livrées par **SH-17**. Les coder
  maintenant produirait du code que rien ne peut exercer. → **SH-18b**.
- **La suppression d'un média** (`DELETE /media/:id`) : la route est SH-17.
- **L'édition du titre et de la description.** `PATCH /media/:id` existe depuis SH-16a, mais
  aucun écran n'en a besoin pour la démonstration. À ajouter quand un besoin réel apparaît.

## 3. Décisions de conception (validées en brainstorming)

| # | Décision | Choix retenu |
|---|---|---|
| D1 | Nommage | **« Portfolio »**, jamais « Mon portfolio ». Route `/portfolio` — `/messages` et `/recherche` ne sont pas préfixés non plus. Asymétrie assumée avec « Mon Armurerie », dont le libellé n'est pas modifié ici. |
| D2 | Point d'entrée principal | **Entrée de navigation** pour le rôle `FREELANCE`, aux côtés de « Mon Armurerie » et « Messages ». |
| D3 | Publication rapide | **Bouton `+` sur la carte Portfolio de `/mon-compte`**, qui mène directement à `/portfolio/ajouter`. Publier ne doit pas exiger de passer par la grille. |
| D4 | Vue recruteur | **Section de `/freelances/:id/armurerie`**, pas de page dédiée : le recruteur consulte déjà cette page, un média et un drone parlent du même savoir-faire. |
| D5 | Forme des éléments | **Cartes**, comme l'Armurerie. Une liste dense romprait la cohérence de l'application. |
| D6 | Dépôt vers S3 | **Instance axios nue**, sans les intercepteurs d'`apiClient`. Voir §6 — c'est le piège principal de ce lot. |
| D7 | Suivi de l'état | **Sondage react-query** tant que le média n'est ni `READY` ni `FAILED`, arrêté sinon. Pas de WebSocket : le socket de SH-24 est dédié au chat, l'y greffer coûterait plus que le sondage n'économise. |
| D8 | Section recruteur | **Livrée avec son état vide**, branchée sur l'API en SH-17. L'emplacement et le rendu sont figés maintenant ; le branchement sera une poignée de lignes. |
| D9 | Vignette | **Dérivée de l'état**, pas d'un poster. Le poster est produit par SH-16b ; d'ici là chaque état a sa propre zone visuelle (icône + libellé), et la grille reste lisible sans aucune image. |

## 4. Écrans

### 4.1 `/portfolio` — la grille

En-tête : titre « Portfolio » et bouton « + Ajouter une vidéo ». Puis une grille de cartes.

Chaque carte porte, de haut en bas : une **zone visuelle** dépendant de l'état, un **badge de
statut**, le **titre**. Une carte `READY` affiche en plus la durée et, si `type` vaut
`VIDEO_360`, un badge « 360° ».

| Statut | Zone visuelle | Badge | Jeton de couleur |
|---|---|---|---|
| `DRAFT` | icône fichier, « Dépôt non confirmé » | `BROUILLON` | `hud-muted` |
| `UPLOADED` | icône horloge, « En file d'attente » | `DÉPOSÉE` | `hud-muted` |
| `PROCESSING` | icône traitement, « Transcodage en cours » | `EN TRAITEMENT` | `hud-pending` |
| `READY` | icône lecture, durée, badge 360° éventuel | `PRÊT` | `hud-positive` |
| `FAILED` | icône alerte + `errorReason` | `ÉCHEC` | `hud-rejected` |

État vide : invitation à publier, pas une excuse — même parti pris que `GearEmptyState`.

> **`PROCESSING` est aujourd'hui un état mort.** Vérifié dans le code de SH-16a : aucune
> écriture ne le positionne. L'écouteur ne branche que `completed` et `failed` ; l'événement
> `active`, que BullMQ émet quand un worker saisit le job, n'est pas écouté. Un média passe
> donc de `DÉPOSÉE` directement à `PRÊT` ou `ÉCHEC`. La carte gère quand même les cinq états —
> l'enum les déclare, et le front n'a pas à parier sur ce que le back positionne — mais **en
> démonstration, « EN TRAITEMENT » n'apparaîtra pas**. Brancher `active` est un ajout de
> quelques lignes côté `media.listener.ts`, à faire avec SH-16b.

### 4.2 `/portfolio/ajouter` — le dépôt en trois temps

Un formulaire (titre obligatoire ≤ 120, description optionnelle ≤ 2000, sélecteur de fichier),
puis une progression en trois segments qui reflète **exactement** les trois appels réels :

1. **Déclaration** — `POST /api/v1/media` renvoie le média `DRAFT` et l'URL PUT signée.
2. **Envoi direct** — `PUT` du fichier vers l'URL signée, avec le pourcentage d'octets envoyés.
3. **Confirmation** — `POST /api/v1/media/:id/complete`, puis redirection vers `/portfolio`.

Le type MIME et la taille sont lus depuis l'objet `File` et envoyés tels quels à l'étape 1 :
le back les recontrôle de toute façon sur l'objet réellement déposé.

**Échec à l'étape 2 ou 3** : le média reste `DRAFT`, l'écran propose de réessayer. Rien à
nettoyer côté client — le balayage serveur de SH-16a purge les `DRAFT` abandonnées au-delà de
24 h.

### 4.3 `/mon-compte` — la carte Portfolio

Une carte parmi les autres, avec un compteur (« 3 vidéos · 1 en traitement ») et un bouton `+`
menant à `/portfolio/ajouter`. Le compteur réutilise la même requête que la grille : aucune
requête supplémentaire.

### 4.4 `/freelances/:id/armurerie` — la section recruteur

Sous la grille de matériel, séparée par un filet : un titre de section « PORTFOLIO » et, pour
l'instant, l'état vide. Aucun appel réseau n'est émis tant que SH-17 n'a pas livré
`GET /api/v1/media/freelance/:id`.

## 5. Composants et données

**`features/media/`**

| Fichier | Responsabilité |
|---|---|
| `types.ts` | `PublicMedia`, `PaginatedMedia`, `MediaStatus`, `MediaType`, dérivés du contrat généré |
| `media-meta.ts` | Table `STATUS_META` (libellé, jeton de couleur, icône) et `formatDuration` |
| `MediaStatusBadge.tsx` | Pastille décorative + libellé — calque de `GearStatusBadge` |
| `MediaCard.tsx` | Une carte, sans logique de chargement |
| `MediaGrid.tsx` | La grille et son état vide |
| `MediaEmptyState.tsx` | Invitation à publier |
| `MediaUploader.tsx` | Orchestration des trois étapes et la progression |
| `useMyMedia.ts` | `GET /api/v1/media/me` + sondage conditionnel |
| `useCreateMedia.ts` | `POST /api/v1/media` |
| `useCompleteMedia.ts` | `POST /api/v1/media/:id/complete` |
| `uploadToStorage.ts` | Le `PUT` direct, isolé dans son propre module (§6) |

**Pages** : `pages/Portfolio.tsx`, `pages/AddMedia.tsx`, plus les modifications de
`pages/Account.tsx` et `pages/FreelanceGear.tsx`.

**Requêtes.** Une seule clé, `['media','me']`, partagée par la grille et le compteur du compte.
Comme pour `useMyGear`, on charge en une requête (`limit=100`) et on filtre en mémoire, et on
ne réessaie **jamais** une erreur 4xx : un 403 ou un 401 est une réponse définitive du serveur,
pas un aléa réseau.

**Sondage (D7).** `refetchInterval` renvoie `5000` tant qu'au moins un média de la page est
`UPLOADED` ou `PROCESSING`, et `false` sinon. Le sondage s'arrête donc tout seul quand tout est
stabilisé, et ne démarre jamais sur un portfolio entièrement `READY`.

## 6. Sécurité — le piège de ce lot

`apiClient` porte les intercepteurs d'authentification de SH-20 : il ajoute un en-tête
`Authorization: Bearer …` à chaque requête et gère le rafraîchissement du jeton.

**Le `PUT` vers S3 ne doit surtout pas passer par lui.** Un en-tête `Authorization` non prévu
invalide la signature SigV4 de l'URL, et S3 refuse le dépôt. Pire, cela enverrait le jeton
d'accès de l'utilisateur à un tiers.

`uploadToStorage.ts` existe pour cette seule raison : il utilise une instance axios **nue**,
créée sur place, sans `baseURL`, sans `withCredentials` et sans intercepteur. Le module est
isolé pour que la règle soit évidente à la lecture et vérifiable par un test dédié.

Le seul en-tête envoyé est le `Content-Type` que l'API a fait signer — celui-là est
obligatoire, sans quoi la signature ne correspond pas non plus.

## 7. Accessibilité

L'audit WCAG de SH-27 est bloquant en CI sous 90 ; ces règles ne sont pas optionnelles.

- **Le statut se lit dans le texte**, jamais dans la couleur seule : pastille `aria-hidden`
  + libellé, comme `GearStatusBadge`.
- **Le changement d'état est annoncé** : une région `aria-live="polite"` porte « 1 vidéo en
  traitement » et se met à jour au fil du sondage. Un utilisateur de lecteur d'écran n'a pas à
  relire la grille pour savoir que quelque chose a bougé.
- **La progression du dépôt** utilise un `role="progressbar"` avec `aria-valuenow` et
  `aria-valuetext` (« 68 % — 125 Mo sur 184 Mo »), et non un simple `<div>` qui grandit.
- **Le bouton `+`** du compte est une icône seule : il porte un `aria-label` explicite
  (« Publier une vidéo »).

## 8. Stratégie de tests

Vitest + Testing Library + MSW, comme le reste du front. Le harnais est en
`onUnhandledRequest: 'error'` : **toute** requête non simulée fait échouer le test, y compris
le `PUT` vers le stockage — il faut donc lui écrire un handler explicite.

- `MediaCard` : les cinq états rendent le bon libellé et la bonne zone visuelle ; le badge 360°
  n'apparaît que pour `VIDEO_360` ; `errorReason` est affiché sur `FAILED`.
- `MediaGrid` : état vide, puis grille peuplée.
- **`uploadToStorage` : le test le plus important du lot.** Il vérifie qu'**aucun en-tête
  `Authorization` n'est envoyé** vers l'URL de stockage, et que `Content-Type` l'est. C'est la
  règle du §6, et c'est celle qu'une refonte distraite casserait en premier.
- `MediaUploader` : les trois étapes s'enchaînent dans l'ordre ; un échec à l'étape 2 laisse
  l'écran en état de réessai sans appeler `complete`.
- `useMyMedia` : le sondage est actif avec un média `PROCESSING`, inactif quand tout est
  `READY` ou `FAILED` ; une erreur 4xx n'est pas réessayée.
- `Portfolio` et `AddMedia` : rendus sous `StrictMode`, comme l'impose SH-41.
- `Account` : la carte affiche le compteur et le `+` mène à `/portfolio/ajouter`.
- `FreelanceGear` : la section Portfolio est présente et affiche son état vide **sans émettre
  de requête** — ce dernier point est vérifiable directement grâce à `onUnhandledRequest`.

## 9. Suites

- **SH-18b** (après SH-17) : lecteur HLS avec `hls.js` en `lazy()`, visionneuse 360° WebGL,
  poster réel sur les cartes, branchement de la section recruteur sur
  `GET /media/freelance/:id`, et suppression d'un média.
- **SH-16b** : tant qu'il n'est pas livré, aucun média n'atteint `READY` — la grille montrera
  surtout `EN TRAITEMENT`. C'est précisément pourquoi cet état a été conçu avec soin.
