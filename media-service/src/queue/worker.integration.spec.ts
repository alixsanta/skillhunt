import { copyFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { createTranscodeWorker, type TranscodeJobData, type TranscodeJobResult } from './worker';
import { MediaMetrics } from '../metrics';
import type { MediaServiceConfig } from '../config';
import type { MediaStorage } from '../storage/s3';
import { hasFfmpeg, makeFixture } from '../test/fixture';

// C2.2.2 — Intégration réelle : un job déposé sur la file est RÉELLEMENT consommé, et
// depuis SH-16b RÉELLEMENT transcodé. Sans ce test, « le worker démarre » ne prouve pas
// « le worker travaille ».
//
// Double garde : Redis (la file) ET ffmpeg (le traitement). Le stockage, lui, est
// substitué : c'est la file et le pipeline qu'on intègre ici, pas S3 — le dépôt réel est
// couvert par la recette de bout en bout sur la stack.
const url = process.env.REDIS_URL;
const describeIf = url && hasFfmpeg() ? describe : describe.skip;

// File dédiée au test : on ne touche jamais à la file de production, et surtout
// AUCUN flushdb (le Redis de dev peut être partagé avec d'autres stacks).
const QUEUE_NAME = 'media-transcode-test';

const JOB: TranscodeJobData = {
  mediaId: '11111111-1111-1111-1111-111111111111',
  sourceKey: 'private/media/f1/m1/master.mp4',
  outputPrefix: 'private/media/f1/m1/hls/',
  posterKey: 'private/media/f1/m1/poster.jpg',
};

describeIf('worker de transcodage (intégration Redis + ffmpeg)', () => {
  let dir: string;
  let fixture: string;
  let queue: Queue<TranscodeJobData>;
  let connection: IORedis;
  let worker: ReturnType<typeof createTranscodeWorker>;
  /** `null` simule un master absent du stockage. */
  let source: string | null;
  const deposes: string[] = [];

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'sh-worker-int-'));
    fixture = await makeFixture(dir);

    const storage: MediaStorage = {
      async download(_key, destPath) {
        if (source === null) {
          throw new Error('objet absent du stockage');
        }
        await mkdir(dirname(destPath), { recursive: true });
        await copyFile(source, destPath);
      },
      async uploadTree(_localDir, keyPrefix) {
        deposes.push(`${keyPrefix}*`);
      },
      async uploadFile(_localPath, key) {
        deposes.push(key);
      },
    };

    const config: MediaServiceConfig = {
      port: 0,
      redisUrl: url as string,
      queueName: QUEUE_NAME,
      concurrency: 1,
      tmpDir: join(dir, 'work'),
      // Jamais atteint : le stockage est substitué ci-dessus.
      s3: { bucket: 'jamais-atteint', region: 'eu-west-3' },
    };

    connection = new IORedis(url as string, { maxRetriesPerRequest: null });
    queue = new Queue<TranscodeJobData>(QUEUE_NAME, { connection });
    worker = createTranscodeWorker(config, new MediaMetrics(), { storage });
  }, 60_000);

  afterAll(async () => {
    await worker.close();
    await queue.obliterate({ force: true });
    await queue.close();
    await connection.quit();
    await rm(dir, { recursive: true, force: true });
  });

  beforeEach(() => {
    source = fixture;
    deposes.length = 0;
  });

  it('consomme un job, le transcode réellement et le termine en completed', async () => {
    // L'écouteur est posé AVANT `queue.add` : le worker consomme déjà, et un job
    // traité plus vite que l'attachement de l'écouteur rendrait le test intermittent.
    const termine = new Promise<{ id?: string; result: TranscodeJobResult }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Aucun job terminé en 60 s')), 60_000);
      worker.once('completed', (finished, result) => {
        clearTimeout(timer);
        resolve({ id: finished.id, result });
      });
      worker.once('failed', (_failed, err) => {
        clearTimeout(timer);
        reject(err);
      });
    });

    const job = await queue.add('transcode', JOB);
    const observe = await termine;

    expect(observe.id).toBe(job.id);
    // Le résultat a traversé BullMQ : c'est la forme que le monolithe recevra.
    expect(observe.result.renditions.length).toBeGreaterThan(0);
    expect(observe.result.renditions[0].playlistKey.startsWith(JOB.outputPrefix)).toBe(true);
    expect(deposes).toContain(JOB.posterKey);

    // Et il SURVIT à la sérialisation Redis : relu depuis la file, il est identique.
    const relu = await queue.getJob(job.id as string);
    expect(relu?.returnvalue).toEqual(observe.result);
  }, 90_000);

  it("fait échouer le job quand le master est absent, avec une raison exploitable", async () => {
    // C'est cet échec BullMQ qui déclenche les tentatives puis le passage en FAILED
    // côté monolithe : un job qui « réussirait » sans master serait bien pire.
    source = null;

    const echoue = new Promise<{ id?: string; raison: string }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Aucun échec observé en 30 s')), 30_000);
      worker.once('failed', (failed, err) => {
        clearTimeout(timer);
        resolve({ id: failed?.id, raison: err.message });
      });
    });

    const job = await queue.add('transcode', { ...JOB, mediaId: '22222222-2222-2222-2222-222222222222' });
    const observe = await echoue;

    expect(observe.id).toBe(job.id);
    // Raison UTILISATEUR : c'est elle qui deviendra l'`errorReason` du média. La cause
    // brute (« objet absent du stockage ») reste dans les journaux du worker.
    expect(observe.raison).toBe('Le fichier déposé est introuvable en stockage.');
    expect(deposes).toEqual([]);
  }, 45_000);
});
