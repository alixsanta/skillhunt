# SH-46 — Refonte de l'interface web (design system HUD)

> Spec de conception validée le 2026-07-18.
> Branche : `feature/SH-46-refonte-ui-hud` (depuis `develop`).

## 1. Problème

Le frontend web est fonctionnel mais ne tient pas la comparaison avec un produit professionnel :

- **Aucune coquille applicative.** Pas de header, pas de navigation, pas d'accès au compte.
  Chaque page se débrouille seule.
- **Thème incohérent.** Les tokens `--color-hud-*` (SH-21a) ne sont appliqués que page par page.
  `Home` tombe sur le thème clair shadcn par défaut : l'accueil du produit s'affiche en blanc
  alors que tout le reste est sombre.
- **Densité et hiérarchie faibles.** Titres nus, pas d'états vides, pas de traitement des avatars.

Un prototype HTML et trois maquettes fixent la direction artistique cible : grille tactique
sombre, accent vert, densité d'information élevée.

## 2. Décisions de cadrage

| Décision | Choix retenu | Raison |
|---|---|---|
| Fidélité au prototype | **Direction artistique du prototype, données réelles de l'API uniquement** | Aucun chiffre affiché ne doit être indéfendable devant un client ou le jury RNCP. |
| Layout `/recherche` | **Split-view plein écran**, repli en liste sous 1024px | Écran le plus démonstratif du matching multicritères, sans renier le Mobile-First du Lot 1 (§6). |
| Périmètre | **Priorité 1 livrée et validée, puis priorité 2** | Le site reste présentable même si le travail s'arrête en cours de route. |
| Backend | **Aucune modification** | Le Lot 1 est clos ; la refonte est purement frontend. |
| Dépendances | **Aucun ajout** | Tailwind, shadcn/ui, lucide-react, Leaflet sont déjà dans la stack (§3). |

### Éléments du prototype volontairement écartés

Non alimentés par l'API, donc non implémentés : heures de vol, taux de fiabilité, note /5,
nombre de missions, onglets `Network` / `Intelligence`, portfolio vidéo, compteur
« 14 203 pilotes actifs ». Le périmètre média (EP04) est dé-priorisé depuis le cadrage du 16/07.

## 3. Architecture

### 3.1 Thème global

Les tokens `--color-hud-*` de `src/index.css` deviennent le thème **par défaut** de l'application
(fond, surface, texte, bordure), au lieu d'une surcouche appliquée page par page. Aucune page ne
peut plus retomber sur le thème clair.

La règle SH-21a est maintenue : **aucune couleur hexadécimale dans un composant**. Le test
`features/gear/gear-meta.test.ts` la vérifie et reste vert.

### 3.2 Composants de layout

Deux coquilles, choisies par la table de routes :

- **`AppLayout`** — routes authentifiées. Header sticky + `<Outlet />`.
- **`PublicLayout`** — `/`, `/login`, `/register`. Coquille épurée, centrée, sans navigation.

```
AppLayout
├── AppHeader
│   ├── Logo (retour accueil)
│   ├── MainNav          → liens dépendants du rôle
│   ├── NotificationBell → pastille alimentée par socket.io
│   └── AccountMenu      → menu déroulant avatar
└── <Outlet />
```

Chaque composant a une responsabilité unique et se teste isolément : `MainNav` reçoit un rôle et
rend des liens ; `AccountMenu` reçoit un utilisateur et rend un menu ; `NotificationBell`
s'abonne au socket et rend un état.

### 3.3 Navigation par rôle

Le rôle est déjà porté par le JWT et exposé par `useAuth()`. Aucune requête supplémentaire.

| | FREELANCE | RECRUITER |
|---|---|---|
| Navigation | Mon Armurerie · Messages | Recherche · Messages |
| Menu avatar | Mon compte · Double authentification · Se déconnecter | idem |

Un lien n'est jamais affiché à un rôle qui recevrait un 403 en le suivant : la navigation
reflète le RBAC du backend au lieu de le contredire.

### 3.4 Notifications

