# SH-51 — Retouches UX avant soutenance · Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corriger douze scories d'interface relevées sur la démonstration — rôles affichés en anglais, Armurerie visible chez le recruteur, cloche redondante, identité d'onglet par défaut, email affiché au lieu du nom, mot de passe faible, page d'arrivée inadaptée, recherche peu visuelle et matériel saisi à la main.

**Architecture:** Aucune dépendance nouvelle, aucun changement structurant. Trois idées directrices : (1) `NAV_ITEMS` devient la **source unique** de ce qu'un rôle a le droit de voir et de son écran d'arrivée, ce qui empêche la régression « Armurerie chez le recruteur » de se reproduire d'un seul côté ; (2) la règle de mot de passe est durcie **des deux côtés** — le front ne peut pas être plus strict que le DTO sans devenir décoratif ; (3) le catalogue de matériel **assiste** la saisie sans jamais la contraindre, via `<datalist>` natif.

**Tech Stack:** React 19 · TypeScript strict · Vite · Tailwind (tokens `--color-hud-*`) · React Router · Vitest + React Testing Library + MSW · NestJS 11 · class-validator · Jest.

## Global Constraints

- **Branche :** `feature/SH-51-retouches-ux-demo`, déjà créée depuis `develop`. **Ne jamais pousser ni ouvrir de PR sans demande explicite.**
- **Langue :** commentaires et textes d'interface en **français** ; identifiants (variables, fonctions, classes) en **anglais**.
- **Aucune couleur hexadécimale dans un composant.** `src/features/gear/gear-meta.test.ts` scanne `src/features/gear`, `src/features/gamification`, `src/features/navigation`, `src/components/ui` et `src/lib` — un `#2ee6a8` dans l'un de ces dossiers fait échouer la CI. Utiliser `currentColor`, les classes Tailwind (`text-hud-positive`) ou `var(--color-hud-*)`.
- **Traçabilité RNCP :** référencer la compétence en commentaire quand un bloc l'illustre (`// Validation stricte des entrées (C2.2.3)`).
- **Prettier :** lancer `npm run format` dans le service touché avant chaque commit — `format:check` est vérifié en CI.
- **MSW :** `onUnhandledRequest: 'error'`. Tout appel HTTP non simulé fait échouer le test.
- **Aucun secret en dur.** Aucune requête brute. Aucune donnée externe non validée.
- **Commits :** Conventional Commits, scope `(SH-51/front)` ou `(SH-51/back)`. Un commit par tâche. Terminer chaque message par :
  ```
  Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
  ```
- **Ne pas toucher `src/pages/Login.tsx`** pour la règle de mot de passe (tâche 6) : durcir la validation à la **connexion** verrouillerait dehors tous les comptes créés sous l'ancienne règle des 8 caractères.
- **Ne JAMAIS utiliser `git add -A` ni `git add .`.** Les additions au `.gitignore` qui excluent
  les supports de soutenance vivent sur `chore/SH-51a-docs-soutenance`, pas sur cette branche :
  `docs/soutenance/*.pptx` et `*.pdf` (5,4 Mo) y apparaissent donc en non suivis. Les ajouter à
  l'historique est une décision qui a été prise en sens inverse. Stager fichier par fichier,
  comme le fait chaque commande de commit de ce plan.
- **Commandes :** front → `cd frontend-web` puis `npm run test`, `npm run lint`, `npm run build`. Back → `cd backend-core` puis `npm run test`, `npm run lint`, `npm run build`.

---

## Structure des fichiers

**Créés**

| Fichier | Responsabilité |
|---|---|
| `frontend-web/src/features/auth/role-labels.ts` | Libellés français des rôles |
| `frontend-web/src/features/auth/role-labels.test.ts` | Garde d'exhaustivité de la table |
| `frontend-web/src/features/auth/display-name.ts` | Nom d'affichage, avec repli pour les tokens sans `username` |
| `frontend-web/src/features/auth/display-name.test.ts` | Couvre le repli |
| `frontend-web/src/features/auth/password-rules.ts` | Règles de mot de passe, miroir du DTO |
| `frontend-web/src/features/auth/password-rules.test.ts` | Vérifie chaque règle |
| `frontend-web/src/features/navigation/home-route.ts` | Écran d'arrivée par rôle, dérivé de `NAV_ITEMS` |
| `frontend-web/src/features/navigation/home-route.test.ts` | Garde : jamais d'écran interdit au rôle |
| `frontend-web/src/components/ui/BrandMark.tsx` | Logo SkillHunt, tracé unique |
| `frontend-web/src/components/ui/BrandMark.test.tsx` | Présence et neutralité accessible |
| `frontend-web/src/features/matching/skill-suggestions.ts` | Compétences suggérées |
| `frontend-web/src/features/gear/gear-catalog.ts` | Catalogue marques/modèles + accesseurs |
| `frontend-web/src/features/gear/gear-catalog.test.ts` | Recherche insensible à la casse |
| `docs/tickets/SH-52-photo-de-profil.md` | Hors périmètre, tracé |
| `docs/tickets/SH-53-verification-email.md` | Hors périmètre, tracé |

**Modifiés**

| Fichier | Nature |
|---|---|
| `frontend-web/src/pages/Account.tsx` | Rôle en français, actions dérivées du rôle, nom affiché |
| `frontend-web/src/pages/Account.test.tsx` | Scénarios 1, 2, 6 |
| `frontend-web/src/features/navigation/AppHeader.tsx` | Cloche retirée, `BrandMark` |
| `frontend-web/src/features/navigation/AppHeader.test.tsx` | Attente de la cloche retirée |
| `frontend-web/src/features/navigation/AccountMenu.tsx` | Nom d'affichage partagé |
| `frontend-web/src/pages/Home.tsx` | `BrandMark`, redirection par rôle |
| `frontend-web/src/pages/Login.tsx` | Redirection par rôle (mot de passe **inchangé**) |
| `frontend-web/src/pages/Register.tsx` | Règles en direct, confirmation, redirection |
| `frontend-web/src/pages/Register.test.tsx` | Scénarios 8 et 9 |
| `frontend-web/src/features/auth/types.ts` | `username?: string` |
| `frontend-web/src/features/auth/token.ts` | Décodage tolérant à l'absence de `username` |
| `frontend-web/src/features/matching/SearchFilters.tsx` | Titre court, puces, curseur |
| `frontend-web/src/pages/Search.tsx` | Carte visible dès l'arrivée |
| `frontend-web/src/pages/Search.test.tsx` | Scénarios 10 et 12 |
| `frontend-web/src/pages/AddGear.tsx` | Champs assistés par le catalogue |
| `frontend-web/src/pages/AddGear.test.tsx` | Scénarios 13 et 14 |
| `frontend-web/index.html` | Titre d'onglet |
| `frontend-web/public/favicon.svg` | Logo SkillHunt |
| `backend-core/src/auth/guards/jwt-auth.guard.ts` | `username` dans `JwtPayload` |
| `backend-core/src/auth/auth.service.ts` | `username` porté dans le payload émis |
| `backend-core/src/auth/dto/register.dto.ts` | Règle de mot de passe + Swagger |
| `docs/BACKLOG.md` | Ligne SH-51 et hors-périmètre |
| `docs/soutenance/GUIDE_DEMO_JOUR_J.md` | Ligne 226 : la règle a changé |

**Supprimés**

| Fichier | Raison |
|---|---|
| `frontend-web/src/features/navigation/NotificationBell.tsx` | Doublon du lien Messages |
| `frontend-web/src/features/navigation/NotificationBell.test.tsx` | Son test |
| `frontend-web/src/features/navigation/useUnreadMessages.ts` | Consommé par la seule cloche |

---

## Task 1 : Libellés de rôle en français

**Files:**
- Create: `frontend-web/src/features/auth/role-labels.ts`
- Test: `frontend-web/src/features/auth/role-labels.test.ts`
- Modify: `frontend-web/src/pages/Account.tsx:32`
- Test: `frontend-web/src/pages/Account.test.tsx`

**Interfaces:**
- Consumes: `UserRole` depuis `@/features/auth/types`.
- Produces: `ROLE_LABELS: Record<UserRole, string>` — consommé par les tâches 2 et 5.

- [ ] **Step 1 : Écrire le test qui échoue**

Créer `frontend-web/src/features/auth/role-labels.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { ROLE_LABELS } from './role-labels';

describe('ROLE_LABELS (SH-51)', () => {
  it('traduit chaque rôle en français', () => {
    expect(ROLE_LABELS.FREELANCE).toBe('Freelance');
    expect(ROLE_LABELS.RECRUITER).toBe('Recruteur');
    expect(ROLE_LABELS.ADMIN).toBe('Administrateur');
  });

  it("n'expose jamais une valeur technique à l'écran", () => {
    // Un libellé tout en majuscules non accentuées trahirait la valeur d'enum brute.
    for (const label of Object.values(ROLE_LABELS)) {
      expect(label).not.toMatch(/^[A-Z_]+$/);
    }
  });
});
```

- [ ] **Step 2 : Lancer le test et vérifier qu'il échoue**

Run: `cd frontend-web && npx vitest run src/features/auth/role-labels.test.ts`
Expected: FAIL — `Failed to resolve import "./role-labels"`.

- [ ] **Step 3 : Écrire l'implémentation minimale**

Créer `frontend-web/src/features/auth/role-labels.ts` :

```ts
import type { UserRole } from './types';

/**
 * Libellés d'affichage des rôles (SH-51).
 *
 * La valeur technique du JWT (`RECRUITER`) ne doit jamais atteindre l'écran : l'interface
 * est en français (CLAUDE.md §7). `Record<UserRole, string>` rend la table exhaustive par
 * construction — un rôle ajouté côté backend casse la compilation ici plutôt que de
 * s'afficher en anglais.
 */
export const ROLE_LABELS: Record<UserRole, string> = {
  FREELANCE: 'Freelance',
  RECRUITER: 'Recruteur',
  ADMIN: 'Administrateur',
};
```

- [ ] **Step 4 : Lancer le test et vérifier qu'il passe**

Run: `cd frontend-web && npx vitest run src/features/auth/role-labels.test.ts`
Expected: PASS — 2 tests.

- [ ] **Step 5 : Écrire le test d'affichage sur la page compte**

Ajouter dans `frontend-web/src/pages/Account.test.tsx`, à la fin du fichier :

```ts
describe('Page Mon compte — libellé du rôle (SH-51)', () => {
  it('affiche « Freelance » et jamais la valeur technique', async () => {
    renderAccount();
    expect(await screen.findByText('Freelance')).toBeInTheDocument();
    expect(screen.queryByText('FREELANCE')).not.toBeInTheDocument();
  });
});
```

> Le `TOKEN` du harnais porte déjà `role: 'FREELANCE'`. La classe CSS `uppercase` change le
> rendu visuel mais **pas** le texte du DOM : `getByText('Freelance')` reste juste.

- [ ] **Step 6 : Lancer le test et vérifier qu'il échoue**

Run: `cd frontend-web && npx vitest run src/pages/Account.test.tsx`
Expected: FAIL — `Unable to find an element with the text: Freelance`, la page affichant encore `FREELANCE`.

- [ ] **Step 7 : Brancher la table sur la page**

Dans `frontend-web/src/pages/Account.tsx`, ajouter l'import :

```tsx
import { ROLE_LABELS } from '@/features/auth/role-labels';
```

puis remplacer la ligne du rôle :

```tsx
          <p className="text-hud-muted text-sm tracking-widest uppercase">{user?.role}</p>
```

par :

```tsx
          {/* Libellé français, jamais la valeur d'enum du JWT (SH-51). */}
          <p className="text-hud-muted text-sm tracking-widest uppercase">
            {user ? ROLE_LABELS[user.role] : null}
          </p>
```

- [ ] **Step 8 : Lancer les tests et vérifier qu'ils passent**

