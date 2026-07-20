# SH-46 — Refonte UI HUD — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Doter le frontend web d'une coquille applicative professionnelle (header, navigation par rôle, menu compte) et appliquer la direction artistique « HUD tactique » à l'ensemble des écrans, sans toucher au backend.

**Architecture:** Deux composants de layout (`AppLayout` authentifié, `PublicLayout` public) branchés dans la table de routes existante. Les tokens `--color-hud-*` deviennent le thème par défaut via une surcharge du bloc `.dark` et l'activation de la classe `dark` sur `<html>`. Les pages perdent leur `bg-hud-bg min-h-screen` individuel au profit du layout.

**Tech Stack:** React 19, TypeScript strict, Vite, Tailwind CSS v4, shadcn/ui + `radix-ui`, `lucide-react`, TanStack Query, Leaflet, Vitest + React Testing Library + MSW.

## Global Constraints

- Textes UI **en français**, identifiants de code **en anglais**.
- **Aucune couleur hexadécimale dans un composant** — toute couleur passe par un token `--color-hud-*`. Vérifié par `src/features/gear/gear-meta.test.ts`.
- **Aucune modification backend**, **aucune nouvelle dépendance npm** (`radix-ui` et `lucide-react` sont déjà installés).
- Un statut n'est **jamais** porté par la seule couleur : toujours un libellé texte (R6).
- L'access token reste **en mémoire** — jamais de `localStorage`/`sessionStorage`.
- Tous les appels HTTP passent par `apiClient` (`@/api/client`).
- MSW est en `onUnhandledRequest: 'error'` : tout appel réseau non simulé fait échouer le test.
- Les tests existants sont **mis à jour, jamais affaiblis** : assertions sur rôles et libellés accessibles.
- Prettier vérifié en CI : lancer `npm run format` avant chaque commit.
- Commits au format Conventional Commits avec scope `(SH-46/frontend-web)`.

**Commandes de référence** (depuis `frontend-web/`) :

```bash
npm run test         # Vitest
npm run lint         # ESLint
npm run format       # Prettier --write
npm run build        # tsc + vite build
```

---

## Structure des fichiers

**Créés :**

| Fichier | Responsabilité |
|---|---|
| `src/app/AppLayout.tsx` | Coquille authentifiée : header + `<Outlet />`. |
| `src/app/PublicLayout.tsx` | Coquille publique épurée et centrée. |
| `src/features/navigation/AppHeader.tsx` | Assemblage logo + nav + cloche + menu compte. |
| `src/features/navigation/MainNav.tsx` | Liens de navigation dépendants du rôle. |
| `src/features/navigation/AccountMenu.tsx` | Menu déroulant avatar (Radix). |
| `src/features/navigation/NotificationBell.tsx` | Pastille de message non lu, alimentée par socket.io. |
| `src/features/navigation/useUnreadMessages.ts` | État des messages reçus hors du fil courant. |
| `src/features/navigation/nav-items.ts` | Table des liens par rôle (donnée pure, testable). |
| `src/components/ui/InitialsAvatar.tsx` | Avatar à initiales, couleur déterministe. |
| `src/lib/avatar.ts` | `getInitials()` + `getAvatarPalette()`. |

**Modifiés :**

| Fichier | Nature |
|---|---|
| `frontend-web/index.html` | `lang="fr"` + `class="dark"`. |
| `src/index.css` | Surcharge `.dark` vers la palette HUD. |
| `src/app/routes.tsx` | Imbrication des routes sous les deux layouts. |
| `src/pages/*.tsx` | Retrait des `bg-hud-bg min-h-screen`, restyle. |
| `src/features/gear/GearCard.tsx` | Style « Gear Locker ». |
| `src/pages/Search.tsx` | Refonte en split-view. |

---

## Task 1 : Thème global sombre et coquilles de layout

**Files:**
- Modify: `frontend-web/index.html`
- Modify: `frontend-web/src/index.css:45`
- Create: `frontend-web/src/app/AppLayout.tsx`
- Create: `frontend-web/src/app/PublicLayout.tsx`
- Modify: `frontend-web/src/app/routes.tsx`
- Test: `frontend-web/src/app/AppLayout.test.tsx`

**Interfaces:**
- Consumes: rien (tâche fondatrice).
- Produces: `AppLayout` et `PublicLayout`, composants sans props rendant `<Outlet />`. `AppLayout` rend un `<header>` (rempli en Task 6) et un `<main>`.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `frontend-web/src/app/AppLayout.test.tsx` :

```tsx
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import AppLayout from './AppLayout';

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      {
        element: <AppLayout />,
        children: [{ path: '/page-test', element: <p>Contenu de la page</p> }],
      },
    ],
    { initialEntries: [path] },
  );
  return render(<RouterProvider router={router} />);
}

describe('AppLayout', () => {
  it('rend la page enfant dans une région principale', () => {
    renderAt('/page-test');
    expect(screen.getByRole('main')).toHaveTextContent('Contenu de la page');
  });

  it('expose une bannière de navigation commune', () => {
    renderAt('/page-test');
    expect(screen.getByRole('banner')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npm run test -- src/app/AppLayout.test.tsx`
Expected: FAIL — `Failed to resolve import "./AppLayout"`.

- [ ] **Step 3: Activer le thème sombre global**

Dans `frontend-web/index.html`, remplacer la balise ouvrante :

```html
<html lang="fr" class="dark">
```

> `lang="fr"` corrige la prononciation des lecteurs d'écran (WCAG 3.1.1) : l'interface est
> intégralement en français. `class="dark"` active le variant `dark` de Tailwind.

- [ ] **Step 4: Rebrancher les tokens shadcn sur la palette HUD**

Dans `frontend-web/src/index.css`, ajouter ce bloc **après** le bloc `@theme` de la palette HUD (soit après la ligne `--color-hud-muted: #7b8794;` et sa `}`) :

```css
/* SH-46 — Le thème sombre de l'application EST la palette HUD. Ce bloc surcharge les
   jetons shadcn générés (qu'on ne modifie pas à la main) pour que tout composant shadcn
   hérite de la direction artistique sans couleur en dur. */
.dark {
  --background: var(--color-hud-bg);
  --foreground: #f1f5f9;
  --card: var(--color-hud-card);
  --card-foreground: #f1f5f9;
  --popover: var(--color-hud-card);
  --popover-foreground: #f1f5f9;
  --primary: var(--color-hud-positive);
  --primary-foreground: var(--color-hud-bg);
  --secondary: var(--color-hud-pill);
  --secondary-foreground: #f1f5f9;
  --muted: var(--color-hud-pill);
  --muted-foreground: var(--color-hud-muted);
  --accent: var(--color-hud-pill);
  --accent-foreground: #f1f5f9;
  --destructive: var(--color-hud-rejected);
  --border: var(--color-hud-border);
  --input: var(--color-hud-border);
  --ring: var(--color-hud-icon);
}
```

