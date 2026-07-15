# SH-21a — Armurerie : grille d'inventaire (vue privée) — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Livrer l'écran « Mon Armurerie » (vue privée freelance) du frontend web : grille de fiches d'équipement responsive, filtres par catégorie, barre de progression, états vide/chargement/erreur — branchée sur l'API réelle `GET /api/v1/gear/me`.

**Architecture :** Le backend expose déjà l'endpoint (SH-9) mais **sans réponse typée dans le Swagger** : `schema.d.ts` génère aujourd'hui `content?: never` pour `GET /gear/me`, donc le front n'a aucun type de réponse. La tâche 1 complète le Swagger (DTOs de réponse) et régénère le contrat ; les tâches suivantes construisent la feature front `src/features/gear/` (composants purs + hook TanStack Query) puis la page `src/pages/Armurerie.tsx` branchée sur une route protégée.

**Tech Stack :** backend-core (NestJS 11, `@nestjs/swagger`, Jest) · frontend-web (React 19, TypeScript strict, Tailwind v4, shadcn/ui, lucide-react, TanStack Query, Axios, Vitest + React Testing Library + MSW).

**Références (à lire avant de coder) :**
- Spec de design (**fait foi pour l'UI**) : `docs/superpowers/specs/2026-07-01-armurerie-grille-inventaire-design.md`
- Ticket : `docs/tickets/SH-21-armurerie-gamifiee.md` (tranche **21a** du §6)
- Conventions : `CLAUDE.md` (racine), `backend-core/CLAUDE.md`, `frontend-web/CLAUDE.md`

## Global Constraints

- **Branche :** `feature/SH-21a-armurerie-grille-inventaire` (déjà créée depuis `develop`). **Jamais** de commit direct sur `develop` ou `main`.
- **Langue :** commentaires et textes d'interface **en français** ; identifiants (variables, fonctions, composants) **en anglais**.
- **Traçabilité RNCP :** référencer la compétence en commentaire quand un bloc l'illustre (`C2.4.1` documentation/Swagger, `C2.2.2` tests, `C2.1.2` qualité/lint).
- **API :** tout appel HTTP passe par `apiClient` (`@/api/client`). Jamais de `fetch`/`axios` direct.
- **Types API :** `frontend-web/src/api/schema.d.ts` est **généré** (`npm run gen:api`). **Ne jamais l'éditer à la main.**
- **Tokens de couleur :** la palette de la spec (§3) vit dans le thème Tailwind (`src/index.css`). **Aucune couleur hexadécimale codée en dur** dans un composant — un test le vérifie automatiquement (tâche 2).
- **Accessibilité (R6) :** le statut ne repose **jamais** sur la couleur seule ; le libellé texte (« VALIDÉ » / « ATTENTE » / « REJETÉ ») accompagne toujours la pastille colorée. Chips filtrantes = vrais `<button>` (navigables au clavier).
- **Sécurité :** `serialNumber` n'est **jamais affiché** dans l'interface (donnée sensible ; cf. SH-39). Aucun token en `localStorage`/`sessionStorage`.
- **Palette (spec §3), valeurs exactes :** fond `#0a0e14` · carte `#111820` (bordure `#5c6e88` — révisée 2026-07-15 depuis `#1e2732` pour WCAG 1.4.11, cf. spec §3) · pastille icône `#152232` (bordure `#21384f`, icône `#4f9eff`) · validé/CTA `#2ee6a8` · attente `#f59e0b` · rejeté `#f43f5e` · texte secondaire `#7b8794`.
- **Catégorie = icône, jamais couleur.** La pastille d'icône est **neutre et identique pour toutes les catégories**.
- **Formatage :** dans `frontend-web/`, lancer **`npm run format`** avant chaque commit (Prettier est bloquant en CI ; `singleQuote: true`, `printWidth: 100` — une chaîne contenant une apostrophe s'écrit donc entre guillemets doubles : `"l'arsenal"`, jamais `'l\'arsenal'`).
- **Commits :** Conventional Commits avec scope — `feat(SH-21a/frontend): …`, `feat(SH-21a/backend): …`, `test(SH-21a/frontend): …`.

## File Structure

**backend-core** (tâche 1)
- Créer `src/gear/dto/gear-response.dto.ts` — `GearResponseDto` + `PaginatedGearDto` (contrat OpenAPI de sortie).
- Créer `src/gear/gear.controller.spec.ts` — vérifie que le document OpenAPI type réellement les réponses.
- Modifier `src/gear/gear.controller.ts` — ajouter `@ApiOkResponse` / `@ApiCreatedResponse`.

**frontend-web** (tâches 2 → 6)
- Modifier `src/index.css` — tokens de couleur de l'Armurerie (thème HUD).
- Modifier `src/api/schema.d.ts` — **régénéré** (tâche 1), jamais édité.
- Créer `src/features/gear/types.ts` — types dérivés du contrat généré.
- Créer `src/features/gear/gear-meta.ts` — libellés + icônes par catégorie, libellés + classes par statut.
- Créer `src/features/gear/GearStatusBadge.tsx` — badge point + libellé.
- Créer `src/features/gear/GearCard.tsx` — fiche technique horizontale.
- Créer `src/features/gear/GearProgress.tsx` — barre de progression `VALIDATED` / total.
- Créer `src/features/gear/GearCategoryChips.tsx` — chips de filtre.
- Créer `src/features/gear/GearEmptyState.tsx` — état vide.
- Créer `src/features/gear/GearGrid.tsx` — grille responsive 1 → 2 colonnes.
- Créer `src/features/gear/useMyGear.ts` — hook TanStack Query.
- Créer `src/pages/Armurerie.tsx` — page « Mon Armurerie » (assemblage + états).
- Modifier `src/app/routes.tsx` — route protégée `/mon-armurerie`.
- Modifier `src/pages/Account.tsx` — lien vers l'Armurerie (rendre la page atteignable).

**Décision d'architecture à acter (le ticket §4 l'exige par écrit) :** **filtrage côté client.**
Le casier est chargé en **une seule requête** (`GET /api/v1/gear/me?limit=100`, plafond du backend) et les chips filtrent **en mémoire**. Raisons : (a) la barre de progression a besoin du **total tous statuts**, donc la donnée complète doit de toute façon être en mémoire ; (b) re-requêter à chaque chip ferait N appels réseau pour une donnée déjà chargée ; (c) un casier de freelance dépasse rarement 100 équipements. Si `total > items.length`, la page l'indique explicitement (la pagination au-delà de 100 relève d'une itération ultérieure). Cette décision est reportée dans le ticket en tâche 7.

---

### Task 1: Contrat OpenAPI des endpoints Armurerie (backend) + régénération du schéma front

**Contexte :** `GearController` porte `@ApiOperation` mais **aucune réponse typée**. Résultat : le Swagger déclare la 200 sans `content`, et `openapi-typescript` génère `content?: never` — le front ne peut pas typer la réponse de `GET /gear/me`. On complète donc le Swagger (C2.4.1) **avant** d'écrire la moindre ligne de front.

**Files:**
- Create: `backend-core/src/gear/dto/gear-response.dto.ts`
- Create: `backend-core/src/gear/gear.controller.spec.ts`
- Modify: `backend-core/src/gear/gear.controller.ts`
- Regenerate: `frontend-web/src/api/schema.d.ts` (via `npm run gen:api`, **jamais à la main**)

