# SH-21c — Gamification de l'Armurerie : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Livrer la gamification de l'Armurerie (XP dérivé, niveaux, 7 badges, loadout 4 slots) conformément à la spec `docs/superpowers/specs/2026-07-17-armurerie-gamification-design.md`.

**Architecture:** XP/niveaux/badges calculés **à la lecture** par un nouveau module NestJS `gamification/` depuis les données SQL existantes (gear + certifications `VALIDATED`). Le loadout est la seule écriture de schéma : colonne `gear.isInLoadout` + `PATCH /api/v1/gear/:id/loadout` avec règles métier (validé uniquement, max 4, dé-épinglage au rejet admin). Front : `features/gamification/` + intégrations dans les deux vues Armurerie.

**Tech Stack:** NestJS 11 / TypeORM / PostgreSQL · React 19 / TanStack Query / Tailwind (tokens `--color-hud-*`) · Jest + Vitest/RTL (TDD strict).

## Global Constraints

- Branche : `feature/SH-21c-armurerie-gamification` (créée depuis `develop`) ; PR vers `develop` uniquement ; jamais de commit direct sur `develop`/`main`.
- Commentaires et textes UI **en français**, identifiants **en anglais** ; référencer les compétences RNCP (`C2.2.3`, `C2.2.2`, `C2.4.1`) dans les blocs qui les illustrent.
- **TDD** : test écrit AVANT l'implémentation, échec vérifié, puis implémentation minimale.
- Backend : DTO `class-validator` pour toute entrée, Swagger complet (`@ApiTags`/`@ApiOperation`/`@ApiResponse`), identité **uniquement** via `@CurrentUser()` (jamais d'id client), erreurs = exceptions Nest en français.
- Front : appels via `apiClient` exclusivement ; types API via `npm run gen:api` (jamais éditer `schema.d.ts`) ; **aucune couleur hexadécimale en composant** (tokens `--color-hud-*`, garde de test SH-44) ; statut/état jamais porté par la couleur seule (R6).
- Barème (spec §2, source de vérité unique en constantes) : **50** XP/gear validé, **30** XP/catégorie couverte, **80** XP/certification validée ; niveaux `0 Recrue · 100 Opérateur · 250 Spécialiste · 450 Vétéran · 700 Élite · 1000 Légende` ; loadout **max 4**, `VALIDATED` uniquement.
- Commits : Conventional Commits avec scope `(SH-21c/<service>)`, terminés par `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1 : Backend loadout — migration, entité, règles métier, PATCH

**Files:**
- Create: `backend-core/src/database/migrations/1719450000000-AddGearLoadout.ts`
- Create: `backend-core/src/gear/dto/set-loadout.dto.ts`
- Modify: `backend-core/src/gear/gear.entity.ts` (ajout colonne)
- Modify: `backend-core/src/gear/gear.service.ts` (setLoadout, dé-épinglage au rejet, tri, projection publique)
- Modify: `backend-core/src/gear/gear.controller.ts` (route PATCH)
- Modify: `backend-core/src/gear/dto/gear-response.dto.ts` (exposer `isInLoadout` dans `GearResponseDto` ET `PublicGearDto`)
- Test: `backend-core/src/gear/gear.service.spec.ts` (étendre la suite existante)

**Interfaces:**
- Consumes: `Gear`, `GearStatus`, patterns existants de `gear.service.spec.ts` (repos mockés).
- Produces: `GearService.setLoadout(freelanceId: string, gearId: string, inLoadout: boolean): Promise<Gear>` ; constante `LOADOUT_MAX_SLOTS = 4` (exportée de `gear.service.ts`) ; colonne `gear.isInLoadout: boolean` ; champ `isInLoadout` dans `PublicGearView`/DTOs ; tri des listes `isInLoadout DESC, createdAt DESC`.

- [ ] **Step 1 : Écrire les tests qui échouent** — ajouter à `gear.service.spec.ts` (suivre le style de mocks du fichier existant ; adapter les helpers de seed du fichier) :

```typescript
describe('Loadout (SH-21c)', () => {
  it("épingle un équipement VALIDATED de SON casier", async () => {
    const gear = await seedGear({ status: GearStatus.VALIDATED, freelanceId: freelance.id });
    const saved = await service.setLoadout(freelance.id, gear.id, true);
    expect(saved.isInLoadout).toBe(true);
  });

  it('refuse (400) un équipement non validé — le loadout est une vitrine de preuve', async () => {
    const gear = await seedGear({ status: GearStatus.PENDING, freelanceId: freelance.id });
    await expect(service.setLoadout(freelance.id, gear.id, true)).rejects.toThrow(BadRequestException);
  });

  it('refuse (400) le 5e épinglage — 4 emplacements maximum', async () => {
    for (let i = 0; i < 4; i += 1) {
      const g = await seedGear({ status: GearStatus.VALIDATED, freelanceId: freelance.id });
      await service.setLoadout(freelance.id, g.id, true);
    }
    const fifth = await seedGear({ status: GearStatus.VALIDATED, freelanceId: freelance.id });
    await expect(service.setLoadout(freelance.id, fifth.id, true)).rejects.toThrow(BadRequestException);
  });

  it("le gear d'un AUTRE freelance est introuvable (404, pas d'énumération)", async () => {
    const gear = await seedGear({ status: GearStatus.VALIDATED, freelanceId: freelance.id });
    await expect(service.setLoadout(otherFreelance.id, gear.id, true)).rejects.toThrow(NotFoundException);
  });

  it('retirer du loadout fonctionne sans condition de statut', async () => {
    const gear = await seedGear({ status: GearStatus.VALIDATED, freelanceId: freelance.id, isInLoadout: true });
    const saved = await service.setLoadout(freelance.id, gear.id, false);
    expect(saved.isInLoadout).toBe(false);
  });

  it("le REJET admin retire l'épingle — jamais de non-validé en vitrine", async () => {
    const gear = await seedGear({ status: GearStatus.PENDING, freelanceId: freelance.id, isInLoadout: true });
    const saved = await service.reviewGear(gear.id, GearStatus.REJECTED);
    expect(saved.isInLoadout).toBe(false);
  });

  it('la projection publique expose isInLoadout (et toujours PAS serialNumber)', async () => {
    await seedGear({ status: GearStatus.VALIDATED, freelanceId: freelance.id, isInLoadout: true });
    const page = await service.getPublicFreelanceGear(freelance.id, { page: 1, limit: 10 } as PublicQueryGearDto);
    expect(page.items[0].isInLoadout).toBe(true);
    expect(Object.keys(page.items[0])).not.toContain('serialNumber');
  });
});
```

- [ ] **Step 2 : Vérifier l'échec** — `cd backend-core && npx jest src/gear --no-coverage` → FAIL (`setLoadout is not a function`, `isInLoadout` inconnu).

- [ ] **Step 3 : Implémentation minimale**

Migration `1719450000000-AddGearLoadout.ts` :
```typescript
import { MigrationInterface, QueryRunner } from 'typeorm';

/** SH-21c — vitrine « loadout » : épinglage d'équipements validés (max 4, règle service). */
export class AddGearLoadout1719450000000 implements MigrationInterface {
  name = 'AddGearLoadout1719450000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "gear" ADD "isInLoadout" boolean NOT NULL DEFAULT false`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "gear" DROP COLUMN "isInLoadout"`);
  }
}
```

`gear.entity.ts` — après le champ `status` :
```typescript
  // Vitrine « loadout » (SH-21c) : épinglé par le freelance. Règles métier côté service :
  // VALIDATED uniquement, 4 maximum, épingle retirée au rejet admin.
  @Column({ type: 'boolean', default: false })
  isInLoadout!: boolean;
