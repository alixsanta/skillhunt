# Design — Setup Web React (SH-19)

> Date : 2026-07-07
> Ticket : [SH-19](../../tickets/SH-19-setup-web-react.md) — EP05 Frontend Multi-support
> Lot : Lot 1 (Web MVP)

## Contexte

Le backend-core (NestJS) est fonctionnel sur trois modules réels : Auth (register/login/refresh/logout, JWT RS256), Armurerie (déclaration/liste/validation de matériel), Certifications (upload/liste/Signed URL/validation). Aucun frontend n'existe encore dans le monorepo. L'objectif de ce ticket est de poser les fondations techniques du frontend web pour permettre aux tickets suivants (SH-20 Auth, SH-21 Armurerie, etc.) de démarrer sur une base saine, sans écran métier à ce stade.

## Décisions

| Sujet | Décision |
|---|---|
| Emplacement | `frontend-web/`, service standalone (pas de workspace npm racine), sibling de `backend-core/` et `matching-service/` |
| Bundler / framework | Vite + React 19 + TypeScript strict |
| Routing | React Router |
| Design system | Tailwind CSS + shadcn/ui (composants Radix accessibles, copiés dans le repo) + Lucide (icônes) |
| Data fetching | TanStack Query + Axios (instance avec intercepteurs, base pour la gestion future du refresh JWT) |
| Types API | Générés depuis le Swagger du backend (`openapi-typescript`, script `npm run gen:api` ciblant `/api/docs-json`), fichier **committé** dans `src/api/schema.d.ts` |
| Tests | Vitest + React Testing Library |
| Lint/format | ESLint + Prettier, config alignée sur les standards TypeScript strict du projet |
| Port dev | 5173 (défaut Vite), pas de conflit avec `backend-core` (3001) |

## Structure de dossiers

Organisation **par feature**, miroir du pattern `backend-core` (§7 CLAUDE.md racine) :

```
frontend-web/
├── src/
│   ├── app/                    # Bootstrap : App.tsx, router, providers (QueryClient…)
│   ├── pages/                  # Une page = une route (placeholders SH-19 : Home, NotFound)
│   ├── components/ui/          # Composants shadcn/ui générés (Button, Input, Card…)
│   ├── features/               # Vide pour l'instant — chaque feature future (auth/, gear/, certifications/…) y aura son dossier
│   ├── api/
│   │   ├── client.ts           # Instance Axios (baseURL via VITE_API_URL, intercepteurs)
│   │   └── schema.d.ts         # Généré depuis /api/docs-json (openapi-typescript), committé
│   ├── lib/                    # Utils partagés (cn(), formatters…)
│   └── main.tsx
├── .env.example                 # VITE_API_URL=http://localhost:3001
├── index.html
├── vite.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── CLAUDE.md                    # Conventions locales frontend-web (pattern backend-core/CLAUDE.md)
└── package.json
```

Aucun écran métier dans `pages/` ou `features/` à ce stade — juste la coquille (Home + NotFound + layout de base) validant que routing + design system + client API fonctionnent ensemble.

## CI/CD

Nouveau workflow `.github/workflows/frontend-ci.yml`, calqué sur `node-ci.yml` :
- Déclencheurs : `push`/`pull_request` vers `main`/`develop`, filtré sur `paths: frontend-web/**` et le fichier de workflow lui-même.
- `working-directory: frontend-web`.
- Étapes : `npm ci` → `npm audit --audit-level=high` → `npm run lint` → `npm run test` → `npm run build`.
- Pas de service Redis (pas de dépendance backend en CI pour ce ticket — la génération de types API n'est pas relancée en CI, le fichier committé fait foi).

## Hors périmètre (tickets suivants)

- Tout écran métier (register/login → SH-20, Armurerie → SH-21, matching → SH-22, cartographie → SH-23, chat → SH-24).
- Gestion réelle du token JWT côté client (stockage, refresh automatique via intercepteur Axios) — posée en base dans `client.ts` mais activée avec SH-20.
- Audit accessibilité CI (SH-27) et éco-conception CI (SH-28) — dette suivie séparément.

## Definition of Done

- [ ] `frontend-web/` scaffoldé, démarre en dev (`npm run dev` → `localhost:5173`)
- [ ] Routing fonctionnel (Home `/` + fallback 404)
- [ ] Tailwind + shadcn/ui configurés, un composant Button de démo l'atteste
- [ ] Client Axios pointant sur `VITE_API_URL`, types générés depuis Swagger (`npm run gen:api`) et committés
- [ ] Vitest configuré, au moins un test smoke passant
- [ ] Lint + build verts en local
- [ ] CI GitHub Actions verte (nouveau workflow `frontend-ci.yml`)
- [ ] `frontend-web/CLAUDE.md` local créé
- [ ] `docs/tickets/SH-19-setup-web-react.md` rédigé, `docs/BACKLOG.md` mis à jour (🔵 → 🟢)