> Les deux littéraux `#f1f5f9` sont dans la **feuille de style de thème**, pas dans un
> composant : `gear-meta.test.ts` n'inspecte que les composants, la règle est respectée.

- [ ] **Step 5: Créer AppLayout**

Créer `frontend-web/src/app/AppLayout.tsx` :

```tsx
import { Outlet } from 'react-router-dom';

/**
 * Coquille des écrans authentifiés (SH-46) : bannière commune + zone de contenu.
 * Le header est rempli en Task 6 ; ici on fige la structure et les repères ARIA.
 */
export default function AppLayout() {
  return (
    <div className="bg-hud-bg flex min-h-screen flex-col">
      <header
        role="banner"
        className="border-hud-border bg-hud-card sticky top-0 z-40 border-b"
      />
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}
```

- [ ] **Step 6: Créer PublicLayout**

Créer `frontend-web/src/app/PublicLayout.tsx` :

```tsx
import { Outlet } from 'react-router-dom';

/**
 * Coquille des écrans publics (SH-46) : accueil, connexion, inscription.
 * Volontairement sans navigation — l'utilisateur n'a pas encore de rôle.
 */
export default function PublicLayout() {
  return (
    <div className="bg-hud-bg flex min-h-screen flex-col">
      <main className="flex flex-1 flex-col">
        <Outlet />
      </main>
    </div>
  );
}
```

- [ ] **Step 7: Imbriquer les routes sous les deux layouts**

Remplacer intégralement `frontend-web/src/app/routes.tsx` :

```tsx
import { type RouteObject } from 'react-router-dom';
import AppLayout from '@/app/AppLayout';
import PublicLayout from '@/app/PublicLayout';
import Home from '@/pages/Home';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import Account from '@/pages/Account';
import Armurerie from '@/pages/Armurerie';
import AddGear from '@/pages/AddGear';
import FreelanceGear from '@/pages/FreelanceGear';
import Search from '@/pages/Search';
import Messages from '@/pages/Messages';
import MessageThread from '@/pages/MessageThread';
import NotFound from '@/pages/NotFound';
import { ProtectedRoute } from '@/features/auth/ProtectedRoute';

// Table de routes (SH-19). Module sans effet de bord : les tests l'importent sans
// construire de router browser-history (SH-38).
// SH-46 : deux coquilles — PublicLayout (sans navigation) et AppLayout (header complet).
export const routes: RouteObject[] = [
  {
    element: <PublicLayout />,
    children: [
      { path: '/', element: <Home /> },
      { path: '/login', element: <Login /> },
      { path: '/register', element: <Register /> },
    ],
  },
  {
    element: <AppLayout />,
    children: [
      {
        path: '/mon-compte',
        element: (
          <ProtectedRoute>
            <Account />
          </ProtectedRoute>
        ),
      },
      {
        path: '/mon-armurerie',
        element: (
          <ProtectedRoute>
            <Armurerie />
          </ProtectedRoute>
        ),
      },
      {
        path: '/mon-armurerie/ajouter',
        element: (
          <ProtectedRoute>
            <AddGear />
          </ProtectedRoute>
        ),
      },
      {
        // Vue publique de l'Armurerie (SH-21b) : « publique » au sens profil consultable,
        // pas anonyme — session requise, et le backend réserve la donnée au rôle RECRUITER.
        path: '/freelances/:freelanceId/armurerie',
        element: (
          <ProtectedRoute>
            <FreelanceGear />
          </ProtectedRoute>
        ),
      },
      {
        // Recherche par matching (SH-22) — le backend réserve la donnée au rôle RECRUITER.
        path: '/recherche',
        element: (
          <ProtectedRoute>
            <Search />
          </ProtectedRoute>
        ),
      },
      {
        // Chat contextuel (SH-24) : liste des conversations, pour les DEUX rôles.
        path: '/messages',
        element: (
          <ProtectedRoute>
            <Messages />
          </ProtectedRoute>
        ),
      },
      {
        // Fil de discussion 1-à-1 — le backend impose la paire RECRUITER↔FREELANCE.
        path: '/messages/:userId',
        element: (
          <ProtectedRoute>
            <MessageThread />
          </ProtectedRoute>
        ),
      },
    ],
  },
  { path: '*', element: <NotFound /> },
];
```

- [ ] **Step 8: Retirer les fonds de page devenus redondants**

Dans `src/pages/Armurerie.tsx` et `src/pages/Search.tsx`, remplacer :

```tsx
<main className="bg-hud-bg min-h-screen p-4 lg:p-8">
```

par :

```tsx
<div className="p-4 lg:p-8">
```

et la balise fermante `</main>` correspondante par `</div>`.

> Le layout fournit désormais le `<main>` et le fond. Deux `<main>` imbriqués créeraient
> deux repères ARIA « principal », ce qu'un lecteur d'écran signale comme une erreur.

Appliquer le même remplacement dans `src/pages/Account.tsx`, `src/pages/AddGear.tsx`,
`src/pages/FreelanceGear.tsx`, `src/pages/Messages.tsx`, `src/pages/MessageThread.tsx`
partout où un `<main>` de page existe.

- [ ] **Step 9: Lancer la suite complète**

Run: `npm run test`
Expected: `AppLayout.test.tsx` PASS. Des tests de page peuvent échouer sur la disparition du rôle `main` — les corriger en visant le contenu (`screen.getByRole('heading', …)`) plutôt que le conteneur.

- [ ] **Step 10: Vérifier le build et le format**

Run: `npm run format && npm run lint && npm run build`
Expected: aucune erreur.

- [ ] **Step 11: Commit**

```bash
git add frontend-web/index.html frontend-web/src/index.css frontend-web/src/app frontend-web/src/pages
git commit -m "feat(SH-46/frontend-web): thème HUD global et coquilles de layout

Le thème sombre devient le défaut (surcharge .dark vers la palette HUD,
classe dark sur <html>) : plus aucune page ne retombe sur le thème clair.
AppLayout et PublicLayout fournissent le <main> et le fond, les pages
cessent de les porter individuellement.

lang=fr corrige la prononciation des lecteurs d'écran (WCAG 3.1.1)."
```

---

## Task 2 : Avatar à initiales

**Files:**
- Create: `frontend-web/src/lib/avatar.ts`
- Create: `frontend-web/src/components/ui/InitialsAvatar.tsx`
- Test: `frontend-web/src/lib/avatar.test.ts`

