import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { GearService } from './gear.service';
import { Gear } from './gear.entity';
import { User } from '../users/user.entity';
import { UserRole, GearStatus, GearCategory } from '../common/enums';
import { QueryGearDto } from './dto/query-gear.dto';

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

/** Faux repository Gear en mémoire (create / save / findOne / findAndCount). */
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

  findOne({ where }: { where: Partial<Gear> }): Promise<Gear | null> {
    const keys = Object.keys(where) as (keyof Gear)[];
    return Promise.resolve(this.store.find((g) => keys.every((k) => g[k] === where[k])) ?? null);
  }

  findAndCount(options: {
    where?: Partial<Gear>;
    order?: { createdAt?: 'ASC' | 'DESC' };
    skip?: number;
    take?: number;
  }): Promise<[Gear[], number]> {
    const where = options.where ?? {};
    const keys = Object.keys(where) as (keyof Gear)[];
    let rows = this.store.filter((g) => keys.every((k) => g[k] === where[k]));
    if (options.order?.createdAt === 'DESC') {
      rows = [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    }
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

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GearService,
        { provide: getRepositoryToken(Gear), useClass: FakeGearRepository },
        { provide: getRepositoryToken(User), useClass: FakeUserRepository },
      ],
    }).compile();

    service = module.get<GearService>(GearService);
    users = module.get<FakeUserRepository>(getRepositoryToken(User));
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
});
