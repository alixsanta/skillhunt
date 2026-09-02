# SH-18a — Portfolio (front web) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendre le flux entrant de SH-16a utilisable et démontrable — une grille qui dit honnêtement où en est chaque média, un dépôt en trois temps avec progression réelle, et trois points d'entrée pour publier.

**Architecture:** Un dossier `features/media/` calqué sur `features/gear/` : types dérivés du contrat généré, table de métadonnées, composants de présentation purs, hooks react-query. Le `PUT` vers le stockage est isolé dans son propre module parce qu'il doit **échapper** aux intercepteurs d'authentification. Aucun lecteur vidéo : il dépend des routes de lecture de SH-17.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind 4, react-router-dom, TanStack Query 5, axios, lucide-react, Vitest + Testing Library + MSW.

**Spec de référence :** [`docs/superpowers/specs/2026-08-31-SH-18a-portfolio-front-design.md`](../specs/2026-08-31-SH-18a-portfolio-front-design.md)

## Global Constraints

- **Langue** : commentaires et textes d'interface **en français**, identifiants **en anglais** (CLAUDE.md §7).
- **Traçabilité RNCP** : SH-18a vise **C2.4.1** (interface, Swagger), **C2.2.2** (tests), **C2.1.2** (normes).
- **Nommage** : « **Portfolio** », jamais « Mon portfolio ». Route `/portfolio`.
- **Le statut se lit dans le TEXTE**, jamais dans la couleur seule : pastille `aria-hidden` + libellé, calque de `GearStatusBadge`. L'audit Lighthouse de SH-27 est **bloquant sous 90**.
- **Types dérivés du contrat généré** (`@/api/schema`), jamais redéclarés à la main : un changement de DTO backend doit casser la compilation du front.
- **Le `PUT` vers le stockage ne passe JAMAIS par `apiClient`** — voir Task 6. C'est la règle la plus importante de ce lot.
- **Harnais de test en `onUnhandledRequest: 'error'`** : toute requête non simulée fait échouer le test. Il faut donc un handler explicite pour le `PUT` de stockage.
- **Jetons de couleur** : `hud-positive`, `hud-pending`, `hud-rejected`, `hud-muted`, `hud-border`, `hud-card`, `hud-pill`, `hud-icon`. Ne pas introduire de couleur hors de cette palette.
- **Icônes** : `lucide-react`, toujours `aria-hidden="true"` quand décoratives.
- **Branche** : `feature/SH-18a-portfolio-front` (déjà créée depuis `develop`). PR ciblant `develop`.
- **Commits** : Conventional Commits, scope `(SH-18a/front)` — ou `(SH-18a/api)` pour la Task 1, qui touche le backend.
- **Hors périmètre**, ne pas anticiper : lecteur HLS, visionneuse 360° WebGL, poster réel, suppression d'un média, édition titre/description. Ce sont **SH-18b** et **SH-17**.

---

## File Structure

**Créés — `frontend-web/src/features/media/`**

| Fichier | Responsabilité |
|---|---|
| `types.ts` | Types dérivés du contrat généré |
| `media-meta.ts` | `STATUS_META`, `MEDIA_STATUSES`, `formatDuration` |
| `MediaStatusBadge.tsx` | Pastille décorative + libellé texte |
| `MediaCard.tsx` | Une carte, sans logique de chargement |
| `MediaGrid.tsx` | La grille sémantique |
| `MediaEmptyState.tsx` | Invitation à publier |
| `MediaUploader.tsx` | Orchestration des trois étapes |
| `useMyMedia.ts` | `GET /media/me` + sondage conditionnel |
| `useCreateMedia.ts` | `POST /media` |
| `useCompleteMedia.ts` | `POST /media/:id/complete` |
| `uploadToStorage.ts` | Le `PUT` direct — **instance axios nue** |

**Créés — pages** : `pages/Portfolio.tsx`, `pages/AddMedia.tsx` (+ leurs tests).

**Créés — backend** : `backend-core/src/media/dto/media-response.dto.ts`.

**Modifiés** : `backend-core/src/media/media.controller.ts` · `frontend-web/src/api/schema.d.ts` (régénéré) · `src/app/routes.tsx` · `src/features/navigation/nav-items.ts` · `src/pages/Account.tsx` · `src/pages/FreelanceGear.tsx` · `docs/BACKLOG.md` · `docs/tickets/SH-18a-portfolio-front.md` (créé).

---

## Task 1 : Compléter le contrat d'API

**Files:**
- Create: `backend-core/src/media/dto/media-response.dto.ts`
- Modify: `backend-core/src/media/media.controller.ts`, `frontend-web/src/api/schema.d.ts` (régénéré)

**Interfaces:**
- Consumes: `MediaStatus`, `MediaType` (`backend-core/src/common/enums`), `PublicMedia`, `UploadInstructions`, `PaginatedMedia` (`media.service.ts`).
- Produces: les schémas `PublicMediaDto`, `MediaRenditionDto`, `UploadInstructionsDto`, `CreateMediaResponseDto`, `PaginatedMediaDto` dans le Swagger, donc dans `frontend-web/src/api/schema.d.ts`. **Toutes les tâches suivantes en dépendent.**

> **Pourquoi cette tâche existe.** Les `@ApiResponse` de SH-16a portent une description mais **aucun `type:`** : Swagger n'émet donc aucune forme de réponse, et le contrat généré ne contient que `CreateMediaDto` et `UpdateMediaDto`. Le front ne peut pas dériver ses types comme le fait `features/gear/types.ts`. C'est aussi une lacune de documentation : un endpoint dont la réponse n'est pas décrite n'est documenté qu'à moitié (C2.4.1). Le modèle à suivre est `backend-core/src/gear/dto/gear-response.dto.ts` — **lis-le avant d'écrire**.

- [ ] **Step 1 : Écrire les DTO de réponse — `backend-core/src/media/dto/media-response.dto.ts`**

Ce sont des **types de documentation** : le service continue de renvoyer ses interfaces, Nest ne valide pas les réponses. Leur rôle est de décrire le contrat pour Swagger, donc pour le front.

```ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MediaStatus, MediaType } from '../../common/enums';

/** Une piste de qualité, telle qu'exposée au client (sans sa clé de stockage). */
export class MediaRenditionDto {
  @ApiProperty({ example: '720p' })
  name!: string;

  @ApiProperty({ example: 1280 })
  width!: number;

  @ApiProperty({ example: 720 })
  height!: number;

  @ApiProperty({ example: 2800000, description: 'Débit cible en bits par seconde' })
  bandwidth!: number;
}

/**
 * Vue publique d'un média. Reflète `PublicMedia` (media.service.ts) : ni `sourceKey`,
 * ni `posterKey`, ni `hlsPrefix`, ni les `playlistKey` des pistes — aucune clé de
 * stockage interne ne sort de l'API.
 */
export class PublicMediaDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  freelanceId!: string;

  @ApiProperty({ example: 'Survol de chantier — Toulouse' })
  title!: string;

  @ApiProperty({ type: String, nullable: true })
  description!: string | null;

  @ApiProperty({ enum: MediaType })
  type!: MediaType;

  @ApiProperty({ enum: MediaStatus })
  status!: MediaStatus;

  @ApiProperty({ type: Number, nullable: true, description: 'Durée en secondes, sondée au transcodage' })
  durationSeconds!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  width!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  height!: number | null;

  @ApiProperty({ type: Number, nullable: true, description: 'Taille réelle du master, en octets' })
  sizeBytes!: number | null;

  @ApiProperty({ example: 'video/mp4' })
  mimeType!: string;

  @ApiProperty({ type: [MediaRenditionDto], nullable: true })
  renditions!: MediaRenditionDto[] | null;

  @ApiProperty({ type: String, nullable: true, description: 'Message court en cas d\'échec' })
  errorReason!: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty({ type: Date, nullable: true })
  processedAt!: Date | null;
}

/** Instructions de dépôt : le navigateur envoie le fichier DIRECTEMENT à cette URL. */
export class UploadInstructionsDto {
  @ApiProperty({ description: 'URL PUT signée, de courte durée' })
  url!: string;

  @ApiProperty({ example: 'PUT' })
  method!: string;

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'string' },
    description: 'En-têtes à envoyer tels quels — le Content-Type entre dans la signature',
  })
  headers!: Record<string, string>;

  @ApiProperty({ example: 900, description: 'Durée de validité de l\'URL, en secondes' })
  expiresIn!: number;
}

export class CreateMediaResponseDto {
  @ApiProperty({ type: PublicMediaDto })
  media!: PublicMediaDto;

  @ApiProperty({ type: UploadInstructionsDto })
  upload!: UploadInstructionsDto;
}

export class PaginatedMediaDto {
  @ApiProperty({ type: [PublicMediaDto] })
  items!: PublicMediaDto[];

  @ApiProperty({ example: 3 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;
}
```

- [ ] **Step 2 : Typer les réponses — `backend-core/src/media/media.controller.ts`**

Importer les DTO, puis ajouter `type:` aux `@ApiResponse` de succès existants, sans toucher aux réponses d'erreur :