**Interfaces:**
- Consumes: `GearStatus`, `GearCategory` (`backend-core/src/common/enums.ts`) ; `PaginatedGear` (`gear.service.ts` : `{ items: Gear[]; total: number; page: number; limit: number }`).
- Produces: schémas OpenAPI `GearResponseDto` (champs `id`, `brand`, `model`, `serialNumber`, `category`, `status`, `createdAt`, `freelanceId`) et `PaginatedGearDto` (`items`, `total`, `page`, `limit`) — consommés par le front en tâche 2 via `components['schemas'][…]`.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `backend-core/src/gear/gear.controller.spec.ts` :

```ts
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import { GearController } from './gear.controller';
import { GearService } from './gear.service';

/**
 * Contrat OpenAPI de l'Armurerie (C2.4.1).
 *
 * Le frontend génère ses types depuis ce document (`npm run gen:api`) : une route sans
 * réponse typée produit un `content?: never` côté client, donc une réponse non typable.
 * Ces tests verrouillent le contrat consommé par la grille d'inventaire (SH-21a).
 */
describe("GearController — contrat OpenAPI (C2.4.1)", () => {
  let app: INestApplication;
  let document: OpenAPIObject;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [GearController],
      // Le document OpenAPI se construit à partir des métadonnées : les dépendances
      // réelles (service, guards) ne sont jamais appelées, de simples doublures suffisent.
      providers: [
        { provide: GearService, useValue: {} },
        { provide: JwtService, useValue: {} },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    document = SwaggerModule.createDocument(app, new DocumentBuilder().build());
  });

  afterAll(async () => {
    await app.close();
  });

  it("type la réponse 200 de GET /api/v1/gear/me en PaginatedGearDto", () => {
    const response = document.paths['/api/v1/gear/me'].get?.responses['200'];
    expect(response).toMatchObject({
      content: {
        'application/json': { schema: { $ref: '#/components/schemas/PaginatedGearDto' } },
      },
    });
  });

  it("type la réponse 201 de POST /api/v1/gear en GearResponseDto", () => {
    const response = document.paths['/api/v1/gear'].post?.responses['201'];
    expect(response).toMatchObject({
      content: {
        'application/json': { schema: { $ref: '#/components/schemas/GearResponseDto' } },
      },
    });
  });

  it("décrit PaginatedGearDto comme une page d'équipements typés", () => {
    const paginated = document.components?.schemas?.PaginatedGearDto;
    expect(paginated).toMatchObject({
      properties: {
        items: { items: { $ref: '#/components/schemas/GearResponseDto' } },
        total: { type: 'number' },
        page: { type: 'number' },
        limit: { type: 'number' },
      },
    });
  });

  it("expose tous les champs réellement sérialisés par l'entité Gear", () => {
    const gear = document.components?.schemas?.GearResponseDto;
    expect(Object.keys((gear as { properties: object }).properties)).toEqual(
      expect.arrayContaining([
        'id',
        'brand',
        'model',
        'serialNumber',
        'category',
        'status',
        'createdAt',
        'freelanceId',
      ]),
    );
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `cd backend-core && npx jest src/gear/gear.controller.spec.ts`
Expected: FAIL — la réponse 200 n'a pas de `content` (et `PaginatedGearDto` est absent des schémas).

- [ ] **Step 3: Créer les DTOs de réponse**

Créer `backend-core/src/gear/dto/gear-response.dto.ts` :

```ts
import { ApiProperty } from '@nestjs/swagger';
import { GearCategory, GearStatus } from '../../common/enums';

/**
 * Équipement tel que renvoyé par l'API (C2.4.1).
 * Miroir exact des champs sérialisés par l'entité `Gear` : ne rien y déclarer que
 * l'entité ne renvoie pas — le front génère ses types depuis ce contrat.
 */
export class GearResponseDto {
  @ApiProperty({ format: 'uuid', example: '3f1b2c9e-6d54-4a1b-9d0e-7c2f5a8b1234' })
  id!: string;

  @ApiProperty({ example: 'DJI', description: 'Marque de l\'équipement' })
  brand!: string;

  @ApiProperty({ example: 'Mavic 3 Enterprise', description: 'Modèle exact' })
  model!: string;

  @ApiProperty({
    example: 'SN-123456789',
    description:
      'Numéro de série — donnée sensible : renvoyée uniquement au propriétaire du casier, jamais dans une vue publique (SH-39)',
  })
  serialNumber!: string;

  @ApiProperty({ enum: GearCategory, example: GearCategory.DRONE })
  category!: GearCategory;

  @ApiProperty({ enum: GearStatus, example: GearStatus.PENDING })
  status!: GearStatus;

  @ApiProperty({ format: 'date-time', example: '2026-07-14T09:12:33.000Z' })
  createdAt!: Date;

  @ApiProperty({
    format: 'uuid',
    description: 'Propriétaire (Freelance) — déduit du token, jamais d\'un identifiant client',
  })
  freelanceId!: string;
}

/** Page de résultats de l'Armurerie (miroir de `PaginatedGear`, gear.service.ts). */
export class PaginatedGearDto {
  @ApiProperty({ type: [GearResponseDto] })
  items!: GearResponseDto[];

  @ApiProperty({
    example: 12,
    description: 'Nombre total d\'équipements correspondant au filtre appliqué',
  })
  total!: number;

  @ApiProperty({ example: 1, description: 'Page courante (1-indexée)' })
  page!: number;

  @ApiProperty({ example: 20, description: 'Taille de page appliquée' })
  limit!: number;
}
```

- [ ] **Step 4: Brancher les réponses typées sur le contrôleur**

Modifier `backend-core/src/gear/gear.controller.ts` — remplacer le bloc d'import Swagger et ajouter les décorateurs de réponse sur les 4 routes (le reste du fichier est inchangé) :

```ts
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiCreatedResponse,
} from '@nestjs/swagger';
import { GearResponseDto, PaginatedGearDto } from './dto/gear-response.dto';
```

```ts
  @Post()
  @Roles(UserRole.FREELANCE)
  @ApiOperation({ summary: 'Déclarer un équipement dans son casier (Freelance)' })
  @ApiCreatedResponse({ type: GearResponseDto, description: 'Équipement déclaré, en attente de validation' })
  addGear(@CurrentUser() user: JwtPayload, @Body() dto: AddGearDto) {
    // Identité issue du token : aucun {id} client n'est accepté (anti-usurpation, OWASP)
    return this.gearService.addGearToLocker(user.userId, dto);
  }

  @Get('me')
  @Roles(UserRole.FREELANCE)
  @ApiOperation({ summary: 'Lister son propre matériel (filtres + pagination)' })
  @ApiOkResponse({ type: PaginatedGearDto, description: 'Page du casier du Freelance authentifié' })
  getMyGear(@CurrentUser() user: JwtPayload, @Query() query: QueryGearDto) {
    // Un Freelance ne peut interroger que SON casier (étanchéité garantie par l'id du token)
    return this.gearService.getFreelanceGear(user.userId, query);
  }

  @Get('pending')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'File de validation : matériel en attente (Admin)' })
  @ApiOkResponse({ type: PaginatedGearDto, description: 'Page des équipements en attente de validation' })
  getPending(@Query() query: QueryGearDto) {
    return this.gearService.listPendingForValidation(query);
  }

  @Patch(':id/review')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Valider ou rejeter un équipement (Admin)' })
  @ApiOkResponse({ type: GearResponseDto, description: 'Équipement après décision (VALIDATED ou REJECTED)' })
  review(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReviewGearDto) {
    return this.gearService.reviewGear(id, dto.decision);
  }
