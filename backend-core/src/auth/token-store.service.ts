import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../common/redis/redis.module';

// Message unique du mode dégradé (F2, SH-36) : fail-closed PROPRE — un hoquet Redis
// produit un 503 explicite côté login/register/refresh, jamais un 500 opaque.
// (Décision tracée dans le ticket : sans `save`, le refresh token émis serait invérifiable.)
const REDIS_DOWN_MESSAGE =
  "Service d'authentification momentanément indisponible. Réessaie dans un instant.";

/**
 * Registre des refresh tokens valides, persisté dans Redis (SH-14, durci SH-36).
 *
 * TTL natif Redis (plus de purge paresseuse) + partage entre instances.
 * Clés : `refresh:{jti}` -> userId ; set secondaire `user:{userId}:jtis`
 * pour la révocation globale (PCA en cas de compromission, dossier §4.4).
 */
@Injectable()
export class TokenStore {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async save(jti: string, userId: string, ttlSeconds: number): Promise<void> {
    // F6 (revue SH-14) : les 3 commandes partent dans UNE transaction MULTI/EXEC —
    // le jti ne peut plus être valide tout en étant absent de l'index de révocation
    // globale (revokeAllForUser, PCA §4.4). Bonus : 1 seul aller-retour au lieu de 3.
    let results: [error: Error | null, result: unknown][] | null;
    try {
      results = await this.redis
        .multi()
        .set(`refresh:${jti}`, userId, 'EX', ttlSeconds)
        .sadd(`user:${userId}:jtis`, jti)
        // Borne supérieure sur le set d'index pour éviter une fuite mémoire
        .expire(`user:${userId}:jtis`, ttlSeconds)
        .exec();
    } catch {
      throw new ServiceUnavailableException(REDIS_DOWN_MESSAGE);
    }

    // exec() rend null si la connexion tombe pendant la transaction, et chaque commande
    // porte sa propre erreur : toute écriture partielle est traitée comme une panne (F2).
    if (results === null || results.some(([error]) => error !== null)) {
      throw new ServiceUnavailableException(REDIS_DOWN_MESSAGE);
    }
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
    // On ne dispose que du jti : la clé primaire suffit à invalider le token.
    // Le jti peut subsister dans le set d'index `user:{id}:jtis` jusqu'à son EXPIRE
    // (entrée morte inoffensive : isValid ne lit que `refresh:{jti}`, jamais le set).
    try {
      await this.redis.del(`refresh:${jti}`);
    } catch {
      // Fail-closed propre (F2) : impossible de garantir la révocation => la rotation
      // refuse en 503. Le logout, lui, reste idempotent (catch dans auth.service).
      throw new ServiceUnavailableException(REDIS_DOWN_MESSAGE);
    }
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
