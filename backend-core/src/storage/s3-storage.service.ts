import { Injectable } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { StorageService } from './storage.service';

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
    return getSignedUrl(this.client, command, { expiresIn: ttlSeconds });
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
