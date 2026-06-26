import { Test } from '@nestjs/testing';
import { StorageModule } from './storage.module';
import { STORAGE_SERVICE, StorageService } from './storage.service';
import { S3StorageService } from './s3-storage.service';
import { FakeStorageService } from './fake-storage.service';

/**
 * Tests du provider `StorageModule` (SH-31) : résolution du token et bascule en test.
 */
describe('🗄️ StorageModule (provider — SH-31)', () => {
  const originalBucket = process.env.AWS_S3_BUCKET;

  afterEach(() => {
    if (originalBucket === undefined) {
      delete process.env.AWS_S3_BUCKET;
    } else {
      process.env.AWS_S3_BUCKET = originalBucket;
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
});
