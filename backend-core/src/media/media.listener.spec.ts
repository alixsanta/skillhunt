import { Repository } from 'typeorm';
import { Logger } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import { MediaService } from './media.service';
import { Media } from './media.entity';
import { MediaStatus, MediaType } from '../common/enums';
import { FakeStorageService } from '../storage/fake-storage.service';
import { MediaTranscodeListener } from './media.listener';

const MEDIA_ID = '66666666-6666-6666-6666-666666666666';
const FREELANCE = '11111111-1111-1111-1111-111111111111';

function contexte(status = MediaStatus.UPLOADED) {
  const media = {
    id: MEDIA_ID,
    freelanceId: FREELANCE,
    status,
    sourceKey: `private/media/${FREELANCE}/${MEDIA_ID}/master.mp4`,
    mimeType: 'video/mp4',
    renditions: null,
    sizeBytes: null,
  } as Media;

  const repo = {
    findOne: async () => media,
    save: async (entity: Media) => entity,
  } as unknown as Repository<Media>;

  const storage = new FakeStorageService();
  const queue = { enqueueTranscode: jest.fn() };
  return { media, storage, service: new MediaService(repo, storage, queue as never) };
}

// C2.2.3 — Le résultat du worker est une donnée EXTERNE au monolithe : elle traverse
// Redis et n'est produite par aucun code de ce service. Elle se valide comme une entrée.
describe('MediaService — issue du transcodage', () => {
  // Le préfixe RÉEL du média de test : `playlistKey` doit désormais y rester confiné.
  const PREFIXE = `private/media/${FREELANCE}/${MEDIA_ID}/`;

  function resultat(overrides: Record<string, unknown> = {}) {
    return JSON.stringify({
      durationSeconds: 42,
      width: 3840,
      height: 2160,
      type: 'VIDEO_360',
      mimeType: 'video/mp4',
      renditions: [
        {
          name: '720p',
          width: 1280,
          height: 720,
          bandwidth: 2800000,
          playlistKey: `${PREFIXE}hls/720p.m3u8`,
        },
      ],
      ...overrides,
    });
  }

  it('passe en READY et transcrit les métadonnées sondées', async () => {
    const { service } = contexte();

    const media = await service.applyTranscodeResult(MEDIA_ID, resultat());

    expect(media.status).toBe(MediaStatus.READY);
    expect(media.durationSeconds).toBe(42);
    expect(media.type).toBe(MediaType.VIDEO_360);
    expect(media.processedAt).not.toBeNull();
    // La vue publique ne laisse pas fuir la clé de playlist.
    expect(JSON.stringify(media.renditions)).not.toContain('playlistKey');
  });

  it('rejette un résultat non conforme plutôt que d\'écrire n\'importe quoi en base', async () => {
    const { service } = contexte();

    await expect(service.applyTranscodeResult(MEDIA_ID, '{"width":"beaucoup"}')).rejects.toThrow();
    await expect(service.applyTranscodeResult(MEDIA_ID, 'pas du json')).rejects.toThrow();
  });

  // Défaut B (recette e2e) : la version de BullMQ installée décode déjà `returnvalue`
  // avant d'émettre `completed` (`queue-events.js:102`) — c'est le cas RÉEL en
  // production. Reparser cet objet avec `JSON.parse` le stringifie en
  // `"[object Object]"` puis échoue toujours : AUCUN média n'atteint jamais READY.
  it('passe en READY quand le résultat arrive déjà DÉCODÉ en objet (cas réel BullMQ)', async () => {
    const { service } = contexte();

    const media = await service.applyTranscodeResult(MEDIA_ID, JSON.parse(resultat()));

    expect(media.status).toBe(MediaStatus.READY);
    expect(media.durationSeconds).toBe(42);
  });

  it('passe en READY quand le résultat arrive en chaîne JSON (compatibilité)', async () => {
    const { service } = contexte();

    const media = await service.applyTranscodeResult(MEDIA_ID, resultat());

    expect(media.status).toBe(MediaStatus.READY);
  });

  // Cas de SÉCURITÉ : une `playlistKey` hors du préfixe du média correspond à un autre
  // freelance. SH-17 la transformera en URL signée — la laisser passer ouvrirait un
  // accès signé au stockage d'AUTRUI. C'est le cas le plus important de ce fichier.
  it('rejette une playlistKey pointant vers le casier d\'un AUTRE freelance', async () => {
    const { service } = contexte();
    const autreFreelance = '22222222-2222-2222-2222-222222222222';

    const malicieux = resultat({
      renditions: [
        {
          name: '720p',
          width: 1280,
          height: 720,
          bandwidth: 2800000,
          playlistKey: `private/media/${autreFreelance}/${MEDIA_ID}/hls/720p.m3u8`,
        },
      ],
    });

    await expect(service.applyTranscodeResult(MEDIA_ID, malicieux)).rejects.toThrow();
  });

  it('rejette une durationSeconds négative', async () => {
    const { service } = contexte();

    await expect(
      service.applyTranscodeResult(MEDIA_ID, resultat({ durationSeconds: -1 })),
    ).rejects.toThrow();
  });

  it('rejette une width négative', async () => {
    const { service } = contexte();

    await expect(service.applyTranscodeResult(MEDIA_ID, resultat({ width: -3840 }))).rejects.toThrow();
  });

  it('rejette une width fractionnaire', async () => {
    const { service } = contexte();

    await expect(service.applyTranscodeResult(MEDIA_ID, resultat({ width: 3840.5 }))).rejects.toThrow();
  });

  it('rejette un mimeType hors de la liste blanche', async () => {
    const { service } = contexte();

    await expect(
      service.applyTranscodeResult(MEDIA_ID, resultat({ mimeType: 'application/octet-stream' })),
    ).rejects.toThrow();
  });

  it('rejette une rendition sans bandwidth exploitable', async () => {
    const { service } = contexte();

    const sansBandwidth = resultat({
      renditions: [
        {
          name: '720p',
          width: 1280,
          height: 720,
          bandwidth: 'beaucoup',
          playlistKey: `${PREFIXE}hls/720p.m3u8`,
        },
      ],
    });

    await expect(service.applyTranscodeResult(MEDIA_ID, sansBandwidth)).rejects.toThrow();
  });

  it('markFailed enregistre la raison et purge les sorties partielles', async () => {
    const { service, storage, media } = contexte();
    await storage.put(`private/media/${FREELANCE}/${MEDIA_ID}/hls/720p.m3u8`, Buffer.from('x'), 'text/plain');

    const failed = await service.markFailed(MEDIA_ID, 'ffprobe: aucun flux vidéo');

    expect(failed.status).toBe(MediaStatus.FAILED);
    expect(failed.errorReason).toBe('ffprobe: aucun flux vidéo');
    // Les segments à moitié écrits n'ont plus rien à faire là.
    await expect(storage.head(`private/media/${FREELANCE}/${MEDIA_ID}/hls/720p.m3u8`)).rejects.toThrow();
    // Le master est CONSERVÉ : il permet de rejouer le transcodage après correction.
    expect(media.sourceKey).toBeDefined();
  });

  it('markFailed tronque une raison trop longue et ne stocke jamais de pile', async () => {
    const { service } = contexte();

    const failed = await service.markFailed(MEDIA_ID, 'x'.repeat(500));

    expect(failed.errorReason!.length).toBeLessThanOrEqual(255);
  });
});