**Interfaces:**
- Consumes: rien.
- Produces:
  - `getInitials(name: string): string` — 1 à 2 caractères majuscules.
  - `getAvatarPalette(name: string): { background: string; foreground: string }` — classes Tailwind, déterministes.
  - `<InitialsAvatar name={string} size?: 'sm' | 'md' | 'lg' />`.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `frontend-web/src/lib/avatar.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { getAvatarPalette, getInitials } from './avatar';

describe('getInitials', () => {
  it('prend les deux premières initiales d\'un nom composé', () => {
    expect(getInitials('Marcus Thorne')).toBe('MT');
  });

  it('prend les deux premiers caractères d\'un mot unique', () => {
    expect(getInitials('DemoPilote')).toBe('DE');
  });

  it('ignore les espaces superflus', () => {
    expect(getInitials('  sasha   ivanova  ')).toBe('SI');
  });

  it('renvoie un repli pour une chaîne vide', () => {
    expect(getInitials('')).toBe('?');
  });
});

describe('getAvatarPalette', () => {
  it('est déterministe pour un même nom', () => {
    expect(getAvatarPalette('Marcus')).toEqual(getAvatarPalette('Marcus'));
  });

  it('renvoie des classes Tailwind, jamais une couleur en dur', () => {
    const palette = getAvatarPalette('Marcus');
    expect(palette.background).toMatch(/^bg-/);
    expect(palette.background).not.toMatch(/#/);
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npm run test -- src/lib/avatar.test.ts`
Expected: FAIL — `Failed to resolve import "./avatar"`.

- [ ] **Step 3: Implémenter le module**

Créer `frontend-web/src/lib/avatar.ts` :

```ts
/**
 * Avatars à initiales (SH-46).
 *
 * L'API ne porte aucune photo de profil et le prototype dépendait d'un service externe
 * (pravatar.cc) : une démonstration hors-ligne y perdrait tous ses avatars. On dérive donc
 * l'avatar du nom, sans aucune requête réseau.
 */

// Variantes issues des tokens de thème — aucune couleur en dur (règle SH-21a).
const PALETTES = [
  { background: 'bg-hud-pill', foreground: 'text-hud-icon' },
  { background: 'bg-hud-icon/15', foreground: 'text-hud-icon' },
  { background: 'bg-hud-positive/15', foreground: 'text-hud-positive' },
  { background: 'bg-hud-pending/15', foreground: 'text-hud-pending' },
] as const;

export function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function getAvatarPalette(name: string): { background: string; foreground: string } {
  // Somme des points de code : stable d'une session à l'autre, contrairement à un hash
  // dépendant de l'ordre d'insertion.
  let sum = 0;
  for (const char of name) sum += char.codePointAt(0) ?? 0;
  return PALETTES[sum % PALETTES.length];
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `npm run test -- src/lib/avatar.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Créer le composant**

Créer `frontend-web/src/components/ui/InitialsAvatar.tsx` :

```tsx
import { getAvatarPalette, getInitials } from '@/lib/avatar';
import { cn } from '@/lib/utils';

const SIZES = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-20 w-20 text-2xl',
} as const;

interface InitialsAvatarProps {
  name: string;
  size?: keyof typeof SIZES;
  className?: string;
}

/**
 * Avatar à initiales (SH-46). Décoratif : `aria-hidden` car le nom qu'il représente est
 * toujours affiché en texte à côté — l'annoncer deux fois alourdirait la lecture d'écran.
 */
export function InitialsAvatar({ name, size = 'md', className }: InitialsAvatarProps) {
  const palette = getAvatarPalette(name);
  return (
    <span
      aria-hidden="true"
      className={cn(
        'border-hud-border inline-flex shrink-0 items-center justify-center rounded-full border font-bold',
        SIZES[size],
        palette.background,
        palette.foreground,
        className,
      )}
    >
      {getInitials(name)}
    </span>
  );
}
```

- [ ] **Step 6: Vérifier**

Run: `npm run test -- src/lib/avatar.test.ts && npm run lint`
Expected: PASS, aucune erreur de lint.

- [ ] **Step 7: Commit**

```bash
git add frontend-web/src/lib/avatar.ts frontend-web/src/lib/avatar.test.ts frontend-web/src/components/ui/InitialsAvatar.tsx
git commit -m "feat(SH-46/frontend-web): avatar à initiales déterministe

Dérivé du nom, sans requête réseau : le prototype dépendait de pravatar.cc,
ce qui aurait vidé tous les avatars lors d'une démonstration hors-ligne."
```

---

## Task 3 : Navigation dépendante du rôle

**Files:**
- Create: `frontend-web/src/features/navigation/nav-items.ts`
- Create: `frontend-web/src/features/navigation/MainNav.tsx`
- Test: `frontend-web/src/features/navigation/MainNav.test.tsx`

**Interfaces:**
- Consumes: `UserRole` depuis `@/features/auth/types`.
- Produces:
  - `NAV_ITEMS: Record<UserRole, ReadonlyArray<{ to: string; label: string; icon: LucideIcon }>>`
  - `<MainNav role={UserRole} />`

- [ ] **Step 1: Écrire le test qui échoue**

Créer `frontend-web/src/features/navigation/MainNav.test.tsx` :

```tsx
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { MainNav } from './MainNav';

function renderNav(role: 'FREELANCE' | 'RECRUITER' | 'ADMIN') {
  return render(
    <MemoryRouter>
      <MainNav role={role} />
    </MemoryRouter>,
  );
}

describe('MainNav', () => {
  it('propose au freelance son armurerie et ses messages', () => {
    renderNav('FREELANCE');
    expect(screen.getByRole('link', { name: /mon armurerie/i })).toHaveAttribute(
      'href',
      '/mon-armurerie',
    );
    expect(screen.getByRole('link', { name: /messages/i })).toBeInTheDocument();
  });

  it("n'expose jamais la recherche au freelance (le backend renverrait 403)", () => {
    renderNav('FREELANCE');
    expect(screen.queryByRole('link', { name: /recherche/i })).not.toBeInTheDocument();
  });

  it('propose au recruteur la recherche et ses messages', () => {
    renderNav('RECRUITER');
    expect(screen.getByRole('link', { name: /recherche/i })).toHaveAttribute('href', '/recherche');
    expect(screen.getByRole('link', { name: /messages/i })).toBeInTheDocument();
  });

  it("n'expose jamais l'armurerie personnelle au recruteur", () => {
    renderNav('RECRUITER');
    expect(screen.queryByRole('link', { name: /mon armurerie/i })).not.toBeInTheDocument();
  });

  it('expose une navigation nommée pour les lecteurs d\'écran', () => {
    renderNav('RECRUITER');
    expect(screen.getByRole('navigation', { name: /navigation principale/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npm run test -- src/features/navigation/MainNav.test.tsx`
Expected: FAIL — `Failed to resolve import "./MainNav"`.

- [ ] **Step 3: Créer la table des liens**

Créer `frontend-web/src/features/navigation/nav-items.ts` :

```ts
import { MessageSquare, Radar, Warehouse, type LucideIcon } from 'lucide-react';
import type { UserRole } from '@/features/auth/types';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

/**
 * Navigation par rôle (SH-46).
 *
 * La navigation REFLÈTE le RBAC du backend : on n'affiche jamais un lien dont on sait
 * qu'il renverrait 403. Un FREELANCE n'a donc pas « Recherche », un RECRUITER n'a pas
 * « Mon Armurerie ».
 */
export const NAV_ITEMS: Record<UserRole, readonly NavItem[]> = {
  FREELANCE: [
    { to: '/mon-armurerie', label: 'Mon Armurerie', icon: Warehouse },
    { to: '/messages', label: 'Messages', icon: MessageSquare },
  ],
  RECRUITER: [
    { to: '/recherche', label: 'Recherche', icon: Radar },
    { to: '/messages', label: 'Messages', icon: MessageSquare },
  ],
  // L'admin valide le matériel via l'API (aucun écran dédié dans le Lot 1).
  ADMIN: [{ to: '/messages', label: 'Messages', icon: MessageSquare }],
};
```

