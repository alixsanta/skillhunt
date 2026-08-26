import { loadConfig } from './config';

// C2.2.2 — La configuration est la première chose qui casse en production : elle se teste.
describe('loadConfig', () => {
  it('échoue explicitement si REDIS_URL est absent', () => {
    expect(() => loadConfig({})).toThrow(/REDIS_URL/);
  });

  it('applique les valeurs par défaut documentées', () => {
    const config = loadConfig({ REDIS_URL: 'redis://localhost:6380' });

    expect(config).toEqual({
      port: 3002,
      redisUrl: 'redis://localhost:6380',
      queueName: 'media-transcode',
      concurrency: 1,
      tmpDir: '/tmp/media',
    });
  });

  it('lit les surcharges depuis l\'environnement', () => {
    const config = loadConfig({
      REDIS_URL: 'redis://redis:6379',
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

  it('refuse une concurrence non entière ou nulle plutôt que de la deviner', () => {
    const base = { REDIS_URL: 'redis://localhost:6380' };

    expect(() => loadConfig({ ...base, MEDIA_WORKER_CONCURRENCY: '0' })).toThrow(/entière positive/);
    expect(() => loadConfig({ ...base, MEDIA_WORKER_CONCURRENCY: 'deux' })).toThrow(/entière positive/);
  });

  it('accepte PORT=0 : port éphémère attribué par le système (utilisé par les tests)', () => {
    expect(loadConfig({ REDIS_URL: 'redis://localhost:6381', PORT: '0' }).port).toBe(0);
  });

  it('refuse un port hors de la plage TCP ou non entier', () => {
    const base = { REDIS_URL: 'redis://localhost:6381' };

    expect(() => loadConfig({ ...base, PORT: '999999' })).toThrow(/entre 0 et 65535/);
    expect(() => loadConfig({ ...base, PORT: '-1' })).toThrow(/entre 0 et 65535/);
    expect(() => loadConfig({ ...base, PORT: 'abc' })).toThrow(/entre 0 et 65535/);
  });
});