Run: `cd frontend-web && npx vitest run src/pages/Account.test.tsx src/features/auth/role-labels.test.ts`
Expected: PASS.

- [ ] **Step 9 : Formater et committer**

```bash
cd frontend-web && npm run format && cd ..
git add frontend-web/src/features/auth/role-labels.ts frontend-web/src/features/auth/role-labels.test.ts frontend-web/src/pages/Account.tsx frontend-web/src/pages/Account.test.tsx
git commit -m "feat(SH-51/front): affiche le role en francais sur la page compte

La valeur d'enum du JWT atteignait l'ecran : un recruteur lisait RECRUITER.
La table ROLE_LABELS est un Record<UserRole, string>, donc exhaustive par
construction — un role ajoute cote backend casse la compilation ici plutot
que de s'afficher en anglais.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2 : Actions du compte dérivées du rôle

Corrige la fuite : un `RECRUITER` voit aujourd'hui un bouton « Mon Armurerie » qui le mène à un 403.

**Files:**
- Modify: `frontend-web/src/pages/Account.tsx:35-46`
- Test: `frontend-web/src/pages/Account.test.tsx`

**Interfaces:**
- Consumes: `NAV_ITEMS` depuis `@/features/navigation/nav-items` (`Record<UserRole, readonly NavItem[]>`, `NavItem = { to: string; label: string; icon: LucideIcon }`).
- Produces: rien de nouveau.

- [ ] **Step 1 : Écrire les tests d'étanchéité qui échouent**

Ajouter dans `frontend-web/src/pages/Account.test.tsx` :

```ts
const RECRUITER_TOKEN = fakeJwt({
  userId: 'u-2',
  email: 'recruteur@skillhunt.io',
  role: 'RECRUITER',
});

