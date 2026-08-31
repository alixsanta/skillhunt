import { Injectable, NotFoundException } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { StorageService, StoredObjectHead } from './storage.service';

/**
 * Adaptateur S3 du port `StorageService` (SH-31).
 *
 * Cible aussi bien **AWS S3 réel** que **LocalStack** : le choix se fait par
 * configuration de l'`S3Client` (endpoint/region/creds via env), sans changement de code
 * (ticket — Scénario 4). Le `S3Client` et le bucket sont injectés (DI testable) : le module
 * les construit depuis l'environnement (cf. `storage.module.ts`).
 *
 * Sécurité (CLAUDE.md §8) : chiffrement au repos AES-256 au dépôt, accès uniquement par
 * Signed URL à durée courte, jamais de log du contenu.
 */
@Injectable()
export class S3StorageService implements StorageService {
  constructor(
    private readonly client: S3Client,
    private readonly bucket: string,
    /**
     * Client dédié à la **signature**. Il porte l'endpoint PUBLIC — celui que le
     * navigateur utilisera. SigV4 couvre l'hôte : signer avec l'endpoint interne
     * (`http://localstack:4566`, un nom de service Docker) produirait une URL que le
     * poste client ne sait même pas résoudre. Par défaut, on réutilise le client
     * principal (cas des tests et d'AWS réel, où les deux endpoints coïncident).
     */
    private readonly presignClient: S3Client = client,
  ) {}

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    // ServerSideEncryption: 'AES256' ⇒ chiffrement au repos géré par S3 (R3/R8).
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        ServerSideEncryption: 'AES256',
      }),
    );
  }

  getSignedUrl(key: string, ttlSeconds: number): Promise<string> {
    // URL temporaire signée V4 : aucun lien permanent, aucun bucket public (R8).
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.presignClient, command, { expiresIn: ttlSeconds });
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  getSignedUploadUrl(key: string, ttlSeconds: number, contentType: string): Promise<string> {
    // On ne signe QUE le type MIME. Signer aussi `ServerSideEncryption` obligerait le
    // navigateur à envoyer l'en-tête `x-amz-server-side-encryption` — le chiffrement au
    // repos est assuré autrement, par le chiffrement PAR DÉFAUT du bucket (cf. le script
    // d'initialisation LocalStack et, en production, la configuration du bucket).
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });
    return getSignedUrl(this.presignClient, command, { expiresIn: ttlSeconds });
  }

  async head(key: string): Promise<StoredObjectHead> {
    try {
      const response = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return {
        sizeBytes: response.ContentLength ?? 0,
        contentType: response.ContentType ?? 'application/octet-stream',
      };
    } catch (err) {
      throw this.translate(err);
    }
  }

  async get(key: string): Promise<Buffer> {
    try {
      const response = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      const bytes = await response.Body!.transformToByteArray();
      return Buffer.from(bytes);
    } catch (err) {
      throw this.translate(err);
    }
  }

  async deletePrefix(prefix: string): Promise<void> {
    let continuationToken: string | undefined;

    // Boucle de pagination : `ListObjectsV2` plafonne à 1000 clés par réponse. Un média
    // long dépasse ce seuil en segments HLS — s'arrêter au premier lot laisserait des
    // objets orphelins, invisibles et facturés.
    do {
      const listed = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      );

      const objects = (listed.Contents ?? [])
        .map((entry) => entry.Key)
        .filter((key): key is string => Boolean(key))
        .map((Key) => ({ Key }));

      if (objects.length > 0) {
        await this.client.send(
          new DeleteObjectsCommand({
            Bucket: this.bucket,
            Delete: { Objects: objects, Quiet: true },
          }),
        );
      }

      continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;
    } while (continuationToken);
  }

  /** Traduit une absence d'objet côté S3 en exception métier Nest. */
  private translate(err: unknown): Error {
    const name = (err as { name?: string }).name;
    const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    if (name === 'NotFound' || name === 'NoSuchKey' || status === 404) {
      return new NotFoundException('Objet de stockage introuvable');
    }
    return err as Error;
  }
}
