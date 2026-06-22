import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { GearService } from './gear.service';
import { Gear } from './gear.entity';
import { User } from '../users/user.entity';
import { UserRole, GearStatus } from '../common/enums';

/** Faux repository User en mémoire, avec un helper de seed pour les tests. */
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

/** Faux repository Gear en mémoire (create / save / find par freelanceId). */
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
    this.store.push(gear);
    return Promise.resolve(gear);
  }

  find({ where }: { where: Partial<Gear> }): Promise<Gear[]> {
    const keys = Object.keys(where) as (keyof Gear)[];
    return Promise.resolve(this.store.filter((g) => keys.every((k) => g[k] === where[k])));
  }
}

describe('🎒 GearService (RBAC & étanchéité — SH-8)', () => {
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

  const dto = { brand: 'DJI', model: 'Mavic 3', serialNumber: 'SN-1' };

  it('rattache le matériel ajouté au freelance courant (identité issue du token)', async () => {
    const a = users.seed({ email: 'a@x.io', username: 'A', passwordHash: 'h', role: UserRole.FREELANCE });

    const gear = await service.addGearToLocker(a.id, dto);

    expect(gear.freelanceId).toBe(a.id);
    expect(gear.status).toBe(GearStatus.PENDING); // En attente de validation admin
  });

  it('garantit l\'étanchéité : le Freelance A ne voit jamais le matériel du Freelance B', async () => {
    const a = users.seed({ email: 'a@x.io', username: 'A', passwordHash: 'h', role: UserRole.FREELANCE });
    const b = users.seed({ email: 'b@x.io', username: 'B', passwordHash: 'h', role: UserRole.FREELANCE });

    await service.addGearToLocker(a.id, { ...dto, serialNumber: 'SN-A' });
    await service.addGearToLocker(b.id, { ...dto, serialNumber: 'SN-B' });

    const gearOfA = await service.getFreelanceGear(a.id);

    expect(gearOfA).toHaveLength(1);
    expect(gearOfA[0].serialNumber).toBe('SN-A');
    expect(gearOfA.every((g) => g.freelanceId === a.id)).toBe(true);
  });

  it('refuse (404) l\'ajout de matériel pour un non-freelance (ex. Recruteur)', async () => {
    const recruiter = users.seed({ email: 'r@x.io', username: 'R', passwordHash: 'h', role: UserRole.RECRUITER });

    await expect(service.addGearToLocker(recruiter.id, dto)).rejects.toThrow(NotFoundException);
  });

  it('refuse (404) l\'ajout de matériel pour un utilisateur inconnu', async () => {
    await expect(service.addGearToLocker('utilisateur-inexistant', dto)).rejects.toThrow(NotFoundException);
  });
});