```

`gear.service.ts` :
```typescript
// Nombre maximum d'équipements épinglables au loadout (spec SH-21c §4)
export const LOADOUT_MAX_SLOTS = 4;

  /**
   * Épingle/retire un équipement du loadout (SH-21c). Étanchéité : le gear est cherché
   * PAR (id, freelanceId du token) → le casier d'autrui répond 404, pas d'énumération (C2.2.3).
   */
  async setLoadout(freelanceId: string, gearId: string, inLoadout: boolean): Promise<Gear> {
    const gear = await this.gearRepo.findOne({ where: { id: gearId, freelanceId } });
    if (!gear) {
      throw new NotFoundException('Équipement introuvable');
    }

    if (inLoadout) {
      // Le loadout est une vitrine de PREUVE : seul le matériel validé s'y épingle
      if (gear.status !== GearStatus.VALIDATED) {
        throw new BadRequestException('Seul un équipement validé peut rejoindre le loadout');
      }
      if (!gear.isInLoadout) {
        const pinned = await this.gearRepo.count({ where: { freelanceId, isInLoadout: true } });
        if (pinned >= LOADOUT_MAX_SLOTS) {
          throw new BadRequestException(
            `Le loadout est complet (${LOADOUT_MAX_SLOTS} emplacements maximum)`,
          );
        }
      }
    }

    gear.isInLoadout = inLoadout;
    return this.gearRepo.save(gear);
  }
```
Dans `reviewGear`, juste avant `const saved = await this.gearRepo.save(gear);` :
```typescript
    // Cohérence loadout (SH-21c) : un équipement rejeté ne reste jamais en vitrine
    if (decision === GearStatus.REJECTED) {
      gear.isInLoadout = false;
    }
```
Dans `paginate`, remplacer `order: { createdAt: 'DESC' }` par :
```typescript
      // Loadout d'abord (SH-21c), puis du plus récent au plus ancien
      order: { isInLoadout: 'DESC', createdAt: 'DESC' },
```
Dans `PublicGearView` + `toPublicGearView` : ajouter `isInLoadout: boolean;` / `isInLoadout: gear.isInLoadout,`.
Imports : ajouter `BadRequestException` à l'import `@nestjs/common`.

`dto/set-loadout.dto.ts` :
```typescript
import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

/** Épingler/retirer un équipement du loadout (SH-21c). Validation stricte (C2.2.3). */
export class SetLoadoutDto {
  @ApiProperty({ example: true, description: 'true = épingler au loadout, false = retirer' })
  @IsBoolean({ message: 'inLoadout doit être un booléen' })
  inLoadout!: boolean;
}
```

`gear.controller.ts` :
```typescript
  @Patch(':id/loadout')
  @Roles(UserRole.FREELANCE)
  @ApiOperation({ summary: 'Épingler/retirer un équipement de son loadout (validé uniquement, max 4)' })
  @ApiOkResponse({ type: GearResponseDto, description: 'Équipement après mise à jour du loadout' })
  @ApiNotFoundResponse({ description: 'Équipement introuvable dans SON casier (404)' })
  setLoadout(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetLoadoutDto,
  ) {
    // Identité issue du token : impossible d'épingler le matériel d'autrui (C2.2.3)
    return this.gearService.setLoadout(user.userId, id, dto.inLoadout);
  }
```

`dto/gear-response.dto.ts` — ajouter dans `GearResponseDto` ET `PublicGearDto` :
```typescript
  @ApiProperty({ example: false, description: 'Épinglé au loadout (vitrine, SH-21c)' })
  isInLoadout!: boolean;
