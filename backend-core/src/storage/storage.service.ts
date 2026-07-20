/**
 * Port de stockage objet (SH-31) — abstraction du stockage de fichiers privés.
 *
 * Le code métier (certifications SH-10, médias SH-17) dépend de cette interface et
 * jamais d'AWS directement : on peut donc substituer une implémentation mémoire en test
 * (cf. `FakeStorageService`) ou un adaptateur S3 réel/LocalStack en runtime
 * (cf. `S3StorageService`), sans changer le code appelant (C2.1.2).
 */
export interface StorageService {
  /**
   * Dépose un objet, **chiffré au repos (SSE AES-256)** côté adaptateur S3.
   * @param key   chemin/clé de l'objet (ex. `certifications/<uuid>.pdf`)
   * @param body  contenu binaire
   * @param contentType type MIME (ex. `application/pdf`)
   */
  put(key: string, body: Buffer, contentType: string): Promise<void>;

  /**
   * Renvoie une URL d'accès **temporaire** expirant après `ttlSeconds`.
   * Aucun lien permanent, aucun bucket public (CLAUDE.md §8 / R8).
   */
  getSignedUrl(key: string, ttlSeconds: number): Promise<string>;

  /** Purge effective de l'objet (RGPD / minimisation). */
  delete(key: string): Promise<void>;
}

/**
 * Token d'injection NestJS du port. Les modules consommateurs injectent
 * `@Inject(STORAGE_SERVICE) private readonly storage: StorageService`.
 */
export const STORAGE_SERVICE = Symbol('STORAGE_SERVICE');
