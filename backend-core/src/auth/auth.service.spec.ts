import { Test, TestingModule } from '@nestjs/testing';
import { JwtModule } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AuthService } from './auth.service';
import { TokenStore } from './token-store.service';
import { loadJwtKeys } from './keys';
import { User } from '../users/user.entity';
import { UserRole } from '../common/enums';

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

  beforeEach(async () => {
    // Paire de clés RSA éphémère dédiée aux tests (RS256)
    const keys = loadJwtKeys();

    const module: TestingModule = await Test.createTestingModule({
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
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    repo = module.get<FakeUserRepository>(getRepositoryToken(User));
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
      const result = await service.login({ email: credentials.email, password: credentials.password });

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
      const first = await service.login({ email: credentials.email, password: credentials.password });

      const rotated = await service.refresh(first.refreshToken);
      expect(rotated.accessToken).toBeDefined();
      expect(rotated.refreshToken).toBeDefined();

      // L'ancien refresh token ne doit plus être accepté après rotation
      await expect(service.refresh(first.refreshToken)).rejects.toThrow(UnauthorizedException);
    });

    it('devrait rejeter un refresh token révoqué via logout', async () => {
      const tokens = await service.login({ email: credentials.email, password: credentials.password });

      expect(service.logout(tokens.refreshToken)).toEqual({ success: true });
      await expect(service.refresh(tokens.refreshToken)).rejects.toThrow(UnauthorizedException);
    });

    it('devrait rejeter un refresh token bidon', async () => {
      await expect(service.refresh('pas.un.jwt')).rejects.toThrow(UnauthorizedException);
    });
  });
});