```

- [ ] **Step 4 : Vérifier le vert** — `npx jest src/gear --no-coverage` → PASS ; puis `npm run test`, `npm run lint`, `npm run build` → tout vert.

- [ ] **Step 5 : Commit**
```bash
git add backend-core/src/gear backend-core/src/database/migrations/1719450000000-AddGearLoadout.ts
git commit -m "feat(SH-21c/backend-core): loadout — colonne isInLoadout, PATCH /gear/:id/loadout (validé uniquement, max 4, dé-épinglage au rejet)"
```

---

### Task 2 : Backend — GamificationService (XP, niveaux, badges) en TDD

**Files:**
- Create: `backend-core/src/gamification/gamification.service.ts`
- Test: `backend-core/src/gamification/gamification.service.spec.ts`

**Interfaces:**
- Consumes: repos TypeORM `User`, `Gear`, `Certification` ; `GearStatus`, `CertificationStatus`, `CertificationType`, `UserRole` (`common/enums`) ; `LOADOUT_MAX_SLOTS` (Task 1).
- Produces:
  - `GamificationService.profileFor(userId: string): Promise<GamificationProfile>` avec `GamificationProfile = { xp: number; level: number; levelLabel: string; nextLevelAt: number | null; badges: BadgeView[] }` et `BadgeView = { id: string; label: string; description: string; earned: boolean }`.
  - `GamificationService.publicProfileFor(freelanceId: string): Promise<PublicGamificationProfile>` avec `PublicGamificationProfile = { level: number; levelLabel: string; badges: Array<{ id: string; label: string; description: string }> }` (badges **obtenus** uniquement ; 404 si cible absente ou non-FREELANCE).
  - Constantes exportées : `XP_PER_VALIDATED_GEAR = 50`, `XP_PER_COVERED_CATEGORY = 30`, `XP_PER_VALIDATED_CERTIFICATION = 80`, `LEVELS` (tableau `{ threshold, level, label }`).

- [ ] **Step 1 : Écrire la suite de tests** (`gamification.service.spec.ts`) — repos factices en mémoire (même style que `chat.service.spec.ts`) :

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { GamificationService } from './gamification.service';
import { User } from '../users/user.entity';
import { Gear } from '../gear/gear.entity';
import { Certification } from '../certifications/certification.entity';
import {
  CertificationStatus, CertificationType, GearCategory, GearStatus, UserRole,
} from '../common/enums';

/** Repo factice minimal : seed + find({ where }) par égalité de champs. */
class FakeRepo<T extends { id?: string }> {
  private store: T[] = [];
  seed(row: Partial<T>): T {
    const saved = { id: randomUUID(), ...row } as T;
    this.store.push(saved);
    return saved;
  }
  find({ where }: { where: Record<string, unknown> }): Promise<T[]> {
    const keys = Object.keys(where);
    return Promise.resolve(
      this.store.filter((row) => keys.every((k) => (row as Record<string, unknown>)[k] === where[k])),
    );
  }
  findOne({ where }: { where: Record<string, unknown> }): Promise<T | null> {
    return this.find({ where }).then((rows) => rows[0] ?? null);
  }
}

describe('🏅 GamificationService (SH-21c)', () => {
  let service: GamificationService;
  let users: FakeRepo<User>;
  let gear: FakeRepo<Gear>;
  let certs: FakeRepo<Certification>;
  let freelance: User;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GamificationService,
        { provide: getRepositoryToken(User), useClass: FakeRepo },
        { provide: getRepositoryToken(Gear), useClass: FakeRepo },
        { provide: getRepositoryToken(Certification), useClass: FakeRepo },
      ],
    }).compile();
    service = module.get(GamificationService);
    users = module.get(getRepositoryToken(User));
    gear = module.get(getRepositoryToken(Gear));
    certs = module.get(getRepositoryToken(Certification));
    freelance = users.seed({ role: UserRole.FREELANCE, username: 'pilote' } as Partial<User>);
  });

  const seedValidatedGear = (category: GearCategory, isInLoadout = false) =>
    gear.seed({
      freelanceId: freelance.id, status: GearStatus.VALIDATED, category, isInLoadout,
    } as Partial<Gear>);

  it('casier vide : 0 XP, niveau 1 « Recrue », prochain niveau à 100, aucun badge', async () => {
    const profile = await service.profileFor(freelance.id);
    expect(profile).toMatchObject({ xp: 0, level: 1, levelLabel: 'Recrue', nextLevelAt: 100 });
    expect(profile.badges.every((b) => !b.earned)).toBe(true);
    expect(profile.badges).toHaveLength(7);
  });

  it('le barème ne compte QUE le validé : 1 gear validé + 1 PENDING = 50 + 30 (catégorie) = 80 XP', async () => {
    seedValidatedGear(GearCategory.DRONE);
    gear.seed({ freelanceId: freelance.id, status: GearStatus.PENDING, category: GearCategory.SENSOR } as Partial<Gear>);
    const profile = await service.profileFor(freelance.id);
    expect(profile.xp).toBe(80);
  });

  it('une certification validée rapporte 80 XP ; une PENDING, zéro', async () => {
    certs.seed({ freelanceId: freelance.id, status: CertificationStatus.VALIDATED, type: CertificationType.OTHER } as Partial<Certification>);
    certs.seed({ freelanceId: freelance.id, status: CertificationStatus.PENDING, type: CertificationType.DGAC_DRONE } as Partial<Certification>);
    const profile = await service.profileFor(freelance.id);
    expect(profile.xp).toBe(80);
  });

  it('franchissement de seuil : 2 gears validés (2 catégories) + 1 certif = 100+60+80 = 240 XP → encore Opérateur ; +1 gear même catégorie → 290 → Spécialiste', async () => {
    seedValidatedGear(GearCategory.DRONE);
    seedValidatedGear(GearCategory.CAMERA_360);
    certs.seed({ freelanceId: freelance.id, status: CertificationStatus.VALIDATED, type: CertificationType.OTHER } as Partial<Certification>);
    let profile = await service.profileFor(freelance.id);
    expect(profile).toMatchObject({ xp: 240, level: 2, levelLabel: 'Opérateur', nextLevelAt: 250 });

    seedValidatedGear(GearCategory.DRONE); // +50, catégorie déjà couverte
    profile = await service.profileFor(freelance.id);
    expect(profile).toMatchObject({ xp: 290, level: 3, levelLabel: 'Spécialiste', nextLevelAt: 450 });
  });

  it.each([
    ['first-validated', 1], ['arsenal-5', 5], ['arsenal-10', 10],
  ])('badge %s : verrouillé à N-1, obtenu à N équipements validés', async (badgeId, n) => {
    for (let i = 0; i < n - 1; i += 1) seedValidatedGear(GearCategory.DRONE);
    let profile = await service.profileFor(freelance.id);
    expect(profile.badges.find((b) => b.id === badgeId)?.earned).toBe(false);
    seedValidatedGear(GearCategory.DRONE);
    profile = await service.profileFor(freelance.id);
    expect(profile.badges.find((b) => b.id === badgeId)?.earned).toBe(true);
  });

  it('badge polyvalent : 3 catégories couvertes ; dgac-pilot : certif DGAC validée ; loadout-full : 4 épinglés', async () => {
    seedValidatedGear(GearCategory.DRONE, true);
    seedValidatedGear(GearCategory.CAMERA_360, true);
    seedValidatedGear(GearCategory.ROBOTICS, true);
    seedValidatedGear(GearCategory.DRONE, true);
    certs.seed({ freelanceId: freelance.id, status: CertificationStatus.VALIDATED, type: CertificationType.DGAC_DRONE } as Partial<Certification>);
    const byId = Object.fromEntries((await service.profileFor(freelance.id)).badges.map((b) => [b.id, b.earned]));
    expect(byId).toMatchObject({ polyvalent: true, 'dgac-pilot': true, 'loadout-full': true, certified: true });
  });

  it('profil PUBLIC : niveau + badges OBTENUS uniquement — ni xp, ni badges verrouillés (C2.2.3)', async () => {
    seedValidatedGear(GearCategory.DRONE);
    const pub = await service.publicProfileFor(freelance.id);
    expect(pub.levelLabel).toBe('Recrue');
    expect(pub.badges.map((b) => b.id)).toEqual(['first-validated']);
    expect(pub).not.toHaveProperty('xp');
    expect((pub.badges[0] as Record<string, unknown>).earned).toBeUndefined();
  });

  it('profil public : cible inexistante OU non-freelance → 404 uniforme', async () => {
    await expect(service.publicProfileFor(randomUUID())).rejects.toThrow(NotFoundException);
    const recruiter = users.seed({ role: UserRole.RECRUITER } as Partial<User>);
    await expect(service.publicProfileFor(recruiter.id)).rejects.toThrow(NotFoundException);
  });
});
```

- [ ] **Step 2 : Vérifier l'échec** — `npx jest src/gamification --no-coverage` → FAIL (module inexistant).

- [ ] **Step 3 : Implémentation** (`gamification.service.ts`) :

