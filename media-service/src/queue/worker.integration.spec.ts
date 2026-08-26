import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { createTranscodeWorker, type TranscodeJobData } from './worker';
import { MediaMetrics } from '../metrics';
import type { MediaServiceConfig } from '../config';

// C2.2.2 — Intégration Redis réelle : un job déposé sur la file est RÉELLEMENT consommé.
// Sans ce test, « le worker démarre » ne prouve pas « le worker travaille ».
const url = process.env.REDIS_URL;
const describeIf = url ? describe : describe.skip;

// File dédiée au test : on ne touche jamais à la file de production, et surtout
// AUCUN flushdb (le Redis de dev peut être partagé avec d'autres stacks).
const QUEUE_NAME = 'media-transcode-test';

describeIf('worker de transcodage (intégration Redis)', () => {
  const config: MediaServiceConfig = {
    port: 0,
    redisUrl: url as string,
    queueName: QUEUE_NAME,
    concurrency: 1,
    tmpDir: '/tmp/media-test',
  };

  let queue: Queue<TranscodeJobData>;
  let connection: IORedis;
  let worker: ReturnType<typeof createTranscodeWorker>;

  beforeAll(() => {
    connection = new IORedis(url as string, { maxRetriesPerRequest: null });
    queue = new Queue<TranscodeJobData>(QUEUE_NAME, { connection });
    worker = createTranscodeWorker(config, new MediaMetrics());
  });

  afterAll(async () => {
    await worker.close();
    await queue.obliterate({ force: true });
    await queue.close();
    await connection.quit();
  });

  it('consomme un job déposé sur la file et le termine en completed', async () => {
    // L'écouteur est posé AVANT `queue.add` : le worker consomme déjà, et un job
    // traité plus vite que l'attachement de l'écouteur rendrait le test intermittent.
    const completed = new Promise<{ id?: string; result: unknown }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Aucun job terminé en 10 s')), 10_000);
      worker.on('completed', (finished, result) => {
        clearTimeout(timer);
        resolve({ id: finished.id, result });
      });
    });

    const job = await queue.add('transcode', {
      mediaId: '11111111-1111-1111-1111-111111111111',
      sourceKey: 'private/media/f1/m1/master.mp4',
      outputPrefix: 'private/media/f1/m1/hls/',
      posterKey: 'private/media/f1/m1/poster.jpg',
    });

    const observed = await completed;

    expect(observed.id).toBe(job.id);
    expect(observed.result).toEqual({ renditions: [] });
  }, 15_000);
});
