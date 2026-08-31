import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { MediaQueue, MEDIA_QUEUE_NAME } from './media.queue';

// C2.2.2 — Redis réel : on prouve que le job est RÉELLEMENT déposé sur la file que
// `media-service` consomme, et pas seulement qu'une méthode a été appelée.
const url = process.env.REDIS_URL;
const describeIf = url ? describe : describe.skip;

// `describe` n'accepte pas de délai en 3e argument (contrairement à `it`/`beforeAll`) :
// le délai voulu par le plan est donc posé ici, pour toute la suite du fichier.
jest.setTimeout(20_000);

describeIf('MediaQueue (intégration Redis)', () => {
  let mediaQueue: MediaQueue;
  let inspector: Queue;
  let connection: IORedis;

  beforeAll(() => {
    mediaQueue = new MediaQueue();
    connection = new IORedis(url as string, { maxRetriesPerRequest: null });
    inspector = new Queue(MEDIA_QUEUE_NAME, { connection });
  });

  afterAll(async () => {
    await mediaQueue.onModuleDestroy();
    // File dédiée au test, jamais de FLUSHDB : le Redis de dev peut être partagé.
    await inspector.obliterate({ force: true });
    await inspector.close();
    await connection.quit();
  });

  it('dépose un job identifié par le mediaId', async () => {
    const mediaId = '44444444-4444-4444-4444-444444444444';

    await mediaQueue.enqueueTranscode({
      mediaId,
      sourceKey: 'private/media/f1/m1/master.mp4',
      outputPrefix: 'private/media/f1/m1/hls/',
      posterKey: 'private/media/f1/m1/poster.jpg',
    });

    const job = await inspector.getJob(mediaId);
    expect(job).toBeDefined();
    expect(job!.data.sourceKey).toBe('private/media/f1/m1/master.mp4');
    expect(job!.opts.attempts).toBe(3);
  });

  it('une double confirmation ne crée pas un second transcodage', async () => {
    const mediaId = '55555555-5555-5555-5555-555555555555';
    const data = {
      mediaId,
      sourceKey: 'private/media/f1/m2/master.mp4',
      outputPrefix: 'private/media/f1/m2/hls/',
      posterKey: 'private/media/f1/m2/poster.jpg',
    };

    await mediaQueue.enqueueTranscode(data);
    await mediaQueue.enqueueTranscode(data);

    const counts = await inspector.getJobCounts('waiting');
    // `jobId = mediaId` rend l'enfilement idempotent : BullMQ ignore le doublon.
    expect(counts.waiting).toBeLessThanOrEqual(2);
    expect(await inspector.getJob(mediaId)).toBeDefined();
  });
});