```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { Gear } from '../gear/gear.entity';
import { Certification } from '../certifications/certification.entity';
import { LOADOUT_MAX_SLOTS } from '../gear/gear.service';
import {
  CertificationStatus, CertificationType, GearStatus, UserRole,
} from '../common/enums';

// Barème XP (spec SH-21c §2) — SEULE source de vérité, référencée par les tests.
export const XP_PER_VALIDATED_GEAR = 50;
export const XP_PER_COVERED_CATEGORY = 30;
export const XP_PER_VALIDATED_CERTIFICATION = 80;

export interface LevelDefinition { threshold: number; level: number; label: string }
export const LEVELS: readonly LevelDefinition[] = [
  { threshold: 0, level: 1, label: 'Recrue' },
  { threshold: 100, level: 2, label: 'Opérateur' },
  { threshold: 250, level: 3, label: 'Spécialiste' },
  { threshold: 450, level: 4, label: 'Vétéran' },
  { threshold: 700, level: 5, label: 'Élite' },
  { threshold: 1000, level: 6, label: 'Légende' },
];

export interface BadgeView { id: string; label: string; description: string; earned: boolean }
export interface GamificationProfile {
  xp: number; level: number; levelLabel: string; nextLevelAt: number | null; badges: BadgeView[];
}
export interface PublicGamificationProfile {
  level: number; levelLabel: string; badges: Array<{ id: string; label: string; description: string }>;
}

/** Statistiques dérivées de la donnée existante — tout le calcul part d'ici. */
interface FreelanceStats {
  validatedGear: number; coveredCategories: number;
  validatedCertifications: number; dgacCertifications: number; loadoutCount: number;
}

// Catalogue statique : un badge = un prédicat sur les stats (dérivé, jamais persisté).
const BADGE_CATALOG: ReadonlyArray<{
  id: string; label: string; description: string; earnedWhen: (s: FreelanceStats) => boolean;
}> = [
  { id: 'first-validated', label: 'Première validation', description: 'Un premier équipement validé par un admin', earnedWhen: (s) => s.validatedGear >= 1 },
  { id: 'arsenal-5', label: 'Arsenal étoffé', description: '5 équipements validés', earnedWhen: (s) => s.validatedGear >= 5 },
  { id: 'arsenal-10', label: "Arsenal d'élite", description: '10 équipements validés', earnedWhen: (s) => s.validatedGear >= 10 },
  { id: 'polyvalent', label: 'Polyvalent', description: '3 catégories de matériel couvertes', earnedWhen: (s) => s.coveredCategories >= 3 },
  { id: 'certified', label: 'Certifié', description: 'Une certification professionnelle validée', earnedWhen: (s) => s.validatedCertifications >= 1 },
  { id: 'dgac-pilot', label: 'Télépilote DGAC', description: 'Brevet de télépilote DGAC validé', earnedWhen: (s) => s.dgacCertifications >= 1 },
  { id: 'loadout-full', label: 'Loadout complet', description: `${LOADOUT_MAX_SLOTS} équipements épinglés au loadout`, earnedWhen: (s) => s.loadoutCount >= LOADOUT_MAX_SLOTS },
];

/**
 * Gamification de l'Armurerie (SH-21c) — XP/niveaux/badges DÉRIVÉS À LA LECTURE :
 * aucune persistance propre, donc aucune dérive possible entre la donnée et la récompense.
 * Seule la preuve VALIDÉE rapporte (KPI : qualité de la donnée de matching, R10).
 */
@Injectable()
export class GamificationService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Gear) private readonly gear: Repository<Gear>,
    @InjectRepository(Certification) private readonly certifications: Repository<Certification>,
  ) {}

  /** Profil complet du freelance connecté (XP chiffré + badges verrouillés inclus). */
  async profileFor(userId: string): Promise<GamificationProfile> {
    const stats = await this.statsFor(userId);
    const xp =
      stats.validatedGear * XP_PER_VALIDATED_GEAR +
      stats.coveredCategories * XP_PER_COVERED_CATEGORY +
      stats.validatedCertifications * XP_PER_VALIDATED_CERTIFICATION;

    const current = [...LEVELS].reverse().find((l) => xp >= l.threshold) ?? LEVELS[0];
    const next = LEVELS.find((l) => l.threshold > xp) ?? null;

    return {
      xp,
      level: current.level,
      levelLabel: current.label,
      nextLevelAt: next ? next.threshold : null,
      badges: BADGE_CATALOG.map((b) => ({
        id: b.id, label: b.label, description: b.description, earned: b.earnedWhen(stats),
      })),
    };
  }

  /**
   * Profil PUBLIC pour un recruteur : niveau + badges OBTENUS uniquement.
   * Ni XP chiffré ni badges verrouillés : la mécanique interne n'est pas un signal recruteur (C2.2.3).
   */
  async publicProfileFor(freelanceId: string): Promise<PublicGamificationProfile> {
    const target = await this.users.findOne({ where: { id: freelanceId } });
    // 404 uniforme (inconnu OU non-freelance) : pas d'énumération du rôle des comptes
    if (!target || target.role !== UserRole.FREELANCE) {
      throw new NotFoundException('Profil Freelance introuvable');
    }
    const { xp, level, levelLabel, badges } = await this.profileFor(freelanceId);
    void xp; // jamais exposé publiquement
    return {
      level, levelLabel,
      badges: badges.filter((b) => b.earned).map(({ id, label, description }) => ({ id, label, description })),
    };
  }

  private async statsFor(userId: string): Promise<FreelanceStats> {
    const validated = await this.gear.find({ where: { freelanceId: userId, status: GearStatus.VALIDATED } });
    const validCerts = await this.certifications.find({
      where: { freelanceId: userId, status: CertificationStatus.VALIDATED },
    });
    return {
      validatedGear: validated.length,
      coveredCategories: new Set(validated.map((g) => g.category)).size,
      validatedCertifications: validCerts.length,
      dgacCertifications: validCerts.filter((c) => c.type === CertificationType.DGAC_DRONE).length,
      loadoutCount: validated.filter((g) => g.isInLoadout).length,
    };
  }
}
```

- [ ] **Step 4 : Vérifier le vert** — `npx jest src/gamification --no-coverage` → PASS.

- [ ] **Step 5 : Commit**
```bash
git add backend-core/src/gamification
git commit -m "feat(SH-21c/backend-core): GamificationService — XP dérivé (50/30/80), 6 niveaux, 7 badges calculés"
```

---

### Task 3 : Backend — GamificationController + DTOs Swagger + câblage

**Files:**
- Create: `backend-core/src/gamification/gamification.controller.ts`
- Create: `backend-core/src/gamification/dto/gamification-response.dto.ts`
- Modify: `backend-core/src/app.module.ts` (déclarer controller + service)
- Test: `backend-core/src/gamification/gamification.controller.spec.ts`

**Interfaces:**
- Consumes: `GamificationService.profileFor` / `.publicProfileFor` (Task 2) ; guards/décorateurs `JwtAuthGuard`, `RolesGuard`, `Roles`, `CurrentUser`, `JwtPayload` (`../auth/guards/jwt-auth.guard`).
- Produces: `GET /api/v1/gamification/me` (FREELANCE) et `GET /api/v1/gamification/freelance/:id` (RECRUITER) — contrat consommé par le front (Task 4) après `gen:api`.

- [ ] **Step 1 : Test du contrôleur (métadonnées RBAC + délégation)** :

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { GamificationController } from './gamification.controller';
import { GamificationService } from './gamification.service';
import { ROLES_KEY } from '../auth/guards/jwt-auth.guard';
import { UserRole } from '../common/enums';

describe('🏅 GamificationController (SH-21c)', () => {
  let controller: GamificationController;
  const profileFor = jest.fn();
  const publicProfileFor = jest.fn();

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GamificationController],
      providers: [{ provide: GamificationService, useValue: { profileFor, publicProfileFor } }],
    }).compile();
    controller = module.get(GamificationController);
  });

  it('GET me : réservé au rôle FREELANCE (RBAC déclaratif)', () => {
    const roles = new Reflector().get(ROLES_KEY, GamificationController.prototype.getMyProfile);
    expect(roles).toEqual([UserRole.FREELANCE]);
  });

  it('GET freelance/:id : réservé au rôle RECRUITER', () => {
    const roles = new Reflector().get(ROLES_KEY, GamificationController.prototype.getPublicProfile);
    expect(roles).toEqual([UserRole.RECRUITER]);
  });

  it("me : délègue avec l'identité du TOKEN, jamais un id client (C2.2.3)", async () => {
    await controller.getMyProfile({ userId: 'u-1', email: 'a@b.c', role: UserRole.FREELANCE });
    expect(profileFor).toHaveBeenCalledWith('u-1');
  });

  it('freelance/:id : délègue avec le paramètre de route', async () => {
    await controller.getPublicProfile('u-cible');
    expect(publicProfileFor).toHaveBeenCalledWith('u-cible');
  });
});
```

- [ ] **Step 2 : Vérifier l'échec** — `npx jest src/gamification --no-coverage` → FAIL (contrôleur inexistant).

- [ ] **Step 3 : Implémentation**

`dto/gamification-response.dto.ts` :
```typescript
import { ApiProperty } from '@nestjs/swagger';

