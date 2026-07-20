# Design — SH-20 : Parcours d'authentification Web

> Spec issue d'une session de brainstorming. Couvre le **parcours d'authentification du front web** (`frontend-web`) et l'**évolution du transport du refresh token** côté `backend-core` qu'il implique.
> **Prérequis bloquant de SH-21a** (Armurerie, vue privée) : `GET /api/v1/gear/me` exige un JWT que le front ne sait pas encore obtenir.

## 1. Contexte

Le backend d'authentification est **déjà livré** (SH-7, SH-14) et n'est pas remis en cause :

| Endpoint | Entrée | Sortie |
|---|---|---|
| `POST /api/v1/auth/register` | `{ email, username, password, role }` (`FREELANCE` \| `RECRUITER`) | l'utilisateur créé — **aucun token** |
| `POST /api/v1/auth/login` | `{ email, password }` | `{ accessToken, refreshToken }` |
| `POST /api/v1/auth/refresh` | `{ refreshToken }` | nouveau couple ; l'ancien `jti` est révoqué (rotation) |
| `POST /api/v1/auth/logout` | `{ refreshToken }` | révocation (idempotent) |

Hachage **Argon2id**, JWT **RS256**, refresh tokens tracés par `jti` dans **Redis** (TTL natif).
**Access token : 15 min. Refresh token : 7 jours.**
Payload JWT : `{ userId, email, role, type }`.

Côté front, le scaffold (SH-19/SH-38) fournit une instance Axios unique (`src/api/client.ts`) où l'emplacement des intercepteurs est **déjà réservé**, React Router, TanStack Query, Tailwind + shadcn/ui et Vitest + RTL.

### Deux constats préalables

1. **La configuration CORS actuelle est cassée pour toute requête authentifiée.** `backend-core/src/main.ts` déclare `origin: '*'` **avec** `credentials: true` — combinaison rejetée par les navigateurs dès qu'une requête est créditée, alors que le front pose déjà `withCredentials: true`. C'est le `TODO sécurité (SH-20)` laissé en SH-19.
2. **La 2FA annoncée au backlog est hors périmètre.** Le backend n'a aucune brique 2FA (ni champ, ni secret TOTP, ni endpoint d'enrôlement). L'ajouter supposerait un chantier backend complet. **Décision : la 2FA sort de SH-20** et fera l'objet d'un ticket dédié.

## 2. Portée

**Dans le scope :**
- Backend : origine CORS explicite ; transport du refresh token par **cookie `httpOnly`** (en conservant le body pour le mobile du Lot 2).
- Front : écrans `/login` et `/register`, session en mémoire, intercepteurs Axios (injection du bearer + refresh automatique), restauration de session au rechargement, route protégée, déconnexion.

**Hors scope (explicitement) :**
- **2FA** (ticket dédié à créer).
- Mot de passe oublié / réinitialisation par email (aucun service d'envoi d'email dans le projet à ce stade).
- Écran de profil, onboarding de la position freelance (**SH-34**, ticket distinct).
- Toute UI de l'Armurerie (**SH-21a**).

## 3. Décision structurante — où vit le refresh token

Le refresh token vit **7 jours** et régénère des couples de tokens à volonté : c'est la clé la plus précieuse du système, bien plus qu'un access token de 15 minutes.

Trois options ont été comparées :

| Option | Sécurité | Coût |
|---|---|---|
| A — `localStorage` | ❌ Lisible par tout JS de la page : **une XSS = 7 jours d'accès au compte** | Nul (contrat backend inchangé) |
| **B — Cookie `httpOnly`** ✅ **retenue** | ✅ **Inaccessible au JavaScript** : une XSS ne peut pas l'exfiltrer | Évolution backend modeste (transport) |
| C — Tout en mémoire | ✅ Rien de persisté | ❌ Déconnexion à **chaque rechargement** — inutilisable |

**Option B retenue.** Elle est la seule à rendre le vol du refresh token structurellement impossible depuis le JS, ce qui est cohérent avec l'approche *Defense in Depth* de `CLAUDE.md` §8 (traçabilité RNCP **C2.2.3**).

> On change le **transport** du refresh token, **pas sa gestion** : rotation et révocation Redis par `jti` (SH-7/SH-14) restent inchangées.

## 4. Évolution backend (`backend-core`)

### 4.1 CORS

Origine **explicite** lue dans l'environnement (`CORS_ORIGIN`, défaut `http://localhost:5173`), `credentials: true` conservé, `origin: '*'` supprimé. Variable ajoutée à `.env.example`.

### 4.2 Cookie de refresh

`login` et `refresh` posent un `Set-Cookie` :

| Attribut | Valeur | Justification |
|---|---|---|
| `httpOnly` | `true` | Hors de portée du JS (anti-XSS) — la raison d'être de la décision §3 |
| `secure` | `true` en production | Jamais transmis en clair |
| `sameSite` | `Lax` | Anti-CSRF : le front (`app.`) et l'API (`api.`) sont sur le même site ; `localhost` en dev |
| `path` | `/api/v1/auth` | Le cookie n'est envoyé qu'aux routes qui en ont besoin (surface minimale) |
| `maxAge` | 7 jours | Aligné sur le TTL Redis existant |

Nom du cookie : `sh_refresh`.

### 4.3 Lecture du token : cookie **ou** body

`refresh` et `logout` lisent le refresh token **depuis le cookie en priorité, sinon depuis le body** :
- le **web** utilisera le cookie ;
- le **mobile (Lot 2, React Native)** conservera le body — le cookie y est inadapté, le Keychain/Keystore natif tenant ce rôle.

