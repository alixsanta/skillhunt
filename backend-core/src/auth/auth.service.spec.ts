import { Test, TestingModule } from '@nestjs/testing';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { DbState, UserRole } from '../db/db-state';
import { TokenStore } from './token-store.service';
import { loadJwtKeys } from './keys';
import { UnauthorizedException } from '@nestjs/common';

describe('🔐 AuthService (Tests Unitaires)', () => {
  let service: AuthService;
  let dbState: DbState;

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
      providers: [AuthService, DbState, TokenStore],
    }).compile();

    service = module.get<AuthService>(AuthService);
    dbState = module.get<DbState>(DbState);
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
      const stored = dbState.users$.getValue().find((u) => u.email === dto.email);
      expect(stored).toBeDefined();
      expect(stored!.passwordHash).toMatch(/^\$argon2id\$/);
      expect(stored!.passwordHash).not.toContain(dto.password);
    });

    it('devrait lever une 401 si l\'email existe déjà', async () => {
      const dto = {
        email: 'marcus.thorne@skillhunt.io', // déjà présent dans le seed DbState
        username: 'MarcusClone',
        password: 'Password123!',
        role: UserRole.FREELANCE,
      };

      await expect(service.register(dto)).rejects.toThrow(UnauthorizedException);
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