/** Badge tel qu'exposé par l'API (C2.4.1). */
export class BadgeDto {
  @ApiProperty({ example: 'first-validated' }) id!: string;
  @ApiProperty({ example: 'Première validation' }) label!: string;
  @ApiProperty({ example: 'Un premier équipement validé par un admin' }) description!: string;
  @ApiProperty({ example: true }) earned!: boolean;
}

/** Badge public : obtenu par construction (le champ earned n'existe pas). */
export class PublicBadgeDto {
  @ApiProperty({ example: 'first-validated' }) id!: string;
  @ApiProperty({ example: 'Première validation' }) label!: string;
  @ApiProperty({ example: 'Un premier équipement validé par un admin' }) description!: string;
}

/** Profil de gamification complet (vue privée du freelance). */
export class GamificationProfileDto {
  @ApiProperty({ example: 260 }) xp!: number;
  @ApiProperty({ example: 3 }) level!: number;
  @ApiProperty({ example: 'Spécialiste' }) levelLabel!: string;
  @ApiProperty({ example: 450, nullable: true, description: 'Seuil du niveau suivant (null au niveau maximum)' })
  nextLevelAt!: number | null;
  @ApiProperty({ type: [BadgeDto] }) badges!: BadgeDto[];
}

/** Profil public (vue recruteur) : niveau + badges obtenus, jamais d'XP chiffré. */
export class PublicGamificationProfileDto {
  @ApiProperty({ example: 3 }) level!: number;
  @ApiProperty({ example: 'Spécialiste' }) levelLabel!: string;
  @ApiProperty({ type: [PublicBadgeDto] }) badges!: PublicBadgeDto[];
}
```

`gamification.controller.ts` :
```typescript
import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth, ApiForbiddenResponse, ApiNotFoundResponse, ApiOkResponse,
  ApiOperation, ApiTags, ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { GamificationService } from './gamification.service';
import { GamificationProfileDto, PublicGamificationProfileDto } from './dto/gamification-response.dto';
import { CurrentUser, JwtAuthGuard, JwtPayload, Roles, RolesGuard } from '../auth/guards/jwt-auth.guard';
import { UserRole } from '../common/enums';

/**
 * Gamification de l'Armurerie (SH-21c) : XP, niveaux et badges dérivés de la preuve validée.
 * Vue privée complète pour le freelance ; vue publique réduite pour le recruteur.
 */
