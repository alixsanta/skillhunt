import { createWriteStream } from 'node:fs';
import { mkdir, readdir, readFile } from 'node:fs/promises';
import { dirname, extname, join, posix } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { MediaServiceConfig } from '../config';

/**
 * Accès au stockage objet du worker (SH-16b ; architecture EP04 §4, où `media-service`
 * lit et écrit S3 directement).
 *
 * Port volontairement PLUS ÉTROIT que le `StorageService` de backend-core : le worker
 * n'a besoin que de descendre un master et de remonter une arborescence de sorties. Ni
 * URL signée, ni suppression — ce n'est pas lui qui porte le cycle de vie du média, et
 * lui donner ces capacités élargirait sa surface sans aucun usage.
 */
export interface MediaStorage {
  download(key: string, destPath: string): Promise<void>;
  uploadTree(localDir: string, keyPrefix: string): Promise<void>;
  uploadFile(localPath: string, key: string): Promise<void>;
}

/**
 * Table FERMÉE des types produits par le pipeline. Rien d'autre n'est déposé par ce
 * service : playlists, segments, poster.
 */
const TYPES_PAR_EXTENSION: Record<string, string> = {
  '.m3u8': 'application/vnd.apple.mpegurl',
  '.ts': 'video/mp2t',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

/**
 * Type MIME d'un fichier de sortie, déduit de son extension.
 *
 * Repli sur `application/octet-stream`, et JAMAIS sur un type deviné : S3 renvoie le
 * `Content-Type` déposé tel quel au navigateur. Un `text/html` inventé sur un fichier
 * inattendu serait servi comme du HTML, ce qui ouvrirait un XSS stocké (C2.2.3).
 */
export function contentTypeFor(fileName: string): string {
  return TYPES_PAR_EXTENSION[extname(fileName).toLowerCase()] ?? 'application/octet-stream';
}

/**
 * Liste récursivement les fichiers d'un répertoire, en chemins relatifs POSIX.
 *
 * `posix.join` et non `join` : une clé S3 est TOUJOURS séparée par des `/`, même quand
 * le worker tourne sous Windows en développement. Un `\` produirait des clés du genre
 * `hls\360p\seg-00001.ts`, illisibles par le lecteur.
 */
async function listerFichiers(racine: string, sousChemin = ''): Promise<string[]> {
  const entrees = await readdir(join(racine, sousChemin), { withFileTypes: true });
  const fichiers: string[] = [];

  for (const entree of entrees) {
    const relatif = sousChemin === '' ? entree.name : posix.join(sousChemin, entree.name);
    if (entree.isDirectory()) {
      fichiers.push(...(await listerFichiers(racine, relatif)));
    } else {
      fichiers.push(relatif);
    }
  }

  return fichiers;
}

export function createMediaStorage(config: MediaServiceConfig['s3']): MediaStorage {
  const client = new S3Client({
    region: config.region,
    ...(config.endpoint
      ? // LocalStack/MinIO : le path-style est OBLIGATOIRE, l'adressage par sous-domaine
        // de bucket n'y étant pas résoluble. Même arbitrage qu'en storage.module.ts.
        { endpoint: config.endpoint, forcePathStyle: true }
      : {}),
  });

  async function uploadFile(localPath: string, key: string): Promise<void> {
    // Buffer et non flux : les SORTIES sont petites (playlists en Ko, segments en Mo).
    // Un flux imposerait de renseigner `ContentLength`, pour aucun gain ici.
    const body = await readFile(localPath);
    await client.send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        Body: body,
        ContentType: contentTypeFor(localPath),
        // Chiffrement au repos AES-256, comme tout objet du bucket (CLAUDE.md §8.6).
        ServerSideEncryption: 'AES256',
      }),
    );
  }

  return {
    async download(key, destPath) {
      await mkdir(dirname(destPath), { recursive: true });
      const reponse = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }));
      if (!reponse.Body) {
        throw new Error(`Objet vide ou absent en stockage : ${key}`);
      }
      // Flux et NON buffer, à l'inverse du dépôt : un master peut peser 500 Mo
      // (`MEDIA_MAX_FILE_MB`), le charger en mémoire ferait tomber le conteneur bien
      // avant que l'encodage ne commence.
      await pipeline(reponse.Body as Readable, createWriteStream(destPath));
    },

    async uploadTree(localDir, keyPrefix) {
      const fichiers = await listerFichiers(localDir);
      for (const relatif of fichiers) {
        await uploadFile(join(localDir, relatif), `${keyPrefix}${relatif}`);
      }
    },

    uploadFile,
  };
}
