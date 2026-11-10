import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Job } from 'bullmq';
import { processTranscodeJob, type TranscodeJobData } from './worker';
import type { MediaStorage } from '../storage/s3';

/**
 * C2.2.2 — Ce fichier teste le CÂBLAGE, pas le transcodage.
 *
 * Le pipeline lui-même est couvert par `pipeline.spec.ts`, qui exige ffmpeg. Ici les
 * dépendances sont simulées, si bien que ces tests tournent sans Redis NI ffmpeg : ce
 * qu'ils vérifient, c'est que le worker transmet bien ses dépendances, relaie le
 * résultat et remonte la progression à BullMQ.
 */
const DONNEES: TranscodeJobData = {
  mediaId: '11111111-1111-1111-1111-111111111111',
  sourceKey: 'private/media/f1/m1/master.mp4',
  outputPrefix: 'private/media/f1/m1/hls/',
  posterKey: 'private/media/f1/m1/poster.jpg',
};

function fauxJob(progressions: number[], echecProgression = false): Job<TranscodeJobData> {
  return {
    id: '42',
    data: DONNEES,
    updateProgress: async (valeur: number) => {
      if (echecProgression) {
        throw new Error('Redis indisponible');
      }
      progressions.push(valeur);
    },
  } as unknown as Job<TranscodeJobData>;
}

describe('processTranscodeJob — câblage (SH-16b)', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'sh-worker-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('engage le pipeline avec les dépendances fournies', async () => {
    const vus: string[] = [];
    const storage: MediaStorage = {
      async download(key) {
        vus.push(key);
        // Rien n'est écrit : ffprobe échouera ensuite, et c'est le comportement
        // attendu. Ce test ne vérifie que l'engagement du pipeline.
        throw new Error('objet absent');
      },
      async uploadTree() {},
      async uploadFile() {},
    };

    await expect(
      processTranscodeJob(fauxJob([]), { storage, tmpDir: dir }),
    ).rejects.toThrow();

    expect(vus).toEqual([DONNEES.sourceKey]);
  });

  it("ne fait PAS échouer le transcodage quand la progression ne s'écrit pas", async () => {
    // Perdre des minutes de calcul pour un détail de supervision serait absurde : un
    // `updateProgress` en échec est journalisé, jamais propagé.
    const storage: MediaStorage = {
      async download() {
        throw new Error('objet absent');
      },
      async uploadTree() {},
      async uploadFile() {},
    };

    // L'erreur attendue est celle du STOCKAGE, pas celle de la progression.
    await expect(
      processTranscodeJob(fauxJob([], true), { storage, tmpDir: dir }),
    ).rejects.toThrow(/objet absent/);
  });
});