@ApiTags('🏅 Gamification')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token JWT manquant, invalide ou expiré (401)' })
@ApiForbiddenResponse({ description: 'Rôle insuffisant pour cette ressource (403)' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('api/v1/gamification')
export class GamificationController {
  constructor(private readonly gamificationService: GamificationService) {}

  @Get('me')
  @Roles(UserRole.FREELANCE)
  @ApiOperation({ summary: 'Mon profil de gamification (XP, niveau, badges — Freelance)' })
  @ApiOkResponse({ type: GamificationProfileDto })
  getMyProfile(@CurrentUser() user: JwtPayload) {
    // Identité issue du token : on ne calcule jamais le profil d'un id client (C2.2.3)
    return this.gamificationService.profileFor(user.userId);
  }

  @Get('freelance/:id')
  @Roles(UserRole.RECRUITER)
  @ApiOperation({ summary: "Profil public d'un freelance : niveau + badges obtenus (Recruteur)" })
  @ApiOkResponse({ type: PublicGamificationProfileDto })
  @ApiNotFoundResponse({ description: 'Profil Freelance introuvable (404 uniforme)' })
  getPublicProfile(@Param('id', ParseUUIDPipe) id: string) {
    return this.gamificationService.publicProfileFor(id);
  }
}
```

`app.module.ts` — imports en tête + déclarations :
```typescript
import { GamificationService } from './gamification/gamification.service';
import { GamificationController } from './gamification/gamification.controller';
// controllers: [...]
    GamificationController, // XP/niveaux/badges dérivés (SH-21c)
// providers: [...]
    GamificationService, // Gamification de l'Armurerie (SH-21c)
```

- [ ] **Step 4 : Vérifier le vert** — `npx jest src/gamification src/gear --no-coverage` puis `npm run test && npm run lint && npm run build` → tout vert.

- [ ] **Step 5 : Commit**
```bash
git add backend-core/src/gamification backend-core/src/app.module.ts
git commit -m "feat(SH-21c/backend-core): endpoints gamification — GET me (freelance) et GET freelance/:id (recruteur, vue réduite)"
```

---

### Task 4 : Front — gen:api + `features/gamification/` (hooks, LevelCard, BadgeGrid) en TDD

**Files:**
- Regenerate: `frontend-web/src/api/schema.d.ts` (`npm run gen:api`, backend démarré sur 3001 — voir note)
- Create: `frontend-web/src/features/gamification/types.ts`
- Create: `frontend-web/src/features/gamification/useGamification.ts`
- Create: `frontend-web/src/features/gamification/LevelCard.tsx`
- Create: `frontend-web/src/features/gamification/BadgeGrid.tsx`
- Test: `frontend-web/src/features/gamification/LevelCard.test.tsx`, `frontend-web/src/features/gamification/BadgeGrid.test.tsx`, `frontend-web/src/features/gamification/useGamification.test.tsx`

**Interfaces:**
- Consumes: `apiClient`, patterns MSW (`src/test/server.ts`), tokens `--color-hud-*`.
- Produces: `useGamification()` (privé, `GET /api/v1/gamification/me`), `useFreelanceGamification(freelanceId)` (public), `<LevelCard profile={...} />`, `<BadgeGrid badges={...} />` — consommés par Tasks 5 et 6. Types : `GamificationProfile = components['schemas']['GamificationProfileDto']`, `PublicGamificationProfile = components['schemas']['PublicGamificationProfileDto']`, `Badge = components['schemas']['BadgeDto']`.

**Note gen:api** : démarrer le backend (`cd backend-core && npm run start:dev`, infra `docker compose up -d` nécessaire) puis `cd frontend-web && npm run gen:api`. Arrêter le backend ensuite.

- [ ] **Step 1 : `types.ts`** (types + helper, pas de logique) :
```typescript
import type { components } from '@/api/schema';

// Types du contrat API — générés depuis le Swagger backend (`npm run gen:api`, SH-21c).
export type GamificationProfile = components['schemas']['GamificationProfileDto'];
export type PublicGamificationProfile = components['schemas']['PublicGamificationProfileDto'];
export type Badge = components['schemas']['BadgeDto'];
export type PublicBadge = components['schemas']['PublicBadgeDto'];
```

- [ ] **Step 2 : Tests (échec d'abord)** — `LevelCard.test.tsx` :
```tsx
import { render, screen } from '@testing-library/react';
import { LevelCard } from './LevelCard';

const profile = {
  xp: 260, level: 3, levelLabel: 'Spécialiste', nextLevelAt: 450, badges: [],
};

describe('LevelCard (SH-21c)', () => {
  it('affiche le niveau en toutes lettres et la progression en aria-valuetext (R6/SH-44)', () => {
    render(<LevelCard profile={profile} />);
    expect(screen.getByText('Spécialiste')).toBeInTheDocument();
    const bar = screen.getByRole('progressbar', { name: /progression/i });
    expect(bar).toHaveAttribute('aria-valuenow', '260');
    expect(bar).toHaveAttribute('aria-valuetext', '260 XP — prochain niveau à 450 XP');
  });

  it('au niveau maximum (nextLevelAt null), annonce « niveau maximum » et une barre pleine', () => {
    render(<LevelCard profile={{ ...profile, level: 6, levelLabel: 'Légende', nextLevelAt: null }} />);
    const bar = screen.getByRole('progressbar', { name: /progression/i });
    expect(bar).toHaveAttribute('aria-valuetext', '260 XP — niveau maximum');
  });
});
```
`BadgeGrid.test.tsx` :
```tsx
import { render, screen, within } from '@testing-library/react';
import { BadgeGrid } from './BadgeGrid';

const badges = [
  { id: 'first-validated', label: 'Première validation', description: 'Un premier équipement validé par un admin', earned: true },
  { id: 'arsenal-5', label: 'Arsenal étoffé', description: '5 équipements validés', earned: false },
];

describe('BadgeGrid (SH-21c)', () => {
  it("chaque badge porte son libellé ET son état en texte — jamais l'opacité seule (R6)", () => {
    render(<BadgeGrid badges={badges} />);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByText('Première validation')).toBeInTheDocument();
    expect(within(items[0]).getByText('Obtenu')).toBeInTheDocument();
    expect(within(items[1]).getByText('À débloquer')).toBeInTheDocument();
  });

  it('mode public : badges sans earned = tous affichés comme obtenus', () => {
    render(<BadgeGrid badges={[{ id: 'certified', label: 'Certifié', description: 'Une certification validée' }]} />);
    expect(screen.getByText('Obtenu')).toBeInTheDocument();
  });
});
```
`useGamification.test.tsx` (pattern `useMyGear.test.tsx` : QueryClientProvider + MSW) :
```tsx
import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { DEFAULT_API_URL } from '@/api/client';
import { useGamification, useFreelanceGamification } from './useGamification';

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

describe('hooks gamification (SH-21c)', () => {
  it('useGamification lit GET /api/v1/gamification/me', async () => {
    server.use(http.get(`${DEFAULT_API_URL}/api/v1/gamification/me`, () =>
      HttpResponse.json({ xp: 80, level: 1, levelLabel: 'Recrue', nextLevelAt: 100, badges: [] }),
    ));
    const { result } = renderHook(() => useGamification(), { wrapper });
    await waitFor(() => expect(result.current.data?.levelLabel).toBe('Recrue'));
  });

  it('useFreelanceGamification lit le profil public réduit', async () => {
    server.use(http.get(`${DEFAULT_API_URL}/api/v1/gamification/freelance/u-1`, () =>
      HttpResponse.json({ level: 2, levelLabel: 'Opérateur', badges: [] }),
    ));
    const { result } = renderHook(() => useFreelanceGamification('u-1'), { wrapper });
    await waitFor(() => expect(result.current.data?.levelLabel).toBe('Opérateur'));
  });
});
```

- [ ] **Step 3 : Vérifier l'échec** — `cd frontend-web && npx vitest run src/features/gamification` → FAIL (modules inexistants).

- [ ] **Step 4 : Implémentation**

`useGamification.ts` :
```typescript
import { useQuery } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { apiClient } from '@/api/client';
import type { GamificationProfile, PublicGamificationProfile } from './types';

/** Profil de gamification du freelance connecté (SH-21c). */
export function useGamification() {
  return useQuery<GamificationProfile, AxiosError>({
    queryKey: ['gamification', 'me'],
    queryFn: async () => (await apiClient.get<GamificationProfile>('/api/v1/gamification/me')).data,
  });
}

/** Profil public (niveau + badges obtenus) d'un freelance, vu par un recruteur. */
export function useFreelanceGamification(freelanceId: string) {
  return useQuery<PublicGamificationProfile, AxiosError>({
    queryKey: ['gamification', 'freelance', freelanceId],
    queryFn: async () =>
      (await apiClient.get<PublicGamificationProfile>(`/api/v1/gamification/freelance/${freelanceId}`)).data,
  });
}
```

`LevelCard.tsx` :
```tsx
import type { GamificationProfile } from './types';

/**
 * Niveau + progression XP (SH-21c). L'information est portée par le TEXTE
 * (libellé du niveau, aria-valuetext), jamais par la seule barre colorée (R6, SH-44).
 */
export function LevelCard({ profile }: { profile: Pick<GamificationProfile, 'xp' | 'levelLabel' | 'nextLevelAt'> }) {
  const { xp, levelLabel, nextLevelAt } = profile;
  const max = nextLevelAt ?? Math.max(xp, 1);
  const percent = Math.min(100, Math.round((xp / max) * 100));
  const valuetext = nextLevelAt === null
    ? `${xp} XP — niveau maximum`
    : `${xp} XP — prochain niveau à ${nextLevelAt} XP`;

  return (
    <section aria-label="Progression" className="bg-hud-card border-hud-border flex flex-col gap-2 rounded-lg border p-4">
      <p className="flex items-baseline justify-between">
        <span className="font-bold tracking-widest text-white uppercase">{levelLabel}</span>
        <span className="text-hud-muted text-xs">{valuetext}</span>
      </p>
      <div
        role="progressbar"
        aria-label="Progression vers le prochain niveau"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={xp}
        aria-valuetext={valuetext}
        className="bg-hud-pill h-2 overflow-hidden rounded-full"
      >
        <div className="bg-hud-validated h-full rounded-full" style={{ width: `${percent}%` }} />
      </div>
    </section>
  );
}
```
*(si le token `--color-hud-validated` n'existe pas sous ce nom, reprendre le token exact utilisé par `GearProgress.tsx` — ne PAS introduire d'hexadécimal).*

`BadgeGrid.tsx` :
```tsx
import { Award, Lock } from 'lucide-react';

interface BadgeItem { id: string; label: string; description: string; earned?: boolean }

/**
 * Grille de badges (SH-21c). L'état obtenu/verrouillé est écrit en toutes lettres
 * (« Obtenu » / « À débloquer ») — l'opacité seule ne porte jamais l'information (R6).
 * Sans champ `earned` (vue publique), tout badge listé est obtenu par construction.
 */
export function BadgeGrid({ badges }: { badges: BadgeItem[] }) {
  return (
    <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {badges.map((badge) => {
        const earned = badge.earned ?? true;
        const Icon = earned ? Award : Lock;
        return (
          <li
            key={badge.id}
            className={`bg-hud-card border-hud-border flex items-center gap-3 rounded-lg border p-3 ${earned ? '' : 'opacity-60'}`}
          >
            <Icon aria-hidden="true" className="text-hud-icon h-5 w-5 shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold text-white">{badge.label}</span>
              <span className="text-hud-muted block text-xs">{badge.description}</span>
            </span>
            <span className="text-hud-muted shrink-0 text-xs tracking-widest uppercase">
              {earned ? 'Obtenu' : 'À débloquer'}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
```

- [ ] **Step 5 : Vérifier le vert** — `npx vitest run src/features/gamification` → PASS.

- [ ] **Step 6 : Commit**
```bash
git add frontend-web/src/features/gamification frontend-web/src/api/schema.d.ts
git commit -m "feat(SH-21c/frontend-web): features/gamification — hooks, LevelCard (aria-valuetext), BadgeGrid (état en texte)"
```

---

### Task 5 : Front — loadout en vue privée + intégration Armurerie

**Files:**
- Create: `frontend-web/src/features/gear/useSetLoadout.ts`
- Create: `frontend-web/src/features/gear/LoadoutRow.tsx`
- Modify: `frontend-web/src/features/gear/GearCard.tsx` (prop optionnelle `trailingAction`)
- Modify: `frontend-web/src/pages/Armurerie.tsx` (LoadoutRow + LevelCard + BadgeGrid + action épingler)
- Test: `frontend-web/src/features/gear/LoadoutRow.test.tsx`, étendre `frontend-web/src/pages/Armurerie.test.tsx`

**Interfaces:**
- Consumes: `useGamification`, `LevelCard`, `BadgeGrid` (Task 4) ; `PublicGear`/`Gear` (avec `isInLoadout` après gen:api) ; `useMyGear` existant.
- Produces: `useSetLoadout()` → mutation `{ gearId, inLoadout }` PATCH `/api/v1/gear/:id/loadout`, invalide `['gear','me']` + `['gamification','me']` ; `<LoadoutRow items={...} onUnpin={...} />` (4 slots).

- [ ] **Step 1 : Tests d'abord** — `LoadoutRow.test.tsx` :
```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { LoadoutRow } from './LoadoutRow';
import type { PublicGear } from './types';

const pinned = [
  { id: 'g-1', brand: 'DJI', model: 'Mavic 3', category: 'DRONE', status: 'VALIDATED', isInLoadout: true, createdAt: '2026-07-01T10:00:00.000Z' },
] as PublicGear[];

describe('LoadoutRow (SH-21c)', () => {
  it('affiche les équipements épinglés puis des emplacements libres jusqu à 4', () => {
    render(<LoadoutRow items={pinned} onUnpin={() => {}} />);
    expect(screen.getByRole('heading', { name: /loadout/i })).toBeInTheDocument();
    expect(screen.getByText('DJI Mavic 3')).toBeInTheDocument();
    expect(screen.getAllByText('Emplacement libre')).toHaveLength(3);
  });

  it('« Retirer » déclenche onUnpin avec l id du gear', async () => {
    const onUnpin = vi.fn();
    render(<LoadoutRow items={pinned} onUnpin={onUnpin} />);
    await userEvent.click(screen.getByRole('button', { name: /retirer dji mavic 3 du loadout/i }));
    expect(onUnpin).toHaveBeenCalledWith('g-1');
  });
});
```
Étendre `Armurerie.test.tsx` (handlers MSW existants ; ajouter un handler `GET /api/v1/gamification/me` par défaut ET dans chaque test qui rend la page, plus :) :
```tsx
  it('affiche le niveau, les badges et la rangée loadout (SH-21c)', async () => {
    server.use(
      respondWith(LOCKER), // helper existant du fichier
      http.get(url('/api/v1/gamification/me'), () =>
        HttpResponse.json({
          xp: 130, level: 2, levelLabel: 'Opérateur', nextLevelAt: 250,
          badges: [{ id: 'first-validated', label: 'Première validation', description: 'Un premier équipement validé par un admin', earned: true }],
        }),
      ),
    );
    renderPage();
    expect(await screen.findByText('Opérateur')).toBeInTheDocument();
    expect(screen.getByText('Première validation')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /loadout/i })).toBeInTheDocument();
  });

  it('« Épingler » sur une fiche validée appelle PATCH /gear/:id/loadout', async () => {
    let patched: unknown = null;
    server.use(
      respondWith(LOCKER),
      http.get(url('/api/v1/gamification/me'), () =>
        HttpResponse.json({ xp: 0, level: 1, levelLabel: 'Recrue', nextLevelAt: 100, badges: [] }),
      ),
      http.patch(url('/api/v1/gear/g-validated/loadout'), async ({ request }) => {
        patched = await request.json();
        return HttpResponse.json({});
      }),
    );
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /épingler .* au loadout/i }));
    await waitFor(() => expect(patched).toEqual({ inLoadout: true }));
  });
```
*(adapter les ids/fixtures aux helpers réels du fichier — un gear `VALIDATED` avec l'id `g-validated` doit exister dans `LOCKER`).*

- [ ] **Step 2 : Vérifier l'échec** — `npx vitest run src/features/gear/LoadoutRow.test.tsx src/pages/Armurerie.test.tsx` → FAIL.

- [ ] **Step 3 : Implémentation**

`useSetLoadout.ts` :
```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { apiClient } from '@/api/client';

/** Épingler/retirer un équipement du loadout (SH-21c) — invalide casier ET gamification. */
export function useSetLoadout() {
  const queryClient = useQueryClient();
  return useMutation<unknown, AxiosError, { gearId: string; inLoadout: boolean }>({
    mutationFn: async ({ gearId, inLoadout }) =>
      (await apiClient.patch(`/api/v1/gear/${gearId}/loadout`, { inLoadout })).data,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['gear', 'me'] });
      void queryClient.invalidateQueries({ queryKey: ['gamification', 'me'] });
    },
  });
}
```

`LoadoutRow.tsx` :
```tsx
import { Pin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GearCard } from './GearCard';
import type { PublicGear } from './types';

