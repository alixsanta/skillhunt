import { Queue, Worker } from 'bullmq';
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

    // `jobId = mediaId` rend l'enfilement idempotent : BullMQ ignore le doublon plutôt que
    // de créer un second job. On vérifie ça sur CE job précisément (et non sur le total de
    // la file, qui dépendrait des jobs laissés par les tests voisins) : parmi les jobs en
    // attente, un seul porte ce `mediaId`.
    const waiting = await inspector.getJobs(['waiting']);
    const pourCeMedia = waiting.filter((job) => job.data.mediaId === mediaId);
    expect(pourCeMedia).toHaveLength(1);
    expect(await inspector.getJob(mediaId)).toBeDefined();
  });

  // ── SH-54 : libération du job avant suppression d'un média ──────────────────────────
  describe('releaseTranscode (SH-54)', () => {
    const donnees = (mediaId: string) => ({
      mediaId,
      sourceKey: `private/media/f1/${mediaId}/master.mp4`,
      outputPrefix: `private/media/f1/${mediaId}/hls/`,
      posterKey: `private/media/f1/${mediaId}/poster.jpg`,
    });

    it("rend true quand aucun job n'existe pour ce média", async () => {
      expect(await mediaQueue.releaseTranscode('66666666-0000-0000-0000-000000000000')).toBe(true);
    });

    it('RETIRE un job en attente : il ne sera jamais transcodé', async () => {
      const mediaId = '66666666-0000-0000-0000-000000000001';
      await mediaQueue.enqueueTranscode(donnees(mediaId));
      expect(await inspector.getJob(mediaId)).toBeDefined();

      expect(await mediaQueue.releaseTranscode(mediaId)).toBe(true);

      expect(await inspector.getJob(mediaId)).toBeUndefined();
    });

    it("rend false tant qu'un worker exécute RÉELLEMENT le job, puis true une fois fini", async () => {
      // Le cas qui justifie la méthode : un vrai worker tient le job. Simuler son état
      // par un bouchon ne prouverait pas que BullMQ refuse bien le retrait d'un job actif.
      const mediaId = '66666666-0000-0000-0000-000000000002';
      let liberer: () => void = () => undefined;
      const retenue = new Promise<void>((resolve) => {
        liberer = resolve;
      });

      const workerConnection = new IORedis(url as string, { maxRetriesPerRequest: null });
      const worker = new Worker(
        MEDIA_QUEUE_NAME,
        async (job) => {
          // Les jobs laissés en attente par les tests voisins passent sans être retenus :
          // seul celui de ce test est tenu actif.
          if (job.id === mediaId) {
            await retenue;
          }
          return { renditions: [] };
        },
        { connection: workerConnection },
      );

      try {
        const actif = new Promise<void>((resolve) => {
          worker.on('active', (job) => {
            if (job.id === mediaId) resolve();
          });
        });
        const termine = new Promise<void>((resolve) => {
          worker.on('completed', (job) => {
            if (job.id === mediaId) resolve();
          });
        });

        await mediaQueue.enqueueTranscode(donnees(mediaId));
        await actif;

        expect(await mediaQueue.releaseTranscode(mediaId)).toBe(false);
        // Refuser ne doit rien casser : le job est toujours là, toujours actif.
        expect(await (await inspector.getJob(mediaId))?.getState()).toBe('active');

        liberer();
        await termine;

        // Une fois le job terminé, plus rien ne s'oppose à la suppression — c'est ce qui
        // rend supprimable un média dont le statut n'aurait jamais été mis à jour.
        expect(await mediaQueue.releaseTranscode(mediaId)).toBe(true);
        expect(await inspector.getJob(mediaId)).toBeUndefined();
      } finally {
        liberer();
        await worker.close();
        await workerConnection.quit();
      }
    });
  });
});
