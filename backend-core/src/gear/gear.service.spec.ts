import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { GearService, LOADOUT_MAX_SLOTS } from './gear.service';
import { Gear } from './gear.entity';
import { User } from '../users/user.entity';
import { UserRole, GearStatus, GearCategory } from '../common/enums';
import { QueryGearDto } from './dto/query-gear.dto';
import { PublicQueryGearDto } from './dto/public-query-gear.dto';
import { EventPublisherService, DomainEventType } from '../common/events/event-publisher.service';

/** Faux repository User en mémoire, avec un helper de seed. */
class FakeUserRepository {
  private store: User[] = [];

  seed(partial: Partial<User>): User {
    const user = { id: randomUUID(), ...partial } as User;
    this.store.push(user);
    return user;
  }

  findOne({ where }: { where: Partial<User> }): Promise<User | null> {
    const keys = Object.keys(where) as (keyof User)[];
    return Promise.resolve(this.store.find((u) => keys.every((k) => u[k] === where[k])) ?? null);
  }
}

/** Faux repository Gear en mémoire (create / save / findOne / findAndCount / seed direct pour les tests). */
class FakeGearRepository {
  private store: Gear[] = [];

  create(partial: Partial<Gear>): Gear {
    return { ...partial } as Gear;
  }

  save(gear: Gear): Promise<Gear> {
    if (!gear.id) {
      gear.id = randomUUID();
      gear.createdAt = new Date();
    }
    const idx = this.store.findIndex((g) => g.id === gear.id);
    if (idx >= 0) {
      this.store[idx] = gear;
    } else {
      this.store.push(gear);
    }
    return Promise.resolve(gear);
  }

  /** Seed direct (contourne create/save) : utile pour poser un état arbitraire (ex. loadout SH-21c). */
  seed(partial: Partial<Gear>): Gear {
    const gear = { id: randomUUID(), createdAt: new Date(), isInLoadout: false, ...partial } as Gear;
    this.store.push(gear);
    return gear;
  }

  findOne({ where }: { where: Partial<Gear> }): Promise<Gear | null> {
    const keys = Object.keys(where) as (keyof Gear)[];
    return Promise.resolve(this.store.find((g) => keys.every((k) => g[k] === where[k])) ?? null);
  }

  count({ where }: { where: Partial<Gear> }): Promise<number> {
    const keys = Object.keys(where) as (keyof Gear)[];
    return Promise.resolve(this.store.filter((g) => keys.every((k) => g[k] === where[k])).length);
  }

  findAndCount(options: {
    where?: Partial<Gear>;
    order?: { isInLoadout?: 'ASC' | 'DESC'; createdAt?: 'ASC' | 'DESC' };
    skip?: number;
    take?: number;
  }): Promise<[Gear[], number]> {
    const where = options.where ?? {};
    const keys = Object.keys(where) as (keyof Gear)[];
    let rows = this.store.filter((g) => keys.every((k) => g[k] === where[k]));
    rows = [...rows].sort((a, b) => {
      if (options.order?.isInLoadout === 'DESC') {
        const diff = Number(b.isInLoadout) - Number(a.isInLoadout);
        if (diff !== 0) return diff;
      }
      if (options.order?.createdAt === 'DESC') {
        return b.createdAt.getTime() - a.createdAt.getTime();
      }
      return 0;
    });
    const total = rows.length;
    const skip = options.skip ?? 0;
    const end = options.take != null ? skip + options.take : undefined;
    return Promise.resolve([rows.slice(skip, end), total]);
  }
}

// Construit une QueryGearDto de test (les valeurs par défaut du DTO ne s'appliquent qu'à l'instanciation réelle)
function q(overrides: Partial<QueryGearDto> = {}): QueryGearDto {
  return { page: 1, limit: 20, ...overrides } as QueryGearDto;
}