```

- [ ] **Step 5: Lancer les tests backend**

Run: `cd backend-core && npm test`
Expected: PASS — les 4 tests du contrat OpenAPI passent, et la suite existante (`gear.service.spec.ts`, auth…) reste verte.
Run aussi : `npm run lint` → aucune erreur.

- [ ] **Step 6: Régénérer le contrat consommé par le front**

`gen:api` interroge le Swagger d'un backend **démarré** (qui a besoin de sa base) :

```bash
cd backend-core
docker compose up -d          # PostgreSQL + PostGIS (port hôte 5433)
npm run start:dev             # laisser tourner dans un terminal → http://localhost:3001
```

Dans un second terminal :

```bash
cd frontend-web
npm run gen:api               # réécrit src/api/schema.d.ts depuis http://localhost:3001/api/docs-json
```

Vérifier que `frontend-web/src/api/schema.d.ts` contient désormais `GearResponseDto` et `PaginatedGearDto`, et que la 200 de `GearController_getMyGear` n'est plus `content?: never` :

Run: `grep -n "PaginatedGearDto\|GearResponseDto" frontend-web/src/api/schema.d.ts | head`
Expected: plusieurs occurrences (schémas + référence dans la réponse 200).

Puis arrêter le backend (Ctrl+C). Lancer `cd frontend-web && npm run format` (Prettier normalise le fichier généré) puis `npm run test` et `npm run build` : la CI front doit rester verte malgré le nouveau schéma.

- [ ] **Step 7: Commit**

```bash
git add backend-core/src/gear/dto/gear-response.dto.ts backend-core/src/gear/gear.controller.ts backend-core/src/gear/gear.controller.spec.ts frontend-web/src/api/schema.d.ts
git commit -m "feat(SH-21a/backend): réponses Swagger typées pour l'Armurerie + régénération du contrat front"
```

---

### Task 2: Tokens de couleur (thème HUD) + types et métadonnées de l'Armurerie

**Contexte :** Fondations du front : la palette de la spec devient un jeu de tokens Tailwind (aucune couleur en dur ailleurs), et les types/libellés/icônes sont centralisés pour que les composants des tâches 3-6 ne dupliquent rien.

**Files:**
- Modify: `frontend-web/src/index.css`
- Create: `frontend-web/src/features/gear/types.ts`
- Create: `frontend-web/src/features/gear/gear-meta.ts`
- Test: `frontend-web/src/features/gear/gear-meta.test.ts`

**Interfaces:**
- Consumes: `components['schemas']['GearResponseDto' | 'PaginatedGearDto']` (tâche 1).
- Produces:
  - `types.ts` : `type Gear`, `type PaginatedGear`, `type GearStatus` (`'PENDING' | 'VALIDATED' | 'REJECTED'`), `type GearCategory` (`'DRONE' | 'CAMERA_360' | 'ROBOTICS' | 'SENSOR' | 'OTHER'`).
  - `gear-meta.ts` : `CATEGORY_META: Record<GearCategory, { label: string; Icon: LucideIcon }>`, `STATUS_META: Record<GearStatus, { label: string; dotClass: string; textClass: string }>`, `GEAR_CATEGORIES: GearCategory[]`, `GEAR_STATUSES: GearStatus[]`.
  - Classes Tailwind disponibles pour toutes les tâches suivantes : `bg-hud-bg`, `bg-hud-card`, `border-hud-border`, `bg-hud-pill`, `border-hud-pill-border`, `text-hud-icon`, `bg-hud-positive`/`text-hud-positive`, `bg-hud-pending`/`text-hud-pending`, `bg-hud-rejected`/`text-hud-rejected`, `text-hud-muted`.

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `frontend-web/src/features/gear/gear-meta.test.ts` :

```ts
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { CATEGORY_META, GEAR_CATEGORIES, GEAR_STATUSES, STATUS_META } from './gear-meta';

describe("Métadonnées de l'Armurerie (SH-21a)", () => {
  it('couvre toutes les catégories de matériel du backend', () => {
    expect(GEAR_CATEGORIES).toEqual(['DRONE', 'CAMERA_360', 'ROBOTICS', 'SENSOR', 'OTHER']);
    for (const category of GEAR_CATEGORIES) {
      expect(CATEGORY_META[category].label).not.toHaveLength(0);
      expect(CATEGORY_META[category].Icon).toBeTypeOf('function');
    }
  });

  it('couvre tous les statuts, chacun avec un libellé TEXTE (jamais la couleur seule — R6)', () => {
    expect(GEAR_STATUSES).toEqual(['VALIDATED', 'PENDING', 'REJECTED']);
    expect(STATUS_META.VALIDATED.label).toBe('VALIDÉ');
    expect(STATUS_META.PENDING.label).toBe('ATTENTE');
    expect(STATUS_META.REJECTED.label).toBe('REJETÉ');
  });
});

