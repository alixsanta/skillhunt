import { Injectable, NotFoundException } from '@nestjs/common';
import { StorageService, StoredObjectHead } from './storage.service';

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

  getSignedUploadUrl(key: string, ttlSeconds: number, contentType: string): Promise<string> {
    // Aucun contrôle d'existence : on signe un dépôt À VENIR, l'objet n'existe pas encore.
    return Promise.resolve(
      `https://fake-storage.local/${encodeURIComponent(key)}` +
        `?upload=1&ttl=${ttlSeconds}&ct=${encodeURIComponent(contentType)}`,
    );
  }

  head(key: string): Promise<StoredObjectHead> {
    const stored = this.store.get(key);
    if (!stored) {
      return Promise.reject(new NotFoundException('Objet de stockage introuvable'));
    }
    return Promise.resolve({ sizeBytes: stored.body.length, contentType: stored.contentType });
  }

  get(key: string): Promise<Buffer> {
    const stored = this.store.get(key);
    if (!stored) {
      return Promise.reject(new NotFoundException('Objet de stockage introuvable'));
    }
    return Promise.resolve(stored.body);
  }

  deletePrefix(prefix: string): Promise<void> {
    for (const key of [...this.store.keys()]) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
      }
    }
    return Promise.resolve();
  }

  // --- Helpers réservés aux tests (non exposés par le port) ---

  /**
   * Contenu brut stocké pour une clé, ou `undefined` si absente.
   * Nommé `peek` et non `get` : `get` appartient désormais au port (SH-16a) et rend
   * une promesse qui rejette sur clé absente — sémantique incompatible avec l'usage
   * en assertion directe qu'en font les tests.
   */
  peek(key: string): Buffer | undefined {
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