describe('🎒 GearService (Armurerie — SH-9)', () => {
  let service: GearService;
  let users: FakeUserRepository;
  let gearRepo: FakeGearRepository;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GearService,
        { provide: getRepositoryToken(Gear), useClass: FakeGearRepository },
        { provide: getRepositoryToken(User), useClass: FakeUserRepository },
        // Bus d'événements mocké : l'émission est testée dans le describe SH-14 dédié (C2.2.2)
        { provide: EventPublisherService, useValue: { publish: jest.fn() } },
      ],
    }).compile();

    service = module.get<GearService>(GearService);
    users = module.get<FakeUserRepository>(getRepositoryToken(User));
    gearRepo = module.get<FakeGearRepository>(getRepositoryToken(Gear));
  });

  const freelance = (): User =>
    users.seed({ email: `${randomUUID()}@x.io`, username: 'F', passwordHash: 'h', role: UserRole.FREELANCE });

  const dto = {
    category: GearCategory.DRONE,
    brand: 'DJI',
    model: 'Mavic 3',
    serialNumber: 'SN-1',
  };

  // --- Déclaration ---
  it('rattache le matériel au freelance courant, en attente de validation', async () => {
    const a = freelance();
    const gear = await service.addGearToLocker(a.id, dto);

    expect(gear.freelanceId).toBe(a.id);
    expect(gear.category).toBe(GearCategory.DRONE);
    expect(gear.status).toBe(GearStatus.PENDING);
  });

  it('refuse (404) la déclaration pour un non-freelance ou un utilisateur inconnu', async () => {
    const recruiter = users.seed({ email: 'r@x.io', username: 'R', passwordHash: 'h', role: UserRole.RECRUITER });

    await expect(service.addGearToLocker(recruiter.id, dto)).rejects.toThrow(NotFoundException);
    await expect(service.addGearToLocker('inconnu', dto)).rejects.toThrow(NotFoundException);
  });

  // --- Étanchéité ---
  it('garantit l\'étanchéité : A ne voit jamais le matériel de B', async () => {
    const a = freelance();
    const b = freelance();
    await service.addGearToLocker(a.id, { ...dto, serialNumber: 'SN-A' });
    await service.addGearToLocker(b.id, { ...dto, serialNumber: 'SN-B' });

    const result = await service.getFreelanceGear(a.id, q());

    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].serialNumber).toBe('SN-A');
    expect(result.items.every((g) => g.freelanceId === a.id)).toBe(true);
  });

  // --- Filtres ---
  it('filtre le casier par catégorie', async () => {
    const a = freelance();
    await service.addGearToLocker(a.id, { ...dto, category: GearCategory.DRONE, serialNumber: 'SN-D' });
    await service.addGearToLocker(a.id, { ...dto, category: GearCategory.SENSOR, serialNumber: 'SN-S' });

    const drones = await service.getFreelanceGear(a.id, q({ category: GearCategory.DRONE }));

    expect(drones.total).toBe(1);
    expect(drones.items[0].category).toBe(GearCategory.DRONE);
  });

  it('filtre le casier par statut', async () => {
    const a = freelance();
    const g1 = await service.addGearToLocker(a.id, { ...dto, serialNumber: 'SN-1' });
    await service.addGearToLocker(a.id, { ...dto, serialNumber: 'SN-2' });
    await service.reviewGear(g1.id, GearStatus.VALIDATED);

    const pending = await service.getFreelanceGear(a.id, q({ status: GearStatus.PENDING }));
    const validated = await service.getFreelanceGear(a.id, q({ status: GearStatus.VALIDATED }));

    expect(pending.total).toBe(1);
    expect(validated.total).toBe(1);
    expect(validated.items[0].id).toBe(g1.id);
  });

  // --- Pagination ---
  it('pagine les résultats', async () => {
    const a = freelance();
    for (let i = 0; i < 3; i++) {
      await service.addGearToLocker(a.id, { ...dto, serialNumber: `SN-${i}` });
    }

    const page1 = await service.getFreelanceGear(a.id, q({ page: 1, limit: 2 }));
    const page2 = await service.getFreelanceGear(a.id, q({ page: 2, limit: 2 }));

    expect(page1.total).toBe(3);
    expect(page1.items).toHaveLength(2);
    expect(page2.items).toHaveLength(1);
  });

  // --- File de validation admin ---
  it('liste uniquement le matériel PENDING, tous freelances confondus', async () => {
    const a = freelance();
    const b = freelance();
    await service.addGearToLocker(a.id, { ...dto, serialNumber: 'SN-A' });
    const gB = await service.addGearToLocker(b.id, { ...dto, serialNumber: 'SN-B' });
    await service.reviewGear(gB.id, GearStatus.VALIDATED); // sort de la file

    const pending = await service.listPendingForValidation(q());

    expect(pending.total).toBe(1);
    expect(pending.items[0].status).toBe(GearStatus.PENDING);
  });

  // --- Workflow de validation ---
  it('valide un équipement PENDING -> VALIDATED', async () => {
    const a = freelance();
    const gear = await service.addGearToLocker(a.id, dto);

    const reviewed = await service.reviewGear(gear.id, GearStatus.VALIDATED);

    expect(reviewed.status).toBe(GearStatus.VALIDATED);
  });

  it('refuse (409) une seconde décision sur un équipement déjà traité', async () => {
    const a = freelance();
    const gear = await service.addGearToLocker(a.id, dto);
    await service.reviewGear(gear.id, GearStatus.VALIDATED);

    await expect(service.reviewGear(gear.id, GearStatus.REJECTED)).rejects.toThrow(ConflictException);
  });

  it('refuse (404) la review d\'un équipement inexistant', async () => {
    await expect(service.reviewGear('inexistant', GearStatus.VALIDATED)).rejects.toThrow(NotFoundException);
  });

  // --- Consultation publique par un recruteur (SH-39) — C2.2.3 ---
  describe('consultation publique du casier par un recruteur (SH-39)', () => {
    it('ne renvoie QUE le matériel VALIDATED du freelance ciblé', async () => {
      const a = freelance();
      const validated = await service.addGearToLocker(a.id, { ...dto, serialNumber: 'SN-OK' });
      await service.addGearToLocker(a.id, { ...dto, serialNumber: 'SN-PENDING' });
      const rejected = await service.addGearToLocker(a.id, { ...dto, serialNumber: 'SN-KO' });
      await service.reviewGear(validated.id, GearStatus.VALIDATED);
      await service.reviewGear(rejected.id, GearStatus.REJECTED);

      const result = await service.getPublicFreelanceGear(a.id, q());

      expect(result.total).toBe(1);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe(validated.id);
      expect(result.items[0].status).toBe(GearStatus.VALIDATED);
    });

    it('n\'expose JAMAIS serialNumber ni freelanceId (minimisation, CLAUDE.md §8)', async () => {
      const a = freelance();
      const g = await service.addGearToLocker(a.id, { ...dto, serialNumber: 'SN-SECRET' });
      await service.reviewGear(g.id, GearStatus.VALIDATED);

      const result = await service.getPublicFreelanceGear(a.id, q());

      expect(result.items).toHaveLength(1);
      // Projection par allowlist : on vérifie les clés EXACTES, pas seulement l'absence
      // du champ sensible — un champ ajouté par inadvertance ferait rougir ce test.
      expect(Object.keys(result.items[0]).sort()).toEqual(
        ['brand', 'category', 'createdAt', 'id', 'isInLoadout', 'model', 'status'].sort(),
      );
    });

    it('refuse (404) une cible inconnue ou qui n\'est pas un freelance', async () => {
      const recruiter = users.seed({ email: 'r@x.io', username: 'R', passwordHash: 'h', role: UserRole.RECRUITER });

      await expect(service.getPublicFreelanceGear(randomUUID(), q())).rejects.toThrow(NotFoundException);
      // Pas d'énumération du rôle des comptes : un recruteur ciblé répond 404, pas 403
      await expect(service.getPublicFreelanceGear(recruiter.id, q())).rejects.toThrow(NotFoundException);
    });

    it('renvoie 200 + liste vide quand le freelance n\'a rien de validé (pas un 404)', async () => {
      const a = freelance();
      await service.addGearToLocker(a.id, { ...dto, serialNumber: 'SN-PENDING' });

      const result = await service.getPublicFreelanceGear(a.id, q());

      expect(result.total).toBe(0);
      expect(result.items).toEqual([]);
    });

    it('filtre par catégorie sans jamais élargir le statut', async () => {
      const a = freelance();
      const drone = await service.addGearToLocker(a.id, { ...dto, category: GearCategory.DRONE, serialNumber: 'SN-D' });
      const sensor = await service.addGearToLocker(a.id, { ...dto, category: GearCategory.SENSOR, serialNumber: 'SN-S' });
      await service.reviewGear(drone.id, GearStatus.VALIDATED);
      await service.reviewGear(sensor.id, GearStatus.VALIDATED);
      // Un DRONE non validé ne doit pas apparaître, même avec le bon filtre catégorie
      await service.addGearToLocker(a.id, { ...dto, category: GearCategory.DRONE, serialNumber: 'SN-P' });

      const drones = await service.getPublicFreelanceGear(a.id, q({ category: GearCategory.DRONE }));

      expect(drones.total).toBe(1);
      expect(drones.items[0].category).toBe(GearCategory.DRONE);
      expect(drones.items[0].status).toBe(GearStatus.VALIDATED);
    });
  });

  // --- Loadout : vitrine d'équipements épinglés (SH-21c) — C2.2.3 ---
  describe('Loadout (SH-21c)', () => {
    let freelance: User;
    let otherFreelance: User;

    beforeEach(() => {
      freelance = users.seed({ email: `${randomUUID()}@x.io`, username: 'F', passwordHash: 'h', role: UserRole.FREELANCE });
      otherFreelance = users.seed({ email: `${randomUUID()}@x.io`, username: 'F2', passwordHash: 'h', role: UserRole.FREELANCE });
    });

    // Seed direct dans le faux repo (contourne le workflow addGearToLocker/reviewGear
    // pour poser un état arbitraire : statut + isInLoadout).
    const seedGear = (partial: Partial<Gear> & { freelanceId: string }): Gear =>
      gearRepo.seed({
        brand: 'DJI',
        model: 'Mavic 3',
        serialNumber: `SN-${randomUUID()}`,
        category: GearCategory.DRONE,
        status: GearStatus.PENDING,
        ...partial,
      });

    it('épingle un équipement VALIDATED de SON casier', async () => {
      const gear = await seedGear({ status: GearStatus.VALIDATED, freelanceId: freelance.id });
      const saved = await service.setLoadout(freelance.id, gear.id, true);
      expect(saved.isInLoadout).toBe(true);
    });

    it('refuse (400) un équipement non validé — le loadout est une vitrine de preuve', async () => {
      const gear = await seedGear({ status: GearStatus.PENDING, freelanceId: freelance.id });
      await expect(service.setLoadout(freelance.id, gear.id, true)).rejects.toThrow(BadRequestException);
    });

    it(`refuse (400) le 5e épinglage — ${LOADOUT_MAX_SLOTS} emplacements maximum`, async () => {
      for (let i = 0; i < LOADOUT_MAX_SLOTS; i += 1) {
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

  // --- Émission d'événements de domaine (bus Redis — SH-14) — C2.2.2 ---
  describe('émission d\'événements sur le bus (SH-14)', () => {
    let svc: GearService;
    let gearRepo: { findOne: jest.Mock; save: jest.Mock };
    let pub: { publish: jest.Mock };

    beforeEach(async () => {
      gearRepo = { findOne: jest.fn(), save: jest.fn() };
      pub = { publish: jest.fn() };
      const mod: TestingModule = await Test.createTestingModule({
        providers: [
          GearService,
          { provide: getRepositoryToken(Gear), useValue: gearRepo },
          { provide: getRepositoryToken(User), useValue: { findOne: jest.fn() } },
          { provide: EventPublisherService, useValue: pub },
        ],
      }).compile();
      svc = mod.get<GearService>(GearService);
    });

    it('reviewGear(VALIDATED) émet un événement gear.validated', async () => {
      gearRepo.findOne.mockResolvedValue({ id: 'g1', freelanceId: 'f1', status: GearStatus.PENDING });
      gearRepo.save.mockResolvedValue({ id: 'g1', freelanceId: 'f1', status: GearStatus.VALIDATED });
      await svc.reviewGear('g1', GearStatus.VALIDATED);
      expect(pub.publish).toHaveBeenCalledWith(
        DomainEventType.GEAR_VALIDATED,
        { gearId: 'g1', freelanceId: 'f1' },
      );
    });

    it('reviewGear(REJECTED) émet un événement gear.rejected', async () => {
      gearRepo.findOne.mockResolvedValue({ id: 'g2', freelanceId: 'f2', status: GearStatus.PENDING });
      gearRepo.save.mockResolvedValue({ id: 'g2', freelanceId: 'f2', status: GearStatus.REJECTED });
      await svc.reviewGear('g2', GearStatus.REJECTED);
      expect(pub.publish).toHaveBeenCalledWith(
        DomainEventType.GEAR_REJECTED,
        { gearId: 'g2', freelanceId: 'f2' },
      );
    });
  });
});