// Garde-fou de design (spec §3) : la palette vit dans les tokens Tailwind (src/index.css).
// Une couleur écrite en dur dans un composant échapperait au thème et pourrait, par exemple,
// réintroduire une couleur par catégorie — que la spec interdit explicitement.
describe("Palette de l'Armurerie — aucune couleur codée en dur", () => {
  const sources = [
    ...readdirSync(join(process.cwd(), 'src/features/gear'))
      .filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file))
      .map((file) => join('src/features/gear', file)),
  ];

  it.each(sources)("%s n'écrit aucune couleur hexadécimale", (source) => {
    const content = readFileSync(join(process.cwd(), source), 'utf8');
    expect(content).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `cd frontend-web && npx vitest run src/features/gear/gear-meta.test.ts`
Expected: FAIL — `Failed to resolve import "./gear-meta"`.

- [ ] **Step 3: Ajouter les tokens de couleur**

Modifier `frontend-web/src/index.css` — insérer ce bloc **après** le bloc `@theme inline { … }` existant (ne rien retirer) :

```css
/* Palette « HUD tactique » de l'Armurerie (SH-21a), transcrite de la spec de design
   docs/superpowers/specs/2026-07-01-armurerie-grille-inventaire-design.md §3.
   Règles portées par ces tokens :
   - le vert est RÉSERVÉ au sens « validé / CTA / live » — il ne code jamais une catégorie ;
   - la pastille d'icône est neutre et identique pour TOUTES les catégories (la catégorie se
     lit dans l'icône, jamais dans une couleur). */
@theme {
  --color-hud-bg: #0a0e14; /* fond d'écran */
  --color-hud-card: #111820; /* fond de fiche */
  --color-hud-border: #1e2732; /* bordure de fiche */
  --color-hud-pill: #152232; /* pastille d'icône (neutre) */
  --color-hud-pill-border: #21384f;
  --color-hud-icon: #4f9eff;
  --color-hud-positive: #2ee6a8; /* VALIDATED / CTA / live */
  --color-hud-pending: #f59e0b; /* PENDING */
  --color-hud-rejected: #f43f5e; /* REJECTED */
  --color-hud-muted: #7b8794; /* texte secondaire, labels meta */
}
```

- [ ] **Step 4: Créer les types du domaine**

Créer `frontend-web/src/features/gear/types.ts` :

```ts
import type { components } from '@/api/schema';

// Types du contrat API — générés depuis le Swagger backend (`npm run gen:api`, SH-21a).
// On dérive au lieu de redéclarer : un changement de DTO backend casse la compilation ici.
export type Gear = components['schemas']['GearResponseDto'];
export type PaginatedGear = components['schemas']['PaginatedGearDto'];
export type GearCategory = Gear['category'];
export type GearStatus = Gear['status'];
```

- [ ] **Step 5: Créer les métadonnées d'affichage**

Créer `frontend-web/src/features/gear/gear-meta.ts` :

```ts
import { Bot, Box, Camera, Drone, Radar, type LucideIcon } from 'lucide-react';
import type { GearCategory, GearStatus } from './types';

// Catégorie : l'identité visuelle passe par l'ICÔNE, jamais par la couleur (spec §3).
// La pastille qui porte l'icône est neutre et identique pour toutes les catégories.
export const CATEGORY_META: Record<GearCategory, { label: string; Icon: LucideIcon }> = {
  DRONE: { label: 'Drone', Icon: Drone },
  CAMERA_360: { label: 'Caméra 360°', Icon: Camera },
  ROBOTICS: { label: 'Robotique', Icon: Bot },
  SENSOR: { label: 'Capteur', Icon: Radar },
  OTHER: { label: 'Autre', Icon: Box },
};

// Statut : le libellé TEXTE accompagne toujours la pastille colorée — l'information ne
// repose jamais sur la couleur seule (accessibilité R6).
export const STATUS_META: Record<
  GearStatus,
  { label: string; dotClass: string; textClass: string }
> = {
  VALIDATED: { label: 'VALIDÉ', dotClass: 'bg-hud-positive', textClass: 'text-hud-positive' },
  PENDING: { label: 'ATTENTE', dotClass: 'bg-hud-pending', textClass: 'text-hud-pending' },
  REJECTED: { label: 'REJETÉ', dotClass: 'bg-hud-rejected', textClass: 'text-hud-rejected' },
};

// Ordre d'affichage stable (chips de filtre, tests d'exhaustivité).
export const GEAR_CATEGORIES: GearCategory[] = [
  'DRONE',
  'CAMERA_360',
  'ROBOTICS',
  'SENSOR',
  'OTHER',
];

export const GEAR_STATUSES: GearStatus[] = ['VALIDATED', 'PENDING', 'REJECTED'];
```

- [ ] **Step 6: Lancer les tests pour vérifier qu'ils passent**

Run: `cd frontend-web && npx vitest run src/features/gear/gear-meta.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
cd frontend-web && npm run format && npm run lint
git add frontend-web/src/index.css frontend-web/src/features/gear/
git commit -m "feat(SH-21a/frontend): tokens de thème HUD + types et métadonnées de l'Armurerie"
```

---

### Task 3: Fiche équipement (`GearStatusBadge` + `GearCard`)

**Contexte :** Le composant central de la spec (§4) : fiche technique **horizontale** — pastille icône neutre → `brand` + `model` → badge de statut à droite.

**Files:**
- Create: `frontend-web/src/features/gear/GearStatusBadge.tsx`
- Create: `frontend-web/src/features/gear/GearCard.tsx`
- Test: `frontend-web/src/features/gear/GearCard.test.tsx`

**Interfaces:**
- Consumes: `CATEGORY_META`, `STATUS_META` (tâche 2) ; `type Gear` (tâche 2) ; `cn()` (`@/lib/utils`).
- Produces: `<GearStatusBadge status={…} />` ; `<GearCard gear={…} />` — rend un `<li>` (la grille de la tâche 6 est un `<ul>`).

- [ ] **Step 1: Écrire le test qui échoue**

Créer `frontend-web/src/features/gear/GearCard.test.tsx` :

```tsx
import { render, screen } from '@testing-library/react';
import { GearCard } from './GearCard';
import type { Gear } from './types';

function makeGear(overrides: Partial<Gear> = {}): Gear {
  return {
    id: 'g-1',
    brand: 'DJI',
    model: 'Mavic 3 Enterprise',
    serialNumber: 'SN-123456789',
    category: 'DRONE',
    status: 'VALIDATED',
    createdAt: '2026-07-01T10:00:00.000Z',
    freelanceId: 'u-1',
    ...overrides,
  } as Gear;
}

function renderCard(gear: Gear) {
  return render(
    <ul>
      <GearCard gear={gear} />
    </ul>,
  );
}

describe('GearCard — fiche équipement (SH-21a)', () => {
  it('affiche la marque, le modèle et le libellé de catégorie', () => {
    renderCard(makeGear());
    expect(screen.getByText('DJI Mavic 3 Enterprise')).toBeInTheDocument();
    expect(screen.getByText('Drone')).toBeInTheDocument();
  });

  it.each([
    ['VALIDATED', 'VALIDÉ'],
    ['PENDING', 'ATTENTE'],
    ['REJECTED', 'REJETÉ'],
  ] as const)('affiche le libellé texte du statut %s (jamais la couleur seule)', (status, label) => {
    renderCard(makeGear({ status }));
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("n'affiche jamais le numéro de série (donnée sensible)", () => {
    renderCard(makeGear());
    expect(screen.queryByText(/SN-123456789/)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `cd frontend-web && npx vitest run src/features/gear/GearCard.test.tsx`
Expected: FAIL — `Failed to resolve import "./GearCard"`.

- [ ] **Step 3: Écrire les composants**

Créer `frontend-web/src/features/gear/GearStatusBadge.tsx` :

```tsx
import { cn } from '@/lib/utils';
import { STATUS_META } from './gear-meta';
import type { GearStatus } from './types';

/**
 * Badge de statut : point coloré + libellé (spec §3).
 * Le point est décoratif (`aria-hidden`) — c'est le TEXTE qui porte l'information, pour que
 * le statut reste lisible sans percevoir la couleur (R6).
 */
export function GearStatusBadge({ status }: { status: GearStatus }) {
  const { label, dotClass, textClass } = STATUS_META[status];

  return (
    <span
      className={cn('flex shrink-0 items-center gap-1.5 text-xs font-semibold tracking-widest', textClass)}
    >
      <span aria-hidden="true" className={cn('h-2 w-2 rounded-full', dotClass)} />
      {label}
    </span>
  );
}
```

Créer `frontend-web/src/features/gear/GearCard.tsx` :

```tsx
import { CATEGORY_META } from './gear-meta';
import { GearStatusBadge } from './GearStatusBadge';
import type { Gear } from './types';

/**
 * Fiche technique horizontale (spec §4) : pastille d'icône neutre → marque + modèle →
 * badge de statut. La catégorie se lit dans l'ICÔNE et le label texte, jamais dans une couleur.
 *
 * `serialNumber` n'est délibérément pas affiché : donnée sensible, inutile à l'écran.
 */
export function GearCard({ gear }: { gear: Gear }) {
  const { label, Icon } = CATEGORY_META[gear.category];

  return (
    <li className="bg-hud-card border-hud-border flex items-center gap-4 rounded-lg border p-4">
      <span className="bg-hud-pill border-hud-pill-border flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border">
        <Icon aria-hidden="true" className="text-hud-icon h-6 w-6" />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate font-bold text-white">
          {gear.brand} {gear.model}
        </span>
        <span className="text-hud-muted block text-xs tracking-widest uppercase">{label}</span>
      </span>

      <GearStatusBadge status={gear.status} />
    </li>
  );
}
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `cd frontend-web && npx vitest run src/features/gear/`
Expected: PASS (GearCard + gear-meta, dont le garde-fou « aucune couleur en dur » qui couvre désormais les deux nouveaux fichiers).

- [ ] **Step 5: Commit**

```bash
cd frontend-web && npm run format && npm run lint
git add frontend-web/src/features/gear/
git commit -m "feat(SH-21a/frontend): fiche équipement horizontale + badge de statut"
```

---

### Task 4: Progression, chips de filtre et état vide

**Contexte :** Les trois composants d'en-tête et l'état vide (spec §5.1 et §5.4). Le CTA « + Ajouter … » est **rendu désactivé** : l'écran de déclaration de matériel est hors périmètre de SH-21a (spec §2 « hors scope : le flow d'ajout ») — il sera branché par le ticket dédié ouvert en tâche 7. Un CTA désactivé et explicite vaut mieux qu'un bouton qui mène à une 404.

**Files:**
- Create: `frontend-web/src/features/gear/GearProgress.tsx`
- Create: `frontend-web/src/features/gear/GearCategoryChips.tsx`
- Create: `frontend-web/src/features/gear/GearEmptyState.tsx`
- Test: `frontend-web/src/features/gear/GearProgress.test.tsx`
- Test: `frontend-web/src/features/gear/GearCategoryChips.test.tsx`
- Test: `frontend-web/src/features/gear/GearEmptyState.test.tsx`

**Interfaces:**
- Consumes: `CATEGORY_META` (tâche 2), `type GearCategory` (tâche 2), `Button` (`@/components/ui/button`), `cn()` (`@/lib/utils`).
- Produces:
  - `<GearProgress validated={number} total={number} />`
  - `<GearCategoryChips categories={GearCategory[]} selected={GearCategory | null} onSelect={(c: GearCategory | null) => void} />` — `null` = chip « Tous ».
  - `<GearEmptyState />`

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `frontend-web/src/features/gear/GearProgress.test.tsx` :

```tsx
import { render, screen } from '@testing-library/react';
import { GearProgress } from './GearProgress';

describe('GearProgress — part de matériel validé (SH-21a)', () => {
  it('affiche le ratio et le pourcentage validé', () => {
    render(<GearProgress validated={3} total={12} />);
    expect(screen.getByText('3/12')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '25');
  });

  it('ne divise pas par zéro quand le casier est vide', () => {
    render(<GearProgress validated={0} total={0} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  });
});
```

Créer `frontend-web/src/features/gear/GearCategoryChips.test.tsx` :

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GearCategoryChips } from './GearCategoryChips';

