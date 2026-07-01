import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../common/redis/redis.module';

/**
 * Registre des refresh tokens valides, persisté dans Redis (SH-14).
 *
 * TTL natif Redis (plus de purge paresseuse) + partage entre instances.
 * Clés : `refresh:{jti}` -> userId ; set secondaire `user:{userId}:jtis`
 * pour la révocation globale (PCA en cas de compromission, dossier §4.4).
 */
@Injectable()
export class TokenStore {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async save(jti: string, userId: string, ttlSeconds: number): Promise<void> {
    await this.redis.set(`refresh:${jti}`, userId, 'EX', ttlSeconds);
    await this.redis.sadd(`user:${userId}:jtis`, jti);
    // Borne supérieure sur le set d'index pour éviter une fuite mémoire
    await this.redis.expire(`user:${userId}:jtis`, ttlSeconds);
  }

  async isValid(jti: string, userId: string): Promise<boolean> {
    try {
      const stored = await this.redis.get(`refresh:${jti}`);
      return stored !== null && stored === userId;
    } catch {
      // Fail-safe (C2.2.3) : un token non vérifiable est traité comme invalide
      return false;
    }
  }

  async revoke(jti: string): Promise<void> {
    await this.redis.del(`refresh:${jti}`);
  }

  /**
   * Invalide tous les refresh tokens d'un utilisateur.
   * Utilisé par le Plan de Continuité d'Activité en cas de compromission (dossier §4.4).
   */
  async revokeAllForUser(userId: string): Promise<void> {
    const jtis = await this.redis.smembers(`user:${userId}:jtis`);
    if (jtis.length > 0) {
      await this.redis.del(...jtis.map((jti) => `refresh:${jti}`));
    }
    await this.redis.del(`user:${userId}:jtis`);
  }
}
