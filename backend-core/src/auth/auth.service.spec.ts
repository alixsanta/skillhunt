import { Test, TestingModule } from '@nestjs/testing';
import { JwtModule } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  UnauthorizedException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { JwtService } from '@nestjs/jwt';
import { AuthService, TokenPair } from './auth.service';
import { TokenStore } from './token-store.service';
import { TwoFactorService } from './two-factor.service';
import { loadJwtKeys } from './keys';
import { User } from '../users/user.entity';
import { UserRole } from '../common/enums';
import { REDIS_CLIENT } from '../common/redis/redis.module';

/**
 * Mock Redis avec état en mémoire : simule SET/GET/DEL de façon cohérente
 * pour que les tests auth exercent vraiment la rotation et la révocation (C2.2.2).
 */
function makeStatefulRedisMock() {
  const store = new Map<string, string>();
  return {
    set: jest.fn().mockImplementation((key: string, value: string) => {
      store.set(key, value);
      return Promise.resolve('OK');
    }),
    get: jest.fn().mockImplementation((key: string) => {
      return Promise.resolve(store.get(key) ?? null);
    }),
    del: jest.fn().mockImplementation((...keys: string[]) => {
      keys.forEach((k) => store.delete(k));
      return Promise.resolve(keys.length);
    }),
    sadd: jest.fn().mockResolvedValue(1),
    srem: jest.fn().mockResolvedValue(1),
    smembers: jest.fn().mockResolvedValue([]),
    expire: jest.fn().mockResolvedValue(1),
    // TokenStore.save écrit désormais en MULTI/EXEC atomique (SH-36) : le pipeline
    // rejoue les écritures sur le même store en mémoire à l'exec().
    multi: jest.fn().mockImplementation(() => {
      const ops: Array<() => void> = [];
      const pipeline = {
        set: (key: string, value: string) => {
          ops.push(() => store.set(key, value));
          return pipeline;
        },
        sadd: () => pipeline,
        expire: () => pipeline,
        exec: () => {
          ops.forEach((apply) => apply());
          return Promise.resolve([[null, 'OK']]);
        },
      };
      return pipeline;
    }),
  };
}

/**
 * Faux repository TypeORM en mémoire : permet de tester la logique d'AuthService
 * sans dépendre d'une vraie base PostgreSQL (tests unitaires rapides et isolés).
 */
class FakeUserRepository {
  private store: User[] = [];

  findOne({ where }: { where: Partial<User> }): Promise<User | null> {
    const keys = Object.keys(where) as (keyof User)[];
    const found = this.store.find((u) => keys.every((k) => u[k] === where[k]));
    return Promise.resolve(found ?? null);
  }

  create(partial: Partial<User>): User {
    return { ...partial } as User;
  }

  save(user: User): Promise<User> {
    if (!user.id) {
      user.id = randomUUID();
      user.createdAt = new Date();
    }
    const idx = this.store.findIndex((u) => u.id === user.id);
    if (idx >= 0) {
      this.store[idx] = user;
    } else {
      this.store.push(user);
    }
    return Promise.resolve(user);
  }

  // Helper de test : accès direct au contenu persisté
  all(): User[] {
    return this.store;
  }
}

