import {
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type Redis from 'ioredis';
import { randomBytes } from 'crypto';
import { authenticator } from 'otplib';
import { hash, verify as argonVerify, Algorithm } from '@node-rs/argon2';
import { User } from '../users/user.entity';
import { REDIS_CLIENT } from '../common/redis/redis.module';
import { encryptTwoFactorSecret, decryptTwoFactorSecret } from './two-factor-crypto';

const BACKUP_CODES_COUNT = 8;
// Anti-brute-force (S5) : un TOTP n'a que 10^6 combinaisons par fenêtre de 30 s —
// 5 échecs consécutifs verrouillent le compte pour la durée de la fenêtre.
const MAX_FAILED_ATTEMPTS = 5;
const FAIL_WINDOW_SECONDS = 300;

export interface EnrollResult {
  secret: string;
  otpauthUrl: string;
}

/**
 * 2FA TOTP (RFC 6238) — SH-40. Opt-in pour tous les rôles (décision 2026-07-16).
 * Secret chiffré AES-256-GCM au repos ; codes de secours à usage unique hachés Argon2id.
 */
@Injectable()
export class TwoFactorService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  /** État 2FA du compte (le JWT ne le porte pas : l'écran « Mon compte » interroge ici). */
  async status(userId: string): Promise<{ enabled: boolean }> {
    const user = await this.requireUser(userId);
    return { enabled: user.twoFactorEnabled };
  }

  /** Étape 1 : génère le secret (chiffré en base) — la 2FA reste INACTIVE avant confirm. */
  async enroll(userId: string): Promise<EnrollResult> {
    const user = await this.requireUser(userId);
    if (user.twoFactorEnabled) {
      throw new ConflictException('La double authentification est déjà activée sur ce compte');
    }

    const secret = authenticator.generateSecret();
    user.twoFactorSecretEncrypted = encryptTwoFactorSecret(secret);
    await this.usersRepo.save(user);

    return {
      secret,
      otpauthUrl: authenticator.keyuri(user.email, 'SkillHunt', secret),
    };
  }

  /** Étape 2 : le premier code valide ACTIVE la 2FA et émet les codes de secours (une seule fois). */
  async confirm(userId: string, code: string): Promise<{ backupCodes: string[] }> {
    const user = await this.requireUser(userId);
    if (!user.twoFactorSecretEncrypted) {
      throw new UnauthorizedException("Aucun enrôlement 2FA en attente sur ce compte");
    }

    const secret = decryptTwoFactorSecret(user.twoFactorSecretEncrypted);
    if (!this.isValidTotp(secret, code)) {
      throw new UnauthorizedException('Code de vérification invalide');
    }

    const backupCodes = this.generateBackupCodes();
    user.twoFactorEnabled = true;
    // Hachés Argon2id (cohérent avec les mots de passe, SH-7) : jamais re-consultables.
    user.twoFactorBackupCodesHashed = await Promise.all(
      backupCodes.map((backupCode) => hash(backupCode, { algorithm: Algorithm.Argon2id })),
    );
    await this.usersRepo.save(user);

    return { backupCodes };
  }

  /**
   * Vérifie un code TOTP OU un code de secours (étape 2 du login, désactivation…).
   * Anti-brute-force : compteur Redis par compte, verrouillage temporaire au-delà du seuil.
   * Un code de secours accepté est immédiatement consommé (usage unique).
   */
  async verifyCode(userId: string, code: string): Promise<boolean> {
    const user = await this.requireUser(userId);
    if (!user.twoFactorEnabled || !user.twoFactorSecretEncrypted) {
      return false;
    }

    await this.assertNotLocked(user.id);

    const secret = decryptTwoFactorSecret(user.twoFactorSecretEncrypted);
    if (this.isValidTotp(secret, code)) {
      await this.clearFailures(user.id);
      return true;
    }

    // Code de secours ? (comparaison sur hash — usage unique en cas de succès)
    const hashed = user.twoFactorBackupCodesHashed ?? [];
    for (let i = 0; i < hashed.length; i++) {
      if (await this.safeArgonVerify(hashed[i], code)) {
        user.twoFactorBackupCodesHashed = hashed.filter((_, index) => index !== i);
        await this.usersRepo.save(user);
        await this.clearFailures(user.id);
        return true;
      }
    }

    await this.registerFailure(user.id);
    return false;
  }

  /** Désactivation (S7) : exige un code valide, puis purge secret ET codes de secours. */
  async disable(userId: string, code: string): Promise<{ success: boolean }> {
    if (!(await this.verifyCode(userId, code))) {
      throw new UnauthorizedException('Code de vérification invalide');
    }

    const user = await this.requireUser(userId);
    user.twoFactorEnabled = false;
    user.twoFactorSecretEncrypted = null;
    user.twoFactorBackupCodesHashed = null;
    await this.usersRepo.save(user);

    return { success: true };
  }

  /** Régénère les codes de secours (les anciens sont invalidés) après un code valide. */
  async regenerateBackupCodes(userId: string, code: string): Promise<{ backupCodes: string[] }> {
    if (!(await this.verifyCode(userId, code))) {
      throw new UnauthorizedException('Code de vérification invalide');
    }

    const user = await this.requireUser(userId);
    const backupCodes = this.generateBackupCodes();
    user.twoFactorBackupCodesHashed = await Promise.all(
      backupCodes.map((backupCode) => hash(backupCode, { algorithm: Algorithm.Argon2id })),
    );
    await this.usersRepo.save(user);

    return { backupCodes };
  }

  // --- Anti-brute-force (compteurs Redis, fail-closed cohérent SH-36) ---

  private async assertNotLocked(userId: string): Promise<void> {
    let failures: number;
    try {
      failures = Number((await this.redis.get(`2fa:fail:${userId}`)) ?? 0);
    } catch {
      // Redis indisponible : impossible de garantir l'anti-brute-force => refus propre
      // (fail-closed, cohérent avec le TokenStore SH-36).
      throw new ServiceUnavailableException(
        "Service d'authentification momentanément indisponible. Réessaie dans un instant.",
      );
    }
    if (failures >= MAX_FAILED_ATTEMPTS) {
      throw new HttpException(
        'Trop de tentatives. Réessaie dans quelques minutes.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async registerFailure(userId: string): Promise<void> {
    try {
      const failures = await this.redis.incr(`2fa:fail:${userId}`);
      if (failures === 1) {
        await this.redis.expire(`2fa:fail:${userId}`, FAIL_WINDOW_SECONDS);
      }
    } catch {
      // Best-effort : l'échec est déjà refusé ; ne pas masquer la réponse 401 par un 503.
    }
  }

  private async clearFailures(userId: string): Promise<void> {
    try {
      await this.redis.del(`2fa:fail:${userId}`);
    } catch {
      // Best-effort : un compteur résiduel expirera par TTL.
    }
  }

  // --- Helpers ---

  private async requireUser(userId: string): Promise<User> {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }
    return user;
  }

  /** Codes de secours lisibles (format XXXX-XXXX, alphabet sans ambiguïté 0/O, 1/I). */
  private generateBackupCodes(): string[] {
    const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    return Array.from({ length: BACKUP_CODES_COUNT }, () => {
      const chars = Array.from(randomBytes(8), (byte) => alphabet[byte % alphabet.length]);
      return `${chars.slice(0, 4).join('')}-${chars.slice(4).join('')}`;
    });
  }

  private async safeArgonVerify(storedHash: string, candidate: string): Promise<boolean> {
    try {
      return await argonVerify(storedHash, candidate);
    } catch {
      return false;
    }
  }

  /** RFC 6238 via otplib — un code au mauvais format (code de secours…) n'est pas une erreur. */
  private isValidTotp(secret: string, code: string): boolean {
    try {
      return authenticator.verify({ token: code, secret });
    } catch {
      return false;
    }
  }
}
