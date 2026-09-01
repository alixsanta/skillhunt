import axios from 'axios';

/**
 * Client dédié au dépôt sur le stockage objet.
 *
 * Instance NUE, créée ici et nulle part ailleurs : `apiClient` porte les intercepteurs
 * d'authentification (SH-20), qui ajouteraient un en-tête `Authorization`. Cet en-tête
 * invaliderait la signature SigV4 de l'URL — le stockage refuserait le dépôt — ET
 * transmettrait le jeton d'accès de l'utilisateur à un tiers.
 *
 * Ne JAMAIS router ce PUT par `apiClient`, ni ajouter d'intercepteur ici.
 */
const storageClient = axios.create();

export interface UploadToStorageParams {
  /** URL PUT signée délivrée par `POST /api/v1/media`. */
  url: string;
  file: File;
  /** Type MIME exact que l'API a fait signer — S3 refuse le dépôt s'il diffère. */
  contentType: string;
  /** Progression en pourcentage d'octets envoyés (0–100). */
  onProgress: (percent: number) => void;
}

/** Dépose le fichier directement sur le stockage. Rejette si le stockage refuse. */
export async function uploadToStorage({
  url,
  file,
  contentType,
  onProgress,
}: UploadToStorageParams): Promise<void> {
  await storageClient.put(url, file, {
    headers: { 'Content-Type': contentType },
    onUploadProgress: (event) => {
      if (event.total) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    },
  });
}
