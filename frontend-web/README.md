# frontend-web

Web App React de SkillHunt — Lot 1.

## Stack

Vite · React 18 · TypeScript strict · React Router · Tailwind CSS + shadcn/ui + Lucide · TanStack Query + Axios · Vitest + React Testing Library · ESLint (flat config) + Prettier.

## Commandes

```bash
npm ci           # installation reproductible des dépendances
npm run dev      # dev (Vite, hot reload) → http://localhost:5173
npm run lint     # ESLint
npm run test     # Vitest
npm run build    # compilation TypeScript + build de production (dist/)
npm run gen:api  # régénère src/api/schema.d.ts depuis le Swagger du backend (backend-core sur :3001)
```

Voir `frontend-web/CLAUDE.md` pour les conventions détaillées de ce service.