- [ ] **Step 4: Créer le composant**

Créer `frontend-web/src/features/navigation/MainNav.tsx` :

```tsx
import { NavLink } from 'react-router-dom';
import type { UserRole } from '@/features/auth/types';
import { cn } from '@/lib/utils';
import { NAV_ITEMS } from './nav-items';

/**
 * Navigation principale (SH-46) — liens dépendants du rôle porté par le JWT.
 * L'état actif est signalé par la couleur ET le poids de police (jamais la couleur seule, R6).
 */
export function MainNav({ role }: { role: UserRole }) {
  return (
    <nav aria-label="Navigation principale" className="flex items-center gap-1 sm:gap-2">
      {NAV_ITEMS[role].map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
              'focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none',
              isActive
                ? 'bg-hud-pill text-hud-positive font-bold'
                : 'text-hud-muted hover:bg-hud-pill/60 font-medium hover:text-white',
            )
          }
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">{label}</span>
          {/* Sous 640px seule l'icône reste : le libellé accessible est préservé. */}
          <span className="sr-only sm:hidden">{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
```

- [ ] **Step 5: Lancer le test pour vérifier qu'il passe**

Run: `npm run test -- src/features/navigation/MainNav.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add frontend-web/src/features/navigation
git commit -m "feat(SH-46/frontend-web): navigation principale dépendante du rôle

La navigation reflète le RBAC du backend : aucun lien affiché ne mène à un 403.
Couverture : un FREELANCE ne voit pas Recherche, un RECRUITER ne voit pas
Mon Armurerie."
```

---

## Task 4 : Menu compte

**Files:**
- Create: `frontend-web/src/features/navigation/AccountMenu.tsx`
- Test: `frontend-web/src/features/navigation/AccountMenu.test.tsx`

**Interfaces:**
- Consumes: `InitialsAvatar` (Task 2), `useAuth()` → `{ user, logout }`.
- Produces: `<AccountMenu />` — lit la session lui-même, aucune prop.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `frontend-web/src/features/navigation/AccountMenu.test.tsx` :

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '@/features/auth/useAuth';
import { AccountMenu } from './AccountMenu';

function renderMenu(overrides: Partial<AuthContextValue> = {}) {
  const logout = vi.fn().mockResolvedValue(undefined);
  const value = {
    user: { userId: 'u-1', email: 'pilote@skillhunt.io', role: 'FREELANCE' as const },
    status: 'ready' as const,
    login: vi.fn(),
    verifyTwoFactor: vi.fn(),
    register: vi.fn(),
    logout,
    ...overrides,
  } as AuthContextValue;

  render(
    <MemoryRouter>
      <AuthContext.Provider value={value}>
        <AccountMenu />
      </AuthContext.Provider>
    </MemoryRouter>,
  );
  return { logout };
}