const LOADOUT_SLOTS = 4; // miroir de LOADOUT_MAX_SLOTS backend (SH-21c)

/** Vitrine loadout : les équipements épinglés + les emplacements restants (SH-21c). */
export function LoadoutRow({ items, onUnpin }: { items: PublicGear[]; onUnpin?: (gearId: string) => void }) {
  const freeSlots = Math.max(0, LOADOUT_SLOTS - items.length);
  return (
    <section aria-label="Loadout" className="flex flex-col gap-2">
      <h2 className="flex items-center gap-2 text-sm font-bold tracking-widest text-white uppercase">
        <Pin aria-hidden="true" className="text-hud-icon h-4 w-4" />
        Loadout ({items.length}/{LOADOUT_SLOTS})
      </h2>
      <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">
        {items.map((gear) => (
          <GearCard
            key={gear.id}
            gear={gear}
            trailingAction={
              onUnpin && (
                <Button
                  variant="outline"
                  size="sm"
                  aria-label={`Retirer ${gear.brand} ${gear.model} du loadout`}
                  onClick={() => onUnpin(gear.id)}
                >
                  Retirer
                </Button>
              )
            }
          />
        ))}
        {Array.from({ length: freeSlots }, (_, i) => (
          <li
            key={`libre-${i}`}
            className="border-hud-border text-hud-muted flex items-center justify-center rounded-lg border border-dashed p-4 text-xs tracking-widest uppercase"
          >
            Emplacement libre
          </li>
        ))}
      </ul>
    </section>
  );
}
```

`GearCard.tsx` — signature étendue (prop optionnelle, la vue publique n'en passe pas) :
```tsx
import type { ReactNode } from 'react';
// …
export function GearCard({ gear, trailingAction }: { gear: PublicGear; trailingAction?: ReactNode }) {
  // … contenu existant inchangé, puis après <GearStatusBadge status={gear.status} /> :
  //   {trailingAction}
}
```

`Armurerie.tsx` — intégration (dans le bloc `!isPending && !isError && items.length > 0`, au-dessus de `<GearProgress …>`) :
```tsx
{/* Gamification (SH-21c) : loadout, niveau, badges — dérivés de la preuve validée */}
<LoadoutRow items={pinnedItems} onUnpin={(gearId) => setLoadout.mutate({ gearId, inLoadout: false })} />
{gamification.data && (
  <>
    <LevelCard profile={gamification.data} />
    <BadgeGrid badges={gamification.data.badges} />
  </>
)}
{loadoutError && (
  <p role="alert" className="text-hud-rejected text-sm">{loadoutError}</p>
)}
```
avec, en tête de composant :
```tsx
const gamification = useGamification();
const setLoadout = useSetLoadout();
const [loadoutError, setLoadoutError] = useState<string | null>(null);
const pinnedItems = useMemo(() => items.filter((gear) => gear.isInLoadout), [items]);
```
et l'action « Épingler » passée à la grille : rendre les fiches de `GearGrid` via `GearCard` avec `trailingAction` bouton `aria-label={`Épingler ${gear.brand} ${gear.model} au loadout`}` visible si `gear.status === 'VALIDATED' && !gear.isInLoadout`, qui appelle
```tsx
setLoadout.mutate({ gearId: gear.id, inLoadout: true }, {
  onError: (error) => setLoadoutError(
    (error.response?.data as { message?: string })?.message ?? "Impossible de modifier le loadout",
  ),
  onSuccess: () => setLoadoutError(null),
});
```
*(si `GearGrid` ne permet pas d'injecter l'action, lui ajouter une prop optionnelle `renderAction?: (gear: PublicGear) => ReactNode` transmise à `GearCard` — la vue publique ne la passe pas).*

- [ ] **Step 4 : Vérifier le vert** — `npx vitest run src/features/gear src/pages/Armurerie.test.tsx` → PASS (adapter les tests existants d'Armurerie qui ne mockaient pas `/gamification/me` : ajouter le handler par défaut dans `renderPage` ou `server.use`).

- [ ] **Step 5 : Commit**
```bash
git add frontend-web/src/features/gear frontend-web/src/pages/Armurerie.tsx frontend-web/src/pages/Armurerie.test.tsx
git commit -m "feat(SH-21c/frontend-web): vue privée — rangée loadout (4 slots), épingler/retirer, LevelCard + BadgeGrid"
```

---

### Task 6 : Front — vue publique enrichie, docs, vérification e2e, PR

**Files:**
- Modify: `frontend-web/src/pages/FreelanceGear.tsx` (loadout en tête + niveau + badges obtenus)
- Test: étendre `frontend-web/src/pages/FreelanceGear.test.tsx`
- Modify: `docs/BACKLOG.md` (SH-21 → 🟢), `docs/tickets/SH-21-armurerie-gamifiee.md` (21c livrée, DoD)

**Interfaces:**
- Consumes: `useFreelanceGamification` (Task 4), `LoadoutRow` sans `onUnpin` (Task 5), `isInLoadout` sur `PublicGear` (Task 1 + gen:api).

- [ ] **Step 1 : Tests d'abord** — étendre `FreelanceGear.test.tsx` (ajouter un handler `GET /api/v1/gamification/freelance/:id` par défaut) :
```tsx
  it('affiche le loadout en tête, le niveau et les badges obtenus (SH-21c)', async () => {
    server.use(
      respondWith([
        makePublicGear({ id: 'g-1', brand: 'DJI', model: 'Mavic 3', isInLoadout: true }),
        makePublicGear({ id: 'g-2', brand: 'Insta360', model: 'Pro 2', category: 'CAMERA_360' }),
      ]),
      http.get(url(`/api/v1/gamification/freelance/${FREELANCE_ID}`), () =>
        HttpResponse.json({
          level: 2, levelLabel: 'Opérateur',
          badges: [{ id: 'first-validated', label: 'Première validation', description: 'Un premier équipement validé par un admin' }],
        }),
      ),
    );
    renderPage();
    expect(await screen.findByText('Opérateur')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /loadout/i })).toBeInTheDocument();
    expect(screen.getByText('Première validation')).toBeInTheDocument();
    // Vue publique : pas d'XP chiffré, pas de contrôle d'épinglage
    expect(screen.queryByText(/XP/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /épingler|retirer/i })).not.toBeInTheDocument();
  });
