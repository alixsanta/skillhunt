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
  /** URL signée délivrée par `POST /api/v1/media`. */
  url: string;
  file: File;
  /**
   * Verbe HTTP délivré par l'API (`upload.method`). Ne jamais figer `PUT` en dur ici : SH-16a
   * documente déjà ce champ comme faisant partie du contrat, pas comme une constante cliente.
   */
  method: string;
  /**
   * En-têtes à envoyer TELS QUELS (`upload.headers`), objet complet — pas une seule clé lue à
   * la main. Le stockage fait entrer chaque en-tête signé dans la signature SigV4 ; en oublier
   * un (ex. un futur `x-amz-checksum-*`, cf. SH-16a) fait échouer le dépôt en 403, un symptôme
   * qui ressemble à un problème de credentials plutôt qu'à ce bug côté client.
   */
  headers: Record<string, string>;
  /** Progression en pourcentage d'octets envoyés (0–100). */
  onProgress: (percent: number) => void;
}

/** Dépose le fichier directement sur le stockage. Rejette si le stockage refuse. */
export async function uploadToStorage({
  url,
  file,
  method,
  headers,
  onProgress,
}: UploadToStorageParams): Promise<void> {
  await storageClient.request({
    url,
    method,
    data: file,
    headers,
    onUploadProgress: (event) => {
      if (event.total) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    },
  });
}
