import { Injectable } from '@nestjs/common';

interface StoredToken {
  userId: string;
  expiresAt: number; // timestamp epoch (ms)
}

/**
 * Registre des refresh tokens valides, indexés par leur identifiant unique (jti).
 *
 * Implémentation EN MÉMOIRE volontairement minimale — à migrer vers Redis (SH-14)
 * pour bénéficier de l'expiration native (TTL) et du partage entre instances.
 * L'interface publique (save/isValid/revoke/revokeAllForUser) est pensée Redis-ready.
 */
@Injectable()
export class TokenStore {
  private readonly store = new Map<string, StoredToken>();

  save(jti: string, userId: string, ttlSeconds: number): void {
    this.store.set(jti, { userId, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  isValid(jti: string, userId: string): boolean {
    const entry = this.store.get(jti);
    if (!entry) {
      return false;
    }
    if (entry.expiresAt < Date.now()) {
      this.store.delete(jti); // purge paresseuse des entrées expirées
      return false;
    }
    return entry.userId === userId;
  }

  revoke(jti: string): void {
    this.store.delete(jti);
  }

  /**
   * Invalide tous les refresh tokens d'un utilisateur.
   * Utilisé par le Plan de Continuité d'Activité en cas de compromission (cf. dossier §4.4).
   */
  revokeAllForUser(userId: string): void {
    for (const [jti, entry] of this.store.entries()) {
      if (entry.userId === userId) {
        this.store.delete(jti);
      }
    }
  }
}
