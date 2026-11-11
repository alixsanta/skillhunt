import { loadConfig } from './config';

// C2.2.2 — La configuration est la première chose qui casse en production : elle se teste.
describe('loadConfig', () => {
  it('échoue explicitement si REDIS_URL est absent', () => {
    expect(() => loadConfig({})).toThrow(/REDIS_URL/);
  });

  it('applique les valeurs par défaut documentées', () => {
    const config = loadConfig({
      REDIS_URL: 'redis://localhost:6380',
      AWS_S3_BUCKET: 'skillhunt-media',
    });

    expect(config).toEqual({
      port: 3002,
      redisUrl: 'redis://localhost:6380',
      queueName: 'media-transcode',
      concurrency: 1,
      tmpDir: '/tmp/media',
      s3: { bucket: 'skillhunt-media', endpoint: undefined, region: 'eu-west-3' },
    });
  });

  it('lit les surcharges depuis l\'environnement', () => {
    const config = loadConfig({
      REDIS_URL: 'redis://redis:6379',
      AWS_S3_BUCKET: 'skillhunt-media',
      PORT: '4002',
      MEDIA_QUEUE_NAME: 'autre-file',
      MEDIA_WORKER_CONCURRENCY: '4',
      MEDIA_TMP_DIR: '/data/tmp',
    });

    expect(config.port).toBe(4002);
    expect(config.queueName).toBe('autre-file');
    expect(config.concurrency).toBe(4);
    expect(config.tmpDir).toBe('/data/tmp');
  });

  // C2.2.3 — SH-16b : le worker lit et depose lui-meme en stockage objet.
  describe('stockage objet (SH-16b)', () => {
    const baseEnv = { REDIS_URL: 'redis://127.0.0.1:6379' } as NodeJS.ProcessEnv;

    it('exige AWS_S3_BUCKET : sans bucket, le worker ne saurait où déposer', () => {
      // Même parti pris que storage.module.ts côté backend-core : échec au démarrage
      // plutôt qu'un worker qui consomme des jobs et perd chacune de ses sorties.
      expect(() => loadConfig({ ...baseEnv })).toThrow(/AWS_S3_BUCKET/);
    });

    it("retient le bucket, l'endpoint et la région", () => {
      const config = loadConfig({
        ...baseEnv,
        AWS_S3_BUCKET: 'skillhunt-media',
        AWS_S3_ENDPOINT: 'http://localstack:4566',
        AWS_REGION: 'eu-west-1',
      });

      expect(config.s3).toEqual({
        bucket: 'skillhunt-media',
        endpoint: 'http://localstack:4566',
        region: 'eu-west-1',
      });
    });

    it("applique eu-west-3 par défaut et laisse l'endpoint absent pour AWS réel", () => {
      // `endpoint` absent = S3 réel ; renseigné = LocalStack/MinIO, et le path-style
      // devient obligatoire (cf. createMediaStorage).
      const config = loadConfig({ ...baseEnv, AWS_S3_BUCKET: 'skillhunt-media' });

      expect(config.s3.region).toBe('eu-west-3');
      expect(config.s3.endpoint).toBeUndefined();
    });

    it('traite un endpoint VIDE comme absent', () => {
      // Une substitution compose non résolue (`${AWS_S3_ENDPOINT}` sans valeur) laisse
      // une chaîne vide, que `??` laisserait passer — et le client S3 échouerait sur un
      // endpoint invalide. Même piège qu'en storage.module.ts.
      const config = loadConfig({
        ...baseEnv,
        AWS_S3_BUCKET: 'skillhunt-media',
        AWS_S3_ENDPOINT: '',
      });

      expect(config.s3.endpoint).toBeUndefined();
    });
  });

  it('refuse une concurrence non entière ou nulle plutôt que de la deviner', () => {
    const base = { REDIS_URL: 'redis://localhost:6380', AWS_S3_BUCKET: 'skillhunt-media' };

    expect(() => loadConfig({ ...base, MEDIA_WORKER_CONCURRENCY: '0' })).toThrow(/entière positive/);
    expect(() => loadConfig({ ...base, MEDIA_WORKER_CONCURRENCY: 'deux' })).toThrow(/entière positive/);
  });

  it('accepte PORT=0 : port éphémère attribué par le système (utilisé par les tests)', () => {
    const env = { REDIS_URL: 'redis://localhost:6381', AWS_S3_BUCKET: 'skillhunt-media' };

    expect(loadConfig({ ...env, PORT: '0' }).port).toBe(0);
  });

  it('refuse un port hors de la plage TCP ou non entier', () => {
    const base = { REDIS_URL: 'redis://localhost:6381', AWS_S3_BUCKET: 'skillhunt-media' };

    expect(() => loadConfig({ ...base, PORT: '999999' })).toThrow(/entre 0 et 65535/);
    expect(() => loadConfig({ ...base, PORT: '-1' })).toThrow(/entre 0 et 65535/);
    expect(() => loadConfig({ ...base, PORT: 'abc' })).toThrow(/entre 0 et 65535/);
  });
});
