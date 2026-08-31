import { Module } from '@nestjs/common';
import { S3Client } from '@aws-sdk/client-s3';
import { STORAGE_SERVICE } from './storage.service';
import { S3StorageService } from './s3-storage.service';

/**
 * Construit l'`S3Client` depuis l'environnement (SH-31).
 *
 * `AWS_S3_ENDPOINT` renseigné ⇒ LocalStack (ou MinIO) : on force le `path-style`.
 * Vide ⇒ AWS S3 réel. Aucun changement de code entre les deux (ticket — Scénario 4).
 * Les credentials sont lus par la chaîne par défaut du SDK (`AWS_ACCESS_KEY_ID` /
 * `AWS_SECRET_ACCESS_KEY`) — jamais en dur (CLAUDE.md §8).
 */
export function buildS3Client(): S3Client {
  const endpoint = process.env.AWS_S3_ENDPOINT;
  return new S3Client({
    region: process.env.AWS_REGION ?? 'eu-west-3',
    // forcePathStyle indispensable pour LocalStack quand un endpoint custom est défini.
    ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
  });
}

/**
 * Construit le client servant **uniquement à signer** les URLs consommées par le
 * navigateur (SH-16a, décision D9).
 *
 * `AWS_S3_ENDPOINT` est un nom de service Docker : le poste client ne sait pas le
 * résoudre. Comme la signature SigV4 couvre l'hôte, on ne peut pas se contenter de
 * réécrire l'URL après coup — il faut signer avec l'hôte final. En production réelle,
 * cette variable vaut le domaine S3/CloudFront et les deux clients coïncident.
 */
export function buildPublicS3Client(): S3Client {
  const endpoint = process.env.AWS_S3_PUBLIC_ENDPOINT ?? process.env.AWS_S3_ENDPOINT;
  return new S3Client({
    region: process.env.AWS_REGION ?? 'eu-west-3',
    ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
  });
}

/**
 * Module de stockage objet (SH-31).
 *
 * Lie le token `STORAGE_SERVICE` à l'adaptateur S3 configuré par l'environnement, et
 * l'**exporte** pour injection dans les autres modules (certifications SH-10, média SH-17).
 * En test, les consommateurs surchargent le provider vers `FakeStorageService`.
 */
@Module({
  providers: [
    {
      provide: STORAGE_SERVICE,
      useFactory: () => {
        const bucket = process.env.AWS_S3_BUCKET;
        if (!bucket) {
          // Échec explicite plutôt qu'un bucket deviné : on ne démarre pas mal configuré.
          throw new Error(
            'AWS_S3_BUCKET manquant : configurez le stockage objet (cf. .env.example).',
          );
        }
        return new S3StorageService(buildS3Client(), bucket, buildPublicS3Client());
      },
    },
  ],
  exports: [STORAGE_SERVICE],
})
export class StorageModule {}