Le body de réponse continue donc de renvoyer `{ accessToken, refreshToken }` pour ce client mobile. `RefreshDto.refreshToken` devient **optionnel** ; si **ni** cookie **ni** body ne portent de token, la requête est rejetée en **401**.

`logout` révoque le `jti` en Redis **et** expire le cookie.

## 5. Front — feature `auth`

### 5.1 Session en mémoire

Un contexte React (`useReducer` — **aucune nouvelle dépendance de state management**) détient l'access token et l'identité de l'utilisateur. **Rien n'est écrit dans `localStorage` ni `sessionStorage`.**

L'identité (`userId`, `email`, `role`) est obtenue en **décodant le payload de l'access token** — le payload la porte déjà, aucun endpoint `/auth/me` n'est nécessaire.

> ⚠️ Ce décodage sert **uniquement à l'affichage et au routage** (masquer une entrée de menu, par exemple). L'autorité reste **exclusivement** la vérification de signature côté serveur : un utilisateur qui falsifierait son rôle dans un token non signé ne franchirait pas le `JwtAuthGuard`. Aucune décision de sécurité ne repose sur ce décodage.

### 5.2 Intercepteurs Axios

Branchés sur l'instance `apiClient` existante (emplacement réservé en SH-19).

- **Requête** : injection de `Authorization: Bearer <accessToken>` quand la session est active.
- **Réponse, sur `401`** : déclenchement d'un refresh **en vol unique** (*single-flight*).
  Les requêtes concurrentes qui prennent un `401` sont **mises en file** et rejouées une fois le nouveau token obtenu, au lieu de lancer N rotations parallèles — lesquelles se **révoqueraient mutuellement** (la rotation invalide l'ancien `jti`) et déconnecteraient l'utilisateur.
  Garde-fous : l'appel à `/auth/refresh` est lui-même **exclu** de l'intercepteur (pas de boucle infinie), et une requête n'est **rejouée qu'une seule fois**.
- **Échec du refresh** (refresh expiré/révoqué) : purge de la session et redirection vers `/login`.

### 5.3 Restauration de session

L'access token ne vivant qu'en mémoire, **un rechargement de page le perd** — mais le cookie, lui, survit. Au démarrage, l'app tente donc un `/auth/refresh` silencieux.

Tant que cette tentative est en vol, l'app affiche un **état de chargement** : sans cela, les routes protégées redirigeraient vers `/login` à chaque F5 avant même que la session soit restaurée.

### 5.4 Écrans et routage

- `/login`, `/register` : publics.
- `ProtectedRoute` : redirige vers `/login` en **mémorisant la route demandée**, pour y revenir après connexion.
- **Inscription** : `register` ne renvoyant pas de token, le front **enchaîne automatiquement un `login`** avec les identifiants saisis → l'utilisateur arrive connecté.
- **Déconnexion** : appelle `/auth/logout` (purge cookie **et** Redis), vide la session, redirige vers `/login`.
- La page d'accueil affiche l'état connecté (email, rôle) et le bouton de déconnexion.

### 5.5 Formulaires

Validation côté client **en miroir du DTO backend** (email valide, mot de passe ≥ 8 caractères, rôle parmi `FREELANCE`/`RECRUITER`), messages **en français**. La validation client est un confort d'UX : **le backend reste l'autorité** (`ValidationPipe` global).

Composants shadcn/ui (Radix) pour l'accessibilité par défaut ; erreurs de formulaire associées aux champs (`aria-describedby`), pas seulement affichées en rouge.

## 6. Tests

**Backend (Jest) :**
- `login` pose le cookie `sh_refresh` (attributs `httpOnly`, `sameSite`, `path`).
- `refresh` fonctionne **via le cookie seul** (body vide) — et via le body seul (compatibilité mobile).
- La rotation révoque bien l'ancien `jti` (le rejouer → 401).
- `logout` révoque en Redis **et** expire le cookie.
- **Ni cookie ni body → 401.**

**Front (Vitest + RTL + MSW) :**
- Formulaires : validation, messages d'erreur en français, erreur backend (401 « identifiants invalides ») affichée.
- `ProtectedRoute` : non authentifié → redirection ; retour sur la route mémorisée après connexion.
- **Intercepteur** (le cœur du risque) : `401` → refresh → **rejeu** de la requête initiale ; refresh en échec → session purgée + redirection ; requêtes concurrentes → **un seul** appel à `/auth/refresh`.
- Restauration de session : refresh silencieux au démarrage ; l'app n'affiche pas `/login` en attendant.

> **Nouvelle dépendance (dev) : `msw`** — validée. Elle permet de simuler les réponses HTTP au niveau réseau, seul moyen fidèle de tester les intercepteurs, et resservira aux features front suivantes (SH-21, SH-22).

## 7. Risques et points d'attention

- **CSRF** : couvert par `SameSite=Lax` (front et API sur le même site) ; le cookie n'est par ailleurs porté que par `/api/v1/auth`. Si un jour le front passe sur un domaine **tiers**, il faudra `SameSite=None; Secure` **et** un jeton anti-CSRF — à réévaluer à ce moment-là.
- **Rotation concurrente** : traitée par le *single-flight* (§5.2). C'est le piège n°1 de ce design ; il est testé explicitement.
- **La 2FA reste due** : le backlog la promettait, elle est reportée dans un ticket dédié — à créer pour ne pas la perdre.

## 8. Compétences RNCP

- **C2.2.3** — sécurité : refresh token hors de portée du JS, CORS à origine explicite, validation d'entrée, anti-CSRF.
- **C2.2.2** — harnais de tests : intercepteur, rotation, étanchéité des routes protégées.
- **C2.1.2** — qualité : ESLint + Prettier vérifiés en CI.