Aucun endpoint de messages non lus n'existe (`chat.controller.ts` n'expose que
`GET /conversations` et `GET /with/:userId`). La cloche s'abonne donc au **socket.io déjà en
place** : un message reçu alors que l'utilisateur n'est pas sur le fil concerné allume la
pastille, qui s'éteint à la lecture. Donnée réelle, aucun endpoint inventé, et le WebSocket
devient visible à la démo.

### 3.5 Avatars

Le prototype dépend de `pravatar.cc`. L'API ne porte aucun avatar et une dépendance réseau
externe casserait une démo hors-ligne. Décision : **pastilles à initiales**, couleur dérivée
du nom d'utilisateur par hachage sur la palette de tokens existante. Déterministe, zéro requête,
zéro backend.

## 4. Traitement des écrans

### Priorité 1 — chemin de démonstration

| Écran | Traitement |
|---|---|
| `AppLayout` + thème global | Coquille et thème. Débloque visuellement toutes les pages. |
| `/mon-armurerie` | Cartes « Gear Locker » : puce catégorie, badge de statut **coloré + libellé texte** (R6), bordure active au survol. En-tête niveau / badges / loadout resserré. |
| `/recherche` | Split-view : filtres en barre haute, liste scrollable à gauche, carte Leaflet plein cadre à droite. Survol d'une fiche → mise en évidence du marqueur. Repli en liste sous 1024px. |
| `/freelances/:id/armurerie` | En-tête de profil (avatar, nom, spécialité, localisation, niveau), loadout mis en avant, puis grille du matériel validé. |
| `/messages`, `/messages/:id` | Colonne conversations à gauche, fil à droite, bulles asymétriques, horodatage. |

### Priorité 2 — crédibilité

`/login`, `/register`, `/` (hero au lieu du texte nu), `/mon-compte` (carte HUD + section 2FA),
`/mon-armurerie/ajouter`, `/404`.

### États vides

Traités partout où une collection peut être vide : aucun matériel déclaré, aucun résultat de
recherche, aucune conversation. C'est l'écran que voit un client qui crée un compte pendant la
démonstration.

## 5. Accessibilité

L'audit SH-27 est acquis, la refonte ne doit pas le défaire :

- Statut toujours porté par un **libellé texte**, jamais par la seule couleur (R6).
- Navigation au clavier complète sur le header et le menu avatar (composants Radix).
- Contrastes ≥ 3:1 pour les bordures et éléments d'interface (WCAG 1.4.11) — les tokens
  existants sont déjà calibrés.
- `prefers-reduced-motion` respecté : la règle globale de `index.css` couvre les animations
  ajoutées (pulsation des marqueurs, survol).

## 6. Tests

Vitest + React Testing Library, MSW en `onUnhandledRequest: 'error'`.

La restructuration du DOM va casser des tests de page existants. Ils sont **mis à jour, pas
affaiblis** : les assertions restent fondées sur les rôles et libellés accessibles, jamais sur
des détails d'implémentation (SH-38).

Nouveaux tests :

| Unité | Vérifie |
|---|---|
| `MainNav` | Un FREELANCE ne voit pas le lien Recherche ; un RECRUITER ne voit pas Mon Armurerie. |
| `AccountMenu` | Le menu s'ouvre au clavier ; la déconnexion purge la session. |
| `NotificationBell` | La pastille s'allume sur événement socket, s'éteint à la lecture. |
| `avatar` (initiales) | Couleur déterministe pour un même nom ; initiales correctes sur nom composé. |

**Definition of Done** : `npm run lint`, `npm run test`, `npm run format:check` et `npm run build`
verts, et parcours vérifié dans le navigateur sur la stack conteneurisée (gateway 8088).

## 7. Compétences RNCP visées

| Réf. | Justification |
|---|---|
| C2.1.2 | Respect des normes de qualité : lint, Prettier, aucune couleur hors token. |
| C2.2.2 | Harnais de tests : tests de navigation par rôle, mise à jour sans affaiblissement. |
| C2.4.1 | Documentation technique : la présente spec et le plan d'implémentation associé. |

## 8. Hors périmètre

- Toute modification du backend ou de l'API.
- Le portfolio vidéo 4K/360° (EP04, dé-priorisé).
- La publication d'offres (SH-37) et le résolveur de besoin (SH-33).
- L'application React Native (Lot 2).