- `POST /media` → `@ApiResponse({ status: 201, description: 'Média déclaré, URL de dépôt délivrée.', type: CreateMediaResponseDto })`
- `GET /media/me` → `@ApiResponse({ status: 200, description: 'Liste paginée des médias du freelance.', type: PaginatedMediaDto })`
- `PATCH /media/:id` → `@ApiResponse({ status: 200, description: 'Média mis à jour.', type: PublicMediaDto })`
- `POST /media/:id/complete` → `@ApiResponse({ status: 202, description: 'Dépôt vérifié, transcodage enfilé.', type: PublicMediaDto })`

- [ ] **Step 3 : Vérifier que le backend compile et que la suite reste verte**

```bash
docker run -d --rm -p 6381:6379 --name sh-redis-verif redis:7-alpine
```

```bash
cd /c/Users/ALX/Projects/skillhunt/backend-core && REDIS_URL=redis://127.0.0.1:6381 BOOTSTRAP_SMOKE=1 npx jest && npm run lint && npm run build
```

Attendu : suite verte, **zéro test `skipped`**, lint et build propres.

```bash
docker stop sh-redis-verif
```

- [ ] **Step 4 : Régénérer le contrat du front**

`gen:api` lit le Swagger d'un backend **qui tourne**, sur le port 3001 vu depuis l'hôte. La stack conteneurisée n'expose pas ce port (la gateway est le point d'entrée unique) : lancer le backend en direct le temps de la génération.

```bash
cd /c/Users/ALX/Projects/skillhunt/backend-core && npm run start:dev
```

Dans un autre appel, une fois le message de démarrage affiché :

```bash
cd /c/Users/ALX/Projects/skillhunt/frontend-web && npm run gen:api
```

Puis arrêter le backend de développement.

- [ ] **Step 5 : Vérifier que les schémas sont bien arrivés**

```bash
cd /c/Users/ALX/Projects/skillhunt/frontend-web && grep -oE "(PublicMediaDto|PaginatedMediaDto|CreateMediaResponseDto|UploadInstructionsDto|MediaRenditionDto)" src/api/schema.d.ts | sort -u
```

Attendu : les cinq noms. Si l'un manque, le DTO n'est pas référencé par un `type:` — corriger avant de continuer.

- [ ] **Step 6 : Commit**

```bash
git add backend-core/src/media/dto/media-response.dto.ts backend-core/src/media/media.controller.ts frontend-web/src/api/schema.d.ts
git commit -m "feat(SH-18a/api): decrit les reponses des routes media dans le contrat"
```

---

## Task 2 : Vocabulaire de présentation

**Files:**
- Create: `frontend-web/src/features/media/types.ts`, `media-meta.ts`, `MediaStatusBadge.tsx`
- Test: `frontend-web/src/features/media/media-meta.test.ts`, `MediaStatusBadge.test.tsx`

**Interfaces:**
- Consumes: les schémas de la Task 1 via `@/api/schema`.
- Produces:
  - `types.ts` : `PublicMedia`, `PaginatedMedia`, `CreateMediaResponse`, `UploadInstructions`, `CreateMediaInput`, `MediaStatus`, `MediaType`
  - `media-meta.ts` : `STATUS_META: Record<MediaStatus, { label: string; dotClass: string; textClass: string; hint: string; Icon: LucideIcon }>`, `MEDIA_STATUSES: MediaStatus[]`, `formatDuration(seconds: number | null): string`
  - `MediaStatusBadge.tsx` : `<MediaStatusBadge status={…} />`
  - Consommés par les Tasks 3, 4, 8, 9.

- [ ] **Step 1 : Écrire `types.ts`**

```ts
import type { components } from '@/api/schema';

// Types du contrat API — générés depuis le Swagger backend (`npm run gen:api`).
// On dérive au lieu de redéclarer : un changement de DTO backend casse la compilation ici.
export type PublicMedia = components['schemas']['PublicMediaDto'];
export type PaginatedMedia = components['schemas']['PaginatedMediaDto'];
export type CreateMediaResponse = components['schemas']['CreateMediaResponseDto'];
export type UploadInstructions = components['schemas']['UploadInstructionsDto'];
export type CreateMediaInput = components['schemas']['CreateMediaDto'];
export type MediaStatus = PublicMedia['status'];
export type MediaType = PublicMedia['type'];
```

- [ ] **Step 2 : Écrire le test qui échoue — `frontend-web/src/features/media/media-meta.test.ts`**

```ts
import { MEDIA_STATUSES, STATUS_META, formatDuration } from './media-meta';

describe('media-meta', () => {
  it('couvre les cinq statuts du cycle de vie', () => {
    expect(MEDIA_STATUSES).toHaveLength(5);
    expect(MEDIA_STATUSES).toEqual(
      expect.arrayContaining(['DRAFT', 'UPLOADED', 'PROCESSING', 'READY', 'FAILED']),
    );
  });

  it('donne à chaque statut un libellé TEXTE — la couleur seule ne suffit jamais', () => {
    for (const status of MEDIA_STATUSES) {
      expect(STATUS_META[status].label.trim()).not.toBe('');
      expect(STATUS_META[status].hint.trim()).not.toBe('');
    }
  });

  it('formate une durée en minutes et secondes', () => {
    expect(formatDuration(134)).toBe('2:14');
    expect(formatDuration(9)).toBe('0:09');
    expect(formatDuration(3661)).toBe('61:01');
  });

  it('rend un tiret quand la durée est inconnue', () => {
    // Tant que SH-16b n'a pas sondé le média, `durationSeconds` est null.
    expect(formatDuration(null)).toBe('—');
  });
});
```

- [ ] **Step 3 : Lancer le test pour vérifier qu'il échoue**

```bash
cd /c/Users/ALX/Projects/skillhunt/frontend-web && npx vitest run src/features/media
```

Attendu : ÉCHEC — `Failed to resolve import "./media-meta"`.

- [ ] **Step 4 : Écrire `media-meta.ts`**

```ts
import { AlertTriangle, Clock, FileVideo, Loader, PlayCircle, type LucideIcon } from 'lucide-react';
import type { MediaStatus } from './types';

/**
 * Statut : le libellé TEXTE accompagne toujours la pastille colorée — l'information ne
 * repose jamais sur la couleur seule (accessibilité R6, calque de `gear-meta.ts`).
 *
 * `hint` et `Icon` alimentent la zone visuelle de la carte : tant que SH-16b n'a pas
 * produit de poster, c'est l'état qui donne son identité visuelle à la vignette.
 */
export const STATUS_META: Record<
  MediaStatus,
  { label: string; dotClass: string; textClass: string; hint: string; Icon: LucideIcon }
> = {
  DRAFT: {
    label: 'BROUILLON',
    dotClass: 'bg-hud-muted',
    textClass: 'text-hud-muted',
    hint: 'Dépôt non confirmé',
    Icon: FileVideo,
  },
  UPLOADED: {
    label: 'DÉPOSÉE',
    dotClass: 'bg-hud-muted',
    textClass: 'text-hud-muted',
    hint: 'En file d\'attente',
    Icon: Clock,
  },
  PROCESSING: {
    label: 'EN TRAITEMENT',
    dotClass: 'bg-hud-pending',
    textClass: 'text-hud-pending',
    hint: 'Transcodage en cours',
    Icon: Loader,
  },
  READY: {
    label: 'PRÊT',
    dotClass: 'bg-hud-positive',
    textClass: 'text-hud-positive',
    hint: 'Prêt à la lecture',
    Icon: PlayCircle,
  },
  FAILED: {
    label: 'ÉCHEC',
    dotClass: 'bg-hud-rejected',
    textClass: 'text-hud-rejected',
    hint: 'Transcodage impossible',
    Icon: AlertTriangle,
  },
};

// Dérivé de la table plutôt que réécrit : `Record<Union, …>` rend une clé manquante
// impossible à compiler, donc un statut ajouté côté backend ne peut pas être oublié ici.
export const MEDIA_STATUSES = Object.keys(STATUS_META) as MediaStatus[];

/** Durée lisible. `null` tant que le média n'a pas été sondé (SH-16b). */
export function formatDuration(seconds: number | null): string {
  if (seconds === null) {
    return '—';
  }
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60);
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}
```

- [ ] **Step 5 : Écrire le test du badge — `frontend-web/src/features/media/MediaStatusBadge.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react';
import { MediaStatusBadge } from './MediaStatusBadge';

describe('MediaStatusBadge', () => {
  it.each([
    ['DRAFT', 'BROUILLON'],
    ['UPLOADED', 'DÉPOSÉE'],
    ['PROCESSING', 'EN TRAITEMENT'],
    ['READY', 'PRÊT'],
    ['FAILED', 'ÉCHEC'],
  ] as const)('affiche le libellé texte du statut %s', (status, label) => {
    render(<MediaStatusBadge status={status} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('rend la pastille décorative invisible aux lecteurs d\'écran', () => {
    const { container } = render(<MediaStatusBadge status="READY" />);
    // Le statut doit rester lisible sans percevoir la couleur : c'est le texte qui porte
    // l'information, la pastille n'est qu'un rappel visuel.
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });
});
```

