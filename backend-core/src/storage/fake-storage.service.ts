import { Injectable, NotFoundException } from '@nestjs/common';
import { StorageService } from './storage.service';

// Objet stocké en mémoire : contenu + type MIME associé.
interface StoredObject {
  body: Buffer;
  contentType: string;
}

/**
 * Implémentation **mémoire** du port `StorageService` (SH-31).
 *
 * Destinée aux tests unitaires : aucun appel réseau, aucun compte AWS requis
 * (ticket — Scénario 3). `getSignedUrl` renvoie une URL factice **déterministe** et
 * refuse les clés inexistantes, ce qui permet d'attester l'inaccessibilité après purge.
 */
@Injectable()
export class FakeStorageService implements StorageService {
  private readonly store = new Map<string, StoredObject>();

  put(key: string, body: Buffer, contentType: string): Promise<void> {
    // Un second put sur la même clé écrase l'objet (sémantique S3 « last write wins »).
    this.store.set(key, { body, contentType });
    return Promise.resolve();
  }

  getSignedUrl(key: string, ttlSeconds: number): Promise<string> {
    if (!this.store.has(key)) {
      return Promise.reject(new NotFoundException('Objet de stockage introuvable'));
    }
    // URL factice déterministe : utile pour des assertions stables en test.
    return Promise.resolve(
      `https://fake-storage.local/${encodeURIComponent(key)}?ttl=${ttlSeconds}`,
    );
  }

  delete(key: string): Promise<void> {
    // Idempotent : supprimer une clé absente n'est pas une erreur.
    this.store.delete(key);
    return Promise.resolve();
  }

  // --- Helpers réservés aux tests (non exposés par le port) ---

  /** Contenu brut stocké pour une clé, ou `undefined` si absente. */
  get(key: string): Buffer | undefined {
    return this.store.get(key)?.body;
  }

  /** Type MIME stocké pour une clé, ou `undefined` si absente. */
  getContentType(key: string): string | undefined {
    return this.store.get(key)?.contentType;
  }

  /** Nombre d'objets stockés. */
  size(): number {
    return this.store.size;
  }
}