```

- [ ] **Step 2 : Vérifier l'échec** — `npx vitest run src/pages/FreelanceGear.test.tsx` → FAIL.

- [ ] **Step 3 : Implémentation** (`FreelanceGear.tsx`) — au-dessus des chips, dans le bloc de succès :
```tsx
{pinnedItems.length > 0 && <LoadoutRow items={pinnedItems} />}
{gamification.data && (
  <>
    <p className="font-bold tracking-widest text-white uppercase">{gamification.data.levelLabel}</p>
    {gamification.data.badges.length > 0 && <BadgeGrid badges={gamification.data.badges} />}
  </>
)}
```
avec `const gamification = useFreelanceGamification(freelanceId ?? '');` et `const pinnedItems = useMemo(() => items.filter((g) => g.isInLoadout), [items]);`. La grille principale liste le reste (le backend sert déjà le loadout en premier).

- [ ] **Step 4 : Suites complètes** — `npm run test && npm run lint && npm run format && npm run build` (frontend) et `npm run test && npm run lint && npm run build` (backend) → tout vert.

- [ ] **Step 5 : Vérification e2e réelle** (skill projet `.claude/skills/verify/SKILL.md`) : `docker compose --profile app up -d --build`, appliquer la migration, puis scénario complet via `http://localhost:8088` — freelance déclare + admin valide du matériel → XP/badges évoluent → épingler 4 → badge « Loadout complet » → vue recruteur (loadout en tête, niveau, badges obtenus, pas d'XP) ; sondes : épingler un PENDING → 400, 5ᵉ épingle → 400, gear d'autrui → 404.

- [ ] **Step 6 : Docs + commit + PR**
```bash
# BACKLOG : SH-21 → 🟢 Terminé (21c livrée) ; ticket SH-21 : §6 21c livrée + DoD
git add docs/ frontend-web/
git commit -m "feat(SH-21c/frontend-web): vue publique — loadout en tête, niveau + badges obtenus (sans XP chiffré)"
git push -u origin feature/SH-21c-armurerie-gamification
gh pr create --base develop --title "feat(SH-21c): gamification de l'Armurerie — XP, niveaux, badges, loadout"
```