describe('Page Mon compte — étanchéité RBAC des actions (SH-51)', () => {
  it("propose l'Armurerie à un freelance", async () => {
    renderAccount();
    expect(await screen.findByRole('link', { name: /mon armurerie/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /recherche/i })).not.toBeInTheDocument();
  });

  it("ne propose jamais l'Armurerie à un recruteur", async () => {
    server.use(
      http.post(url('/api/v1/auth/refresh'), () =>
        HttpResponse.json({ accessToken: RECRUITER_TOKEN, refreshToken: 'r' }),
      ),
    );
    renderAccount();
    expect(await screen.findByRole('link', { name: /recherche/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /armurerie/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2 : Lancer les tests et vérifier qu'ils échouent**

Run: `cd frontend-web && npx vitest run src/pages/Account.test.tsx`
Expected: FAIL sur le second test — `Unable to find an element with the role "link" and name /recherche/i`, la page codant ses boutons en dur.

- [ ] **Step 3 : Dériver les actions de la navigation**

Dans `frontend-web/src/pages/Account.tsx`, ajouter l'import :

```tsx
import { NAV_ITEMS } from '@/features/navigation/nav-items';
```

puis remplacer tout le bloc d'actions :

```tsx
        <div className="border-hud-border flex w-full flex-wrap justify-center gap-3 border-t pt-6">
          <Button asChild>
            <Link to="/mon-armurerie">Mon Armurerie</Link>
          </Button>
          {/* Chat contextuel (SH-24) : point d'entrée des deux rôles vers leurs conversations */}
          <Button asChild variant="outline">
            <Link to="/messages">Messages</Link>
          </Button>
          <Button variant="outline" onClick={handleLogout}>
            Se déconnecter
          </Button>
        </div>
```

par :

```tsx
        {/* Les actions DÉRIVENT de la navigation par rôle (SH-51) : `nav-items.ts` reste la
            source unique de ce qu'un rôle a le droit de voir. Codées en dur, elles avaient
            divergé — un RECRUITER se voyait proposer l'Armurerie, donc un 403. */}
        <div className="border-hud-border flex w-full flex-wrap justify-center gap-3 border-t pt-6">
          {user &&
            NAV_ITEMS[user.role].map(({ to, label }, index) => (
              <Button key={to} asChild variant={index === 0 ? 'default' : 'outline'}>
                <Link to={to}>{label}</Link>
              </Button>
            ))}
          <Button variant="outline" onClick={handleLogout}>
            Se déconnecter
          </Button>
        </div>
```

- [ ] **Step 4 : Lancer les tests et vérifier qu'ils passent**

Run: `cd frontend-web && npx vitest run src/pages/Account.test.tsx`
Expected: PASS.

- [ ] **Step 5 : Vérifier qu'aucun autre test ne dépendait des boutons en dur**

Run: `cd frontend-web && npm run test`
Expected: PASS sur toute la suite. Si un test échoue en cherchant « Messages » sur la page compte, il est toujours satisfait — `Messages` figure dans `NAV_ITEMS` des trois rôles.

- [ ] **Step 6 : Formater et committer**

```bash
cd frontend-web && npm run format && cd ..
git add frontend-web/src/pages/Account.tsx frontend-web/src/pages/Account.test.tsx
git commit -m "fix(SH-51/front): aligne les actions du compte sur le RBAC du role

Les boutons etaient codes en dur et avaient diverge de nav-items.ts : un
recruteur se voyait proposer Mon Armurerie, donc un 403. Ils derivent
desormais de NAV_ITEMS, seule source de ce qu'un role a le droit de voir,
et la regression ne peut plus se reproduire d'un seul cote.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3 : Suppression de la cloche redondante

**Files:**
- Delete: `frontend-web/src/features/navigation/NotificationBell.tsx`
- Delete: `frontend-web/src/features/navigation/NotificationBell.test.tsx`
- Delete: `frontend-web/src/features/navigation/useUnreadMessages.ts`
- Modify: `frontend-web/src/features/navigation/AppHeader.tsx`
- Modify: `frontend-web/src/features/navigation/AppHeader.test.tsx:44`

**Interfaces:**
- Consumes: rien.
- Produces: `AppHeader` n'expose plus de lien « Messages, … » dans sa zone droite.

- [ ] **Step 1 : Confirmer qu'aucun autre module ne consomme le hook**

Run: `cd frontend-web && npx tsc --noEmit -p tsconfig.app.json` après suppression (étape 3). Avant cela :

Run: `cd frontend-web && grep -rn "useUnreadMessages\|NotificationBell" src --include=*.ts --include=*.tsx`
Expected: uniquement `NotificationBell.tsx`, `NotificationBell.test.tsx`, `useUnreadMessages.ts` et `AppHeader.tsx`. Si un autre fichier apparaît, **arrêter et signaler** — le périmètre a changé depuis la rédaction du plan.

- [ ] **Step 2 : Adapter le test de l'en-tête**

Dans `frontend-web/src/features/navigation/AppHeader.test.tsx`, remplacer le test :

```ts
  it('assemble navigation, notifications et menu compte pour un recruteur', () => {
    renderHeader('RECRUITER');
    expect(screen.getByRole('navigation', { name: /navigation principale/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /messages, aucun nouveau/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /mon compte/i })).toBeInTheDocument();
  });
```

par :

```ts
  it('assemble navigation et menu compte pour un recruteur', () => {
    renderHeader('RECRUITER');
    expect(screen.getByRole('navigation', { name: /navigation principale/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /mon compte/i })).toBeInTheDocument();
  });

  // SH-51 : la cloche menait à /messages, exactement comme l'entrée de navigation du même
  // nom. Deux chemins pour une destination, dont un annoncé « notifications » : on garde
  // le lien explicite et on supprime la cloche.
  it("n'offre qu'un seul chemin vers les messages", () => {
    renderHeader('RECRUITER');
    const versMessages = screen
      .getAllByRole('link')
      .filter((lien) => lien.getAttribute('href') === '/messages');
    expect(versMessages).toHaveLength(1);
  });
```

- [ ] **Step 3 : Lancer le test et vérifier qu'il échoue**

Run: `cd frontend-web && npx vitest run src/features/navigation/AppHeader.test.tsx`
Expected: FAIL sur « n'offre qu'un seul chemin » — `expected length 2 to be 1`.

- [ ] **Step 4 : Supprimer les trois fichiers**

```bash
git rm frontend-web/src/features/navigation/NotificationBell.tsx \
       frontend-web/src/features/navigation/NotificationBell.test.tsx \
       frontend-web/src/features/navigation/useUnreadMessages.ts
```

- [ ] **Step 5 : Retirer la cloche de l'en-tête**

Dans `frontend-web/src/features/navigation/AppHeader.tsx`, supprimer l'import :

```tsx
import { NotificationBell } from './NotificationBell';
```

et remplacer le bloc de droite :

```tsx
      <div className="flex items-center gap-1">
        {user && (
          <>
            <NotificationBell />
            <AccountMenu />
          </>
        )}
      </div>
```

par :

```tsx
      <div className="flex items-center gap-1">{user && <AccountMenu />}</div>
```

- [ ] **Step 6 : Lancer les tests et la compilation**

Run: `cd frontend-web && npx vitest run src/features/navigation/ && npx tsc --noEmit -p tsconfig.app.json`
Expected: PASS, et aucune erreur de type (preuve qu'aucun import orphelin ne subsiste).

- [ ] **Step 7 : Formater et committer**

```bash
cd frontend-web && npm run format && cd ..
git add -A frontend-web/src/features/navigation/
git commit -m "fix(SH-51/front): supprime la cloche, doublon du lien Messages

La cloche etait un Link vers /messages, la meme destination que l'entree de
navigation voisine, mais annoncee comme des notifications. Deux chemins pour
une destination, dont un trompeur : on garde le lien explicite.

useUnreadMessages disparait avec elle, n'ayant aucun autre consommateur.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4 : Logo SkillHunt, favicon et titre d'onglet

*Lot sacrifiable si le temps manque — aucune autre tâche n'en dépend.*

**Files:**
- Create: `frontend-web/src/components/ui/BrandMark.tsx`
- Test: `frontend-web/src/components/ui/BrandMark.test.tsx`
- Modify: `frontend-web/src/features/navigation/AppHeader.tsx`
- Modify: `frontend-web/src/pages/Home.tsx`
- Modify: `frontend-web/public/favicon.svg`
- Modify: `frontend-web/index.html:7`

**Interfaces:**
- Consumes: rien.
- Produces: `<BrandMark className?: string />` — un `<svg>` décoratif (`aria-hidden`), coloré par `currentColor`, dimensionné par les classes Tailwind du parent.

- [ ] **Step 1 : Écrire le test qui échoue**

Créer `frontend-web/src/components/ui/BrandMark.test.tsx` :

```tsx
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BrandMark } from './BrandMark';

describe('BrandMark (SH-51)', () => {
  it('est décoratif : le mot-symbole textuel porte déjà le nom accessible', () => {
    const { container } = render(<BrandMark />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute('aria-hidden', 'true');
  });

  it('hérite de la couleur du parent plutôt que de la coder', () => {
    const { container } = render(<BrandMark />);
    // `currentColor` permet au parent de piloter la teinte via une classe de token
    // (text-hud-positive), sans jamais écrire d'hexadécimal dans un composant.
    expect(container.innerHTML).toContain('currentColor');
    expect(container.innerHTML).not.toMatch(/#[0-9a-fA-F]{3,8}/);
  });

  it('accepte une classe de dimensionnement', () => {
    const { container } = render(<BrandMark className="h-7 w-7" />);
    expect(container.querySelector('svg')).toHaveClass('h-7', 'w-7');
  });
});
```

- [ ] **Step 2 : Lancer le test et vérifier qu'il échoue**

Run: `cd frontend-web && npx vitest run src/components/ui/BrandMark.test.tsx`
Expected: FAIL — `Failed to resolve import "./BrandMark"`.

- [ ] **Step 3 : Écrire le composant**

Créer `frontend-web/src/components/ui/BrandMark.tsx` :

```tsx
/**
 * Marque SkillHunt (SH-51) — engrenage denté, réticule à quatre équerres, curseur.
 *
 * Tracé UNIQUE de la marque : l'en-tête et la page d'accueil le consomment tous les deux,
 * là où ils recopiaient chacun l'icône `Crosshair` de Lucide. Purement décoratif
 * (`aria-hidden`) : le mot-symbole « SKILLHUNT » l'accompagne toujours en texte, et
 * l'annoncer deux fois alourdirait la lecture d'écran.
 *
 * Couleur : `currentColor` uniquement. Aucun hexadécimal — `gear-meta.test.ts` scanne ce
 * dossier et ferait échouer la CI.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Denture : douze dents réparties tous les 30°. Écrites une à une plutôt qu'en
          <use href="#id"> — un identifiant dupliqué casserait le rendu dès que deux
          BrandMark coexistent sur la même page. */}
      <g fill="currentColor">
        <rect x="29.4" y="0.8" width="5.2" height="9" rx="1.4" />
        <rect x="29.4" y="0.8" width="5.2" height="9" rx="1.4" transform="rotate(30 32 32)" />
        <rect x="29.4" y="0.8" width="5.2" height="9" rx="1.4" transform="rotate(60 32 32)" />
        <rect x="29.4" y="0.8" width="5.2" height="9" rx="1.4" transform="rotate(90 32 32)" />
        <rect x="29.4" y="0.8" width="5.2" height="9" rx="1.4" transform="rotate(120 32 32)" />
        <rect x="29.4" y="0.8" width="5.2" height="9" rx="1.4" transform="rotate(150 32 32)" />
        <rect x="29.4" y="0.8" width="5.2" height="9" rx="1.4" transform="rotate(180 32 32)" />
        <rect x="29.4" y="0.8" width="5.2" height="9" rx="1.4" transform="rotate(210 32 32)" />
        <rect x="29.4" y="0.8" width="5.2" height="9" rx="1.4" transform="rotate(240 32 32)" />
        <rect x="29.4" y="0.8" width="5.2" height="9" rx="1.4" transform="rotate(270 32 32)" />
        <rect x="29.4" y="0.8" width="5.2" height="9" rx="1.4" transform="rotate(300 32 32)" />
        <rect x="29.4" y="0.8" width="5.2" height="9" rx="1.4" transform="rotate(330 32 32)" />
      </g>

      {/* Corps de l'engrenage : anneau épais, intérieur laissé transparent — la marque se
          pose ainsi sur n'importe quel fond. */}
      <circle cx="32" cy="32" r="21" stroke="currentColor" strokeWidth="6" />

      {/* Anneau fin intérieur */}
      <circle cx="32" cy="32" r="15.5" stroke="currentColor" strokeWidth="1.8" />

      {/* Réticule : quatre équerres de collimateur */}
      <g stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 26.5V23a1 1 0 0 1 1-1h3.5" />
        <path d="M37.5 22H41a1 1 0 0 1 1 1v3.5" />
        <path d="M42 37.5V41a1 1 0 0 1-1 1h-3.5" />
        <path d="M26.5 42H23a1 1 0 0 1-1-1v-3.5" />
      </g>

      {/* Cible */}
      <circle cx="32" cy="32" r="6.5" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="32" cy="32" r="2.6" fill="currentColor" />

      {/* Curseur, débordant sur le quart bas-droit. Le liseré reprend le fond de
          l'application pour détacher la flèche de la denture. */}
      <path
        d="M38.5 38.5 58 46.6l-8.7 2.4-2.4 8.7z"
        fill="currentColor"
        stroke="var(--color-hud-bg)"
        strokeWidth="2.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}
```

- [ ] **Step 4 : Lancer le test et vérifier qu'il passe**

Run: `cd frontend-web && npx vitest run src/components/ui/BrandMark.test.tsx`
Expected: PASS — 3 tests.

- [ ] **Step 5 : Remplacer l'icône Lucide chez les deux consommateurs**

Dans `frontend-web/src/features/navigation/AppHeader.tsx` : supprimer `import { Crosshair } from 'lucide-react';`, ajouter `import { BrandMark } from '@/components/ui/BrandMark';`, puis remplacer

```tsx
        <Crosshair className="text-hud-positive h-7 w-7" aria-hidden="true" />
```

par

```tsx
        <BrandMark className="text-hud-positive h-7 w-7" />
```

Dans `frontend-web/src/pages/Home.tsx` : mêmes remplacements d'import, puis

```tsx
        <Crosshair className="text-hud-positive h-10 w-10" aria-hidden="true" />
```

devient

```tsx
        <BrandMark className="text-hud-positive h-10 w-10" />
```

- [ ] **Step 6 : Reprendre le favicon**

Remplacer intégralement `frontend-web/public/favicon.svg` (c'est encore le logo Vite par défaut) par le même tracé, en teinte figée — **fichier statique hors composants, seul endroit où l'hexadécimal est admis** :

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
  <g fill="#2ee6a8">
    <rect x="29.4" y="0.8" width="5.2" height="9" rx="1.4"/>
    <rect x="29.4" y="0.8" width="5.2" height="9" rx="1.4" transform="rotate(30 32 32)"/>
    <rect x="29.4" y="0.8" width="5.2" height="9" rx="1.4" transform="rotate(60 32 32)"/>
    <rect x="29.4" y="0.8" width="5.2" height="9" rx="1.4" transform="rotate(90 32 32)"/>
    <rect x="29.4" y="0.8" width="5.2" height="9" rx="1.4" transform="rotate(120 32 32)"/>
    <rect x="29.4" y="0.8" width="5.2" height="9" rx="1.4" transform="rotate(150 32 32)"/>
    <rect x="29.4" y="0.8" width="5.2" height="9" rx="1.4" transform="rotate(180 32 32)"/>
    <rect x="29.4" y="0.8" width="5.2" height="9" rx="1.4" transform="rotate(210 32 32)"/>
    <rect x="29.4" y="0.8" width="5.2" height="9" rx="1.4" transform="rotate(240 32 32)"/>
    <rect x="29.4" y="0.8" width="5.2" height="9" rx="1.4" transform="rotate(270 32 32)"/>
    <rect x="29.4" y="0.8" width="5.2" height="9" rx="1.4" transform="rotate(300 32 32)"/>
    <rect x="29.4" y="0.8" width="5.2" height="9" rx="1.4" transform="rotate(330 32 32)"/>
  </g>
  <circle cx="32" cy="32" r="21" stroke="#2ee6a8" stroke-width="6"/>
  <circle cx="32" cy="32" r="7.5" stroke="#2ee6a8" stroke-width="3"/>
  <circle cx="32" cy="32" r="3" fill="#2ee6a8"/>
  <path d="M38.5 38.5 58 46.6l-8.7 2.4-2.4 8.7z" fill="#2ee6a8" stroke="#0a0e14" stroke-width="2.6" stroke-linejoin="round"/>
</svg>
```

> Volontairement **simplifié** par rapport au composant : l'anneau fin et les quatre équerres
> disparaissent, illisibles à 16 px. La cible et la denture suffisent à identifier la marque.

- [ ] **Step 7 : Corriger le titre d'onglet**

Dans `frontend-web/index.html`, remplacer `<title>frontend-web</title>` par :

```html
    <title>SkillHunt — Recrutement technique de niche</title>
```

> C'est le seul endroit de l'application où la baseline apparaît. Elle s'écrit
> **« Recrutement »**, sans accent sur le premier E — le fichier de logo fourni porte
> « RÉCRUTEMENT », qui est une faute.

- [ ] **Step 8 : Vérifier à l'écran**

Run: `cd frontend-web && npm run dev`
Ouvrir http://localhost:5173 et contrôler :
1. Le logo apparaît dans l'en-tête et sur l'accueil, en vert `hud-positive`.
2. L'onglet porte « SkillHunt — Recrutement technique de niche » et l'icône verte, plus l'éclair violet de Vite.
3. Zoomer l'en-tête à 200 % : la denture ne bave pas, le curseur reste détaché de l'engrenage.

Si le curseur mange la denture, ajuster son `stroke-width` entre 2.2 et 3.

- [ ] **Step 9 : Lancer toute la suite**

Run: `cd frontend-web && npm run test && npm run lint && npm run build`
Expected: PASS partout. Le garde anti-hexadécimal (`gear-meta.test.ts`) doit passer — il scanne `src/components/ui`, et `BrandMark.tsx` n'utilise que `currentColor` et `var(--color-hud-bg)`.

- [ ] **Step 10 : Formater et committer**

```bash
cd frontend-web && npm run format && cd ..
git add frontend-web/src/components/ui/BrandMark.tsx frontend-web/src/components/ui/BrandMark.test.tsx frontend-web/src/features/navigation/AppHeader.tsx frontend-web/src/pages/Home.tsx frontend-web/public/favicon.svg frontend-web/index.html
git commit -m "feat(SH-51/front): remplace l'icone generique par la marque SkillHunt

L'en-tete et la page d'accueil recopiaient chacun l'icone Crosshair de Lucide,
partagee avec des milliers de projets. BrandMark porte desormais le trace une
seule fois, colore par currentColor pour rester pilotable par les tokens.

L'onglet du navigateur affichait encore frontend-web et le logo Vite par
defaut, visibles pendant toute une demonstration.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5 : Nom d'utilisateur porté par le JWT

**Files:**
- Modify: `backend-core/src/auth/guards/jwt-auth.guard.ts:14-18`
- Modify: `backend-core/src/auth/auth.service.ts:184`
- Modify: `frontend-web/src/features/auth/types.ts`
- Modify: `frontend-web/src/features/auth/token.ts`
- Create: `frontend-web/src/features/auth/display-name.ts`
- Test: `frontend-web/src/features/auth/display-name.test.ts`
- Modify: `frontend-web/src/features/navigation/AccountMenu.tsx:19`
- Modify: `frontend-web/src/pages/Account.tsx`
- Test: `frontend-web/src/pages/Account.test.tsx`

**Interfaces:**
- Consumes: `AuthUser` depuis `@/features/auth/types`.
- Produces: `AuthUser.username?: string` (**optionnel**) et `getDisplayName(user: AuthUser): string` — consommé par la page compte et le menu compte.

- [ ] **Step 1 : Écrire le test de repli qui échoue**

Créer `frontend-web/src/features/auth/display-name.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { getDisplayName } from './display-name';
import type { AuthUser } from './types';

const base: AuthUser = { userId: 'u-1', email: 'marc.dupont@skillhunt.io', role: 'FREELANCE' };

describe('getDisplayName (SH-51)', () => {
  it("préfère le nom d'utilisateur quand le token le porte", () => {
    expect(getDisplayName({ ...base, username: 'PiloteJury' })).toBe('PiloteJury');
  });

  // Scénario 7 du ticket : les tokens émis AVANT cette évolution n'ont pas de `username`.
  // Sans repli, toute session ouverte au moment du déploiement serait fermée.
  it("se rabat sur la partie locale de l'email quand le token est antérieur", () => {
    expect(getDisplayName(base)).toBe('marc.dupont');
  });

  it('ignore un nom vide ou fait uniquement d’espaces', () => {
    expect(getDisplayName({ ...base, username: '   ' })).toBe('marc.dupont');
  });
});
```

- [ ] **Step 2 : Lancer le test et vérifier qu'il échoue**

Run: `cd frontend-web && npx vitest run src/features/auth/display-name.test.ts`
Expected: FAIL — `Failed to resolve import "./display-name"`.

- [ ] **Step 3 : Rendre `username` optionnel puis écrire l'accesseur**

Dans `frontend-web/src/features/auth/types.ts`, remplacer l'interface :

```ts
// Identité de l'utilisateur connecté, telle que portée par le payload du JWT.
export interface AuthUser {
  userId: string;
  email: string;
  role: UserRole;
  /**
   * Nom d'affichage (SH-51). OPTIONNEL À DESSEIN : les access tokens émis avant cette
   * évolution ne le portent pas, et les rejeter fermerait toute session ouverte au
   * moment du déploiement. Donnée d'AFFICHAGE — aucune décision d'autorisation ne s'y adosse.
   */
  username?: string;
}
```

Créer `frontend-web/src/features/auth/display-name.ts` :

```ts
import type { AuthUser } from './types';

/**
 * Nom d'affichage de l'utilisateur connecté (SH-51).
 *
 * Repli sur la partie locale de l'email quand le token ne porte pas encore `username` —
 * c'est ce que faisait déjà `AccountMenu`, désormais partagé plutôt que dupliqué.
 */
export function getDisplayName(user: AuthUser): string {
  const nom = user.username?.trim();
  return nom && nom.length > 0 ? nom : user.email.split('@')[0];
}
```

- [ ] **Step 4 : Lancer le test et vérifier qu'il passe**

Run: `cd frontend-web && npx vitest run src/features/auth/display-name.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5 : Transmettre `username` dans le décodage**

Dans `frontend-web/src/features/auth/token.ts`, remplacer la ligne de retour :

```ts
    return { userId: payload.userId, email: payload.email, role: payload.role };
```

par :

```ts
    // `username` est repris s'il est présent, JAMAIS exigé : un token antérieur à SH-51
    // n'en a pas, et le rejeter fermerait la session au lieu de dégrader l'affichage.
    return {
      userId: payload.userId,
      email: payload.email,
      role: payload.role,
      username: payload.username,
    };
```

> Le garde d'entrée juste au-dessus (`if (!payload.userId || !payload.email || !payload.role)`)
> reste **inchangé** : y ajouter `username` produirait exactement la déconnexion qu'on évite.

- [ ] **Step 6 : Porter le champ côté backend**

Dans `backend-core/src/auth/guards/jwt-auth.guard.ts`, remplacer l'interface :

```ts
export interface JwtPayload {
  userId: string;
  email: string;
  role: UserRole;
  /**
   * Nom d'affichage (SH-51) — porté pour éviter un aller-retour serveur juste pour saluer
   * l'utilisateur par son nom. Donnée d'AFFICHAGE : aucune autorisation ne s'y adosse.
   */
  username?: string;
}
```

Dans `backend-core/src/auth/auth.service.ts` ligne 184, remplacer :

```ts
    const payload: JwtPayload = { userId: user.id, email: user.email, role: user.role };
```

par :

```ts
    const payload: JwtPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      username: user.username,
    };
```

- [ ] **Step 7 : Vérifier le backend**

Run: `cd backend-core && npm run test && npm run lint && npm run build`
Expected: PASS. Aucun test existant ne devrait casser — le payload ne fait que s'enrichir.

- [ ] **Step 8 : Écrire le test d'affichage puis brancher les deux écrans**

Ajouter dans `frontend-web/src/pages/Account.test.tsx` :

```ts
const NAMED_TOKEN = fakeJwt({
  userId: 'u-1',
  email: 'pilote@skillhunt.io',
  role: 'FREELANCE',
  username: 'PiloteJury',
});

describe("Page Mon compte — nom d'utilisateur (SH-51)", () => {
  it('met le nom en identité principale et relègue l’email', async () => {
    server.use(
      http.post(url('/api/v1/auth/refresh'), () =>
        HttpResponse.json({ accessToken: NAMED_TOKEN, refreshToken: 'r' }),
      ),
    );
    renderAccount();
    expect(await screen.findByText('PiloteJury')).toBeInTheDocument();
    expect(screen.getByText('pilote@skillhunt.io')).toBeInTheDocument();
  });

  it("reste utilisable avec un token antérieur, sans nom d'utilisateur", async () => {
    renderAccount(); // le TOKEN par défaut du harnais ne porte pas `username`
    expect(await screen.findByText('pilote')).toBeInTheDocument();
  });
});
```

Run: `cd frontend-web && npx vitest run src/pages/Account.test.tsx`
Expected: FAIL — `Unable to find an element with the text: PiloteJury`.

Puis dans `frontend-web/src/pages/Account.tsx`, ajouter l'import :

```tsx
import { getDisplayName } from '@/features/auth/display-name';
```

et remplacer le bloc d'identité :

```tsx
        <div className="flex flex-col items-center gap-1">
          <h1 className="text-2xl font-bold text-white">Mon compte</h1>
          <p className="text-white">{user?.email}</p>
```

par :

```tsx
        <div className="flex flex-col items-center gap-1">
          <h1 className="text-2xl font-bold text-white">Mon compte</h1>
          {/* Le nom passe en identité principale, l'email en information secondaire (SH-51). */}
          <p className="text-lg font-bold text-white">{user ? getDisplayName(user) : null}</p>
          <p className="text-hud-muted text-sm">{user?.email}</p>
```

Enfin, dans `frontend-web/src/features/navigation/AccountMenu.tsx`, ajouter l'import et remplacer :

```tsx
  // L'email fait office de nom d'affichage : le JWT ne porte pas le username.
  const displayName = user.email.split('@')[0];
```

par :

```tsx
  // Le JWT porte le username depuis SH-51 ; `getDisplayName` gère le repli pour les
  // tokens antérieurs — le calcul est partagé plutôt que redupliqué ici.
  const displayName = getDisplayName(user);
```

- [ ] **Step 9 : Lancer toute la suite front**

Run: `cd frontend-web && npm run test && npm run lint && npm run build`
Expected: PASS.

- [ ] **Step 10 : Formater et committer**

```bash
cd frontend-web && npm run format && cd ..
git add backend-core/src/auth/guards/jwt-auth.guard.ts backend-core/src/auth/auth.service.ts frontend-web/src/features/auth/ frontend-web/src/features/navigation/AccountMenu.tsx frontend-web/src/pages/Account.tsx frontend-web/src/pages/Account.test.tsx
git commit -m "feat(SH-51): affiche le nom de l'utilisateur plutot que son email

Le username etait deja en base et deja saisi a l'inscription, mais n'etait
porte nulle part jusqu'au front : la page compte et le menu se rabattaient sur
l'email.

Le champ est optionnel de bout en bout, a dessein : un access token emis avant
ce deploiement ne le porte pas, et l'exiger fermerait toutes les sessions
ouvertes au lieu de degrader l'affichage. getDisplayName porte ce repli une
seule fois, la ou AccountMenu le dupliquait.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6 : Durcissement de la règle de mot de passe (backend)

**Files:**
- Modify: `backend-core/src/auth/dto/register.dto.ts:42-47`
- Test: `backend-core/src/auth/dto/register.dto.spec.ts` (le fichier existe : y ajouter le `describe`)

**Interfaces:**
- Consumes: rien.
- Produces: la règle **12 caractères minimum, une minuscule, une majuscule, un chiffre** — reprise à l'identique par la tâche 7 côté front.

- [ ] **Step 1 : Écrire le test qui échoue**

Ajouter ce `describe` à la fin de `backend-core/src/auth/dto/register.dto.spec.ts`. Les fonctions `build` et `messagesFor` sont locales à ce bloc ; si le fichier en définit déjà d'équivalentes, réutiliser les siennes plutôt que de les redéclarer :

```ts
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RegisterDto } from './register.dto';
import { UserRole } from '../../common/enums';

function build(password: string): RegisterDto {
  return plainToInstance(RegisterDto, {
    email: 'pilote@skillhunt.io',
    username: 'PiloteJury',
    password,
    role: UserRole.RECRUITER,
  });
}

async function messagesFor(password: string): Promise<string[]> {
  const errors = await validate(build(password));
  return errors.flatMap((error) => Object.values(error.constraints ?? {}));
}

describe('RegisterDto — robustesse du mot de passe (SH-51, C2.2.3)', () => {
  it('accepte un mot de passe conforme', async () => {
    expect(await messagesFor('PiloteDrone2026')).toHaveLength(0);
  });

  it('refuse en dessous de douze caractères', async () => {
    expect(await messagesFor('Pilote2026')).toContain(
      'Le mot de passe doit faire au moins 12 caractères',
    );
  });

  it('refuse un mot de passe sans majuscule', async () => {
    expect(await messagesFor('pilotedrone2026')).toContain(
      'Le mot de passe doit contenir au moins une majuscule',
    );
  });

  it('refuse un mot de passe sans minuscule', async () => {
    expect(await messagesFor('PILOTEDRONE2026')).toContain(
      'Le mot de passe doit contenir au moins une minuscule',
    );
  });

  it('refuse un mot de passe sans chiffre', async () => {
    expect(await messagesFor('PiloteDroneAAAA')).toContain(
      'Le mot de passe doit contenir au moins un chiffre',
    );
  });

  it('laisse passer le mot de passe des comptes de démonstration', async () => {
    // Non-régression : la nouvelle règle ne doit invalider aucun compte existant.
    expect(await messagesFor('MotDePasse2026!')).toHaveLength(0);
  });
});
```

- [ ] **Step 2 : Lancer le test et vérifier qu'il échoue**

Run: `cd backend-core && npx jest src/auth/dto/register.dto.spec.ts`
Expected: FAIL sur « refuse en dessous de douze caractères » et les trois suivants — le DTO n'exige aujourd'hui que 8 caractères.

- [ ] **Step 3 : Durcir le DTO**

Dans `backend-core/src/auth/dto/register.dto.ts`, ajouter `Matches` à l'import `class-validator` :

```ts
import {
  IsEmail, IsString, IsNotEmpty, MinLength, IsIn, IsOptional,
  IsDefined, IsLatitude, IsLongitude, ValidateIf, ValidateNested, Matches,
} from 'class-validator';
```

puis remplacer le champ :

```ts
  @ApiProperty({ example: 'P@ssw0rdSecureDrone2026', description: 'Mot de passe fort (8 caractères minimum)' })
  @IsString()
  @MinLength(8, { message: 'Le mot de passe doit faire au moins 8 caractères' })
  password!: string;
```

par :

```ts
  // Robustesse du mot de passe (SH-51 — C2.2.3). La règle ne s'applique qu'à la CRÉATION :
  // aucun compte existant n'est invalidé, et `LoginDto` reste volontairement permissif.
  @ApiProperty({
    example: 'P@ssw0rdSecureDrone2026',
    description:
      'Mot de passe : 12 caractères minimum, dont au moins une minuscule, une majuscule et un chiffre',
  })
  @IsString()
  @MinLength(12, { message: 'Le mot de passe doit faire au moins 12 caractères' })
  @Matches(/[a-z]/, { message: 'Le mot de passe doit contenir au moins une minuscule' })
  @Matches(/[A-Z]/, { message: 'Le mot de passe doit contenir au moins une majuscule' })
  @Matches(/[0-9]/, { message: 'Le mot de passe doit contenir au moins un chiffre' })
  password!: string;
```

- [ ] **Step 4 : Lancer les tests et vérifier qu'ils passent**

Run: `cd backend-core && npx jest src/auth/`
Expected: PASS — y compris le test de non-régression sur `MotDePasse2026!`.

- [ ] **Step 5 : Vérifier que la documentation suit (C2.4.1)**

Run: `cd backend-core && npm run build && npm run start:dev`
Ouvrir http://localhost:3001/api/docs, déplier `POST /api/v1/auth/register` et confirmer que la description de `password` annonce bien la nouvelle règle. Arrêter le serveur.

- [ ] **Step 6 : Corriger le déroulé de démonstration**

⚠️ **`docs/soutenance/GUIDE_DEMO_JOUR_J.md` n'existe PAS sur cette branche** : il est commité sur
`chore/SH-51a-docs-soutenance`, qui n'est pas encore fusionnée dans `develop`. Deux voies, selon
l'état du dépôt au moment de l'exécution :

- **La branche `chore/` a été fusionnée dans `develop`** → rapatrier `develop` dans la branche
  de feature (`git merge develop`), puis appliquer la correction ici.
- **Elle ne l'est pas encore** → **ne rien faire dans cette tâche** et appliquer la correction
  directement sur `chore/SH-51a-docs-soutenance`, avec son propre commit. Cocher cette étape
  seulement une fois que c'est fait.

Dans les deux cas, la ligne 226 annonce « Le mot de passe fait huit caractères minimum. » — la
remplacer par :

```
Le mot de passe demande douze caractères, une minuscule, une majuscule et un chiffre.
```

- [ ] **Step 7 : Lancer toute la suite backend et committer**

Run: `cd backend-core && npm run test && npm run lint && npm run build`
Expected: PASS.

```bash
git add backend-core/src/auth/dto/register.dto.ts backend-core/src/auth/dto/register.dto.spec.ts docs/soutenance/GUIDE_DEMO_JOUR_J.md
git commit -m "feat(SH-51/back): durcit la regle de mot de passe a l'inscription

Douze caracteres avec minuscule, majuscule et chiffre, la ou huit caracteres
sans aucune contrainte de composition suffisaient. La regle ne vise que la
creation de compte : LoginDto reste permissif, sans quoi tout compte cree sous
l'ancienne regle serait verrouille dehors.

La description Swagger suit la regle (C2.4.1), et le guide de demonstration
cesse d'annoncer huit caracteres.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 7 : Formulaire d'inscription — règles en direct et confirmation

**Files:**
- Create: `frontend-web/src/features/auth/password-rules.ts`
- Test: `frontend-web/src/features/auth/password-rules.test.ts`
- Modify: `frontend-web/src/pages/Register.tsx`
- Test: `frontend-web/src/pages/Register.test.tsx`

**Interfaces:**
- Consumes: rien.
- Produces: `PASSWORD_RULES: readonly PasswordRule[]` avec `PasswordRule = { id: string; label: string; test: (value: string) => boolean }`, et `isPasswordValid(value: string): boolean`.

- [ ] **Step 1 : Écrire le test qui échoue**

Créer `frontend-web/src/features/auth/password-rules.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { PASSWORD_RULES, isPasswordValid } from './password-rules';

describe('PASSWORD_RULES (SH-51)', () => {
  it('valide un mot de passe conforme', () => {
    expect(isPasswordValid('PiloteDrone2026')).toBe(true);
  });

  it.each([
    ['Pilote2026', 'length'],
    ['pilotedrone2026', 'upper'],
    ['PILOTEDRONE2026', 'lower'],
    ['PiloteDroneAAAA', 'digit'],
  ])('refuse %s en signalant la règle %s', (mot, regleAttendue) => {
    expect(isPasswordValid(mot)).toBe(false);
    const echouees = PASSWORD_RULES.filter((regle) => !regle.test(mot)).map((r) => r.id);
    expect(echouees).toContain(regleAttendue);
  });

  it('reste aligné sur le DTO backend', () => {
    // Miroir de RegisterDto.password (C2.2.3) : quatre règles, ni plus ni moins.
    expect(PASSWORD_RULES.map((r) => r.id)).toEqual(['length', 'lower', 'upper', 'digit']);
  });
});
```

- [ ] **Step 2 : Lancer le test et vérifier qu'il échoue**

Run: `cd frontend-web && npx vitest run src/features/auth/password-rules.test.ts`
Expected: FAIL — `Failed to resolve import "./password-rules"`.

- [ ] **Step 3 : Écrire les règles**

Créer `frontend-web/src/features/auth/password-rules.ts` :

```ts
export interface PasswordRule {
  id: string;
  label: string;
  test: (value: string) => boolean;
}

/**
 * Règles de robustesse du mot de passe (SH-51 — C2.2.3).
 *
 * MIROIR EXACT de `RegisterDto.password` côté backend. Si l'une des deux listes change,
 * l'autre doit suivre : une validation cliente plus laxiste laisserait partir un 400
 * assuré, une validation plus stricte interdirait des mots de passe que l'API accepte.
 * Le backend reste le juge de paix — ceci n'est qu'un confort d'usage.
 */
export const PASSWORD_RULES: readonly PasswordRule[] = [
  { id: 'length', label: 'Au moins 12 caractères', test: (value) => value.length >= 12 },
  { id: 'lower', label: 'Une lettre minuscule', test: (value) => /[a-z]/.test(value) },
  { id: 'upper', label: 'Une lettre majuscule', test: (value) => /[A-Z]/.test(value) },
  { id: 'digit', label: 'Un chiffre', test: (value) => /[0-9]/.test(value) },
];

export function isPasswordValid(value: string): boolean {
  return PASSWORD_RULES.every((rule) => rule.test(value));
}
```

- [ ] **Step 4 : Lancer le test et vérifier qu'il passe**

Run: `cd frontend-web && npx vitest run src/features/auth/password-rules.test.ts`
Expected: PASS — 6 cas.

- [ ] **Step 5 : Écrire les tests du formulaire**

Ajouter dans `frontend-web/src/pages/Register.test.tsx` :

```ts
describe('Inscription — robustesse du mot de passe (SH-51)', () => {
  it('refuse un mot de passe faible sans émettre le moindre appel réseau', async () => {
    // MSW est en `onUnhandledRequest: 'error'` : aucune route register n'est simulée ici,
    // donc si le formulaire appelait l'API, le test échouerait de lui-même.
    const user = userEvent.setup();
    renderRegister();

    await user.type(screen.getByLabelText(/^email$/i), 'jury@skillhunt.io');
    await user.type(screen.getByLabelText(/nom d'utilisateur/i), 'PiloteJury');
    await user.type(screen.getByLabelText(/^mot de passe$/i), 'motdepasse');
    await user.type(screen.getByLabelText(/confirmation/i), 'motdepasse');
    await user.click(screen.getByRole('button', { name: /créer mon compte/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/mot de passe/i);
  });

  it('signale une confirmation divergente', async () => {
    const user = userEvent.setup();
    renderRegister();

    await user.type(screen.getByLabelText(/^email$/i), 'jury@skillhunt.io');
    await user.type(screen.getByLabelText(/nom d'utilisateur/i), 'PiloteJury');
    await user.type(screen.getByLabelText(/^mot de passe$/i), 'PiloteDrone2026');
    await user.type(screen.getByLabelText(/confirmation/i), 'PiloteDrone2027');
    await user.click(screen.getByRole('button', { name: /créer mon compte/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/ne correspondent pas/i);
  });

  it('coche les règles au fur et à mesure de la saisie', async () => {
    const user = userEvent.setup();
    renderRegister();

    const liste = screen.getByRole('list', { name: /règles du mot de passe/i });
    await user.type(screen.getByLabelText(/^mot de passe$/i), 'PiloteDrone2026');

    const respectees = within(liste)
      .getAllByRole('listitem')
      .filter((item) => item.getAttribute('data-respectee') === 'true');
    expect(respectees).toHaveLength(4);
  });
});
```

> `renderRegister` existe déjà en tête de `Register.test.tsx` (ligne 21) — le réutiliser tel
> quel. Ajouter `within` à l'import de `@testing-library/react`.

- [ ] **Step 6 : Lancer les tests et vérifier qu'ils échouent**

Run: `cd frontend-web && npx vitest run src/pages/Register.test.tsx`
Expected: FAIL — pas de champ « Confirmation », pas de liste de règles.

- [ ] **Step 7 : Reprendre le formulaire**

Dans `frontend-web/src/pages/Register.tsx`, ajouter l'import :

```tsx
import { PASSWORD_RULES, isPasswordValid } from '@/features/auth/password-rules';
```

Ajouter l'état de confirmation à côté de `password` :

```tsx
  const [passwordConfirm, setPasswordConfirm] = useState('');
```

Remplacer le contrôle de validation dans `handleSubmit` :

```tsx
    if (password.length < 8) {
      setError('Le mot de passe doit faire au moins 8 caractères.');
      return;
    }
```

par :

```tsx
    // Validation stricte des entrées (C2.2.3) — mêmes règles que RegisterDto : un mot de
    // passe non conforme n'atteint jamais le réseau.
    if (!isPasswordValid(password)) {
      setError('Le mot de passe ne respecte pas toutes les règles indiquées.');
      return;
    }
    if (password !== passwordConfirm) {
      setError('Le mot de passe et sa confirmation ne correspondent pas.');
      return;
    }
```

Puis, juste après le bloc `<div>` du champ « Mot de passe », insérer la liste de règles et le champ de confirmation :

```tsx
          {/* Les règles sont affichées ET cochées en direct : l'utilisateur n'apprend pas
              son erreur au moment de l'envoi. `data-respectee` porte l'état pour les tests,
              `aria-label` sur chaque item le porte pour les lecteurs d'écran (R6). */}
          <ul
            aria-label="Règles du mot de passe"
            className="text-hud-muted flex flex-col gap-1 text-xs"
          >
            {PASSWORD_RULES.map((regle) => {
              const respectee = regle.test(password);
              return (
                <li
                  key={regle.id}
                  data-respectee={respectee}
                  aria-label={`${regle.label} : ${respectee ? 'respectée' : 'non respectée'}`}
                  className={respectee ? 'text-hud-positive' : undefined}
                >
                  {respectee ? '✓' : '•'} {regle.label}
                </li>
              );
            })}
          </ul>

          <div className="flex flex-col gap-1">
            <label htmlFor="password-confirm" className="text-white">
              Confirmation du mot de passe
            </label>
            <input
              id="password-confirm"
              type="password"
              required
              value={passwordConfirm}
              onChange={(event) => setPasswordConfirm(event.target.value)}
              aria-describedby={error ? 'register-error' : undefined}
              className="border-hud-border bg-hud-card rounded-md border px-3 py-2 text-white"
            />
          </div>
```

- [ ] **Step 8 : Lancer les tests et vérifier qu'ils passent**

Run: `cd frontend-web && npx vitest run src/pages/Register.test.tsx src/features/auth/password-rules.test.ts`
Expected: PASS.

- [ ] **Step 9 : Formater et committer**

```bash
cd frontend-web && npm run format && cd ..
git add frontend-web/src/features/auth/password-rules.ts frontend-web/src/features/auth/password-rules.test.ts frontend-web/src/pages/Register.tsx frontend-web/src/pages/Register.test.tsx
git commit -m "feat(SH-51/front): montre les regles du mot de passe pendant la saisie

Les quatre regles sont affichees et cochees en direct, avec un champ de
confirmation : l'utilisateur n'apprend plus son erreur au moment de l'envoi.

PASSWORD_RULES est le miroir exact de RegisterDto, et un test verrouille cet
alignement : une validation cliente plus laxiste laisserait partir un 400
assure, une plus stricte interdirait ce que l'API accepte.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 8 : Écran d'arrivée par rôle

**Files:**
- Create: `frontend-web/src/features/navigation/home-route.ts`
- Test: `frontend-web/src/features/navigation/home-route.test.ts`
- Modify: `frontend-web/src/pages/Home.tsx`
- Modify: `frontend-web/src/pages/Login.tsx`
- Modify: `frontend-web/src/pages/Register.tsx`

**Interfaces:**
- Consumes: `NAV_ITEMS` depuis `./nav-items`, `UserRole` depuis `@/features/auth/types`.
- Produces: `getHomeRoute(role: UserRole): string`.

- [ ] **Step 1 : Écrire le test qui échoue**

Créer `frontend-web/src/features/navigation/home-route.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { getHomeRoute } from './home-route';
import { NAV_ITEMS } from './nav-items';

describe('getHomeRoute (SH-51)', () => {
  it('mène le recruteur sur la recherche', () => {
    expect(getHomeRoute('RECRUITER')).toBe('/recherche');
  });

  it('mène le freelance sur son Armurerie', () => {
    expect(getHomeRoute('FREELANCE')).toBe('/mon-armurerie');
  });

  it("mène l'admin sur les messages, seul écran de son Lot 1", () => {
    expect(getHomeRoute('ADMIN')).toBe('/messages');
  });

  it("n'envoie jamais un rôle sur un écran que son RBAC lui refuse", () => {
    for (const role of ['FREELANCE', 'RECRUITER', 'ADMIN'] as const) {
      const autorisees = NAV_ITEMS[role].map((item) => item.to);
      expect(autorisees).toContain(getHomeRoute(role));
    }
  });
});
```

- [ ] **Step 2 : Lancer le test et vérifier qu'il échoue**

Run: `cd frontend-web && npx vitest run src/features/navigation/home-route.test.ts`
Expected: FAIL — `Failed to resolve import "./home-route"`.

- [ ] **Step 3 : Écrire l'accesseur**

Créer `frontend-web/src/features/navigation/home-route.ts` :

```ts
import type { UserRole } from '@/features/auth/types';
import { NAV_ITEMS } from './nav-items';

/**
 * Écran d'arrivée d'un rôle (SH-51) : la PREMIÈRE entrée de sa navigation.
 *
 * Dérivé de `NAV_ITEMS` plutôt qu'écrit en table séparée — un rôle ne peut donc jamais
 * atterrir sur un écran que son RBAC lui refuse, et la règle reste vraie si la navigation
 * évolue. Un recruteur arrive sur la recherche, un freelance sur son Armurerie : chacun
 * sur son écran de travail plutôt que sur la fiche administrative de son compte.
 */
export function getHomeRoute(role: UserRole): string {
  return NAV_ITEMS[role][0].to;
}
```

- [ ] **Step 4 : Lancer le test et vérifier qu'il passe**

Run: `cd frontend-web && npx vitest run src/features/navigation/home-route.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5 : Rediriger depuis l'accueil**

Dans `frontend-web/src/pages/Home.tsx`, remplacer l'import de `react-router-dom` par :

```tsx
import { Link, Navigate } from 'react-router-dom';
```

ajouter :

```tsx
import { getHomeRoute } from '@/features/navigation/home-route';
```

puis, juste après `const { user } = useAuth();`, insérer :

```tsx
  // Un utilisateur connecté n'a rien à faire sur la vitrine (SH-51) : il est mené à
  // l'écran de travail de son rôle. Le hero reste la page d'accueil du visiteur anonyme.
  if (user) {
    return <Navigate to={getHomeRoute(user.role)} replace />;
  }
```

Le bloc `{user ? (<Button …>Mon compte</Button>) : (…)}` du corps devient inatteignable : le remplacer par le seul contenu anonyme :

```tsx
      <div className="flex gap-3">
        <Button asChild>
          <Link to="/login">Se connecter</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/register">Créer un compte</Link>
        </Button>
      </div>
```

- [ ] **Step 6 : Rediriger après connexion**

Dans `frontend-web/src/pages/Login.tsx`, ajouter `Navigate` à l'import de `react-router-dom` et importer `getHomeRoute`. Remplacer :

```tsx
  // Route d'origine mémorisée par ProtectedRoute, sinon l'accueil.
  const from = (location.state as { from?: string } | null)?.from ?? '/';
```

par :

```tsx
  // Route d'origine mémorisée par ProtectedRoute, sinon l'écran du rôle (SH-51).
  const from = (location.state as { from?: string } | null)?.from ?? null;
```

Ajouter `user` à la déstructuration de `useAuth()` :

```tsx
  const { user, login, verifyTwoFactor } = useAuth();
```

et insérer, juste avant `if (twoFactorToken) {` :

```tsx
  // Redirection PAR RENDU une fois la session ouverte (SH-51). Un `navigate()` dans le
  // gestionnaire de soumission lirait un `user` périmé — la closure est capturée avant
  // qu'AuthProvider n'ait renseigné la session.
  if (user) {
    return <Navigate to={from ?? getHomeRoute(user.role)} replace />;
  }
```

Supprimer enfin les deux `navigate(from, { replace: true });` devenus inutiles dans `handleSubmit` et `handleVerify`, ainsi que `const navigate = useNavigate();` et `useNavigate` de l'import s'ils ne servent plus.

- [ ] **Step 7 : Rediriger après inscription**

Dans `frontend-web/src/pages/Register.tsx`, ajouter `Navigate` à l'import, importer `getHomeRoute`, ajouter `user` à la déstructuration :

```tsx
  const { user, register } = useAuth();
```

remplacer dans `handleSubmit` :

```tsx
      await register(input);
      navigate('/mon-compte', { replace: true });
```

par :

```tsx
      await register(input);
```

et insérer juste avant le `return (` du composant :

```tsx
  // `register` enchaîne le login : dès que la session est ouverte, l'utilisateur part sur
  // l'écran de travail de son rôle plutôt que sur la fiche de son compte (SH-51).
  if (user) {
    return <Navigate to={getHomeRoute(user.role)} replace />;
  }
```

Supprimer `useNavigate` et `const navigate = useNavigate();` s'ils ne servent plus.

- [ ] **Step 8 : Lancer toute la suite**

Run: `cd frontend-web && npm run test && npm run lint && npx tsc --noEmit -p tsconfig.app.json`
Expected: PASS. Les tests de `Login.test.tsx` qui attendaient une navigation vers `/` doivent être mis à jour pour attendre `/recherche` ou `/mon-armurerie` selon le rôle du token simulé — corriger les attentes, **pas** l'implémentation.

- [ ] **Step 9 : Formater et committer**

```bash
cd frontend-web && npm run format && cd ..
git add frontend-web/src/features/navigation/home-route.ts frontend-web/src/features/navigation/home-route.test.ts frontend-web/src/pages/Home.tsx frontend-web/src/pages/Login.tsx frontend-web/src/pages/Register.tsx frontend-web/src/pages/Login.test.tsx
git commit -m "feat(SH-51/front): mene chaque role sur son ecran de travail

Un recruteur atterrissait sur la fiche administrative de son compte, alors que
son ecran de travail est la recherche ; un freelance sur la meme fiche plutot
que sur son Armurerie.

getHomeRoute derive la destination de NAV_ITEMS, donc un role ne peut jamais
atterrir sur un ecran que son RBAC lui refuse. La redirection passe par un
rendu et non par un navigate() imperatif, qui lirait un user perime dans la
closure du gestionnaire de soumission.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 9 : Recherche plus visuelle

**Files:**
- Create: `frontend-web/src/features/matching/skill-suggestions.ts`
- Modify: `frontend-web/src/features/matching/SearchFilters.tsx`
- Modify: `frontend-web/src/pages/Search.tsx`
- Test: `frontend-web/src/pages/Search.test.tsx`

**Interfaces:**
- Consumes: `CITIES` depuis `@/lib/cities` (`{ name: string; lat: number; lon: number }[]`), `SearchCriteria = { skills: string[]; lat: number; lon: number; radiusKm: number }`.
- Produces: `SKILL_SUGGESTIONS: readonly string[]`. La signature de `SearchFilters` et de `SearchCriteria` **ne change pas** — les tâches en aval ne sont pas affectées.

- [ ] **Step 1 : Écrire les suggestions**

Créer `frontend-web/src/features/matching/skill-suggestions.ts` :

```ts
/**
 * Compétences proposées au recruteur (SH-51).
 *
 * Aide à la saisie, JAMAIS une liste fermée : le champ libre reste ouvert juste à côté.
 * Le champ « séparées par des virgules » qu'elles remplacent obligeait à connaître par
 * cœur le vocabulaire du référentiel avant de pouvoir chercher quoi que ce soit.
 */
export const SKILL_SUGGESTIONS: readonly string[] = [
  'pilotage drone',
  'thermographie',
  'inspection',
  'cartographie',
  'captation 360°',
  'photogrammétrie',
  'robotique',
  'vol en intérieur',
];
```

- [ ] **Step 2 : Écrire les tests qui échouent**

Ajouter dans `frontend-web/src/pages/Search.test.tsx` :

```ts
describe('Recherche — saisie visuelle (SH-51)', () => {
  it('propose les compétences en boutons à bascule', async () => {
    const user = userEvent.setup();
    renderPage();

    const puce = screen.getByRole('button', { name: /pilotage drone/i });
    expect(puce).toHaveAttribute('aria-pressed', 'false');

    await user.click(puce);
    expect(puce).toHaveAttribute('aria-pressed', 'true');

    await user.click(puce);
    expect(puce).toHaveAttribute('aria-pressed', 'false');
  });

  it('accepte une compétence absente des suggestions', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText(/ajouter une compétence/i), 'bathymétrie{Enter}');
    expect(screen.getByRole('button', { name: /bathymétrie/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('affiche la carte avant toute recherche', () => {
    renderPage();
    // La carte n'attend plus une première soumission : le recruteur voit son périmètre
    // de mission dès l'arrivée (SH-51).
    expect(screen.getByRole('region', { name: /carte des freelances/i })).toBeInTheDocument();
  });
});
```

> `renderPage` existe déjà en tête de `Search.test.tsx` (ligne 39). `SearchMap` y est doublé
> lignes 14-16 par `<div data-testid="search-map" />`, qui ne porte aucun rôle : le test de la
> carte échouerait sur le double, pas sur le code. Remplacer ce `vi.mock` par :
>
> ```tsx
> vi.mock('@/features/matching/SearchMap', () => ({
>   SearchMap: () => <div role="region" aria-label="Carte des freelances" />,
> }));
> ```

- [ ] **Step 3 : Lancer les tests et vérifier qu'ils échouent**

Run: `cd frontend-web && npx vitest run src/pages/Search.test.tsx`
Expected: FAIL — pas de bouton « pilotage drone », pas de région carte.

- [ ] **Step 4 : Reprendre le formulaire de filtres**

Dans `frontend-web/src/features/matching/SearchFilters.tsx`, remplacer l'état `skillsRaw` :

```tsx
  const [skillsRaw, setSkillsRaw] = useState('');
```

par :

```tsx
  const [skills, setSkills] = useState<string[]>([]);
  const [skillDraft, setSkillDraft] = useState('');
```

Ajouter l'import :

```tsx
import { SKILL_SUGGESTIONS } from './skill-suggestions';
```

Ajouter les deux manipulateurs, au-dessus de `handleSubmit` :

```tsx
  function toggleSkill(skill: string) {
    setSkills((courantes) =>
      courantes.includes(skill)
        ? courantes.filter((valeur) => valeur !== skill)
        : [...courantes, skill],
    );
  }

  function addDraftSkill() {
    const skill = skillDraft.trim().toLowerCase();
    if (skill === '' || skills.includes(skill)) return;
    setSkills((courantes) => [...courantes, skill]);
    setSkillDraft('');
  }
```

Remplacer le début de `handleSubmit` :

```tsx
    const skills = skillsRaw
      .split(',')
      .map((skill) => skill.trim())
      .filter(Boolean);
    if (skills.length === 0) {
```

par :

```tsx
    if (skills.length === 0) {
```

Remplacer le bloc du champ « Compétences » :

```tsx
      <div className="flex flex-col gap-1">
        <label htmlFor="skills" className="text-white">
          Compétences recherchées (séparées par des virgules)
        </label>
        <input
          id="skills"
          value={skillsRaw}
          onChange={(event) => setSkillsRaw(event.target.value)}
          placeholder="pilotage drone, thermographie, inspection"
          className={inputClass}
        />
      </div>
```

par :

```tsx
      {/* Puces à bascule (SH-51) : de vrais <button> porteurs d'`aria-pressed`, pas des
          <div> cliquables — l'état est ainsi audible et la navigation au clavier native. */}
      <div className="flex flex-col gap-2">
        <span className="text-white" id="skills-legende">
          Compétences recherchées
        </span>
        <div className="flex flex-wrap gap-2" role="group" aria-labelledby="skills-legende">
          {[...SKILL_SUGGESTIONS, ...skills.filter((s) => !SKILL_SUGGESTIONS.includes(s))].map(
            (skill) => {
              const active = skills.includes(skill);
              return (
                <button
                  key={skill}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleSkill(skill)}
                  className={
                    active
                      ? 'bg-hud-positive/15 border-hud-positive text-hud-positive rounded-full border px-3 py-1 text-sm font-bold'
                      : 'border-hud-border bg-hud-card text-hud-muted hover:text-white rounded-full border px-3 py-1 text-sm'
                  }
                >
                  {skill}
                </button>
              );
            },
          )}
        </div>

        <div className="flex gap-2">
          <input
            id="skill-draft"
            aria-label="Ajouter une compétence"
            value={skillDraft}
            onChange={(event) => setSkillDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                // Empêche la soumission du formulaire : Entrée ajoute la compétence.
                event.preventDefault();
                addDraftSkill();
              }
            }}
            placeholder="Autre compétence…"
            className={`${inputClass} flex-1`}
          />
          <Button type="button" variant="outline" onClick={addDraftSkill}>
            Ajouter
          </Button>
        </div>
      </div>
```

Remplacer enfin le champ « Rayon » par un curseur :

```tsx
        <div className="flex w-32 flex-col gap-1">
          <label htmlFor="radius" className="text-white">
            Rayon (km)
          </label>
          <input
            id="radius"
            type="number"
            min={1}
            max={500}
            value={radiusKm}
            onChange={(event) => setRadiusKm(event.target.value)}
            className={inputClass}
          />
        </div>
```

par :

```tsx
        <div className="flex min-w-56 flex-1 flex-col gap-1">
          {/* La valeur figure DANS le libellé : elle est ainsi annoncée à chaque
              déplacement du curseur, sans région live supplémentaire (R6). */}
          <label htmlFor="radius" className="text-white">
            Rayon de mission — {radiusKm} km
          </label>
          <input
            id="radius"
            type="range"
            min={1}
            max={500}
            step={1}
            value={radiusKm}
            onChange={(event) => setRadiusKm(event.target.value)}
            className="accent-hud-positive mt-3"
          />
        </div>
```

- [ ] **Step 5 : Raccourcir le titre et montrer la carte d'emblée**

Dans `frontend-web/src/pages/Search.tsx`, remplacer l'en-tête :

```tsx
          <header className="flex flex-col gap-1">
            <h1 className="text-2xl font-bold tracking-widest text-white uppercase">
              Recherche de freelances
            </h1>
            <p className="text-hud-muted text-sm">
              Score de matching multicritères : compétences, matériel validé et distance au lieu de
              mission.
            </p>
          </header>
```

par :

```tsx
          {/* Titre court (SH-51) : la phrase sur le score multicritères était du jargon
              interne et mangeait la hauteur utile au-dessus de la carte. Le détail du
              score reste lisible sur chaque carte de résultat, là où il a du sens. */}
          <h1 className="text-2xl font-bold tracking-widest text-white uppercase">
            Trouver un freelance
          </h1>
```

Remplacer l'état initial du périmètre :

```tsx
  const [submittedArea, setSubmittedArea] = useState<{
    lat: number;
    lon: number;
    radiusKm: number;
  } | null>(null);
```

par :

```tsx
  // La carte est visible DÈS L'ARRIVÉE (SH-51), centrée sur la ville par défaut : le
  // recruteur voit son périmètre de mission avant sa première recherche, là où l'écran
  // s'ouvrait sur un vide. `SearchFilters` part des mêmes valeurs par défaut.
  const [submittedArea, setSubmittedArea] = useState<{
    lat: number;
    lon: number;
    radiusKm: number;
  }>({ lat: CITIES[0].lat, lon: CITIES[0].lon, radiusKm: 50 });
```

Ajouter l'import `import { CITIES } from '@/lib/cities';` et retirer le garde `{submittedArea && (` autour de `<SearchMap …>` — l'état n'est plus nullable :

```tsx
        <div className="min-h-80 flex-1">
          <Suspense fallback={null}>
            <SearchMap
              center={{ lat: submittedArea.lat, lon: submittedArea.lon }}
              radiusKm={submittedArea.radiusKm}
              results={search.data ?? []}
              highlightedId={highlightedId}
            />
          </Suspense>
        </div>
```

> Le chargement paresseux de Leaflet est **conservé** : il devient simplement immédiat sur cet
> écran. L'éco-conception de SH-28 reste vraie partout ailleurs.

- [ ] **Step 6 : Donner un nom accessible à la carte**

Le double du test ne suffit pas : le composant réel doit porter le même rôle, sinon la carte
reste anonyme pour un lecteur d'écran. Dans `frontend-web/src/features/matching/SearchMap.tsx`,
remplacer le conteneur racine (ligne 40) :

```tsx
    <div className="border-hud-border h-full overflow-hidden rounded-lg border">
```

par :

```tsx
    <div
      role="region"
      aria-label="Carte des freelances"
      className="border-hud-border h-full overflow-hidden rounded-lg border"
    >
```

- [ ] **Step 7 : Lancer les tests et vérifier qu'ils passent**

Run: `cd frontend-web && npx vitest run src/pages/Search.test.tsx src/features/matching/`
Expected: PASS.

- [ ] **Step 8 : Vérifier à l'écran**

Run: `cd frontend-web && npm run dev`
Se connecter en recruteur, contrôler : arrivée directe sur `/recherche`, carte visible avec le cercle de rayon, puces qui basculent au clic, curseur qui met le libellé à jour, compétence libre ajoutable à la touche Entrée.

- [ ] **Step 9 : Lancer toute la suite, formater, committer**

Run: `cd frontend-web && npm run test && npm run lint && npm run build`

```bash
cd frontend-web && npm run format && cd ..
git add frontend-web/src/features/matching/ frontend-web/src/pages/Search.tsx frontend-web/src/pages/Search.test.tsx
git commit -m "feat(SH-51/front): rend la recherche visuelle des l'arrivee

La carte restait vide tant qu'aucune recherche n'avait ete lancee, et les
competences se saisissaient dans un champ texte separe par des virgules, ce qui
supposait de connaitre le vocabulaire du referentiel par coeur.

Les competences deviennent des boutons a bascule porteurs d'aria-pressed, le
rayon un curseur dont le libelle annonce la valeur, et la carte s'affiche des
l'arrivee sur la ville par defaut. La saisie libre reste ouverte.

Le titre perd sa phrase sur le score multicriteres, du jargon interne qui
mangeait la hauteur utile ; le detail reste sur chaque carte de resultat.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 10 : Catalogue d'aide à la déclaration de matériel

**Files:**
- Create: `frontend-web/src/features/gear/gear-catalog.ts`
- Test: `frontend-web/src/features/gear/gear-catalog.test.ts`
- Modify: `frontend-web/src/pages/AddGear.tsx`
- Test: `frontend-web/src/pages/AddGear.test.tsx`

**Interfaces:**
- Consumes: `GearCategory` depuis `@/features/gear/types`.
- Produces: `getBrands(category: GearCategory): string[]` et `getModels(category: GearCategory, brand: string): readonly string[]`.

- [ ] **Step 1 : Écrire le test qui échoue**

Créer `frontend-web/src/features/gear/gear-catalog.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { getBrands, getModels } from './gear-catalog';
import { GEAR_CATEGORIES } from './gear-meta';

describe('Catalogue de matériel (SH-51)', () => {
  it('propose les marques de drones par ordre alphabétique', () => {
    const marques = getBrands('DRONE');
    expect(marques).toContain('DJI');
    expect([...marques]).toEqual([...marques].sort((a, b) => a.localeCompare(b, 'fr')));
  });

  it('propose les modèles de la marque choisie', () => {
    expect(getModels('DRONE', 'DJI')).toContain('Mavic 3 Enterprise');
  });

  it('retrouve la marque quelle que soit la casse saisie', () => {
    // Le champ est libre : l'utilisateur tape « dji » aussi bien que « DJI ».
    expect(getModels('DRONE', 'dji')).toEqual(getModels('DRONE', 'DJI'));
  });

  it('reste muet sur une marque inconnue plutôt que de lever', () => {
    expect(getModels('DRONE', 'Marque Confidentielle')).toEqual([]);
  });

  it('couvre chaque catégorie du référentiel', () => {
    // `Record<GearCategory, …>` l'impose déjà à la compilation ; ce test le prouve à
    // l'exécution et documente l'intention.
    for (const categorie of GEAR_CATEGORIES) {
      expect(() => getBrands(categorie)).not.toThrow();
    }
  });
});
```

- [ ] **Step 2 : Lancer le test et vérifier qu'il échoue**

Run: `cd frontend-web && npx vitest run src/features/gear/gear-catalog.test.ts`
Expected: FAIL — `Failed to resolve import "./gear-catalog"`.

- [ ] **Step 3 : Écrire le catalogue**

Créer `frontend-web/src/features/gear/gear-catalog.ts` :

```ts
import type { GearCategory } from './types';

/**
 * Catalogue d'aide à la saisie du matériel (SH-51).
 *
 * Il ASSISTE, il ne contraint jamais : `AddGear` accepte toujours une marque et un modèle
 * absents de cette table, et `AddGearDto` côté backend est inchangé. Contraindre la liste
 * rendrait indéclarable tout matériel légitime qui n'y figure pas.
 *
 * Enjeu : la donnée du Gear Locker alimente le score de matching, cœur différenciant du
 * produit. Saisie librement, elle produit des doublons orthographiques (« dji », « D.J.I »,
 * « Dji ») qui fragmentent les correspondances.
 *
 * `Record<GearCategory, …>` rend la table exhaustive : une catégorie ajoutée côté backend
 * casse la compilation ici plutôt que d'arriver sans aucune suggestion.
 */
export const GEAR_CATALOG: Record<GearCategory, Record<string, readonly string[]>> = {
  DRONE: {
    DJI: ['Mavic 3 Enterprise', 'Matrice 350 RTK', 'Matrice 30T', 'Mini 4 Pro', 'Avata 2'],
    Parrot: ['Anafi USA', 'Anafi Ai'],
    Autel: ['EVO II Dual 640T', 'EVO Max 4T'],
    Skydio: ['X10', 'S2+'],
  },
  CAMERA_360: {
    Insta360: ['X4', 'ONE RS 1-Inch 360', 'Pro 2', 'Titan'],
    GoPro: ['MAX', 'Fusion'],
    Ricoh: ['Theta X', 'Theta Z1'],
    Kandao: ['Obsidian Pro', 'QooCam 8K'],
  },
  ROBOTICS: {
    'Boston Dynamics': ['Spot', 'Stretch'],
    Unitree: ['Go2', 'B2', 'H1'],
    ANYbotics: ['ANYmal D'],
    Clearpath: ['Husky A300', 'Jackal'],
  },
  SENSOR: {
    FLIR: ['Vue Pro R', 'Duo Pro R', 'Tau 2'],
    Teledyne: ['Micasense RedEdge-P', 'Altum-PT'],
    YellowScan: ['Mapper+', 'Surveyor Ultra'],
    Velodyne: ['Puck VLP-16', 'Ultra Puck'],
  },
  // Catégorie fourre-tout : par nature sans catalogue, la saisie y est toujours libre.
  OTHER: {},
};

export function getBrands(category: GearCategory): string[] {
  return Object.keys(GEAR_CATALOG[category]).sort((a, b) => a.localeCompare(b, 'fr'));
}

export function getModels(category: GearCategory, brand: string): readonly string[] {
  // Comparaison insensible à la casse : le champ étant libre, « dji » doit retrouver « DJI ».
  const recherche = brand.trim().toLowerCase();
  const trouvee = Object.entries(GEAR_CATALOG[category]).find(
    ([nom]) => nom.toLowerCase() === recherche,
  );
  return trouvee ? trouvee[1] : [];
}
```

- [ ] **Step 4 : Lancer le test et vérifier qu'il passe**

Run: `cd frontend-web && npx vitest run src/features/gear/gear-catalog.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5 : Écrire les tests du formulaire**

Ajouter dans `frontend-web/src/pages/AddGear.test.tsx` :

```ts
describe('Déclaration de matériel — catalogue (SH-51)', () => {
  it('propose les marques de la catégorie choisie', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.selectOptions(screen.getByLabelText(/catégorie/i), 'DRONE');
    const marque = screen.getByLabelText(/marque/i);
    const listeId = marque.getAttribute('list');
    expect(listeId).not.toBeNull();

    const options = document.getElementById(listeId as string)?.querySelectorAll('option');
    const valeurs = Array.from(options ?? []).map((option) => option.getAttribute('value'));
    expect(valeurs).toContain('DJI');
  });

  it('propose les modèles une fois la marque saisie', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.selectOptions(screen.getByLabelText(/catégorie/i), 'DRONE');
    await user.type(screen.getByLabelText(/marque/i), 'DJI');

    const modele = screen.getByLabelText(/modèle/i);
    const listeId = modele.getAttribute('list');
    const options = document.getElementById(listeId as string)?.querySelectorAll('option');
    const valeurs = Array.from(options ?? []).map((option) => option.getAttribute('value'));
    expect(valeurs).toContain('Mavic 3 Enterprise');
  });

  it('accepte un matériel absent du catalogue', async () => {
    // Le catalogue assiste, il ne contraint pas : la saisie libre reste possible.
    const user = userEvent.setup();
    renderPage();

    await user.selectOptions(screen.getByLabelText(/catégorie/i), 'DRONE');
    await user.type(screen.getByLabelText(/marque/i), 'Marque Confidentielle');
    await user.type(screen.getByLabelText(/modèle/i), 'Prototype 01');

    expect(screen.getByLabelText(/marque/i)).toHaveValue('Marque Confidentielle');
    expect(screen.getByLabelText(/modèle/i)).toHaveValue('Prototype 01');
  });
});
```

> `renderPage` existe déjà en tête de `AddGear.test.tsx` (ligne 13) — le réutiliser tel quel.

- [ ] **Step 6 : Lancer les tests et vérifier qu'ils échouent**

Run: `cd frontend-web && npx vitest run src/pages/AddGear.test.tsx`
Expected: FAIL — `expected null not to be null`, les champs n'ayant pas d'attribut `list`.

- [ ] **Step 7 : Brancher le catalogue sur les deux champs**

Dans `frontend-web/src/pages/AddGear.tsx`, ajouter l'import :

```tsx
import { getBrands, getModels } from '@/features/gear/gear-catalog';
```

Calculer les suggestions juste avant le `return` :

```tsx
  // Suggestions dérivées de la catégorie puis de la marque (SH-51). Tant qu'aucune
  // catégorie n'est choisie, il n'y a rien de pertinent à proposer.
  const brandOptions = category === '' ? [] : getBrands(category);
  const modelOptions = category === '' ? [] : getModels(category, brand);
```

Remplacer l'input « Marque » par sa version assistée :

```tsx
            <input
              id="brand"
              value={brand}
              onChange={(event) => setBrand(event.target.value)}
              placeholder="DJI, Insta360, Boston Dynamics…"
              aria-invalid={fieldErrors.brand ? true : undefined}
              aria-describedby={fieldErrors.brand ? 'brand-error' : undefined}
              className={inputClass}
            />
```

par :

```tsx
            {/* `<datalist>` natif : suggère sans jamais contraindre, et reste accessible
                au clavier comme aux lecteurs d'écran sans aucune dépendance ajoutée. */}
            <input
              id="brand"
              list="brand-options"
              autoComplete="off"
              value={brand}
              onChange={(event) => setBrand(event.target.value)}
              placeholder="DJI, Insta360, Boston Dynamics…"
              aria-invalid={fieldErrors.brand ? true : undefined}
              aria-describedby={fieldErrors.brand ? 'brand-error' : 'brand-hint'}
              className={inputClass}
            />
            <datalist id="brand-options">
              {brandOptions.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
            <p id="brand-hint" className="text-hud-muted text-xs">
              Choisis dans la liste, ou saisis librement si ton matériel n'y figure pas.
            </p>
```

Remplacer de même l'input « Modèle » :

```tsx
            <input
              id="model"
              value={model}
              onChange={(event) => setModel(event.target.value)}
              placeholder="Mavic 3 Enterprise"
              aria-invalid={fieldErrors.model ? true : undefined}
              aria-describedby={fieldErrors.model ? 'model-error' : undefined}
              className={inputClass}
            />
```

par :

```tsx
            <input
              id="model"
              list="model-options"
              autoComplete="off"
              value={model}
              onChange={(event) => setModel(event.target.value)}
              placeholder="Mavic 3 Enterprise"
              aria-invalid={fieldErrors.model ? true : undefined}
              aria-describedby={fieldErrors.model ? 'model-error' : undefined}
              className={inputClass}
            />
            <datalist id="model-options">
              {modelOptions.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
```

- [ ] **Step 8 : Lancer les tests et vérifier qu'ils passent**

Run: `cd frontend-web && npx vitest run src/pages/AddGear.test.tsx src/features/gear/`
Expected: PASS. Le garde anti-hexadécimal doit rester vert — `gear-catalog.ts` ne contient aucune couleur.

- [ ] **Step 9 : Vérifier à l'écran**

Run: `cd frontend-web && npm run dev`
Se connecter en freelance, aller sur « Mon Armurerie » → « Ajouter », choisir « Drone », taper `dj` dans Marque : « DJI » doit être proposé. Le choisir, puis cliquer le champ Modèle : les modèles DJI apparaissent. Saisir enfin une marque inconnue et vérifier que la déclaration aboutit.

- [ ] **Step 10 : Lancer toute la suite, formater, committer**

Run: `cd frontend-web && npm run test && npm run lint && npm run build`

```bash
cd frontend-web && npm run format && cd ..
git add frontend-web/src/features/gear/gear-catalog.ts frontend-web/src/features/gear/gear-catalog.test.ts frontend-web/src/pages/AddGear.tsx frontend-web/src/pages/AddGear.test.tsx
git commit -m "feat(SH-51/front): propose le materiel au lieu de le faire saisir

Marque et modele etaient deux champs texte libres. La donnee du Gear Locker
alimentant le score de matching, les doublons orthographiques (dji, D.J.I, Dji)
fragmentaient les correspondances.

Le catalogue assiste via un datalist natif — aucune dependance ajoutee,
accessible par construction — et la saisie libre reste ouverte : contraindre
la liste rendrait indeclarable tout materiel legitime qui n'y figure pas.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 11 : Traçabilité — backlog et hors-périmètre

**Files:**
- Modify: `docs/BACKLOG.md`
- Create: `docs/tickets/SH-52-photo-de-profil.md`
- Create: `docs/tickets/SH-53-verification-email.md`

**Interfaces:**
- Consumes: `docs/templates/TICKET_TEMPLATE.md`.
- Produces: rien de code.

- [ ] **Step 1 : Écrire les deux tickets hors-périmètre**

Créer `docs/tickets/SH-52-photo-de-profil.md` en suivant `docs/templates/TICKET_TEMPLATE.md`. Points à faire figurer :

- **User Story :** en tant qu'utilisateur, je veux une photo de profil, afin d'être identifiable dans la recherche et le chat.
- **Estimation :** 5 SP. **Statut :** 🔵 Backlog. **Compétences :** C2.2.3, C2.4.1.
- **Spécifications :** colonne `avatarUrl` sur `users` + migration TypeORM ; `POST /api/v1/users/me/avatar` délivrant une URL PUT signée, en réutilisant l'abstraction de stockage de SH-31 ; validation du **type MIME réel** (magic bytes), pas de l'extension ; bucket **privé**, lecture par URL signée à durée courte (~15 min) — jamais de lien permanent (§8-3) ; côté front, `InitialsAvatar` reste le repli quand `avatarUrl` est absente.
- **Pourquoi hors SH-51 :** infrastructure de stockage à mobiliser pour un gain purement cosmétique, à budget contraint avant soutenance.

Créer `docs/tickets/SH-53-verification-email.md`. Points à faire figurer :

- **User Story :** en tant que plateforme, je veux vérifier l'adresse email à l'inscription, afin de garantir que chaque compte est joignable.
- **Estimation :** 8 SP. **Statut :** 🔵 Backlog. **Compétences :** C2.2.3, C2.4.1.
- **Spécifications :** colonne `emailVerifiedAt` (nullable) ; jeton de vérification à usage unique et à durée limitée, **haché** en base au même titre qu'un mot de passe ; `GET /api/v1/auth/verify-email` + renvoi limité en fréquence (anti-abus) ; **dépendance externe nouvelle** : un service d'envoi d'email (SES ou SMTP), avec ses secrets en variables d'environnement.
- **Risque à consigner :** introduit une dépendance externe susceptible d'échouer en démonstration ; décider si un compte non vérifié reste utilisable en lecture seule ou est bloqué.

- [ ] **Step 2 : Mettre le backlog à jour**

Dans `docs/BACKLOG.md`, ajouter les trois lignes à la fin de la table de **EP05 — Frontend Multi-support** (l'en-tête de section est à la ligne 123), en respectant le format des lignes voisines :

```markdown
| [SH-51](tickets/SH-51-retouches-ux-demo.md) | Retouches UX avant soutenance (rôles, identité, inscription, recherche, catalogue) | 🟠 En cours | 5 | C2.1.2, C2.2.2, C2.2.3, C2.4.1 | — |
| [SH-52](tickets/SH-52-photo-de-profil.md) | Photo de profil (upload S3, URL signée) | 🔵 Backlog | 5 | C2.2.3, C2.4.1 | — |
| [SH-53](tickets/SH-53-verification-email.md) | Vérification du compte par email | 🔵 Backlog | 8 | C2.2.3, C2.4.1 | Dépendance SMTP externe |
```

- [ ] **Step 3 : Vérifier les liens**

Run: `cd .. && grep -o "tickets/SH-5[123][^)]*" docs/BACKLOG.md | while read -r f; do test -f "docs/$f" && echo "OK $f" || echo "MANQUANT $f"; done`
Expected: trois lignes `OK`.

- [ ] **Step 4 : Committer**

```bash
git add docs/BACKLOG.md docs/tickets/SH-52-photo-de-profil.md docs/tickets/SH-53-verification-email.md
git commit -m "docs(SH-51): trace SH-52 et SH-53, hors perimetre de la soutenance

Photo de profil et verification par email ont ete ecartees du perimetre faute
de temps, pas faute d'interet : la premiere demande de mobiliser le stockage
S3, la seconde ajoute une dependance SMTP externe susceptible d'echouer en
demonstration. Elles rejoignent le backlog plutot que d'etre oubliees.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Recette finale

- [ ] **Suite complète des deux services**

```bash
cd backend-core && npm run lint && npm run test && npm run build && cd ../frontend-web && npm run lint && npm run format:check && npm run test && npm run build && cd ..
```
Expected: PASS partout.

- [ ] **Parcours recruteur de bout en bout**

Se connecter en recruteur. Vérifier : arrivée sur `/recherche` ; carte visible immédiatement ; puces de compétences fonctionnelles ; aucune trace d'Armurerie ; « Recruteur » en français sur la page compte ; nom d'utilisateur affiché ; un seul chemin vers les messages ; onglet « SkillHunt » avec le logo vert.

- [ ] **Parcours freelance de bout en bout**

Se connecter en freelance. Vérifier : arrivée sur `/mon-armurerie` ; déclaration d'un DJI Mavic 3 Enterprise via les suggestions ; déclaration d'un matériel hors catalogue tout aussi possible.

- [ ] **Non-régression de session (scénario 7)**

Se connecter, puis dans la console du navigateur, confirmer que la session survit à un access token dépourvu de `username` — c'est le cas de tout jeton émis avant ce lot. Le nom affiché doit se rabattre sur la partie locale de l'email, sans déconnexion.

- [ ] **Audit d'accessibilité**

Run: `cd frontend-web && npm run audit:a11y`
Expected: score ≥ 90. Points de vigilance introduits par ce lot : `aria-pressed` sur les puces de compétences, valeur du rayon portée par le libellé du curseur, et contraste du vert `hud-positive` sur les puces actives.
