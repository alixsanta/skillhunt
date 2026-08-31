import { Test } from '@nestjs/testing';
import { StorageModule, buildS3Client } from './storage.module';
import { STORAGE_SERVICE, StorageService } from './storage.service';
import { S3StorageService } from './s3-storage.service';
import { FakeStorageService } from './fake-storage.service';

/**
 * Tests du provider `StorageModule` (SH-31) : résolution du token et bascule en test.
 */
describe('🗄️ StorageModule (provider — SH-31)', () => {
  const originalBucket = process.env.AWS_S3_BUCKET;
  const originalEndpoint = process.env.AWS_S3_ENDPOINT;
  const originalPublicEndpoint = process.env.AWS_S3_PUBLIC_ENDPOINT;

  afterEach(() => {
    if (originalBucket === undefined) {
      delete process.env.AWS_S3_BUCKET;
    } else {
      process.env.AWS_S3_BUCKET = originalBucket;
    }

    if (originalEndpoint === undefined) {
      delete process.env.AWS_S3_ENDPOINT;
    } else {
      process.env.AWS_S3_ENDPOINT = originalEndpoint;
    }

    if (originalPublicEndpoint === undefined) {
      delete process.env.AWS_S3_PUBLIC_ENDPOINT;
    } else {
      process.env.AWS_S3_PUBLIC_ENDPOINT = originalPublicEndpoint;
    }
  });

  it('fournit un S3StorageService configuré depuis l\'environnement', async () => {
    process.env.AWS_S3_BUCKET = 'skillhunt-media';

    const moduleRef = await Test.createTestingModule({ imports: [StorageModule] }).compile();
    const storage = moduleRef.get<StorageService>(STORAGE_SERVICE);

    expect(storage).toBeInstanceOf(S3StorageService);
  });

  it('échoue explicitement si le bucket n\'est pas configuré (pas de secret en dur)', async () => {
    delete process.env.AWS_S3_BUCKET;

    await expect(
      Test.createTestingModule({ imports: [StorageModule] }).compile(),
    ).rejects.toThrow(/AWS_S3_BUCKET/);
  });

  it('autorise l\'override du token vers le FakeStorageService en test', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [StorageModule] })
      .overrideProvider(STORAGE_SERVICE)
      .useClass(FakeStorageService)
      .compile();

    const storage = moduleRef.get<StorageService>(STORAGE_SERVICE);

    expect(storage).toBeInstanceOf(FakeStorageService);
  });

  it('buildPublicS3Client signe sur AWS_S3_PUBLIC_ENDPOINT quand il est défini', async () => {
    process.env.AWS_S3_ENDPOINT = 'http://localstack:4566';
    process.env.AWS_S3_PUBLIC_ENDPOINT = 'http://localhost:4566';

    const { buildPublicS3Client } = await import('./storage.module');
    const endpoint = await buildPublicS3Client().config.endpoint!();

    // L'hôte entre dans la signature SigV4 : c'est celui que le NAVIGATEUR utilisera.
    expect(endpoint.hostname).toBe('localhost');
  });

  it('buildPublicS3Client retombe sur AWS_S3_ENDPOINT quand l\'endpoint public est absent', async () => {
    process.env.AWS_S3_ENDPOINT = 'http://localstack:4566';
    delete process.env.AWS_S3_PUBLIC_ENDPOINT;

    const { buildPublicS3Client } = await import('./storage.module');
    const endpoint = await buildPublicS3Client().config.endpoint!();

    expect(endpoint.hostname).toBe('localstack');
  });

  it('buildPublicS3Client retombe sur AWS_S3_ENDPOINT quand l\'endpoint public est une chaîne vide', async () => {
    process.env.AWS_S3_ENDPOINT = 'http://localstack:4566';
    // Compose substitue une chaîne vide à une variable non définie (`${VAR}` sans
    // valeur par défaut) : ce n'est pas la même chose qu'une variable absente.
    process.env.AWS_S3_PUBLIC_ENDPOINT = '';

    const { buildPublicS3Client } = await import('./storage.module');
    const endpoint = await buildPublicS3Client().config.endpoint!();

    expect(endpoint.hostname).toBe('localstack');
  });

  // Défaut A (recette e2e) : `@aws-sdk/client-s3` fige par défaut un checksum CRC32
  // dans l'URL AU MOMENT DE LA SIGNATURE, sur un corps encore vide (`AAAAAA==`). Tout
  // dépôt réel envoie un corps différent ⇒ S3 répond 400. Preuve que
  // `requestChecksumCalculation: WHEN_REQUIRED` supprime bien ces paramètres signés.
  it('buildPublicS3Client signe une URL de dépôt SANS paramètre de checksum figé', async () => {
    process.env.AWS_S3_BUCKET = 'skillhunt-media';
    process.env.AWS_S3_ENDPOINT = 'http://localstack:4566';
    process.env.AWS_S3_PUBLIC_ENDPOINT = 'http://localhost:4566';
    // Identifiants factices : LocalStack ne vérifie pas leur validité, mais la chaîne
    // de résolution du SDK exige que QUELQUE CHOSE soit présent pour signer.
    process.env.AWS_ACCESS_KEY_ID ??= 'test';
    process.env.AWS_SECRET_ACCESS_KEY ??= 'test';

    const { buildPublicS3Client } = await import('./storage.module');
    const storage = new S3StorageService(buildS3Client(), 'skillhunt-media', buildPublicS3Client());

    const url = await storage.getSignedUploadUrl('private/media/f/m/master.mp4', 900, 'video/mp4');
    const params = new URL(url).searchParams;

    expect(params.has('x-amz-checksum-crc32')).toBe(false);
    expect(params.has('x-amz-sdk-checksum-algorithm')).toBe(false);
  });
});
