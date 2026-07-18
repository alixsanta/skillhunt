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