describe('AccountMenu', () => {
  it('expose un déclencheur nommé pour les lecteurs d\'écran', () => {
    renderMenu();
    expect(screen.getByRole('button', { name: /mon compte/i })).toBeInTheDocument();
  });

  it('ouvre le menu au clavier et propose la déconnexion', async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.tab();
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('menuitem', { name: /se déconnecter/i })).toBeInTheDocument();
  });

  it('déclenche la déconnexion', async () => {
    const user = userEvent.setup();
    const { logout } = renderMenu();
    await user.click(screen.getByRole('button', { name: /mon compte/i }));
    await user.click(await screen.findByRole('menuitem', { name: /se déconnecter/i }));
    expect(logout).toHaveBeenCalledOnce();
  });

  it('ne rend rien hors session', () => {
    renderMenu({ user: null });
    expect(screen.queryByRole('button', { name: /mon compte/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npm run test -- src/features/navigation/AccountMenu.test.tsx`
Expected: FAIL — `Failed to resolve import "./AccountMenu"`.

- [ ] **Step 3: Implémenter le menu**

Créer `frontend-web/src/features/navigation/AccountMenu.tsx` :

```tsx
import { LogOut, ShieldCheck, UserCog } from 'lucide-react';
import { DropdownMenu } from 'radix-ui';
import { useNavigate } from 'react-router-dom';
import { InitialsAvatar } from '@/components/ui/InitialsAvatar';
import { useAuth } from '@/features/auth/useAuth';

const ITEM_CLASS =
  'flex cursor-pointer items-center gap-2 rounded-sm px-3 py-2 text-sm text-white outline-none ' +
  'data-[highlighted]:bg-hud-pill data-[highlighted]:text-hud-positive';

/**
 * Menu compte (SH-46) — Radix fournit la navigation clavier, le piège de focus et les
 * rôles ARIA (`menu` / `menuitem`) : on ne réimplémente pas ce qui est déjà accessible.
 */
export function AccountMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  if (!user) return null;

  // L'email fait office de nom d'affichage : le JWT ne porte pas le username.
  const displayName = user.email.split('@')[0];

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        aria-label="Mon compte"
        className="focus-visible:ring-ring rounded-full focus-visible:ring-2 focus-visible:outline-none"
      >
        <InitialsAvatar name={displayName} size="sm" />
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="border-hud-border bg-hud-card z-50 min-w-56 rounded-lg border p-1 shadow-xl"
        >
          <div className="border-hud-border border-b px-3 py-2">
            <p className="truncate text-sm font-bold text-white">{displayName}</p>
            <p className="text-hud-muted truncate text-xs">{user.email}</p>
          </div>

          <DropdownMenu.Item className={ITEM_CLASS} onSelect={() => void navigate('/mon-compte')}>
            <UserCog className="h-4 w-4" aria-hidden="true" />
            Mon compte
          </DropdownMenu.Item>

          <DropdownMenu.Item
            className={ITEM_CLASS}
            onSelect={() => void navigate('/mon-compte#2fa')}
          >
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            Double authentification
          </DropdownMenu.Item>

          <DropdownMenu.Separator className="bg-hud-border my-1 h-px" />

          <DropdownMenu.Item className={ITEM_CLASS} onSelect={() => void logout()}>
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Se déconnecter
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `npm run test -- src/features/navigation/AccountMenu.test.tsx`
Expected: PASS (4 tests).

> Si Radix échoue dans jsdom sur `ResizeObserver`, ajouter le polyfill dans
> `src/test/setup.ts` : `globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };`

- [ ] **Step 5: Commit**

```bash
git add frontend-web/src/features/navigation/AccountMenu.tsx frontend-web/src/features/navigation/AccountMenu.test.tsx
git commit -m "feat(SH-46/frontend-web): menu compte accessible au clavier

Radix fournit rôles ARIA, navigation clavier et piège de focus : on ne
réimplémente pas un menu déjà accessible."
```

---

## Task 5 : Cloche de notification

**Files:**
- Create: `frontend-web/src/features/navigation/useUnreadMessages.ts`
- Create: `frontend-web/src/features/navigation/NotificationBell.tsx`
- Test: `frontend-web/src/features/navigation/NotificationBell.test.tsx`

**Interfaces:**
- Consumes: `getChatSocket()` depuis `@/features/chat/socket`, événement `message:new` portant un `ChatMessage`.
- Produces: `useUnreadMessages(): { hasUnread: boolean; markAllRead: () => void }` et `<NotificationBell />`.

**Contexte** : aucun endpoint de messages non lus n'existe côté backend (`chat.controller.ts` n'expose que `GET /conversations` et `GET /with/:userId`). La pastille reflète donc uniquement les messages **reçus pendant la session courante**, hors du fil consulté. C'est une limite assumée, documentée dans la spec §3.4.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `frontend-web/src/features/navigation/NotificationBell.test.tsx` :

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationBell } from './NotificationBell';

const handlers = new Map<string, (payload: unknown) => void>();

vi.mock('@/features/chat/socket', () => ({
  getChatSocket: () => ({
    on: (event: string, handler: (payload: unknown) => void) => handlers.set(event, handler),
    off: (event: string) => handlers.delete(event),
  }),
}));

function emitMessage() {
  handlers.get('message:new')?.({
    id: 'm-1',
    conversationId: 'a:b',
    senderId: 'other-user',
    body: 'Bonjour',
    createdAt: new Date().toISOString(),
  });
}

beforeEach(() => handlers.clear());
afterEach(() => vi.clearAllMocks());

describe('NotificationBell', () => {
  it('n\'annonce aucun message non lu au départ', () => {
    render(
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: /messages, aucun nouveau message/i })).toBeInTheDocument();
  });

  it('signale un message reçu pendant la session', async () => {
    render(
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>,
    );
    emitMessage();
    expect(
      await screen.findByRole('link', { name: /messages, nouveaux messages non lus/i }),
    ).toBeInTheDocument();
  });

  it('éteint la pastille quand on ouvre les messages', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>,
    );
    emitMessage();
    await user.click(await screen.findByRole('link', { name: /nouveaux messages/i }));
    expect(
      await screen.findByRole('link', { name: /aucun nouveau message/i }),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npm run test -- src/features/navigation/NotificationBell.test.tsx`
Expected: FAIL — `Failed to resolve import "./NotificationBell"`.

- [ ] **Step 3: Implémenter le hook**

Créer `frontend-web/src/features/navigation/useUnreadMessages.ts` :

```ts
import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { getChatSocket } from '@/features/chat/socket';

/**
 * Signal de message non lu (SH-46).
 *
 * Le backend n'expose AUCUN compteur de non-lus : la pastille ne reflète donc que les
 * messages reçus pendant la session courante. Un rechargement de page la remet à zéro —
 * limite assumée plutôt qu'un compteur inventé (spec §3.4).
 */
export function useUnreadMessages(): { hasUnread: boolean; markAllRead: () => void } {
  const [hasUnread, setHasUnread] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => {
    const socket = getChatSocket();
    // Un message reçu alors qu'on lit déjà les messages n'est pas « non lu ».
    const onMessage = () => {
      if (!pathname.startsWith('/messages')) setHasUnread(true);
    };
    socket.on('message:new', onMessage);
    return () => {
      socket.off('message:new', onMessage);
    };
  }, [pathname]);

  // Entrer dans la messagerie vaut lecture.
  useEffect(() => {
    if (pathname.startsWith('/messages')) setHasUnread(false);
  }, [pathname]);

  const markAllRead = useCallback(() => setHasUnread(false), []);

  return { hasUnread, markAllRead };
}
```

- [ ] **Step 4: Implémenter le composant**

Créer `frontend-web/src/features/navigation/NotificationBell.tsx` :

```tsx
import { Bell } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useUnreadMessages } from './useUnreadMessages';

/**
 * Cloche de notification (SH-46) — l'état est porté par le NOM ACCESSIBLE du lien,
 * pas seulement par la pastille colorée : un lecteur d'écran doit l'entendre (R6).
 */
export function NotificationBell() {
  const { hasUnread, markAllRead } = useUnreadMessages();

  return (
    <Link
      to="/messages"
      onClick={markAllRead}
      aria-label={hasUnread ? 'Messages, nouveaux messages non lus' : 'Messages, aucun nouveau message'}
      className="text-hud-muted hover:bg-hud-pill focus-visible:ring-ring relative rounded-md p-2 transition-colors hover:text-white focus-visible:ring-2 focus-visible:outline-none"
    >
      <Bell className="h-5 w-5" aria-hidden="true" />
      {hasUnread && (
        <span className="bg-hud-positive border-hud-card absolute top-1 right-1 h-2.5 w-2.5 rounded-full border-2" />
      )}
    </Link>
  );
}
```

- [ ] **Step 5: Lancer le test pour vérifier qu'il passe**

Run: `npm run test -- src/features/navigation/NotificationBell.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add frontend-web/src/features/navigation/useUnreadMessages.ts frontend-web/src/features/navigation/NotificationBell.tsx frontend-web/src/features/navigation/NotificationBell.test.tsx
git commit -m "feat(SH-46/frontend-web): cloche de notification adossée au socket

Aucun endpoint de non-lus n'existe : la pastille reflète les messages reçus
pendant la session, et l'état est porté par le nom accessible du lien."
```

---

## Task 6 : Assemblage du header

**Files:**
- Create: `frontend-web/src/features/navigation/AppHeader.tsx`
- Modify: `frontend-web/src/app/AppLayout.tsx`
- Test: `frontend-web/src/features/navigation/AppHeader.test.tsx`

**Interfaces:**
- Consumes: `MainNav` (Task 3), `AccountMenu` (Task 4), `NotificationBell` (Task 5), `useAuth()`.
- Produces: `<AppHeader />`, monté par `AppLayout`.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `frontend-web/src/features/navigation/AppHeader.test.tsx` :

```tsx
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '@/features/auth/useAuth';
import { AppHeader } from './AppHeader';

vi.mock('@/features/chat/socket', () => ({
  getChatSocket: () => ({ on: vi.fn(), off: vi.fn() }),
}));

function renderHeader(role: 'FREELANCE' | 'RECRUITER' | null) {
  const value = {
    user: role ? { userId: 'u-1', email: 'demo@skillhunt.io', role } : null,
    status: 'ready' as const,
    login: vi.fn(),
    verifyTwoFactor: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
  } as AuthContextValue;

  render(
    <MemoryRouter>
      <AuthContext.Provider value={value}>
        <AppHeader />
      </AuthContext.Provider>
    </MemoryRouter>,
  );
}

describe('AppHeader', () => {
  it('affiche le logo ramenant à l\'accueil', () => {
    renderHeader('RECRUITER');
    expect(screen.getByRole('link', { name: /skillhunt/i })).toHaveAttribute('href', '/');
  });

  it('assemble navigation, notifications et menu compte pour un recruteur', () => {
    renderHeader('RECRUITER');
    expect(screen.getByRole('navigation', { name: /navigation principale/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /messages, aucun nouveau/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /mon compte/i })).toBeInTheDocument();
  });

  it('hors session, n\'affiche ni navigation ni menu compte', () => {
    renderHeader(null);
    expect(screen.queryByRole('navigation', { name: /navigation principale/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /mon compte/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npm run test -- src/features/navigation/AppHeader.test.tsx`
Expected: FAIL — `Failed to resolve import "./AppHeader"`.

- [ ] **Step 3: Implémenter le header**

Créer `frontend-web/src/features/navigation/AppHeader.tsx` :

```tsx
import { Crosshair } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/features/auth/useAuth';
import { AccountMenu } from './AccountMenu';
import { MainNav } from './MainNav';
import { NotificationBell } from './NotificationBell';

/**
 * En-tête applicatif (SH-46) : logo, navigation par rôle, notifications, menu compte.
 * Hors session, seul le logo subsiste — il n'y a pas de rôle sur lequel fonder la navigation.
 */
export function AppHeader() {
  const { user } = useAuth();

  return (
    <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-4 px-4">
      <Link
        to="/"
        className="focus-visible:ring-ring flex items-center gap-2 rounded-md focus-visible:ring-2 focus-visible:outline-none"
      >
        <Crosshair className="text-hud-positive h-7 w-7" aria-hidden="true" />
        <span className="text-lg font-bold tracking-widest text-white">
          SKILL<span className="text-hud-positive">HUNT</span>
        </span>
      </Link>

      {user && <MainNav role={user.role} />}

      <div className="flex items-center gap-1">
        {user && (
          <>
            <NotificationBell />
            <AccountMenu />
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Monter le header dans AppLayout**

Remplacer `frontend-web/src/app/AppLayout.tsx` :

```tsx
import { Outlet } from 'react-router-dom';
import { AppHeader } from '@/features/navigation/AppHeader';

/** Coquille des écrans authentifiés (SH-46) : bannière commune + zone de contenu. */
export default function AppLayout() {
  return (
    <div className="bg-hud-bg flex min-h-screen flex-col">
      <header
        role="banner"
        className="border-hud-border bg-hud-card sticky top-0 z-40 border-b"
      >
        <AppHeader />
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}
```

- [ ] **Step 5: Lancer la suite complète**

Run: `npm run test`
Expected: PASS. `AppLayout.test.tsx` doit être enveloppé d'un `AuthContext.Provider` — si ce test échoue sur `useAuth doit être utilisé à l'intérieur d'un <AuthProvider>`, l'entourer du même provider que `AppHeader.test.tsx`.

- [ ] **Step 6: Vérifier dans le navigateur**

```bash
docker compose --profile app up -d --build frontend-web gateway
```

Ouvrir `http://localhost:8088/mon-armurerie` connecté en freelance : le header doit être présent, la nav doit montrer « Mon Armurerie » et « Messages », l'avatar doit ouvrir le menu au clavier.

- [ ] **Step 7: Commit**

```bash
npm run format
git add frontend-web/src
git commit -m "feat(SH-46/frontend-web): assemblage du header applicatif

Logo, navigation par rôle, cloche et menu compte réunis dans AppLayout :
toutes les pages authentifiées héritent de la coquille."
```

---

## Task 7 : Cartes « Gear Locker »

**Files:**
- Modify: `frontend-web/src/features/gear/GearCard.tsx`
- Modify: `frontend-web/src/features/gear/GearCard.test.tsx`

**Interfaces:**
- Consumes: types `Gear` existants (`@/features/gear/types`), `GearStatusBadge`, `gear-meta`.
- Produces: aucun changement d'API du composant — restyle uniquement.

- [ ] **Step 1: Lire l'existant**

Run: `cat frontend-web/src/features/gear/GearCard.tsx frontend-web/src/features/gear/GearCard.test.tsx`

Relever la signature exacte des props et les assertions existantes : elles doivent toutes rester vertes.

- [ ] **Step 2: Ajouter le test du nouvel affordance visuel**

Ajouter à `GearCard.test.tsx`, dans le `describe` existant :

```tsx
it('affiche le statut en toutes lettres, pas seulement par la couleur', () => {
  render(
    <GearCard
      gear={{
        id: 'g-1',
        brand: 'DJI',
        model: 'Mavic 3 Enterprise',
        serialNumber: 'SN-DEMO-0001',
        category: 'DRONE',
        status: 'PENDING',
        isInLoadout: false,
        createdAt: '2026-07-18T10:00:00.000Z',
        freelanceId: 'f-1',
      }}
    />,
  );
  expect(screen.getByText(/en attente/i)).toBeInTheDocument();
});
```

- [ ] **Step 3: Lancer le test**

Run: `npm run test -- src/features/gear/GearCard.test.tsx`
Expected: PASS si `GearStatusBadge` porte déjà un libellé ; sinon FAIL → ajouter le libellé texte au badge.

- [ ] **Step 4: Appliquer le style du prototype**

Sur le conteneur racine de `GearCard`, appliquer :

```tsx
className="group border-hud-border bg-hud-card hover:border-hud-positive relative flex flex-col gap-3 overflow-hidden rounded-lg border p-5 transition-colors"
```

Ajouter en haut de carte la ligne catégorie / statut :

```tsx
<div className="flex items-start justify-between gap-2">
  <span className="text-hud-muted text-xs font-bold tracking-widest uppercase">
    {GEAR_CATEGORY_LABELS[gear.category]}
  </span>
  <GearStatusBadge status={gear.status} />
</div>
```

> Réutiliser la table de libellés déjà exportée par `gear-meta.ts`. Ne pas en créer une seconde.

- [ ] **Step 5: Vérifier la non-régression**

Run: `npm run test -- src/features/gear && npm run lint`
Expected: PASS, y compris `gear-meta.test.ts` (aucune couleur hexadécimale introduite).

- [ ] **Step 6: Commit**

```bash
npm run format
git add frontend-web/src/features/gear
git commit -m "feat(SH-46/frontend-web): cartes matériel façon Gear Locker

Puce catégorie, badge de statut avec libellé texte et bordure active au survol."
```

---

## Task 8 : Recherche en split-view

**Files:**
- Modify: `frontend-web/src/pages/Search.tsx`
- Modify: `frontend-web/src/pages/Search.test.tsx`
- Create: `frontend-web/src/features/matching/SearchFilters.tsx`
- Create: `frontend-web/src/features/matching/SearchResultCard.tsx`

**Interfaces:**
- Consumes: `useMatchSearch()`, `SearchMap`, `CITIES`, `MatchResult`.
- Produces:
  - `<SearchFilters onSubmit={(criteria: { skills: string[]; lat: number; lon: number; radiusKm: number }) => void} isPending={boolean} error={string | null} />`
  - `<SearchResultCard result={MatchResult} isHighlighted={boolean} onHover={(id: string | null) => void} />`

**Note de décomposition** : `Search.tsx` dépasse déjà 200 lignes et va grossir. On en extrait le formulaire et la carte de résultat — chacun testable isolément, conformément au découpage par feature du projet.

- [ ] **Step 1: Extraire SearchFilters**

Créer `frontend-web/src/features/matching/SearchFilters.tsx` en déplaçant **tel quel** le `<form>` de `Search.tsx` (lignes du `handleSubmit` et du JSX de formulaire), avec la validation client existante (compétences non vides, rayon entre 1 et 500). Le composant appelle `onSubmit(criteria)` au lieu de `search.mutate`.

Conserver mot pour mot les libellés existants — les tests de `Search.test.tsx` s'y appuient :
« Compétences recherchées (séparées par des virgules) », « Lieu de mission », « Rayon (km) », « Lancer la recherche ».

- [ ] **Step 2: Vérifier que les tests existants passent toujours**

Run: `npm run test -- src/pages/Search.test.tsx`
Expected: PASS sans modification des assertions — l'extraction ne change pas le DOM rendu.

- [ ] **Step 3: Commit de l'extraction**

```bash
npm run format
git add frontend-web/src/features/matching/SearchFilters.tsx frontend-web/src/pages/Search.tsx
git commit -m "refactor(SH-46/frontend-web): extraction du formulaire de recherche

Prépare le passage en split-view sans changer le DOM rendu."
```

- [ ] **Step 4: Écrire le test du split-view**

Ajouter à `frontend-web/src/pages/Search.test.tsx` :

```tsx
it('présente les résultats dans une liste nommée', async () => {
  // … déclencher une recherche via les helpers existants du fichier …
  expect(
    await screen.findByRole('list', { name: /résultats de la recherche/i }),
  ).toBeInTheDocument();
});
```

- [ ] **Step 5: Lancer le test pour vérifier qu'il échoue**

Run: `npm run test -- src/pages/Search.test.tsx`
Expected: FAIL — aucune liste nommée « résultats de la recherche ».

- [ ] **Step 6: Restructurer Search.tsx en split-view**

Structure cible du `return` :

```tsx
return (
  <div className="flex h-[calc(100vh-4rem)] flex-col">
    {/* Barre de filtres pleine largeur */}
    <div className="border-hud-border bg-hud-card border-b p-4">
      <SearchFilters onSubmit={handleSearch} isPending={search.isPending} error={error} />
    </div>

    {/* Split : liste à gauche, carte à droite. Sous 1024px, la carte passe SOUS la liste
        (Mobile-First, §6 du CLAUDE.md) — d'où flex-col lg:flex-row. */}
    <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
      <div className="border-hud-border w-full overflow-y-auto p-4 lg:w-96 lg:border-r">
        {search.isPending && (
          <p role="status" className="text-hud-muted">
            Calcul des scores de matching…
          </p>
        )}

        {search.isSuccess && search.data.length === 0 && (
          <p className="text-hud-muted border-hud-border rounded-lg border border-dashed p-10 text-center">
            Aucun freelance ne correspond à ces critères. Élargis le rayon ou retire des
            compétences.
          </p>
        )}

        {search.isSuccess && search.data.length > 0 && (
          <ul aria-label="Résultats de la recherche" className="flex flex-col gap-3">
            {search.data.map((result) => (
              <SearchResultCard
                key={result.freelanceId}
                result={result}
                isHighlighted={highlightedId === result.freelanceId}
                onHover={setHighlightedId}
              />
            ))}
          </ul>
        )}
      </div>

      <div className="min-h-80 flex-1">
        {submittedArea && (
          <Suspense fallback={null}>
            <SearchMap
              center={{ lat: submittedArea.lat, lon: submittedArea.lon }}
              radiusKm={submittedArea.radiusKm}
              results={search.data ?? []}
              highlightedId={highlightedId}
            />
          </Suspense>
        )}
      </div>
    </div>
  </div>
);
```

Ajouter l'état de survol : `const [highlightedId, setHighlightedId] = useState<string | null>(null);`

- [ ] **Step 7: Propager la mise en évidence dans SearchMap**

Dans `frontend-web/src/features/matching/SearchMap.tsx`, ajouter la prop optionnelle
`highlightedId?: string | null` et augmenter le rayon du marqueur correspondant. Réutiliser
la classe CSS `.map-freelance-marker` existante ; ajouter au besoin dans `index.css` :

```css
.map-freelance-marker--highlighted {
  stroke: var(--color-hud-positive);
  stroke-width: 3;
  fill-opacity: 0.85;
}
```

- [ ] **Step 8: Lancer les tests**

Run: `npm run test -- src/pages/Search.test.tsx src/features/matching`
Expected: PASS.

- [ ] **Step 9: Vérifier dans le navigateur**

Sur `http://localhost:8088/recherche` en recruteur : filtres en haut, liste à gauche, carte à droite en ≥1024px ; carte sous la liste en 375px de large.

- [ ] **Step 10: Commit**

```bash
npm run format
git add frontend-web/src
git commit -m "feat(SH-46/frontend-web): recherche en split-view liste + carte

Filtres en barre haute, liste scrollable et carte plein cadre au-delà de
1024px, empilement sous ce seuil (Mobile-First). Le survol d'une fiche met
en évidence le marqueur correspondant."
```

---

## Task 9 : En-tête de profil freelance

**Files:**
- Modify: `frontend-web/src/pages/FreelanceGear.tsx`
- Modify: `frontend-web/src/pages/FreelanceGear.test.tsx`

**Interfaces:**
- Consumes: `useFreelanceGear()`, `useGamification()` (variante publique `freelance/:id`), `InitialsAvatar` (Task 2), `LoadoutRow`, `GearGrid`.
- Produces: aucun nouvel export.

- [ ] **Step 1: Lire l'existant**

Run: `cat frontend-web/src/pages/FreelanceGear.tsx`

Relever le nom d'utilisateur disponible et les données de gamification déjà chargées (SH-21b/21c : loadout en tête, niveau et badges obtenus, **sans XP chiffré**).

- [ ] **Step 2: Ajouter le test de l'en-tête**

Ajouter à `FreelanceGear.test.tsx` :

```tsx
it('présente le freelance dans un en-tête de profil', async () => {
  // … monter la page avec les handlers MSW existants …
  expect(await screen.findByRole('heading', { name: /demopilote/i })).toBeInTheDocument();
});
```

- [ ] **Step 3: Implémenter l'en-tête**

Insérer avant le loadout, en réutilisant les données déjà chargées (aucun appel réseau supplémentaire) :

```tsx
<header className="border-hud-border bg-hud-card flex flex-wrap items-center gap-6 rounded-xl border p-6">
  <InitialsAvatar name={username} size="lg" />
  <div className="min-w-0 flex-1">
    <h1 className="truncate text-2xl font-bold tracking-widest text-white uppercase">
      {username}
    </h1>
    {profile && <p className="text-hud-positive font-semibold">{profile.levelLabel}</p>}
  </div>
</header>
```

> Champs vérifiés dans `src/api/schema.d.ts` : `PublicGamificationProfileDto` expose
> `{ level: number; levelLabel: string; badges: PublicBadgeDto[] }`. Il **n'expose pas `xp`**,
> contrairement à `GamificationProfileDto` — c'est voulu (SH-21c : pas d'XP chiffré en vue
> publique). Ne pas afficher d'XP ici.

- [ ] **Step 4: Lancer les tests**

Run: `npm run test -- src/pages/FreelanceGear.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run format
git add frontend-web/src/pages/FreelanceGear.tsx frontend-web/src/pages/FreelanceGear.test.tsx
git commit -m "feat(SH-46/frontend-web): en-tête de profil sur l'armurerie publique

Avatar, nom et niveau — sans XP chiffré, conformément à SH-21c."
```

---

## Task 10 : Messagerie en deux colonnes

**Files:**
- Modify: `frontend-web/src/pages/Messages.tsx`
- Modify: `frontend-web/src/pages/MessageThread.tsx`
- Modify: les tests associés

**Interfaces:**
- Consumes: `useConversations()`, `useChatThread()`, `InitialsAvatar` (Task 2).
- Produces: aucun nouvel export.

- [ ] **Step 1: Lire l'existant**

Run: `cat frontend-web/src/pages/Messages.tsx frontend-web/src/pages/MessageThread.tsx`

- [ ] **Step 2: Styler la liste de conversations**

Chaque entrée : `InitialsAvatar` (taille `sm`), nom de l'interlocuteur en gras, extrait du dernier message tronqué (`truncate`), horodatage court à droite. Entrée active : `bg-hud-pill border-l-2 border-hud-positive`.

- [ ] **Step 3: Styler le fil**

Bulles asymétriques : message reçu à gauche sur `bg-hud-card`, message envoyé à droite sur `bg-hud-icon/20`. Horodatage sous chaque bulle en `text-hud-muted text-xs`. Zone de saisie en bas, collée, sur `bg-hud-card` avec bordure haute.

L'appartenance d'un message se déduit de `senderId === user.userId` — ne pas se fier à l'ordre.

- [ ] **Step 4: Traiter l'état vide**

Aucune conversation :

```tsx
<p className="text-hud-muted border-hud-border rounded-lg border border-dashed p-10 text-center">
  Aucune conversation pour l'instant. Contacte un freelance depuis son armurerie pour démarrer un échange.
</p>
```

- [ ] **Step 5: Lancer les tests**

Run: `npm run test -- src/pages/Messages.test.tsx src/pages/MessageThread.test.tsx`
Expected: PASS — mettre à jour les sélecteurs cassés sans affaiblir les assertions.

- [ ] **Step 6: Commit**

```bash
npm run format
git add frontend-web/src/pages
git commit -m "feat(SH-46/frontend-web): messagerie en deux colonnes

Liste de conversations à gauche, fil à droite, bulles asymétriques et
état vide traité."
```

---

## Task 11 : Point de validation — priorité 1 terminée

- [ ] **Step 1: Suite complète**

Run: `npm run lint && npm run test && npm run format:check && npm run build`
Expected: tout vert.

- [ ] **Step 2: Recette navigateur sur la stack conteneurisée**

```bash
docker compose --profile app up -d --build
bash scripts/seed-demo.sh
```

Parcourir en 1280px **puis en 375px** : `/mon-armurerie`, `/recherche`, `/freelances/:id/armurerie`, `/messages`. Vérifier header présent partout, navigation correcte par rôle, aucun débordement horizontal.

- [ ] **Step 3: Restituer à l'utilisatrice avant d'entamer la priorité 2**

---

## Task 12 : Priorité 2 — écrans publics et compte

**Files:**
- Modify: `frontend-web/src/pages/Home.tsx`, `Login.tsx`, `Register.tsx`, `Account.tsx`, `AddGear.tsx`, `NotFound.tsx`
- Modify: les tests associés

- [ ] **Step 1: Accueil**

Remplacer le contenu de `Home.tsx` par un hero : logo `Crosshair` + « SKILLHUNT », accroche « La preuve de compétence par l'image et la donnée technique », puis les CTA existants (`Se connecter` / `Créer un compte` hors session, `Mon compte` en session). **Conserver les libellés de boutons existants** — les tests s'y appuient.

- [ ] **Step 2: Connexion et inscription**

Envelopper le formulaire dans une carte centrée :

```tsx
<div className="flex flex-1 items-center justify-center p-4">
  <div className="border-hud-border bg-hud-card w-full max-w-md rounded-xl border p-8">
    {/* logo + titre + formulaire existant, inchangés */}
  </div>
</div>
```

- [ ] **Step 3: Compte**

Carte HUD, sections séparées par des bordures, et **ancre `id="deux-facteurs"`** sur la section double authentification (le menu compte y renvoie via `/mon-compte#deux-facteurs`).

> ⚠️ L'ancre est `deux-facteurs`, **pas `2fa`** : la chaîne `#2fa` est de l'hexadécimal valide et
> déclenche un faux positif du garde anti-couleur-en-dur (Task 4). Le libellé français est de toute
> façon plus cohérent avec la convention du projet.

- [ ] **Step 4: Ajout de matériel et 404**

Même traitement en carte. Sur `NotFound.tsx`, ajouter un lien de retour à l'accueil.

- [ ] **Step 5: Suite complète**

Run: `npm run lint && npm run test && npm run format:check && npm run build`
Expected: tout vert.

- [ ] **Step 6: Commit**

```bash
npm run format
git add frontend-web/src
git commit -m "feat(SH-46/frontend-web): écrans publics et compte au thème HUD

Accueil en hero, formulaires d'authentification en carte centrée, ancre 2fa
sur la page compte pour le menu déroulant."
```

---

## Task 13 : Clôture

- [ ] **Step 1: Recette complète**

Rejouer la Task 11 Step 2 sur l'ensemble des écrans, y compris `/`, `/login`, `/register`, `/404`.

- [ ] **Step 2: Vérifier qu'aucune couleur en dur n'a été introduite**

Run: `npm run test -- src/features/gear/gear-meta.test.ts`
Expected: PASS.

- [ ] **Step 3: Ouvrir la PR vers develop**

À faire **uniquement sur demande explicite de l'utilisatrice** (règle §11 du CLAUDE.md).

```bash
git push -u origin feature/SH-46-refonte-ui-hud
gh pr create --base develop --title "feat(SH-46): refonte UI HUD" --body "…"
```

Ne jamais passer `--delete-branch` au merge : les branches sont une preuve de traçabilité pour le jury.