- [ ] **Step 6 : Lancer le test pour vérifier qu'il échoue**

```bash
cd /c/Users/ALX/Projects/skillhunt/frontend-web && npx vitest run src/features/media
```

Attendu : ÉCHEC — `Failed to resolve import "./MediaStatusBadge"`.

- [ ] **Step 7 : Écrire `MediaStatusBadge.tsx`**

```tsx
import { cn } from '@/lib/utils';
import { STATUS_META } from './media-meta';
import type { MediaStatus } from './types';

/**
 * Badge de statut : point coloré + libellé.
 * Le point est décoratif (`aria-hidden`) — c'est le TEXTE qui porte l'information, pour que
 * le statut reste lisible sans percevoir la couleur (R6). Calque de `GearStatusBadge`.
 */
export function MediaStatusBadge({ status }: { status: MediaStatus }) {
  const { label, dotClass, textClass } = STATUS_META[status];

  return (
    <span
      className={cn(
        'flex shrink-0 items-center gap-1.5 text-xs font-semibold tracking-widest',
        textClass,
      )}
    >
      <span aria-hidden="true" className={cn('h-2 w-2 rounded-full', dotClass)} />
      {label}
    </span>
  );
}
```

- [ ] **Step 8 : Lancer les tests, le lint et la compilation**

```bash
cd /c/Users/ALX/Projects/skillhunt/frontend-web && npx vitest run src/features/media && npm run lint && npm run build
```

Attendu : PASS — 8 tests.

- [ ] **Step 9 : Commit**

```bash
git add frontend-web/src/features/media/
git commit -m "feat(SH-18a/front): vocabulaire de presentation des medias"
```

---

## Task 3 : La carte

**Files:**
- Create: `frontend-web/src/features/media/MediaCard.tsx`
- Test: `frontend-web/src/features/media/MediaCard.test.tsx`

**Interfaces:**
- Consumes: `PublicMedia`, `STATUS_META`, `formatDuration`, `MediaStatusBadge` (Task 2).
- Produces: `<MediaCard media={…} />`, rendue comme un `<li>`. Consommée par la Task 4.

- [ ] **Step 1 : Écrire le test qui échoue — `frontend-web/src/features/media/MediaCard.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react';
import { MediaCard } from './MediaCard';
import type { PublicMedia } from './types';

function makeMedia(overrides: Partial<PublicMedia> = {}): PublicMedia {
  return {
    id: 'm-1',
    freelanceId: 'u-1',
    title: 'Survol de chantier — Toulouse',
    description: null,
    type: 'VIDEO',
    status: 'READY',
    durationSeconds: 134,
    width: 3840,
    height: 2160,
    sizeBytes: 184000000,
    mimeType: 'video/mp4',
    renditions: null,
    errorReason: null,
    createdAt: '2026-08-31T10:00:00.000Z',
    processedAt: '2026-08-31T10:02:00.000Z',
    ...overrides,
  } as PublicMedia;
}

function renderCard(media: PublicMedia) {
  return render(
    <ul>
      <MediaCard media={media} />
    </ul>,
  );
}

describe('MediaCard', () => {
  it('affiche le titre', () => {
    renderCard(makeMedia());
    expect(screen.getByText('Survol de chantier — Toulouse')).toBeInTheDocument();
  });

  it.each([
    ['DRAFT', 'BROUILLON', 'Dépôt non confirmé'],
    ['UPLOADED', 'DÉPOSÉE', 'En file d\'attente'],
    ['PROCESSING', 'EN TRAITEMENT', 'Transcodage en cours'],
    ['FAILED', 'ÉCHEC', 'Transcodage impossible'],
  ] as const)('rend le statut %s avec son libellé et son indice visuel', (status, label, hint) => {
    renderCard(makeMedia({ status, durationSeconds: null }));
    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.getByText(hint)).toBeInTheDocument();
  });

  it('affiche la durée quand le média est prêt', () => {
    renderCard(makeMedia({ status: 'READY', durationSeconds: 134 }));
    expect(screen.getByText('2:14')).toBeInTheDocument();
  });

  it('n\'affiche pas de durée tant que le média n\'est pas prêt', () => {
    // `durationSeconds` reste null jusqu'au sondage de SH-16b : afficher « — » sur une
    // vignette en attente ne dirait rien à personne.
    renderCard(makeMedia({ status: 'UPLOADED', durationSeconds: null }));
    expect(screen.queryByText('—')).not.toBeInTheDocument();
  });

  it('signale une vidéo 360°, et seulement celle-là', () => {
    renderCard(makeMedia({ type: 'VIDEO_360' }));
    expect(screen.getByText('360°')).toBeInTheDocument();
  });

  it('n\'affiche pas le badge 360° sur une vidéo plate', () => {
    renderCard(makeMedia({ type: 'VIDEO' }));
    expect(screen.queryByText('360°')).not.toBeInTheDocument();
  });

  it('affiche la raison de l\'échec, qui est la seule information utile à ce stade', () => {
    renderCard(makeMedia({ status: 'FAILED', errorReason: 'Aucun flux vidéo décodable' }));
    expect(screen.getByText('Aucun flux vidéo décodable')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2 : Lancer le test pour vérifier qu'il échoue**

```bash
cd /c/Users/ALX/Projects/skillhunt/frontend-web && npx vitest run src/features/media/MediaCard
```

Attendu : ÉCHEC — `Failed to resolve import "./MediaCard"`.

- [ ] **Step 3 : Écrire `MediaCard.tsx`**

```tsx
import { STATUS_META, formatDuration } from './media-meta';
import { MediaStatusBadge } from './MediaStatusBadge';
import type { PublicMedia } from './types';

/**
 * Fiche d'un média du portfolio.
 *
 * La vignette est **dérivée de l'état** et non d'un poster : celui-ci est produit par le
 * transcodage (SH-16b), donc absent tant que le pipeline réel n'est pas livré. Chaque état
 * porte son icône et son indice textuel, si bien que la grille reste lisible même quand
 * aucun média n'a d'image.
 */
export function MediaCard({ media }: { media: PublicMedia }) {
  const { hint, Icon } = STATUS_META[media.status];
  const isReady = media.status === 'READY';

  return (
    <li className="border-hud-border bg-hud-card flex flex-col overflow-hidden rounded-lg border">
      <div className="bg-hud-pill relative flex h-24 flex-col items-center justify-center gap-2">
        <Icon aria-hidden="true" className="text-hud-icon h-6 w-6" />
        <span className="text-hud-muted text-xs">{hint}</span>

        {media.type === 'VIDEO_360' && (
          <span className="border-hud-pill-border text-hud-icon absolute top-2 left-2 rounded border px-1.5 py-0.5 text-[11px]">
            360°
          </span>
        )}

        {isReady && media.durationSeconds !== null && (
          <span className="bg-hud-bg text-hud-muted absolute right-2 bottom-2 rounded px-1.5 py-0.5 text-[11px]">
            {formatDuration(media.durationSeconds)}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1.5 p-4">
        <MediaStatusBadge status={media.status} />
        <span className="truncate font-bold text-white">{media.title}</span>
        {media.errorReason !== null && (
          <span className="text-hud-muted text-xs">{media.errorReason}</span>
        )}
      </div>
    </li>
  );
}
```

- [ ] **Step 4 : Lancer les tests**

```bash
cd /c/Users/ALX/Projects/skillhunt/frontend-web && npx vitest run src/features/media/MediaCard
```

Attendu : PASS — 10 tests.

- [ ] **Step 5 : Commit**

```bash
git add frontend-web/src/features/media/MediaCard.tsx frontend-web/src/features/media/MediaCard.test.tsx
git commit -m "feat(SH-18a/front): fiche media avec vignette derivee de l'etat"
```

---

## Task 4 : La grille et son état vide

**Files:**
- Create: `frontend-web/src/features/media/MediaGrid.tsx`, `MediaEmptyState.tsx`
- Test: `frontend-web/src/features/media/MediaGrid.test.tsx`

**Interfaces:**
- Consumes: `MediaCard` (Task 3), `PublicMedia` (Task 2).
- Produces: `<MediaGrid items={…} />` et `<MediaEmptyState />`. Consommés par les Tasks 8 et 9.

- [ ] **Step 1 : Écrire le test qui échoue — `frontend-web/src/features/media/MediaGrid.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MediaGrid } from './MediaGrid';
import { MediaEmptyState } from './MediaEmptyState';
import type { PublicMedia } from './types';

function makeMedia(id: string, title: string): PublicMedia {
  return {
    id,
    freelanceId: 'u-1',
    title,
    description: null,
    type: 'VIDEO',
    status: 'UPLOADED',
    durationSeconds: null,
    width: null,
    height: null,
    sizeBytes: null,
    mimeType: 'video/mp4',
    renditions: null,
    errorReason: null,
    createdAt: '2026-08-31T10:00:00.000Z',
    processedAt: null,
  } as PublicMedia;
}

describe('MediaGrid', () => {
  it('rend une liste sémantique nommée, annoncée comme telle', () => {
    render(<MediaGrid items={[makeMedia('m-1', 'Un'), makeMedia('m-2', 'Deux')]} />);
    expect(screen.getByRole('list', { name: 'Vidéos du portfolio' })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });
});

describe('MediaEmptyState', () => {
  it('invite à publier plutôt que de constater un vide', () => {
    render(
      <MemoryRouter>
        <MediaEmptyState />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: /ajouter ma première vidéo/i })).toHaveAttribute(
      'href',
      '/portfolio/ajouter',
    );
  });
});
```

- [ ] **Step 2 : Lancer le test pour vérifier qu'il échoue**

```bash
cd /c/Users/ALX/Projects/skillhunt/frontend-web && npx vitest run src/features/media/MediaGrid
```

Attendu : ÉCHEC — `Failed to resolve import "./MediaGrid"`.

- [ ] **Step 3 : Écrire `MediaGrid.tsx`**

```tsx
import { MediaCard } from './MediaCard';
import type { PublicMedia } from './types';