describe('GearCategoryChips — filtre par catégorie (SH-21a)', () => {
  it('rend une chip « Tous » puis une chip par catégorie présente dans le casier', () => {
    render(<GearCategoryChips categories={['DRONE', 'SENSOR']} selected={null} onSelect={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Tous' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Drone' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Capteur' })).toBeInTheDocument();
    // Aucune chip pour une catégorie absente du casier.
    expect(screen.queryByRole('button', { name: 'Robotique' })).not.toBeInTheDocument();
  });

  it('remonte la catégorie choisie, et `null` pour « Tous »', async () => {
    const onSelect = vi.fn();
    render(<GearCategoryChips categories={['DRONE']} selected="DRONE" onSelect={onSelect} />);

    await userEvent.click(screen.getByRole('button', { name: 'Drone' }));
    expect(onSelect).toHaveBeenCalledWith('DRONE');

    await userEvent.click(screen.getByRole('button', { name: 'Tous' }));
    expect(onSelect).toHaveBeenCalledWith(null);
  });
});
```

Créer `frontend-web/src/features/gear/GearEmptyState.test.tsx` :

```tsx
import { render, screen } from '@testing-library/react';
import { GearEmptyState } from './GearEmptyState';

describe('GearEmptyState — casier vide (SH-21a)', () => {
  it("affiche le message d'arsenal vide, l'impact sur le matching et un CTA unique", () => {
    render(<GearEmptyState />);

    expect(screen.getByRole('heading', { name: 'Ton arsenal est vide' })).toBeInTheDocument();
    expect(screen.getByText(/matching/i)).toBeInTheDocument();

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveAccessibleName('+ Ajouter mon premier équipement');
  });
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `cd frontend-web && npx vitest run src/features/gear/`
Expected: FAIL — imports `./GearProgress`, `./GearCategoryChips`, `./GearEmptyState` introuvables.

- [ ] **Step 3: Écrire `GearProgress`**

Créer `frontend-web/src/features/gear/GearProgress.tsx` :

```tsx
/**
 * Part de matériel VALIDATED sur le total déclaré (spec §5.1).
 * Signal de fiabilité et petit ressort de gamification : aucun champ backend supplémentaire,
 * le ratio est calculé côté front à partir des statuts.
 */
export function GearProgress({ validated, total }: { validated: number; total: number }) {
  const percent = total === 0 ? 0 : Math.round((validated / total) * 100);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-hud-muted flex justify-between text-xs tracking-widest uppercase">
        <span>Matériel validé</span>
        <span>{`${validated}/${total}`}</span>
      </p>
      <div
        role="progressbar"
        aria-label="Part de matériel validé"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        className="bg-hud-pill h-2 w-full overflow-hidden rounded-full"
      >
        <div className="bg-hud-positive h-full rounded-full" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Écrire `GearCategoryChips`**

Créer `frontend-web/src/features/gear/GearCategoryChips.tsx` :

```tsx
import { cn } from '@/lib/utils';
import { CATEGORY_META } from './gear-meta';
import type { GearCategory } from './types';

interface GearCategoryChipsProps {
  /** Catégories réellement présentes dans le casier (spec §5.1 : pas de chip vide). */
  categories: GearCategory[];
  /** Catégorie active ; `null` = chip « Tous ». */
  selected: GearCategory | null;
  onSelect: (category: GearCategory | null) => void;
}

/**
 * Chips de filtre par catégorie (spec §5.1). Ce sont de vrais <button> : navigables au
 * clavier et annoncés par les lecteurs d'écran via `aria-pressed` (R6).
 */
export function GearCategoryChips({ categories, selected, onSelect }: GearCategoryChipsProps) {
  const chipClass = (active: boolean) =>
    cn(
      'rounded-full border px-3 py-1 text-xs tracking-widest uppercase transition-colors',
      active
        ? 'border-hud-positive text-hud-positive bg-hud-pill'
        : 'border-hud-border text-hud-muted hover:text-white',
    );

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        aria-pressed={selected === null}
        onClick={() => onSelect(null)}
        className={chipClass(selected === null)}
      >
        Tous
      </button>

      {categories.map((category) => (
        <button
          key={category}
          type="button"
          aria-pressed={selected === category}
          onClick={() => onSelect(category)}
          className={chipClass(selected === category)}
        >
          {CATEGORY_META[category].label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Écrire `GearEmptyState`**

Créer `frontend-web/src/features/gear/GearEmptyState.tsx` :

```tsx
import { PackageOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * État vide de la vue privée (spec §5.4).
 *
 * Le CTA est volontairement DÉSACTIVÉ : l'écran de déclaration de matériel est hors du
 * périmètre de SH-21a (spec §2). Un bouton désactivé et explicite vaut mieux qu'un lien qui
 * mènerait à une 404.
 */
export function GearEmptyState() {
  return (
    <section className="border-hud-border bg-hud-card flex flex-col items-center gap-3 rounded-lg border border-dashed p-10 text-center">
      <PackageOpen aria-hidden="true" className="text-hud-muted h-12 w-12" />
      <h2 className="text-lg font-bold text-white">Ton arsenal est vide</h2>
      <p className="text-hud-muted max-w-sm text-sm">
        Déclare ton matériel : chaque équipement validé renforce ta crédibilité et améliore ta
        pertinence dans le matching des missions.
      </p>
      <Button disabled title="Écran de déclaration de matériel à venir">
        + Ajouter mon premier équipement
      </Button>
    </section>
  );
}
```

- [ ] **Step 6: Lancer les tests pour vérifier qu'ils passent**

Run: `cd frontend-web && npx vitest run src/features/gear/`
Expected: PASS (progression, chips, état vide, fiche, métadonnées, garde-fou couleurs).

- [ ] **Step 7: Commit**

```bash
cd frontend-web && npm run format && npm run lint
git add frontend-web/src/features/gear/
git commit -m "feat(SH-21a/frontend): barre de progression, chips de filtre et état vide de l'Armurerie"
```

---

### Task 5: Hook de données `useMyGear`

**Contexte :** Le seul point d'accès réseau de la feature. Charge le casier en **une** requête (`limit=100`, plafond du backend) — décision de filtrage côté client actée en tête de plan.

**Files:**
- Create: `frontend-web/src/features/gear/useMyGear.ts`
- Test: `frontend-web/src/features/gear/useMyGear.test.tsx`

**Interfaces:**
- Consumes: `apiClient` (`@/api/client`) ; `type PaginatedGear` (tâche 2).
- Produces: `useMyGear(): UseQueryResult<PaginatedGear, AxiosError>` ; constantes exportées `GEAR_PAGE_LIMIT = 100` et `myGearQueryKey = ['gear', 'me']`.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `frontend-web/src/features/gear/useMyGear.test.tsx` :

```tsx
import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { DEFAULT_API_URL } from '@/api/client';
import { useMyGear } from './useMyGear';

const url = (path: string) => `${DEFAULT_API_URL}${path}`;

function wrapper({ children }: { children: ReactNode }) {
  // `retry: false` : sans cela, TanStack Query réessaierait 3 fois avant d'exposer l'erreur.
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useMyGear — chargement du casier (SH-21a)', () => {
  it('charge le casier en une requête et demande la page maximale', async () => {
    let requestedLimit: string | null = null;

    server.use(
      http.get(url('/api/v1/gear/me'), ({ request }) => {
        requestedLimit = new URL(request.url).searchParams.get('limit');
        return HttpResponse.json({
          items: [
            {
              id: 'g-1',
              brand: 'DJI',
              model: 'Mavic 3',
              serialNumber: 'SN-1',
              category: 'DRONE',
              status: 'VALIDATED',
              createdAt: '2026-07-01T10:00:00.000Z',
              freelanceId: 'u-1',
            },
          ],
          total: 1,
          page: 1,
          limit: 100,
        });
      }),
    );

    const { result } = renderHook(() => useMyGear(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.items).toHaveLength(1);
    expect(result.current.data?.total).toBe(1);
    expect(requestedLimit).toBe('100');
  });

  it("expose l'erreur quand l'API échoue (pas de plantage silencieux)", async () => {
    server.use(http.get(url('/api/v1/gear/me'), () => new HttpResponse(null, { status: 500 })));

    const { result } = renderHook(() => useMyGear(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `cd frontend-web && npx vitest run src/features/gear/useMyGear.test.tsx`
Expected: FAIL — `Failed to resolve import "./useMyGear"`.

- [ ] **Step 3: Écrire le hook**

Créer `frontend-web/src/features/gear/useMyGear.ts` :

```ts
import { useQuery } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { apiClient } from '@/api/client';
import type { PaginatedGear } from './types';

/**
 * Chargement du casier du freelance authentifié (`GET /api/v1/gear/me`).
 *
 * Le casier est chargé en UNE requête et les chips filtrent ensuite en mémoire (SH-21a) :
 * la barre de progression a de toute façon besoin du total tous statuts, et re-requêter à
 * chaque chip ferait N appels réseau pour une donnée déjà chargée.
 *
 * L'identité vient du token (jamais d'un id client) et le bearer est injecté par les
 * intercepteurs d'`apiClient` (SH-20) — ne pas les court-circuiter.
 */
export const GEAR_PAGE_LIMIT = 100; // plafond imposé par QueryGearDto côté backend
export const myGearQueryKey = ['gear', 'me'] as const;

export function useMyGear() {
  return useQuery<PaginatedGear, AxiosError>({
    queryKey: myGearQueryKey,
    queryFn: async () => {
      const { data } = await apiClient.get<PaginatedGear>('/api/v1/gear/me', {
        params: { limit: GEAR_PAGE_LIMIT },
      });
      return data;
    },
  });
}
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `cd frontend-web && npx vitest run src/features/gear/useMyGear.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
cd frontend-web && npm run format && npm run lint
git add frontend-web/src/features/gear/
git commit -m "feat(SH-21a/frontend): hook useMyGear (chargement du casier via apiClient)"
```

---

### Task 6: Grille responsive + page « Mon Armurerie » + route protégée

**Contexte :** Assemblage de la tranche verticale : grille 1 → 2 colonnes, en-tête, états chargement/erreur/vide, RBAC vu du front (un RECRUITER reçoit un 403 sur `/gear/me` — on lui explique pourquoi plutôt que d'afficher une erreur générique).

**Files:**
- Create: `frontend-web/src/features/gear/GearGrid.tsx`
- Create: `frontend-web/src/pages/Armurerie.tsx`
- Test: `frontend-web/src/pages/Armurerie.test.tsx`
- Modify: `frontend-web/src/app/routes.tsx`
- Modify: `frontend-web/src/app/router.test.tsx`
- Modify: `frontend-web/src/pages/Account.tsx`

**Interfaces:**
- Consumes: tout ce que produisent les tâches 2 à 5 (`useMyGear`, `GearCard`, `GearProgress`, `GearCategoryChips`, `GearEmptyState`, `GEAR_CATEGORIES`, types) ; `ProtectedRoute` (`@/features/auth/ProtectedRoute`).
- Produces: `<GearGrid items={Gear[]} />` ; page par défaut `Armurerie` ; route `/mon-armurerie`.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `frontend-web/src/pages/Armurerie.test.tsx` :

```tsx
import type { ReactNode } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { DEFAULT_API_URL } from '@/api/client';
import type { Gear } from '@/features/gear/types';
import Armurerie from './Armurerie';

const url = (path: string) => `${DEFAULT_API_URL}${path}`;

function makeGear(overrides: Partial<Gear>): Gear {
  return {
    id: 'g-1',
    brand: 'DJI',
    model: 'Mavic 3',
    serialNumber: 'SN-1',
    category: 'DRONE',
    status: 'VALIDATED',
    createdAt: '2026-07-01T10:00:00.000Z',
    freelanceId: 'u-1',
    ...overrides,
  } as Gear;
}

const LOCKER: Gear[] = [
  makeGear({ id: 'g-1', brand: 'DJI', model: 'Mavic 3', category: 'DRONE', status: 'VALIDATED' }),
  makeGear({ id: 'g-2', brand: 'Insta360', model: 'Pro 2', category: 'CAMERA_360', status: 'PENDING' }),
  makeGear({ id: 'g-3', brand: 'Flir', model: 'Vue TZ20', category: 'SENSOR', status: 'REJECTED' }),
];

function respondWith(items: Gear[]) {
  return http.get(url('/api/v1/gear/me'), () =>
    HttpResponse.json({ items, total: items.length, page: 1, limit: 100 }),
  );
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(<Armurerie />, { wrapper });
}

describe('Page Mon Armurerie — vue privée (SH-21a)', () => {
  it('affiche un état de chargement pendant la requête', () => {
    server.use(respondWith(LOCKER));
    renderPage();
    expect(screen.getByRole('status')).toHaveTextContent(/chargement/i);
  });

  it('affiche le compteur, la progression et toutes les fiches, tous statuts confondus', async () => {
    server.use(respondWith(LOCKER));
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Mon Armurerie' })).toBeInTheDocument();
    expect(screen.getByText('3 équipements')).toBeInTheDocument();
    // 1 VALIDATED sur 3 → 33 %
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '33');

    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByText('VALIDÉ')).toBeInTheDocument();
    expect(screen.getByText('ATTENTE')).toBeInTheDocument();
    expect(screen.getByText('REJETÉ')).toBeInTheDocument();
  });

  it('filtre la liste sur la catégorie choisie, et « Tous » la rétablit', async () => {
    server.use(respondWith(LOCKER));
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Drone' }));

    const list = screen.getByRole('list');
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    expect(within(list).getByText('DJI Mavic 3')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Tous' }));
    expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(3);
  });

  it("affiche l'état vide quand le casier ne contient aucun équipement", async () => {
    server.use(respondWith([]));
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Ton arsenal est vide' })).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it("affiche une erreur en français avec « Réessayer » quand l'API échoue, et recharge au clic", async () => {
    server.use(http.get(url('/api/v1/gear/me'), () => new HttpResponse(null, { status: 500 })));
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent(/impossible de charger/i);

    server.use(respondWith(LOCKER));
    await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }));

    expect(await screen.findByText('DJI Mavic 3')).toBeInTheDocument();
  });

  it("explique le 403 d'un compte non-freelance (RBAC vu du front)", async () => {
    server.use(http.get(url('/api/v1/gear/me'), () => new HttpResponse(null, { status: 403 })));
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent(/réservée aux freelances/i);
    expect(screen.queryByRole('button', { name: 'Réessayer' })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `cd frontend-web && npx vitest run src/pages/Armurerie.test.tsx`
Expected: FAIL — `Failed to resolve import "./Armurerie"`.

- [ ] **Step 3: Écrire la grille**

Créer `frontend-web/src/features/gear/GearGrid.tsx` :

```tsx
import { GearCard } from './GearCard';
import type { Gear } from './types';

/**
 * Grille d'inventaire (spec §5.3) : une colonne en mobile (< 1024px, priorité Lot 1),
 * deux colonnes à partir de `lg` (≥ 1024px). Liste sémantique (<ul>/<li>) : les fiches
 * sont annoncées comme une liste par les lecteurs d'écran.
 */
export function GearGrid({ items }: { items: Gear[] }) {
  return (
    <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {items.map((gear) => (
        <GearCard key={gear.id} gear={gear} />
      ))}
    </ul>
  );
}
```

- [ ] **Step 4: Écrire la page**

Créer `frontend-web/src/pages/Armurerie.tsx` :

```tsx
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { GearCategoryChips } from '@/features/gear/GearCategoryChips';
import { GearEmptyState } from '@/features/gear/GearEmptyState';
import { GearGrid } from '@/features/gear/GearGrid';
import { GearProgress } from '@/features/gear/GearProgress';
import { GEAR_CATEGORIES } from '@/features/gear/gear-meta';
import type { GearCategory } from '@/features/gear/types';
import { useMyGear } from '@/features/gear/useMyGear';

/**
 * Vue privée de l'Armurerie (SH-21a) — le freelance voit TOUS ses équipements, quel que soit
 * leur statut de validation : c'est précisément l'information qu'il vient chercher (spec §5.1).
 *
 * Le filtre par catégorie s'applique en mémoire sur le casier déjà chargé (cf. useMyGear).
 */
export default function Armurerie() {
  const { data, isPending, isError, error, refetch } = useMyGear();
  const [category, setCategory] = useState<GearCategory | null>(null);

  const items = useMemo(() => data?.items ?? [], [data]);

  // Chips : uniquement les catégories réellement présentes dans le casier (spec §5.1),
  // dans l'ordre d'affichage stable de GEAR_CATEGORIES.
  const presentCategories = useMemo(
    () => GEAR_CATEGORIES.filter((c) => items.some((gear) => gear.category === c)),
    [items],
  );

  const visibleItems = useMemo(
    () => (category === null ? items : items.filter((gear) => gear.category === category)),
    [items, category],
  );

  const validatedCount = items.filter((gear) => gear.status === 'VALIDATED').length;
  const total = data?.total ?? 0;

  return (
    <main className="bg-hud-bg min-h-screen p-4 lg:p-8">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-widest text-white uppercase">Mon Armurerie</h1>
          {!isPending && !isError && (
            <p className="text-hud-muted text-sm">
              {`${total} équipement${total > 1 ? 's' : ''}`}
            </p>
          )}
        </header>

        {isPending && (
          <p role="status" className="text-hud-muted">
            Chargement de ton armurerie…
          </p>
        )}

        {isError &&
          // 403 : le backend réserve GET /gear/me au rôle FREELANCE (RBAC). Réessayer n'y
          // changerait rien — on explique au lieu de proposer une action inutile.
          (error?.response?.status === 403 ? (
            <p role="alert" className="text-hud-pending">
              Cette page est réservée aux freelances.
            </p>
          ) : (
            <div className="flex flex-col items-start gap-3">
              <p role="alert" className="text-hud-rejected">
                Impossible de charger ton armurerie.
              </p>
              <Button onClick={() => void refetch()}>Réessayer</Button>
            </div>
          ))}

        {!isPending && !isError && items.length === 0 && <GearEmptyState />}

        {!isPending && !isError && items.length > 0 && (
          <>
            <GearProgress validated={validatedCount} total={items.length} />
            <GearCategoryChips
              categories={presentCategories}
              selected={category}
              onSelect={setCategory}
            />
            <GearGrid items={visibleItems} />

            {total > items.length && (
              <p className="text-hud-muted text-xs">
                Affichage des {items.length} équipements les plus récents.
              </p>
            )}

            {/* CTA désactivé : l'écran de déclaration de matériel est hors périmètre SH-21a. */}
            <Button disabled title="Écran de déclaration de matériel à venir" className="self-start">
              + Ajouter du matériel
            </Button>
          </>
        )}
      </div>
    </main>
  );
}
```

- [ ] **Step 5: Lancer les tests de la page**

Run: `cd frontend-web && npx vitest run src/pages/Armurerie.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 6: Brancher la route protégée et le lien depuis « Mon compte »**

Modifier `frontend-web/src/app/routes.tsx` — ajouter l'import et l'entrée de route **avant** la route `*` :

```tsx
import Armurerie from '@/pages/Armurerie';
```

```tsx
  {
    path: '/mon-armurerie',
    element: (
      <ProtectedRoute>
        <Armurerie />
      </ProtectedRoute>
    ),
  },
```

Modifier `frontend-web/src/pages/Account.tsx` — importer `Link` et rendre l'Armurerie atteignable (remplacer le bloc du bouton de déconnexion par les deux boutons) :

```tsx
import { Link, useNavigate } from 'react-router-dom';
```

```tsx
      <div className="flex gap-3">
        <Button asChild>
          <Link to="/mon-armurerie">Mon Armurerie</Link>
        </Button>
        <Button variant="outline" onClick={handleLogout}>
          Se déconnecter
        </Button>
      </div>
```

Ajouter dans `frontend-web/src/app/router.test.tsx`, à l'intérieur du `describe('router', …)` :

```tsx
  it('redirige un visiteur non connecté de /mon-armurerie vers /login', async () => {
    renderAt('/mon-armurerie');
    expect(await screen.findByRole('heading', { name: 'Connexion' })).toBeInTheDocument();
  });
```

- [ ] **Step 7: Lancer toute la suite front**

Run: `cd frontend-web && npm run format && npm run lint && npm run test && npm run build`
Expected: tout est vert (le test de `Account` existant continue de trouver le bouton « Se déconnecter »).

- [ ] **Step 8: Commit**

```bash
git add frontend-web/src/features/gear/ frontend-web/src/pages/ frontend-web/src/app/
git commit -m "feat(SH-21a/frontend): page Mon Armurerie (grille responsive, filtres, états) + route protégée"
```

---

### Task 7: Documentation, backlog et vérification de bout en bout

**Contexte :** Clore la tranche : acter les décisions dans le ticket, ouvrir le ticket de suite (écran de déclaration de matériel, aujourd'hui un CTA désactivé), et **vérifier l'écran dans un vrai navigateur** — une suite verte ne prouve pas qu'une classe Tailwind inexistante produit la bonne couleur (leçon de SH-20 / SH-41).

**Files:**
- Modify: `docs/tickets/SH-21-armurerie-gamifiee.md`
- Modify: `docs/BACKLOG.md`
- Modify: `frontend-web/CLAUDE.md`

- [ ] **Step 1: Acter les décisions dans le ticket SH-21**

Dans `docs/tickets/SH-21-armurerie-gamifiee.md` :
- §4, remplacer la ligne « Décider par écrit : filtre côté serveur ou côté client » par la décision retenue : **une requête `limit=100`, filtrage par catégorie en mémoire** (la barre de progression a besoin du total tous statuts ; au-delà de 100 équipements, la page l'indique explicitement).
- §6, marquer **SH-21a** comme livrée (date, numéro de PR une fois ouverte).
- §7, cocher les items de la DoD réellement satisfaits ; laisser décochés ceux qui relèvent de 21b/21c.
- Noter que le CTA d'ajout est **désactivé** dans 21a (écran de déclaration hors périmètre) et pointer le nouveau ticket ci-dessous.

- [ ] **Step 2: Mettre à jour le backlog**

Dans `docs/BACKLOG.md` :
- Passer la ligne SH-21 (ou ajouter une ligne SH-21a) au statut livré, avec le lien vers le ticket.
- Ajouter une ligne pour le ticket de suite : **SH-43 — Armurerie : écran de déclaration de matériel** (`POST /api/v1/gear`), statut 🔵 À faire — c'est lui qui activera les CTA « + Ajouter … » aujourd'hui désactivés.

- [ ] **Step 3: Documenter la convention front**

Dans `frontend-web/CLAUDE.md`, section « Règles spécifiques », ajouter :

```markdown
- **Armurerie (SH-21a)** : la palette « HUD tactique » vit dans les tokens Tailwind de `src/index.css` (`--color-hud-*`). **Aucune couleur hexadécimale dans un composant** — un test (`features/gear/gear-meta.test.ts`) le vérifie. La catégorie de matériel se lit dans l'**icône** (pastille neutre), jamais dans une couleur ; le statut porte toujours un **libellé texte** en plus de la pastille colorée (R6).
```

- [ ] **Step 4: Vérifier dans un vrai navigateur**

```bash
cd backend-core && docker compose up -d && npm run start:dev   # terminal 1
cd frontend-web && npm run dev                                  # terminal 2 → http://localhost:5173
```

Avec un compte **FREELANCE** (en créer un via `/register` si besoin, puis déclarer 2-3 équipements via Swagger `POST /api/v1/gear` sur http://localhost:3001/api/docs) :
- `/mon-armurerie` affiche le fond sombre, les fiches, la pastille d'icône **bleue neutre** et les badges (vert / ambre / rose) — si une couleur manque, le token Tailwind n'a pas été généré.
- Réduire la fenêtre sous 1024px → **une colonne** ; au-dessus → **deux colonnes**.
- Cliquer une chip → la liste se filtre sans nouvelle requête réseau (onglet Réseau).
- Avec un compte **RECRUITER** : `/mon-armurerie` affiche « Cette page est réservée aux freelances. »

- [ ] **Step 5: Vérification finale des deux services**

Run: `cd backend-core && npm run lint && npm test && npm run build`
Run: `cd frontend-web && npm run lint && npm run format:check && npm run test && npm run build`
Expected: tout vert.

- [ ] **Step 6: Commit**

```bash
git add docs/ frontend-web/CLAUDE.md
git commit -m "docs(SH-21a): décisions de filtrage, DoD, backlog et convention de thème Armurerie"
```

---

## Notes de vigilance (pièges connus de ce dépôt)

- **Prettier bloque la CI front.** Lancer `npm run format` avant chaque commit. `singleQuote: true` : une chaîne contenant une apostrophe s'écrit `"l'arsenal"` — **jamais** `'l\'arsenal'`.
- **`schema.d.ts` ne s'édite pas à la main.** Il se régénère (tâche 1) avec le backend démarré.
- **Un test vert ne prouve pas que l'écran s'affiche.** Aucun test n'exécute Tailwind : une classe `bg-hud-*` inexistante passerait la suite sans produire la moindre couleur. D'où la vérification navigateur de la tâche 7.
- **Redis local :** le port 6379 est occupé par un Redis personnel de l'utilisateur — **ne jamais le vider (`FLUSHDB`)**. Le backend en dev n'en a pas besoin pour l'Armurerie.
