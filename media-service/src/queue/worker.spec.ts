import { copyFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { Job } from 'bullmq';
import { processTranscodeJob, type TranscodeJobData } from './worker';
import type { MediaStorage } from '../storage/s3';
import { MESSAGE_ECHEC_GENERIQUE, TranscodeError } from '../transcode/errors';
import { describeIfFfmpeg, makeFixture } from '../test/fixture';

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
    ).rejects.toThrow('Le fichier déposé est introuvable en stockage.');

    expect(vus).toEqual([DONNEES.sourceKey]);
  });

  it("ne laisse sortir AUCUN détail interne dans l'erreur d'un job", async () => {
    // Le message de cette erreur devient le `failedReason` BullMQ, puis l'`errorReason`
    // que le portfolio affiche tel quel (C2.2.3). Relevé en recette de bout en bout.
    const storage: MediaStorage = {
      async download() {
        throw new Error('connect ECONNREFUSED 172.18.0.5:4566 — /tmp/media/secret/master.mp4');
      },
      async uploadTree() {},
      async uploadFile() {},
    };

    const erreur = await processTranscodeJob(fauxJob([]), { storage, tmpDir: dir }).then(
      () => null,
      (err: unknown) => err as TranscodeError,
    );

    expect(erreur).toBeInstanceOf(TranscodeError);
    for (const interdit of ['ECONNREFUSED', '172.18', '/tmp', 'private/media', DONNEES.sourceKey]) {
      expect(erreur?.message).not.toContain(interdit);
    }
    // La cause n'est pas perdue : elle reste disponible pour les journaux.
    expect(erreur?.detail).toContain('ECONNREFUSED');
  });

  it("ne fait PAS échouer le transcodage quand la progression ne s'écrit pas", async () => {
    // Perdre des minutes de calcul pour un détail de supervision serait absurde : un
    // `updateProgress` en échec est journalisé, jamais propagé.
    //
    // Le téléchargement RÉUSSIT (sans rien écrire), pour que le pipeline atteigne son
    // premier point de progression. Une première rédaction faisait échouer le
    // téléchargement : la progression n'était alors jamais appelée, et le test ne
    // prouvait rien.
    let tentatives = 0;
    const job = {
      id: '42',
      data: DONNEES,
      updateProgress: async () => {
        tentatives += 1;
        throw new Error('Redis indisponible');
      },
    } as unknown as Job<TranscodeJobData>;

    const storage: MediaStorage = {
      async download() {},
      async uploadTree() {},
      async uploadFile() {},
    };

    // L'échec attendu est celui du SONDAGE (aucun fichier n'a été écrit), pas celui de
    // la progression — qui, elle, a bien été tentée.
    await expect(processTranscodeJob(job, { storage, tmpDir: dir })).rejects.toThrow(
      /Fichier illisible/,
    );
    expect(tentatives).toBeGreaterThan(0);
  });
});

// Le cas qui exerce le POINT DE PASSAGE UNIQUE du worker : une erreur que rien n'enveloppe
// en dessous de lui. Un refus de dépôt S3 est le plus réaliste, et son message brut porte
// le bucket, la clé et un identifiant de requête. Il faut un vrai transcodage pour
// atteindre l'étape de dépôt, d'où la garde ffmpeg.
describeIfFfmpeg('processTranscodeJob — erreur brute du dépôt (SH-16b)', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'sh-worker-depot-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('remplace le message brut du stockage par le message générique', async () => {
    const fixture = await makeFixture(dir);
    const brut = 'AccessDenied: s3://skillhunt-media/private/media/f1/m1/poster.jpg RequestId=9F2C';

    const storage: MediaStorage = {
      async download(_key, destPath) {
        await mkdir(dirname(destPath), { recursive: true });
        await copyFile(fixture, destPath);
      },
      async uploadTree() {},
      async uploadFile() {
        throw new Error(brut);
      },
    };

    const erreur = await processTranscodeJob(fauxJob([]), {
      storage,
      tmpDir: join(dir, 'work'),
    }).then(
      () => null,
      (err: unknown) => err as TranscodeError,
    );

    expect(erreur).toBeInstanceOf(TranscodeError);
    expect(erreur?.message).toBe(MESSAGE_ECHEC_GENERIQUE);
    for (const interdit of ['AccessDenied', 's3://', 'private/media', 'RequestId']) {
      expect(erreur?.message).not.toContain(interdit);
    }
    expect(erreur?.detail).toBe(brut);
  }, 180_000);
});