/**
 * Grille du portfolio : une colonne en mobile (priorité Lot 1), deux à partir de `lg`.
 * Liste sémantique (`<ul>`/`<li>`) et nommée : la page recruteur affiche DEUX listes
 * (matériel puis vidéos), un nom explicite les distingue pour les lecteurs d'écran
 * comme pour les tests. Calque de `GearGrid`.
 */
export function MediaGrid({ items }: { items: PublicMedia[] }) {
  return (
    <ul aria-label="Vidéos du portfolio" className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {items.map((media) => (
        <MediaCard key={media.id} media={media} />
      ))}
    </ul>
  );
}
```

- [ ] **Step 4 : Écrire `MediaEmptyState.tsx`**

```tsx
import { Link } from 'react-router-dom';
import { VideoOff } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** État vide du portfolio : une invitation à publier, pas le constat d'une absence. */
export function MediaEmptyState() {
  return (
    <section className="border-hud-border bg-hud-card flex flex-col items-center gap-3 rounded-lg border border-dashed p-10 text-center">
      <VideoOff aria-hidden="true" className="text-hud-muted h-12 w-12" />
      <h2 className="text-lg font-bold text-white">Ton portfolio est vide</h2>
      <p className="text-hud-muted max-w-sm text-sm">
        Une vidéo en dit plus qu'un CV : montre un vol, une inspection, un rush. C'est ce que
        les recruteurs regardent en premier.
      </p>
      <Button asChild>
        <Link to="/portfolio/ajouter">+ Ajouter ma première vidéo</Link>
      </Button>
    </section>
  );
}
```

- [ ] **Step 5 : Lancer les tests, le lint et la compilation**

```bash
cd /c/Users/ALX/Projects/skillhunt/frontend-web && npx vitest run src/features/media && npm run lint && npm run build
```

Attendu : PASS.

- [ ] **Step 6 : Commit**

```bash
git add frontend-web/src/features/media/MediaGrid.tsx frontend-web/src/features/media/MediaEmptyState.tsx frontend-web/src/features/media/MediaGrid.test.tsx
git commit -m "feat(SH-18a/front): grille du portfolio et son etat vide"
```

---

## Task 5 : Charger ses médias, et suivre leur état

**Files:**
- Create: `frontend-web/src/features/media/useMyMedia.ts`
- Test: `frontend-web/src/features/media/useMyMedia.test.tsx`

**Interfaces:**
- Consumes: `apiClient` (`@/api/client`), `PaginatedMedia` (Task 2).
- Produces: `useMyMedia()`, `myMediaQueryKey = ['media','me']`, `MEDIA_PAGE_LIMIT = 100`, `POLL_INTERVAL_MS = 5000`, et `hasPendingMedia(items: PublicMedia[]): boolean`. Consommés par les Tasks 8 et 9.

- [ ] **Step 1 : Écrire le test qui échoue — `frontend-web/src/features/media/useMyMedia.test.tsx`**

```tsx
import { hasPendingMedia } from './useMyMedia';
import type { PublicMedia } from './types';

function media(status: PublicMedia['status']): PublicMedia {
  return { id: status, status } as PublicMedia;
}

// Le sondage est la seule chose qui fait bouger la grille tant qu'aucun WebSocket ne
// couvre les médias : sa condition d'arrêt mérite d'être épinglée.
describe('hasPendingMedia', () => {
  it('est vrai tant qu\'un média est déposé ou en traitement', () => {
    expect(hasPendingMedia([media('READY'), media('UPLOADED')])).toBe(true);
    expect(hasPendingMedia([media('PROCESSING')])).toBe(true);
  });

  it('est faux quand tout est stabilisé', () => {
    expect(hasPendingMedia([media('READY'), media('FAILED')])).toBe(false);
    expect(hasPendingMedia([])).toBe(false);
  });

  it('ignore les brouillons : rien ne les fera avancer sans action de l\'utilisateur', () => {
    // Un DRAFT attend une confirmation de dépôt, pas un traitement serveur — le sonder
    // indéfiniment ne ferait que du trafic pour rien.
    expect(hasPendingMedia([media('DRAFT')])).toBe(false);
  });
});
```

- [ ] **Step 2 : Lancer le test pour vérifier qu'il échoue**

```bash
cd /c/Users/ALX/Projects/skillhunt/frontend-web && npx vitest run src/features/media/useMyMedia
```

Attendu : ÉCHEC — `Failed to resolve import "./useMyMedia"`.

- [ ] **Step 3 : Écrire `useMyMedia.ts`**

```ts
import { useQuery } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { apiClient } from '@/api/client';
import type { PaginatedMedia, PublicMedia } from './types';

export const MEDIA_PAGE_LIMIT = 100; // plafond imposé par QueryMediaDto côté backend
export const POLL_INTERVAL_MS = 5000;
export const myMediaQueryKey = ['media', 'me'] as const;

/**
 * Un média est « en cours » tant qu'il attend le worker. `DRAFT` n'en fait pas partie :
 * il attend une confirmation de dépôt de la part de l'utilisateur, pas un traitement
 * serveur — le sonder ne produirait que du trafic inutile.
 */
export function hasPendingMedia(items: PublicMedia[]): boolean {
  return items.some((media) => media.status === 'UPLOADED' || media.status === 'PROCESSING');
}

/**
 * Chargement du portfolio du freelance authentifié (`GET /api/v1/media/me`).
 *
 * Chargé en UNE requête, comme le casier de SH-21a : le compteur de la page compte a besoin
 * du total tous statuts, et re-requêter par statut ferait N appels pour une donnée déjà là.
 *
 * Le sondage s'arrête de lui-même dès que plus rien n'est en cours, et ne démarre jamais sur
 * un portfolio entièrement stabilisé.
 *
 * L'identité vient du token (jamais d'un id client) et le bearer est injecté par les
 * intercepteurs d'`apiClient` (SH-20) — ne pas les court-circuiter ici.
 */
export function useMyMedia() {
  return useQuery<PaginatedMedia, AxiosError>({
    queryKey: myMediaQueryKey,
    queryFn: async () => {
      const { data } = await apiClient.get<PaginatedMedia>('/api/v1/media/me', {
        params: { limit: MEDIA_PAGE_LIMIT },
      });
      return data;
    },
    refetchInterval: (query) =>
      hasPendingMedia(query.state.data?.items ?? []) ? POLL_INTERVAL_MS : false,
    // Ne jamais réessayer une erreur 4xx : un 403 (RECRUITER sur une route @Roles(FREELANCE))
    // ou un 401 (session expirée, déjà géré par les intercepteurs) est une réponse définitive
    // du serveur, pas un aléa réseau. Seuls les 5xx et les échecs réseau méritent un retry.
    retry: (failureCount, error) => {
      const status = error.response?.status;
      if (status !== undefined && status >= 400 && status < 500) {
        return false;
      }
      return failureCount < 3;
    },
  });
}
```

- [ ] **Step 4 : Lancer les tests**

```bash
cd /c/Users/ALX/Projects/skillhunt/frontend-web && npx vitest run src/features/media/useMyMedia
```

Attendu : PASS — 3 tests.

- [ ] **Step 5 : Commit**

```bash
git add frontend-web/src/features/media/useMyMedia.ts frontend-web/src/features/media/useMyMedia.test.tsx
git commit -m "feat(SH-18a/front): chargement du portfolio et sondage conditionnel"
```

---

## Task 6 : Le dépôt direct — le module le plus sensible du lot

**Files:**
- Create: `frontend-web/src/features/media/uploadToStorage.ts`, `useCreateMedia.ts`, `useCompleteMedia.ts`
- Test: `frontend-web/src/features/media/uploadToStorage.test.ts`

**Interfaces:**
- Consumes: `apiClient`, `CreateMediaInput`, `CreateMediaResponse`, `PublicMedia`, `myMediaQueryKey` (Tasks 2, 5).
- Produces:
  - `uploadToStorage({ url, file, contentType, onProgress }): Promise<void>`
  - `useCreateMedia()` → mutation `CreateMediaInput → CreateMediaResponse`
  - `useCompleteMedia()` → mutation `{ id: string } → PublicMedia`
  - Consommés par la Task 7.

> **La règle de ce module.** `apiClient` porte les intercepteurs d'authentification de SH-20 : il ajoute un `Authorization: Bearer …` à chaque requête. Envoyer cet en-tête au stockage objet **invalide la signature SigV4** de l'URL — S3 refuse le dépôt — **et transmet le jeton d'accès de l'utilisateur à un tiers**. Le `PUT` part donc d'une instance axios **nue**, créée dans ce fichier et nulle part ailleurs. Le module existe séparément pour que la règle soit évidente à la lecture et vérifiable par un test dédié.

- [ ] **Step 1 : Écrire le test qui échoue — `frontend-web/src/features/media/uploadToStorage.test.ts`**

Le harnais est en `onUnhandledRequest: 'error'` : le `PUT` doit avoir son handler explicite, sinon le test échoue pour la mauvaise raison.

```ts
import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { uploadToStorage } from './uploadToStorage';

