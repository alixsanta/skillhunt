import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  ConflictException,
  HttpException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { authenticator } from 'otplib';
import { verify as argonVerify } from '@node-rs/argon2';
import { TwoFactorService } from './two-factor.service';
import { User } from '../users/user.entity';
import { UserRole } from '../common/enums';
import { REDIS_CLIENT } from '../common/redis/redis.module';

/** Faux repository User en mémoire (pattern des specs gear/auth). */
class FakeUserRepository {
  private store: User[] = [];

  seed(partial: Partial<User>): User {
    const user = {
      id: randomUUID(),
      email: `${randomUUID()}@x.io`,
      username: 'U',
      passwordHash: 'h',
      role: UserRole.RECRUITER,
      twoFactorEnabled: false,
      twoFactorSecretEncrypted: null,
      twoFactorBackupCodesHashed: null,
      ...partial,
    } as User;
    this.store.push(user);
    return user;
  }

  findOne({ where }: { where: Partial<User> }): Promise<User | null> {
    const keys = Object.keys(where) as (keyof User)[];
    return Promise.resolve(this.store.find((u) => keys.every((k) => u[k] === where[k])) ?? null);
  }

  save(user: User): Promise<User> {
    const idx = this.store.findIndex((u) => u.id === user.id);
    if (idx >= 0) this.store[idx] = user;
    return Promise.resolve(user);
  }
}

/** Redis en mémoire minimal : compteurs INCR/EXPIRE/DEL du rate-limiting. */
function makeRedisMock() {
  const counters = new Map<string, number>();
  return {
    counters,
    get: jest.fn().mockImplementation((key: string) => {
      const value = counters.get(key);
      return Promise.resolve(value === undefined ? null : String(value));
    }),
    incr: jest.fn().mockImplementation((key: string) => {
      const next = (counters.get(key) ?? 0) + 1;
      counters.set(key, next);
      return Promise.resolve(next);
    }),
    expire: jest.fn().mockResolvedValue(1),
    del: jest.fn().mockImplementation((key: string) => {
      counters.delete(key);
      return Promise.resolve(1);
    }),
  } as any;
}