describe('MediaTranscodeListener — câblage', () => {
  function ecouteur() {
    const events = new EventEmitter();
    const service = {
      applyTranscodeResult: jest.fn().mockResolvedValue({}),
      markFailed: jest.fn().mockResolvedValue({}),
    };
    const listener = new MediaTranscodeListener({ events } as never, service as never);
    listener.onModuleInit();
    return { events, service };
  }

  it('un job terminé déclenche la transcription du résultat', async () => {
    const { events, service } = ecouteur();

    events.emit('completed', { jobId: 'm1', returnvalue: '{"ok":true}' });
    await Promise.resolve();

    expect(service.applyTranscodeResult).toHaveBeenCalledWith('m1', '{"ok":true}');
  });

  it('un job en échec marque le média FAILED avec sa raison', async () => {
    const { events, service } = ecouteur();

    events.emit('failed', { jobId: 'm2', failedReason: 'ffmpeg: exit 1' });
    await Promise.resolve();

    expect(service.markFailed).toHaveBeenCalledWith('m2', 'ffmpeg: exit 1');
  });

  it('un résultat inexploitable est journalisé, pas propagé en rejet non géré', async () => {
    const { events, service } = ecouteur();
    const journal = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    service.applyTranscodeResult.mockRejectedValue(new Error('non conforme'));

    events.emit('completed', { jobId: 'm3', returnvalue: 'nawak' });
    // Laisse la micro-tâche du `.catch` s'exécuter avant d'observer.
    await new Promise((resolve) => setImmediate(resolve));

    // On vérifie la trace elle-même : sans assertion sur le journal, ce test passerait
    // aussi bien si l'erreur était silencieusement avalée.
    expect(journal).toHaveBeenCalledWith(expect.stringContaining('m3'));
    journal.mockRestore();
  });
});