const STORAGE_URL = 'http://localhost:4566/skillhunt-media/private/media/f1/m1/master.mp4';

describe('uploadToStorage', () => {
  it('n\'envoie AUCUN en-tête Authorization vers le stockage', async () => {
    let authorization: string | null = 'jamais lu';
    server.use(
      http.put(STORAGE_URL, ({ request }) => {
        authorization = request.headers.get('authorization');
        return new HttpResponse(null, { status: 200 });
      }),
    );

    await uploadToStorage({
      url: STORAGE_URL,
      file: new File(['x'], 'rush.mp4', { type: 'video/mp4' }),
      contentType: 'video/mp4',
      onProgress: () => {},
    });

    // Un bearer envoyé ici invaliderait la signature SigV4 ET fuiterait le jeton de
    // l'utilisateur vers un tiers. C'est la régression la plus grave que ce lot puisse
    // introduire, et la plus facile à commettre en réutilisant `apiClient` par réflexe.
    expect(authorization).toBeNull();
  });

  it('envoie le Content-Type signé, sans lequel S3 refuse le dépôt', async () => {
    let contentType: string | null = null;
    server.use(
      http.put(STORAGE_URL, ({ request }) => {
        contentType = request.headers.get('content-type');
        return new HttpResponse(null, { status: 200 });
      }),
    );

    await uploadToStorage({
      url: STORAGE_URL,
      file: new File(['x'], 'rush.mp4', { type: 'video/mp4' }),
      contentType: 'video/mp4',
      onProgress: () => {},
    });

    expect(contentType).toContain('video/mp4');
  });

  it('propage l\'échec du dépôt à l\'appelant', async () => {
    server.use(http.put(STORAGE_URL, () => new HttpResponse(null, { status: 403 })));

    await expect(
      uploadToStorage({
        url: STORAGE_URL,
        file: new File(['x'], 'rush.mp4', { type: 'video/mp4' }),
        contentType: 'video/mp4',
        onProgress: () => {},
      }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2 : Lancer le test pour vérifier qu'il échoue**

```bash
cd /c/Users/ALX/Projects/skillhunt/frontend-web && npx vitest run src/features/media/uploadToStorage
```

Attendu : ÉCHEC — `Failed to resolve import "./uploadToStorage"`.

- [ ] **Step 3 : Écrire `uploadToStorage.ts`**

```ts
import axios from 'axios';

/**
 * Client dédié au dépôt sur le stockage objet.
 *
 * Instance NUE, créée ici et nulle part ailleurs : `apiClient` porte les intercepteurs
 * d'authentification (SH-20), qui ajouteraient un en-tête `Authorization`. Cet en-tête
 * invaliderait la signature SigV4 de l'URL — le stockage refuserait le dépôt — ET
 * transmettrait le jeton d'accès de l'utilisateur à un tiers.
 *
 * Ne JAMAIS router ce PUT par `apiClient`, ni ajouter d'intercepteur ici.
 */
const storageClient = axios.create();

export interface UploadToStorageParams {
  /** URL PUT signée délivrée par `POST /api/v1/media`. */
  url: string;
  file: File;
  /** Type MIME exact que l'API a fait signer — S3 refuse le dépôt s'il diffère. */
  contentType: string;
  /** Progression en pourcentage d'octets envoyés (0–100). */
  onProgress: (percent: number) => void;
}

/** Dépose le fichier directement sur le stockage. Rejette si le stockage refuse. */
export async function uploadToStorage({
  url,
  file,
  contentType,
  onProgress,
}: UploadToStorageParams): Promise<void> {
  await storageClient.put(url, file, {
    headers: { 'Content-Type': contentType },
    onUploadProgress: (event) => {
      if (event.total) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    },
  });
}
```

- [ ] **Step 4 : Lancer le test**

```bash
cd /c/Users/ALX/Projects/skillhunt/frontend-web && npx vitest run src/features/media/uploadToStorage
```

Attendu : PASS — 3 tests.

- [ ] **Step 5 : Prouver que le test d'authentification peut échouer**

Un test qui ne peut pas échouer ne protège rien. Remplacer temporairement `storageClient` par une instance portant un en-tête d'authentification :

```ts
const storageClient = axios.create({ headers: { Authorization: 'Bearer sabotage' } });
```

```bash
cd /c/Users/ALX/Projects/skillhunt/frontend-web && npx vitest run src/features/media/uploadToStorage
```

Attendu : **ÉCHEC** du premier test. Restaurer ensuite `axios.create()` et vérifier que les trois tests repassent. Consigner les deux sorties dans le rapport.

- [ ] **Step 6 : Écrire `useCreateMedia.ts`**

```ts
import { useMutation } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { apiClient } from '@/api/client';
import type { CreateMediaInput, CreateMediaResponse } from './types';

/** Corps d'erreur du ValidationPipe NestJS : un message, ou un tableau de messages français. */
export type ApiValidationError = AxiosError<{ message?: string | string[] }>;

/**
 * Déclaration d'un média (`POST /api/v1/media`).
 *
 * Crée la ligne au statut `DRAFT` et rend l'URL PUT signée. Le portfolio n'est PAS invalidé
 * ici : la déclaration seule ne produit rien de consultable — c'est la confirmation du dépôt
 * qui fait entrer le média dans la grille.
 */
export function useCreateMedia() {
  return useMutation<CreateMediaResponse, ApiValidationError, CreateMediaInput>({
    mutationFn: async (input) => {
      const { data } = await apiClient.post<CreateMediaResponse>('/api/v1/media', input);
      return data;
    },
  });
}
```

- [ ] **Step 7 : Écrire `useCompleteMedia.ts`**

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { apiClient } from '@/api/client';
import type { PublicMedia } from './types';
import { myMediaQueryKey } from './useMyMedia';

/**
 * Confirmation du dépôt (`POST /api/v1/media/:id/complete`).
 *
 * L'API vérifie alors la taille et le type RÉELS de l'objet déposé, puis enfile le
 * transcodage. Au succès, le portfolio est invalidé : la grille se recharge et le média
 * apparaît, avec son sondage.
 */
export function useCompleteMedia() {
  const queryClient = useQueryClient();

  return useMutation<PublicMedia, AxiosError, { id: string }>({
    mutationFn: async ({ id }) => {
      const { data } = await apiClient.post<PublicMedia>(`/api/v1/media/${id}/complete`);
      return data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: myMediaQueryKey });
    },
  });
}
```

- [ ] **Step 8 : Lancer les tests, le lint et la compilation**

```bash
cd /c/Users/ALX/Projects/skillhunt/frontend-web && npx vitest run src/features/media && npm run lint && npm run build
```

- [ ] **Step 9 : Commit**

```bash
git add frontend-web/src/features/media/uploadToStorage.ts frontend-web/src/features/media/uploadToStorage.test.ts frontend-web/src/features/media/useCreateMedia.ts frontend-web/src/features/media/useCompleteMedia.ts
git commit -m "feat(SH-18a/front): depot direct sur le stockage, hors des intercepteurs d'auth"
```

---

## Task 7 : L'écran de dépôt

**Files:**
- Create: `frontend-web/src/features/media/MediaUploader.tsx`, `frontend-web/src/pages/AddMedia.tsx`
- Test: `frontend-web/src/pages/AddMedia.test.tsx`

**Interfaces:**
- Consumes: `useCreateMedia`, `useCompleteMedia`, `uploadToStorage` (Task 6).
- Produces: la page `AddMedia` (export par défaut), montée sur `/portfolio/ajouter` en Task 8.

- [ ] **Step 1 : Écrire le test qui échoue — `frontend-web/src/pages/AddMedia.test.tsx`**

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { server } from '@/test/server';
import AddMedia from './AddMedia';

const STORAGE_URL = 'http://localhost:4566/skillhunt-media/private/media/f1/m1/master.mp4';

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AddMedia />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function fillAndSubmit() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText(/titre/i), 'Survol de chantier');
  await user.upload(
    screen.getByLabelText(/fichier/i),
    new File(['x'], 'rush.mp4', { type: 'video/mp4' }),
  );
  await user.click(screen.getByRole('button', { name: /publier/i }));
}

describe('AddMedia', () => {
  it('refuse de publier sans titre, sans appeler l\'API', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.upload(
      screen.getByLabelText(/fichier/i),
      new File(['x'], 'rush.mp4', { type: 'video/mp4' }),
    );
    await user.click(screen.getByRole('button', { name: /publier/i }));

    // Aucun handler n'est enregistré : si l'API était appelée, le harnais
    // (`onUnhandledRequest: 'error'`) ferait échouer le test.
    expect(await screen.findByText(/le titre est obligatoire/i)).toBeInTheDocument();
  });

  it('enchaîne déclaration, dépôt direct puis confirmation', async () => {
    const appels: string[] = [];
    server.use(
      http.post('*/api/v1/media', async () => {
        appels.push('declare');
        return HttpResponse.json({
          media: { id: 'm-1', status: 'DRAFT', title: 'Survol de chantier' },
          upload: {
            url: STORAGE_URL,
            method: 'PUT',
            headers: { 'Content-Type': 'video/mp4' },
            expiresIn: 900,
          },
        });
      }),
      http.put(STORAGE_URL, () => {
        appels.push('depot');
        return new HttpResponse(null, { status: 200 });
      }),
      http.post('*/api/v1/media/m-1/complete', () => {
        appels.push('confirme');
        return HttpResponse.json({ id: 'm-1', status: 'UPLOADED' });
      }),
    );

    renderPage();
    await fillAndSubmit();

    await waitFor(() => expect(appels).toEqual(['declare', 'depot', 'confirme']));
  });

  it('ne confirme pas quand le dépôt échoue, et propose de réessayer', async () => {
    let confirmed = false;
    server.use(
      http.post('*/api/v1/media', () =>
        HttpResponse.json({
          media: { id: 'm-1', status: 'DRAFT', title: 'Survol de chantier' },
          upload: {
            url: STORAGE_URL,
            method: 'PUT',
            headers: { 'Content-Type': 'video/mp4' },
            expiresIn: 900,
          },
        }),
      ),
      http.put(STORAGE_URL, () => new HttpResponse(null, { status: 403 })),
      http.post('*/api/v1/media/m-1/complete', () => {
        confirmed = true;
        return HttpResponse.json({ id: 'm-1', status: 'UPLOADED' });
      }),
    );

    renderPage();
    await fillAndSubmit();

    expect(await screen.findByText(/l'envoi a échoué/i)).toBeInTheDocument();
    // Confirmer un dépôt qui a échoué ferait entrer un média sans fichier dans le portfolio.
    expect(confirmed).toBe(false);
  });

  it('expose la progression du dépôt aux technologies d\'assistance', async () => {
    server.use(
      http.post('*/api/v1/media', () =>
        HttpResponse.json({
          media: { id: 'm-1', status: 'DRAFT', title: 'Survol de chantier' },
          upload: {
            url: STORAGE_URL,
            method: 'PUT',
            headers: { 'Content-Type': 'video/mp4' },
            expiresIn: 900,
          },
        }),
      ),
      http.put(STORAGE_URL, () => new HttpResponse(null, { status: 200 })),
      http.post('*/api/v1/media/m-1/complete', () =>
        HttpResponse.json({ id: 'm-1', status: 'UPLOADED' }),
      ),
    );

    renderPage();
    await fillAndSubmit();

    // Une barre qui grandit sans rôle ni valeur ne dit rien à un lecteur d'écran.
    const barre = await screen.findByRole('progressbar');
    expect(barre).toHaveAttribute('aria-valuenow');
  });
});
```

- [ ] **Step 2 : Lancer le test pour vérifier qu'il échoue**

```bash
cd /c/Users/ALX/Projects/skillhunt/frontend-web && npx vitest run src/pages/AddMedia
```

Attendu : ÉCHEC — `Failed to resolve import "./AddMedia"`.

- [ ] **Step 3 : Écrire `MediaUploader.tsx`**

```tsx
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useCreateMedia } from './useCreateMedia';
import { useCompleteMedia } from './useCompleteMedia';
import { uploadToStorage } from './uploadToStorage';

type Etape = 'saisie' | 'declaration' | 'depot' | 'confirmation';

const inputClass =
  'border-hud-border bg-hud-card rounded-md border px-3 py-2 text-white ' +
  'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 outline-none';

/**
 * Dépôt d'une vidéo en trois temps, qui reflètent exactement les trois appels réels :
 * déclaration, envoi DIRECT vers le stockage, puis confirmation.
 *
 * L'envoi ne transite pas par l'API — c'est ce qui permet d'afficher une progression en
 * octets réels, et ce qui évite au monolithe d'encaisser des centaines de mégaoctets.
 *
 * En cas d'échec à l'envoi, on ne confirme SURTOUT pas : le média resterait `DRAFT` et le
 * balayage serveur le purgera au-delà de 24 h. Confirmer un dépôt raté ferait entrer dans
 * le portfolio un média sans fichier.
 */
export function MediaUploader() {
  const navigate = useNavigate();
  const createMedia = useCreateMedia();
  const completeMedia = useCompleteMedia();

  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [etape, setEtape] = useState<Etape>('saisie');
  const [percent, setPercent] = useState(0);
  const [erreur, setErreur] = useState<string | null>(null);
  const [titleError, setTitleError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setErreur(null);

    // Validation client : évite un aller-retour voué à l'échec. Le backend reste juge.
    if (title.trim() === '') {
      setTitleError('Le titre est obligatoire.');
      return;
    }
    if (file === null) {
      setErreur('Choisis un fichier vidéo.');
      return;
    }
    setTitleError(null);

    // Étape suivie dans une variable LOCALE et non via `etape` : la valeur d'état lue dans
    // ce gestionnaire vient de la fermeture du rendu courant, donc `setEtape` ne la met pas
    // à jour ici. S'appuyer dessus dans le `catch` afficherait toujours le mauvais message.
    let etapeCourante: Etape = 'declaration';

    try {
      etapeCourante = 'declaration';
      setEtape('declaration');
      const { media, upload } = await createMedia.mutateAsync({
        title: title.trim(),
        contentType: file.type,
        sizeBytes: file.size,
      });

      etapeCourante = 'depot';
      setEtape('depot');
      setPercent(0);
      await uploadToStorage({
        url: upload.url,
        file,
        contentType: upload.headers['Content-Type'],
        onProgress: setPercent,
      });

      etapeCourante = 'confirmation';
      setEtape('confirmation');
      await completeMedia.mutateAsync({ id: media.id });
      navigate('/portfolio');
    } catch {
      setErreur(
        etapeCourante === 'depot'
          ? "L'envoi a échoué. Réessaie : rien n'a été publié."
          : "La publication a échoué. Réessaie dans un instant.",
      );
      setEtape('saisie');
    }
  }

  const enCours = etape !== 'saisie';

  return (
    <form className="flex max-w-lg flex-col gap-4" onSubmit={handleSubmit}>
      <label className="flex flex-col gap-1 text-sm text-white" htmlFor="media-title">
        Titre
      </label>
      <input
        className={inputClass}
        id="media-title"
        maxLength={120}
        onChange={(event) => setTitle(event.target.value)}
        value={title}
      />
      {titleError !== null && <span className="text-hud-rejected text-sm">{titleError}</span>}

      <label className="flex flex-col gap-1 text-sm text-white" htmlFor="media-file">
        Fichier
      </label>
      <input
        accept="video/mp4,video/quicktime"
        className={inputClass}
        id="media-file"
        onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        type="file"
      />

      {enCours && (
        <div
          aria-label="Progression du dépôt"
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={etape === 'depot' ? percent : 100}
          aria-valuetext={
            etape === 'depot' ? `Envoi — ${percent} %` : 'Déclaration et confirmation'
          }
          className="bg-hud-pill h-2 w-full overflow-hidden rounded"
          role="progressbar"
        >
          <span
            className="bg-hud-positive block h-full"
            style={{ width: `${etape === 'depot' ? percent : 100}%` }}
          />
        </div>
      )}

      {erreur !== null && (
        <span className="text-hud-rejected text-sm" role="alert">
          {erreur}
        </span>
      )}

      <Button disabled={enCours} type="submit">
        {enCours ? 'Publication en cours…' : 'Publier la vidéo'}
      </Button>
    </form>
  );
}
```

- [ ] **Step 4 : Écrire `frontend-web/src/pages/AddMedia.tsx`**

```tsx
import { Link } from 'react-router-dom';
import { MediaUploader } from '@/features/media/MediaUploader';

/** Écran de dépôt d'une vidéo (SH-18a). */
export default function AddMedia() {
  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-white">Ajouter une vidéo</h1>
        <p className="text-hud-muted text-sm">
          Le fichier part directement vers le stockage : il ne transite pas par l'API.
        </p>
      </div>

      <MediaUploader />

      <Link className="text-hud-muted text-sm underline" to="/portfolio">
        Retour au portfolio
      </Link>
    </section>
  );
}
```

- [ ] **Step 5 : Lancer les tests**

```bash
cd /c/Users/ALX/Projects/skillhunt/frontend-web && npx vitest run src/pages/AddMedia
```

Attendu : PASS — 4 tests.

- [ ] **Step 6 : Commit**

```bash
git add frontend-web/src/features/media/MediaUploader.tsx frontend-web/src/pages/AddMedia.tsx frontend-web/src/pages/AddMedia.test.tsx
git commit -m "feat(SH-18a/front): ecran de depot en trois temps avec progression reelle"
```

---

## Task 8 : La page portfolio, sa route et sa navigation

**Files:**
- Create: `frontend-web/src/pages/Portfolio.tsx`
- Modify: `frontend-web/src/app/routes.tsx`, `frontend-web/src/features/navigation/nav-items.ts`
- Test: `frontend-web/src/pages/Portfolio.test.tsx`

**Interfaces:**
- Consumes: `useMyMedia`, `hasPendingMedia` (Task 5), `MediaGrid`, `MediaEmptyState` (Task 4), `AddMedia` (Task 7).
- Produces: les routes `/portfolio` et `/portfolio/ajouter`, et l'entrée de navigation « Portfolio ».

- [ ] **Step 1 : Écrire le test qui échoue — `frontend-web/src/pages/Portfolio.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { server } from '@/test/server';
import Portfolio from './Portfolio';

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Portfolio />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function media(id: string, status: string, title: string) {
  return {
    id,
    freelanceId: 'u-1',
    title,
    description: null,
    type: 'VIDEO',
    status,
    durationSeconds: null,
    width: null,
    height: null,
    sizeBytes: null,
    mimeType: 'video/mp4',
    renditions: null,
    errorReason: null,
    createdAt: '2026-08-31T10:00:00.000Z',
    processedAt: null,
  };
}

describe('Portfolio', () => {
  it('invite à publier quand le portfolio est vide', async () => {
    server.use(
      http.get('*/api/v1/media/me', () =>
        HttpResponse.json({ items: [], total: 0, page: 1, limit: 100 }),
      ),
    );
    renderPage();

    expect(await screen.findByText(/ton portfolio est vide/i)).toBeInTheDocument();
  });

  it('affiche les médias et annonce ce qui est en cours', async () => {
    server.use(
      http.get('*/api/v1/media/me', () =>
        HttpResponse.json({
          items: [media('m-1', 'READY', 'Survol'), media('m-2', 'UPLOADED', 'Inspection')],
          total: 2,
          page: 1,
          limit: 100,
        }),
      ),
    );
    renderPage();

    expect(await screen.findByText('Survol')).toBeInTheDocument();
    // Un utilisateur de lecteur d'écran ne doit pas avoir à relire la grille pour savoir
    // que quelque chose bouge.
    expect(await screen.findByText(/1 vidéo en cours de traitement/i)).toBeInTheDocument();
  });

  it('n\'annonce rien quand tout est stabilisé', async () => {
    server.use(
      http.get('*/api/v1/media/me', () =>
        HttpResponse.json({
          items: [media('m-1', 'READY', 'Survol')],
          total: 1,
          page: 1,
          limit: 100,
        }),
      ),
    );
    renderPage();

    expect(await screen.findByText('Survol')).toBeInTheDocument();
    expect(screen.queryByText(/en cours de traitement/i)).not.toBeInTheDocument();
  });

  it('signale une erreur de chargement au lieu de rester vide', async () => {
    server.use(http.get('*/api/v1/media/me', () => new HttpResponse(null, { status: 500 })));
    renderPage();

    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2 : Lancer le test pour vérifier qu'il échoue**

```bash
cd /c/Users/ALX/Projects/skillhunt/frontend-web && npx vitest run src/pages/Portfolio
```

Attendu : ÉCHEC — `Failed to resolve import "./Portfolio"`.

- [ ] **Step 3 : Écrire `frontend-web/src/pages/Portfolio.tsx`**

```tsx
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { MediaEmptyState } from '@/features/media/MediaEmptyState';
import { MediaGrid } from '@/features/media/MediaGrid';
import { hasPendingMedia, useMyMedia } from '@/features/media/useMyMedia';

/** Portfolio du freelance authentifié (SH-18a). */
export default function Portfolio() {
  const { data, isPending, isError } = useMyMedia();

  const items = data?.items ?? [];
  const enCours = items.filter(
    (media) => media.status === 'UPLOADED' || media.status === 'PROCESSING',
  ).length;

  return (
    <section className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-white">Portfolio</h1>
        <Button asChild>
          <Link to="/portfolio/ajouter">+ Ajouter une vidéo</Link>
        </Button>
      </div>

      {/* Le sondage fait évoluer la grille sans action de l'utilisateur : le changement
          doit être ANNONCÉ, pas seulement affiché. */}
      <p aria-live="polite" className="text-hud-muted text-sm">
        {hasPendingMedia(items)
          ? `${enCours} vidéo${enCours > 1 ? 's' : ''} en cours de traitement`
          : ''}
      </p>

      {isPending && <p className="text-hud-muted text-sm">Chargement du portfolio…</p>}

      {isError && (
        <p className="text-hud-rejected text-sm" role="alert">
          Impossible de charger le portfolio. Réessaie dans un instant.
        </p>
      )}

      {!isPending && !isError && (items.length === 0 ? <MediaEmptyState /> : <MediaGrid items={items} />)}
    </section>
  );
}
```

- [ ] **Step 4 : Déclarer les routes — `frontend-web/src/app/routes.tsx`**

Importer les deux pages, puis ajouter dans les enfants d'`AppLayout`, juste après le bloc `/mon-armurerie/ajouter` :

```tsx
      {
        // Portfolio du freelance (SH-18a). Route non préfixée « mon- » : le libellé de
        // l'interface est « Portfolio », comme `/messages` et `/recherche`.
        path: '/portfolio',
        element: (
          <ProtectedRoute>
            <Portfolio />
          </ProtectedRoute>
        ),
      },
      {
        path: '/portfolio/ajouter',
        element: (
          <ProtectedRoute>
            <AddMedia />
          </ProtectedRoute>
        ),
      },
```

- [ ] **Step 5 : Ajouter l'entrée de navigation — `frontend-web/src/features/navigation/nav-items.ts`**

Importer `PlayCircle` depuis `lucide-react`, puis insérer dans la liste `FREELANCE`, entre l'armurerie et les messages :

```ts
    { to: '/portfolio', label: 'Portfolio', icon: PlayCircle },
```

- [ ] **Step 6 : Lancer les tests de page et de routage**

```bash
cd /c/Users/ALX/Projects/skillhunt/frontend-web && npx vitest run src/pages/Portfolio src/app
```

Attendu : PASS. Si un test de `router.test.tsx` énumère les routes, l'ajuster pour inclure les deux nouvelles.

- [ ] **Step 7 : Suite complète, lint et compilation**

```bash
cd /c/Users/ALX/Projects/skillhunt/frontend-web && npm test && npm run lint && npm run build
```

- [ ] **Step 8 : Commit**

```bash
git add frontend-web/src/pages/Portfolio.tsx frontend-web/src/pages/Portfolio.test.tsx frontend-web/src/app/routes.tsx frontend-web/src/features/navigation/nav-items.ts
git commit -m "feat(SH-18a/front): page portfolio, routes et entree de navigation"
```

---

## Task 9 : Les deux autres points d'entrée

**Files:**
- Modify: `frontend-web/src/pages/Account.tsx`, `frontend-web/src/pages/FreelanceGear.tsx`
- Test: `frontend-web/src/pages/Account.test.tsx`, `frontend-web/src/pages/FreelanceGear.test.tsx`

**Interfaces:**
- Consumes: `useMyMedia` (Task 5), `MediaEmptyState` (Task 4).
- Produces: rien pour d'autres tâches.

- [ ] **Step 1 : Écrire les tests qui échouent — ajouter à `frontend-web/src/pages/Account.test.tsx`**

Lire d'abord le fichier pour reprendre son harnais de rendu, puis ajouter les tests ci-dessous.

> **Deux points à traiter avant qu'ils ne passent.** `Account` appelle désormais `useMyMedia`,
> donc son rendu de test doit être enveloppé dans un `QueryClientProvider` — si le harnais
> existant n'en a pas, l'ajouter, avec `retry: false`. Et les imports `server`, `http`,
> `HttpResponse` doivent être présents en tête de fichier.



```tsx
  it('mène au portfolio et permet de publier directement', async () => {
    server.use(
      http.get('*/api/v1/media/me', () =>
        HttpResponse.json({ items: [], total: 0, page: 1, limit: 100 }),
      ),
    );
    renderAccount();

    expect(await screen.findByRole('link', { name: 'Portfolio' })).toHaveAttribute(
      'href',
      '/portfolio',
    );
    // Publier ne doit pas obliger à passer par la grille.
    expect(screen.getByRole('link', { name: /publier une vidéo/i })).toHaveAttribute(
      'href',
      '/portfolio/ajouter',
    );
  });

  it('résume l\'état du portfolio', async () => {
    server.use(
      http.get('*/api/v1/media/me', () =>
        HttpResponse.json({
          items: [
            { id: 'm-1', status: 'READY' },
            { id: 'm-2', status: 'UPLOADED' },
          ],
          total: 2,
          page: 1,
          limit: 100,
        }),
      ),
    );
    renderAccount();

    expect(await screen.findByText(/2 vidéos · 1 en traitement/i)).toBeInTheDocument();
  });
```

Et à `frontend-web/src/pages/FreelanceGear.test.tsx` :

```tsx
  it('affiche la section portfolio, sans émettre de requête média', async () => {
    renderFreelanceGear();

    // Aucun handler média n'est enregistré : le harnais est en `onUnhandledRequest: 'error'`,
    // donc toute requête vers l'API média ferait échouer ce test. C'est exactement ce qu'on
    // veut vérifier — la route `GET /media/freelance/:id` est livrée par SH-17.
    expect(await screen.findByRole('heading', { name: /portfolio/i })).toBeInTheDocument();
    expect(screen.getByText(/aucune vidéo publiée/i)).toBeInTheDocument();
  });
```

- [ ] **Step 2 : Lancer les tests pour vérifier qu'ils échouent**

```bash
cd /c/Users/ALX/Projects/skillhunt/frontend-web && npx vitest run src/pages/Account src/pages/FreelanceGear
```

Attendu : ÉCHEC — les libellés n'existent pas encore.

- [ ] **Step 3 : Ajouter la carte Portfolio — `frontend-web/src/pages/Account.tsx`**

Le compteur réutilise `useMyMedia`, donc la même clé de requête que la grille : aucune requête supplémentaire.

```tsx
      <div className="border-hud-border bg-hud-card flex items-center gap-3 rounded-lg border p-4">
        <Link className="min-w-0 flex-1" to="/portfolio">
          <span className="block font-bold text-white">Portfolio</span>
          <span className="text-hud-muted block text-sm">{resumePortfolio}</span>
        </Link>

        {/* Publier doit rester à un clic depuis le compte, sans détour par la grille. */}
        <Link
          aria-label="Publier une vidéo"
          className="bg-hud-positive text-hud-bg flex h-9 w-9 items-center justify-center rounded-md"
          to="/portfolio/ajouter"
        >
          <Plus aria-hidden="true" className="h-5 w-5" />
        </Link>
      </div>
```

avec, plus haut dans le composant :

```tsx
  const { data: portfolio } = useMyMedia();
  const medias = portfolio?.items ?? [];
  const enTraitement = medias.filter(
    (media) => media.status === 'UPLOADED' || media.status === 'PROCESSING',
  ).length;
  const resumePortfolio =
    medias.length === 0
      ? 'Aucune vidéo publiée'
      : `${medias.length} vidéo${medias.length > 1 ? 's' : ''}` +
        (enTraitement > 0 ? ` · ${enTraitement} en traitement` : '');
```

Importer `Plus` depuis `lucide-react` et `useMyMedia` depuis `@/features/media/useMyMedia`.

- [ ] **Step 4 : Ajouter la section Portfolio — `frontend-web/src/pages/FreelanceGear.tsx`**

Après la grille de matériel, séparée par un filet :

```tsx
        <div className="border-hud-pill-border my-8 border-t" />

        <h2 className="text-hud-muted mb-3 text-xs font-bold tracking-widest uppercase">
          Portfolio
        </h2>
        {/* Emplacement figé dès SH-18a ; le branchement sur `GET /media/freelance/:id`
            arrive avec SH-17. Aucune requête n'est émise d'ici là. */}
        <section className="border-hud-border bg-hud-card flex flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-center">
          <VideoOff aria-hidden="true" className="text-hud-muted h-8 w-8" />
          <span className="font-bold text-white">Aucune vidéo publiée</span>
          <span className="text-hud-muted text-sm">
            Ce freelance n'a pas encore de média prêt à la lecture.
          </span>
        </section>
```

Importer `VideoOff` depuis `lucide-react`.

- [ ] **Step 5 : Lancer les tests**

```bash
cd /c/Users/ALX/Projects/skillhunt/frontend-web && npx vitest run src/pages/Account src/pages/FreelanceGear
```

Attendu : PASS.

- [ ] **Step 6 : Suite complète, lint et compilation**

```bash
cd /c/Users/ALX/Projects/skillhunt/frontend-web && npm test && npm run lint && npm run build
```

- [ ] **Step 7 : Commit**

```bash
git add frontend-web/src/pages/Account.tsx frontend-web/src/pages/Account.test.tsx frontend-web/src/pages/FreelanceGear.tsx frontend-web/src/pages/FreelanceGear.test.tsx
git commit -m "feat(SH-18a/front): carte portfolio du compte et section recruteur"
```

---

## Task 10 : Recette visuelle et documentation

**Files:**
- Create: `docs/tickets/SH-18a-portfolio-front.md`
- Modify: `docs/BACKLOG.md`

**Interfaces:**
- Consumes: tout le reste.
- Produces: rien — c'est la clôture.

- [ ] **Step 1 : Vérifier les écrans dans un vrai navigateur**

La stack applicative doit tourner. Lancer le serveur de développement Vite, puis ouvrir `/portfolio` avec le compte de démonstration `demo2026-pilote@skillhunt.io` (mot de passe `MotDePasse2026!`, cf. `scripts/seed-demo.sh`).

Vérifier, capture d'écran à l'appui : l'entrée « Portfolio » apparaît dans la navigation ; l'état vide s'affiche ; le dépôt d'un fichier fait progresser la barre puis redirige vers la grille ; le média apparaît en « DÉPOSÉE » ; la carte Portfolio du compte affiche le bon compteur ; la page armurerie d'un freelance montre la section Portfolio vide.

> **Ne pas s'attendre à « EN TRAITEMENT » ni à « PRÊT ».** `PROCESSING` n'est jamais positionné (l'événement `active` de BullMQ n'est pas écouté), et `READY` exige le pipeline réel de SH-16b. C'est documenté au §4.1 du spec, et c'est le comportement attendu aujourd'hui.

- [ ] **Step 2 : Écrire le ticket — `docs/tickets/SH-18a-portfolio-front.md`**

Suivre `docs/templates/TICKET_TEMPLATE.md`, en reprenant la forme de `docs/tickets/SH-16a-flux-entrant-media.md`. En-tête : `**Compétences RNCP visées :** C2.4.1 (interface, Swagger), C2.2.2 (tests), C2.1.2 (normes)`. Scénarios Gherkin, un par comportement vérifié :

1. Portfolio vide → invitation à publier.
2. Dépôt complet → déclaration, envoi direct, confirmation, média en « DÉPOSÉE ».
3. Échec de l'envoi → message de reprise, **aucune confirmation envoyée**.
4. Publication sans titre → message d'erreur, **aucun appel API**.
5. Aucun en-tête `Authorization` n'est envoyé au stockage.
6. Le statut est lisible sans percevoir la couleur.
7. La progression du dépôt est exposée aux technologies d'assistance.
8. Section Portfolio présente sur la page armurerie, **sans requête média**.
9. Carte Portfolio du compte : compteur juste et bouton de publication directe.

- [ ] **Step 3 : Mettre à jour `docs/BACKLOG.md`**

Remplacer la ligne SH-18 de la table **EP04** par deux lignes :

```markdown
| [SH-18a](tickets/SH-18a-portfolio-front.md) | Portfolio (front) : grille des cinq états, dépôt direct en trois temps avec progression réelle, carte du compte, section recruteur — *lecteur HLS et visionneuse 360° reportés en SH-18b, ils dépendent des routes de lecture de SH-17* | 🟢 Terminé | 3 | C2.4.1, C2.2.2, C2.1.2 | — |
| [SH-18b](tickets/SH-18b-lecteur-portfolio.md) | Lecteur HLS + visionneuse 360° WebGL, poster réel, branchement de la section recruteur, suppression d'un média — *dépend de SH-17* | 🔵 Backlog | 3 | C2.4.1, C2.2.2 | — |
```

- [ ] **Step 4 : Vérification finale**

```bash
cd /c/Users/ALX/Projects/skillhunt/frontend-web && npm test && npm run lint && npm run build
```

Attendu : suite verte, lint et compilation propres.

- [ ] **Step 5 : Commit**

```bash
git add docs/
git commit -m "docs(SH-18a/front): ticket et backlog"
```

---

## Vérification de la Definition of Done

- [ ] Les 9 scénarios Gherkin du ticket sont vérifiés
- [ ] Suite `frontend-web` verte, lint et build propres
- [ ] **Aucun en-tête `Authorization` vers le stockage** — test dédié, vérifié par sabotage (Task 6, Step 5)
- [ ] Statut lisible sans la couleur ; progression exposée en `role="progressbar"` ; changements annoncés en `aria-live`
- [ ] Recette visuelle passée dans un vrai navigateur (Task 10, Step 1)
- [ ] `docs/BACKLOG.md` et le ticket à jour

**PR** : base `develop`, **jamais `main`** (CLAUDE.md §11). Ne pas supprimer la branche après merge (traçabilité jury).