describe('🔐 AuthService (Tests Unitaires)', () => {
  let service: AuthService;
  let repo: FakeUserRepository;
  let redisMock: ReturnType<typeof makeStatefulRedisMock>;
  let module: TestingModule;

  beforeEach(async () => {
    // Paire de clés RSA éphémère dédiée aux tests (RS256)
    const keys = loadJwtKeys();

    module = await Test.createTestingModule({
      imports: [
        JwtModule.register({
          privateKey: keys.privateKey,
          publicKey: keys.publicKey,
          signOptions: { algorithm: 'RS256', issuer: 'skillhunt' },
          verifyOptions: { algorithms: ['RS256'], issuer: 'skillhunt' },
        }),
      ],
      providers: [
        AuthService,
        TokenStore,
        { provide: getRepositoryToken(User), useClass: FakeUserRepository },
        { provide: REDIS_CLIENT, useFactory: makeStatefulRedisMock },
        // Doublure 2FA : la vérification TOTP réelle a ses propres tests
        // (two-factor.service.spec.ts) — ici seul le FLOW login importe (SH-40).
        {
          provide: TwoFactorService,
          useValue: {
            verifyCode: jest
              .fn()
              .mockImplementation((_userId: string, code: string) =>
                Promise.resolve(code === '123456'),
              ),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    repo = module.get<FakeUserRepository>(getRepositoryToken(User));
    redisMock = module.get<ReturnType<typeof makeStatefulRedisMock>>(REDIS_CLIENT);
  });

  it('devrait être défini (Test de Sanité)', () => {
    expect(service).toBeDefined();
  });

  // --- REGISTER ---
  describe('➡️ Méthode register()', () => {
    it('devrait hacher le mot de passe en Argon2id et ne pas l\'exposer', async () => {
      const dto = {
        email: 'nouveau.pilote@skillhunt.io',
        username: 'NouveauPilote',
        password: 'Password123!',
        role: UserRole.FREELANCE,
      };

      const user = await service.register(dto);

      // La réponse publique ne contient jamais le hash
      expect(user).not.toHaveProperty('passwordHash');

      // En base, le mot de passe est stocké haché (format Argon2id), jamais en clair
      const stored = repo.all().find((u) => u.email === dto.email);
      expect(stored).toBeDefined();
      expect(stored!.passwordHash).toMatch(/^\$argon2id\$/);
      expect(stored!.passwordHash).not.toContain(dto.password);
    });

    it('devrait lever une 401 si l\'email existe déjà', async () => {
      const dto = {
        email: 'doublon.pilote@skillhunt.io',
        username: 'Doublon',
        password: 'Password123!',
        role: UserRole.FREELANCE,
      };

      // Premier enregistrement OK, le second avec le même email doit échouer
      await service.register(dto);
      await expect(service.register({ ...dto, username: 'DoublonClone' })).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('devrait REFUSER l\'auto-attribution du rôle ADMIN (anti-élévation de privilèges)', async () => {
      const dto = {
        email: 'pirate@skillhunt.io',
        username: 'Pirate',
        password: 'Password123!',
        role: UserRole.ADMIN, // tentative d'escalade
      };

      await expect(service.register(dto)).rejects.toThrow(ForbiddenException);
      // Aucun compte ADMIN ne doit avoir été créé
      expect(repo.all().find((u) => u.email === dto.email)).toBeUndefined();
    });

    it('devrait autoriser l\'inscription en tant que RECRUITER', async () => {
      const dto = {
        email: 'recruteur@skillhunt.io',
        username: 'Recruteur',
        password: 'Password123!',
        role: UserRole.RECRUITER,
      };

      const user = await service.register(dto);
      expect(user.role).toBe(UserRole.RECRUITER);
    });

    it('devrait persister la position d\'un freelance en GeoJSON Point [lon, lat] (SH-34)', async () => {
      const dto = {
        email: 'geo.pilote@skillhunt.io',
        username: 'GeoPilote',
        password: 'Password123!',
        role: UserRole.FREELANCE,
        location: { latitude: 43.6045, longitude: 1.4442 },
      };

      await service.register(dto);

      const stored = repo.all().find((u) => u.email === dto.email);
      // Ordre GeoJSON : [longitude, latitude] — l'inversion est le piège à verrouiller (C2.2.2)
      expect(stored!.location).toEqual({ type: 'Point', coordinates: [1.4442, 43.6045] });
    });

    it('devrait laisser la position à null pour un recruteur sans position (SH-34)', async () => {
      const dto = {
        email: 'recruteur.sans.geo@skillhunt.io',
        username: 'RecruteurSansGeo',
        password: 'Password123!',
        role: UserRole.RECRUITER,
      };

      await service.register(dto);

      const stored = repo.all().find((u) => u.email === dto.email);
      expect(stored!.location).toBeNull();
    });
  });

  // --- LOGIN ---
  describe('➡️ Méthode login()', () => {
    const credentials = {
      email: 'login.pilote@skillhunt.io',
      username: 'LoginPilote',
      password: 'Password123!',
      role: UserRole.FREELANCE,
    };

    beforeEach(async () => {
      await service.register(credentials);
    });

    it('devrait retourner un couple de tokens (access + refresh) pour des identifiants valides', async () => {
      // 2FA inactive dans ce scénario : le résultat est un TokenPair complet.
      const result = (await service.login({ email: credentials.email, password: credentials.password })) as TokenPair;

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      // Un JWT possède 3 parties séparées par des points
      expect(result.accessToken.split('.')).toHaveLength(3);
      expect(result.refreshToken.split('.')).toHaveLength(3);
    });

    it('devrait lever une 401 pour un mauvais mot de passe', async () => {
      await expect(
        service.login({ email: credentials.email, password: 'MauvaisMotDePasse!' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('2FA active : le login ne rend NI tokens NI cookie, mais un jeton d\'étape 5 min (SH-40)', async () => {
      const user = repo.all().find((u) => u.email === credentials.email)!;
      user.twoFactorEnabled = true;

      const result = await service.login({
        email: credentials.email,
        password: credentials.password,
      });

      expect(result).toEqual({
        twoFactorRequired: true,
        twoFactorToken: expect.any(String),
      });
      expect(result).not.toHaveProperty('accessToken');
      expect(result).not.toHaveProperty('refreshToken');

      // Le jeton d'étape est de type dédié : REFUSÉ par le JwtAuthGuard (qui exige 'access')
      const jwt = module.get<JwtService>(JwtService);
      const payload = jwt.verify((result as { twoFactorToken: string }).twoFactorToken) as {
        type: string;
        userId: string;
      };
      expect(payload.type).toBe('twofa_pending');
      expect(payload.userId).toBe(user.id);
    });

    it('completeTwoFactorLogin : un jeton d\'étape valide + code vérifié => vrais tokens (SH-40)', async () => {
      const user = repo.all().find((u) => u.email === credentials.email)!;
      user.twoFactorEnabled = true;

      const challenge = (await service.login({
        email: credentials.email,
        password: credentials.password,
      })) as { twoFactorToken: string };

      const tokens = await service.completeTwoFactorLogin(challenge.twoFactorToken, '123456');

      expect(tokens).toHaveProperty('accessToken');
      expect(tokens).toHaveProperty('refreshToken');
    });

    it('completeTwoFactorLogin : refuse (401) un code invalide et un jeton non-2FA', async () => {
      const user = repo.all().find((u) => u.email === credentials.email)!;
      user.twoFactorEnabled = true;

      const challenge = (await service.login({
        email: credentials.email,
        password: credentials.password,
      })) as { twoFactorToken: string };

      // Code refusé par le TwoFactorService
      await expect(
        service.completeTwoFactorLogin(challenge.twoFactorToken, '000000'),
      ).rejects.toThrow(UnauthorizedException);

      // Un ACCESS token complet ne doit jamais franchir l'étape 2FA (anti-confusion de type)
      user.twoFactorEnabled = false;
      const full = (await service.login({
        email: credentials.email,
        password: credentials.password,
      })) as { accessToken: string };
      await expect(service.completeTwoFactorLogin(full.accessToken, '123456')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('panne Redis pendant le login => 503 explicite, jamais un 500 opaque (SH-36, F2)', async () => {
      redisMock.multi.mockImplementation(() => {
        throw new Error('connexion Redis perdue');
      });

      // Identifiants VALIDES : c'est bien l'indisponibilité du registre de tokens qui
      // refuse proprement, pas l'authentification.
      await expect(
        service.login({ email: credentials.email, password: credentials.password }),
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it('devrait lever une 401 pour un email inconnu', async () => {
      await expect(
        service.login({ email: 'fantome@skillhunt.io', password: 'Password123!' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // --- REFRESH / LOGOUT ---
  describe('➡️ Rotation et révocation des tokens', () => {
    const credentials = {
      email: 'refresh.pilote@skillhunt.io',
      username: 'RefreshPilote',
      password: 'Password123!',
      role: UserRole.FREELANCE,
    };

    beforeEach(async () => {
      await service.register(credentials);
    });

    it('devrait émettre un nouveau couple de tokens et révoquer l\'ancien refresh (rotation)', async () => {
      const first = (await service.login({ email: credentials.email, password: credentials.password })) as TokenPair;

      const rotated = await service.refresh(first.refreshToken);
      expect(rotated.accessToken).toBeDefined();
      expect(rotated.refreshToken).toBeDefined();

      // L'ancien refresh token ne doit plus être accepté après rotation
      await expect(service.refresh(first.refreshToken)).rejects.toThrow(UnauthorizedException);
    });

    it('devrait rejeter un refresh token révoqué via logout', async () => {
      const tokens = (await service.login({ email: credentials.email, password: credentials.password })) as TokenPair;

      await expect(service.logout(tokens.refreshToken)).resolves.toEqual({ success: true });
      await expect(service.refresh(tokens.refreshToken)).rejects.toThrow(UnauthorizedException);
    });

    it('devrait rejeter un refresh token bidon', async () => {
      await expect(service.refresh('pas.un.jwt')).rejects.toThrow(UnauthorizedException);
    });
  });
});
