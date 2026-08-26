/**
 * Port de stockage objet (SH-31) — abstraction du stockage de fichiers privés.
 *
 * Le code métier (certifications SH-10, médias SH-17) dépend de cette interface et
 * jamais d'AWS directement : on peut donc substituer une implémentation mémoire en test
 * (cf. `FakeStorageService`) ou un adaptateur S3 réel/LocalStack en runtime
 * (cf. `S3StorageService`), sans changer le code appelant (C2.1.2).
 */
/** Métadonnées d'un objet, obtenues sans télécharger son contenu. */
export interface StoredObjectHead {
  sizeBytes: number;
  contentType: string;
}

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

  /**
   * URL **PUT** temporaire : le navigateur dépose l'objet DIRECTEMENT sur S3, sans
   * qu'aucun octet ne traverse l'API (design EP04, décision D1 — un master 4K ne peut
   * pas être bufferisé comme un PDF de 5 Mo).
   *
   * `contentType` entre dans la signature : le client DOIT envoyer exactement cet
   * en-tête `Content-Type`, sinon S3 rejette le dépôt.
   */
  getSignedUploadUrl(key: string, ttlSeconds: number, contentType: string): Promise<string>;

  /**
   * Taille et type MIME **réels** de l'objet (C2.2.3). Une URL PUT signée ne sait pas
   * plafonner la taille : c'est cette lecture, APRÈS dépôt, qui fait foi et démasque
   * une annonce mensongère (design EP04 §9.1).
   * Rejette `NotFoundException` si l'objet n'existe pas.
   */
  head(key: string): Promise<StoredObjectHead>;

  /**
   * Contenu de l'objet. Réservé aux **petits** objets texte — les playlists HLS de
   * SH-17 font quelques Ko. Ne jamais l'utiliser sur un master vidéo.
   */
  get(key: string): Promise<Buffer>;

  /**
   * Supprime tous les objets sous un préfixe. Supprimer un média, c'est supprimer son
   * master, son poster et ses N segments — pas un objet. Idempotent.
   */
  deletePrefix(prefix: string): Promise<void>;
}

/**
 * Token d'injection NestJS du port. Les modules consommateurs injectent
 * `@Inject(STORAGE_SERVICE) private readonly storage: StorageService`.
 */
export const STORAGE_SERVICE = Symbol('STORAGE_SERVICE');