describe('🔐 TwoFactorService (2FA TOTP — SH-40)', () => {
  let service: TwoFactorService;
  let users: FakeUserRepository;
  let redis: ReturnType<typeof makeRedisMock>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TwoFactorService,
        { provide: getRepositoryToken(User), useClass: FakeUserRepository },
        { provide: REDIS_CLIENT, useFactory: makeRedisMock },
      ],
    }).compile();

    service = module.get(TwoFactorService);
    users = module.get(getRepositoryToken(User));
    redis = module.get(REDIS_CLIENT);
  });

  async function enrolledUser(): Promise<{ user: User; secret: string }> {
    const user = users.seed({ email: 'pro@skillhunt.io' });
    const { secret } = await service.enroll(user.id);
    return { user, secret };
  }

  async function confirmedUser(): Promise<{ user: User; secret: string; backupCodes: string[] }> {
    const { user, secret } = await enrolledUser();
    const { backupCodes } = await service.confirm(user.id, authenticator.generate(secret));
    return { user, secret, backupCodes };
  }

  // --- Enrôlement ---
  it('enroll : génère un secret, le persiste CHIFFRÉ, et la 2FA reste inactive', async () => {
    const user = users.seed({ email: 'pro@skillhunt.io' });

    const result = await service.enroll(user.id);

    expect(result.secret).toBeTruthy();
    expect(result.otpauthUrl).toContain('otpauth://totp/');
    expect(result.otpauthUrl).toContain('SkillHunt');
    // Le secret n'apparaît JAMAIS en clair en base (AES-256, §8-6)
    expect(user.twoFactorSecretEncrypted).toBeTruthy();
    expect(user.twoFactorSecretEncrypted).not.toContain(result.secret);
    expect(user.twoFactorEnabled).toBe(false);
  });

  it('enroll : refuse (409) si la 2FA est déjà activée', async () => {
    const { user } = await confirmedUser();
    await expect(service.enroll(user.id)).rejects.toThrow(ConflictException);
  });

  // --- Confirmation ---
  it('confirm : un code valide active la 2FA et rend des codes de secours hachés', async () => {
    const { user, secret } = await enrolledUser();

    const { backupCodes } = await service.confirm(user.id, authenticator.generate(secret));

    expect(user.twoFactorEnabled).toBe(true);
    expect(backupCodes).toHaveLength(8);
    expect(user.twoFactorBackupCodesHashed).toHaveLength(8);
    // Stockés HACHÉS (Argon2id), jamais en clair — mais vérifiables
    expect(user.twoFactorBackupCodesHashed).not.toContain(backupCodes[0]);
    await expect(argonVerify(user.twoFactorBackupCodesHashed![0], backupCodes[0])).resolves.toBe(
      true,
    );
  });

  it("confirm : un code invalide n'active RIEN (401)", async () => {
    const { user } = await enrolledUser();

    await expect(service.confirm(user.id, '000000')).rejects.toThrow(UnauthorizedException);
    expect(user.twoFactorEnabled).toBe(false);
  });

  // --- Vérification (étape 2 du login) ---
  it('verifyCode : accepte le code TOTP courant et purge le compteur anti-brute-force', async () => {
    const { user, secret } = await confirmedUser();

    await expect(service.verifyCode(user.id, authenticator.generate(secret))).resolves.toBe(true);
    expect(redis.del).toHaveBeenCalledWith(`2fa:fail:${user.id}`);
  });

  it('verifyCode : refuse un code erroné et incrémente le compteur', async () => {
    const { user } = await confirmedUser();

    await expect(service.verifyCode(user.id, '000000')).resolves.toBe(false);
    expect(redis.incr).toHaveBeenCalledWith(`2fa:fail:${user.id}`);
  });

  it('anti-brute-force : au-delà de 5 échecs, la vérification est bloquée (429)', async () => {
    const { user, secret } = await confirmedUser();
    redis.counters.set(`2fa:fail:${user.id}`, 5);

    // Même un code VALIDE est refusé pendant le blocage : le compteur prime.
    await expect(service.verifyCode(user.id, authenticator.generate(secret))).rejects.toThrow(
      HttpException,
    );
    await expect(
      service.verifyCode(user.id, authenticator.generate(secret)),
    ).rejects.toMatchObject({ status: 429 });
  });

  // --- Codes de secours ---
  it('un code de secours valide est accepté PUIS immédiatement invalidé (usage unique)', async () => {
    const { user, backupCodes } = await confirmedUser();

    await expect(service.verifyCode(user.id, backupCodes[0])).resolves.toBe(true);
    expect(user.twoFactorBackupCodesHashed).toHaveLength(7);
    // Rejouer le même code échoue : il a été consommé
    await expect(service.verifyCode(user.id, backupCodes[0])).resolves.toBe(false);
  });

  it('regenerateBackupCodes : les anciens codes deviennent invalides', async () => {
    const { user, secret, backupCodes } = await confirmedUser();

    const { backupCodes: fresh } = await service.regenerateBackupCodes(
      user.id,
      authenticator.generate(secret),
    );

    expect(fresh).toHaveLength(8);
    await expect(service.verifyCode(user.id, backupCodes[0])).resolves.toBe(false);
    await expect(service.verifyCode(user.id, fresh[0])).resolves.toBe(true);
  });

  // --- Désactivation ---
  it('disable : supprime le secret chiffré ET les codes de secours', async () => {
    const { user, secret } = await confirmedUser();

    await service.disable(user.id, authenticator.generate(secret));

    expect(user.twoFactorEnabled).toBe(false);
    expect(user.twoFactorSecretEncrypted).toBeNull();
    expect(user.twoFactorBackupCodesHashed).toBeNull();
  });

  it('disable : refuse (401) avec un code invalide — la 2FA reste active', async () => {
    const { user } = await confirmedUser();

    await expect(service.disable(user.id, '000000')).rejects.toThrow(UnauthorizedException);
    expect(user.twoFactorEnabled).toBe(true);
  });
});
