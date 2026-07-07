# CLAUDE.md — frontend-web (Web App React)

> Contexte local. Hérite du `CLAUDE.md` racine — ici on ne décrit que les conventions **spécifiques au frontend web**.

## Rôle du service
Web App **responsive Mobile-First** de SkillHunt (Lot 1). React 18 · TypeScript strict · Vite · port **5173**.
Consomme l'API `backend-core` (NestJS, port 3001) et, à terme, le `matching-service`.

## Stack
Vite · React 18 · React Router · Tailwind CSS + shadcn/ui + Lucide · TanStack Query + Axios · Vitest + React Testing Library · ESLint (flat config) + Prettier.

## Organisation (pattern à respecter)
Organisation **par feature**, miroir du backend :
- `src/app/` — bootstrap (App, router, providers).
- `src/pages/` — une page = une route.
- `src/features/<feature>/` — logique et composants d'une feature métier (auth, gear…).
- `src/components/ui/` — composants shadcn/ui (générés, ne pas éditer à la main sauf besoin).
- `src/api/` — `client.ts` (instance Axios) + `schema.d.ts` (types **générés**, ne pas éditer).
- `src/lib/` — utilitaires partagés (`cn()`…).

## Règles spécifiques
- **Langue** : commentaires et textes UI en **français** ; identifiants en **anglais**.
- **API** : toujours passer par l'instance `apiClient` (`@/api/client`), jamais d'appel `fetch`/`axios` direct dispersé.
- **Types API** : régénérer via `npm run gen:api` (backend démarré sur 3001) quand les DTOs backend changent. Ne jamais éditer `src/api/schema.d.ts` à la main.
- **Secrets** : URL d'API via `VITE_API_URL` (`.env`, git-ignoré). Jamais de secret en dur.
- **Tests** : Vitest + React Testing Library ; tester du point de vue utilisateur (rôles/labels accessibles), pas les détails d'implémentation.
- **Accessibilité** : viser WCAG (audit CI formalisé en SH-27) ; préférer les composants shadcn/ui (Radix) accessibles par défaut.

## Commandes
```bash
npm ci
npm run dev      # http://localhost:5173
npm run lint
npm run test
npm run build
npm run gen:api  # régénère src/api/schema.d.ts depuis le Swagger backend
```
