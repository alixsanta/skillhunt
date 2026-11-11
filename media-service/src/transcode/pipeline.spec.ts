import { access, copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describeIfFfmpeg, makeFixture } from '../test/fixture';
import { runPipeline } from './pipeline';
import type { MediaStorage } from '../storage/s3';

const JOB = {
  mediaId: '11111111-1111-1111-1111-111111111111',
  sourceKey: 'private/media/f-1/m-1/master.mp4',
  outputPrefix: 'private/media/f-1/m-1/hls/',
  posterKey: 'private/media/f-1/m-1/poster.jpg',
};

/**
 * Stockage simulé : il sert la fixture au téléchargement et MÉMORISE les clés écrites.
 *
 * Simulé et non réel, parce que c'est le PIPELINE qui est testé ici, pas S3. Le vrai
 * dépôt est exercé par la recette de bout en bout (tâche 8 du plan).
 */
function fakeStorage(fixturePath: string | null) {
  const written: string[] = [];

  const storage: MediaStorage = {
    async download(_key, destPath) {
      if (fixturePath === null) {
        throw new Error('objet absent du stockage');
      }
      await mkdir(dirname(destPath), { recursive: true });
      await copyFile(fixturePath, destPath);
    },
    async uploadTree(_localDir, keyPrefix) {
      written.push(`${keyPrefix}*`);
    },
    async uploadFile(_localPath, key) {
      written.push(key);
    },
  };

  return { storage, written };
}

describeIfFfmpeg('runPipeline (SH-16b)', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'sh-pipeline-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('rend un résultat complet et dépose poster puis pistes', async () => {
    const fixture = await makeFixture(dir);
    const { storage, written } = fakeStorage(fixture);

    const resultat = await runPipeline({ storage, tmpDir: join(dir, 'work') }, JOB);

    expect(resultat.durationSeconds).toBeGreaterThan(0);
    expect(resultat.width).toBe(640);
    expect(resultat.height).toBe(360);
    expect(resultat.type).toBe('VIDEO');
    expect(resultat.mimeType).toBe('video/mp4');
    expect(resultat.renditions.length).toBeGreaterThan(0);
    expect(written).toContain(JOB.posterKey);
    expect(written).toContain(`${JOB.outputPrefix}*`);
  }, 180_000);

  it('CONFINE chaque playlistKey dans le préfixe du job', async () => {
    // Exigence de SÉCURITÉ (C2.2.3), pas de cosmétique : une clé hors préfixe serait
    // signée par SH-17 et ouvrirait un accès au stockage d'un AUTRE freelance.
    const fixture = await makeFixture(dir);
    const { storage } = fakeStorage(fixture);

    const resultat = await runPipeline({ storage, tmpDir: join(dir, 'work') }, JOB);

    for (const piste of resultat.renditions) {
      expect(piste.playlistKey).toBe(`${JOB.outputPrefix}${piste.name}.m3u8`);
      expect(piste.playlistKey.startsWith(JOB.outputPrefix)).toBe(true);
    }
  }, 180_000);

  it("n'applique AUCUNE piste au-delà de la définition source", async () => {
    // La fixture est en 360p : une piste 720p ou 1080p signifierait que l'échelle ABR
    // a été contournée quelque part dans l'orchestration.
    const fixture = await makeFixture(dir);
    const { storage } = fakeStorage(fixture);

    const resultat = await runPipeline({ storage, tmpDir: join(dir, 'work') }, JOB);

    expect(resultat.renditions.every((p) => p.height <= 360)).toBe(true);
  }, 180_000);

  it('déduit video/quicktime d\'un master .mov', async () => {
    // Le monolithe n'accepte que `video/mp4` ou `video/quicktime` : un mimeType deviné
    // ailleurs ferait rejeter TOUT le résultat.
    const fixture = await makeFixture(dir);
    const { storage } = fakeStorage(fixture);

    const resultat = await runPipeline(
      { storage, tmpDir: join(dir, 'work') },
      { ...JOB, sourceKey: 'private/media/f-1/m-1/master.mov' },
    );

    expect(resultat.mimeType).toBe('video/quicktime');
  }, 180_000);

  it("refuse une extension de master inconnue plutôt que de deviner", async () => {
    const fixture = await makeFixture(dir);
    const { storage } = fakeStorage(fixture);

    await expect(
      runPipeline(
        { storage, tmpDir: join(dir, 'work') },
        { ...JOB, sourceKey: 'private/media/f-1/m-1/master.avi' },
      ),
    ).rejects.toThrow('Format de fichier non supporté.');
  }, 180_000);

  it('NETTOIE le temporaire même quand le transcodage échoue', async () => {
    // Sans ce nettoyage, un worker remplit son disque en quelques jobs ratés — et
    // l'incident se manifeste alors loin de sa cause.
    const pasUneVideo = join(dir, 'master.mp4');
    await writeFile(pasUneVideo, 'du texte, pas un flux vidéo');
    const { storage } = fakeStorage(pasUneVideo);
    const travail = join(dir, 'work');

    await expect(runPipeline({ storage, tmpDir: travail }, JOB)).rejects.toThrow();

    await expect(access(join(travail, JOB.mediaId))).rejects.toThrow();
  }, 180_000);

  it('NETTOIE le temporaire aussi en cas de succès', async () => {
    const fixture = await makeFixture(dir);
    const { storage } = fakeStorage(fixture);
    const travail = join(dir, 'work');

    await runPipeline({ storage, tmpDir: travail }, JOB);

    await expect(access(join(travail, JOB.mediaId))).rejects.toThrow();
  }, 180_000);

  it('rapporte une progression croissante et bornée entre 0 et 100', async () => {
    const fixture = await makeFixture(dir);
    const { storage } = fakeStorage(fixture);
    const avancees: number[] = [];

    await runPipeline(
      { storage, tmpDir: join(dir, 'work'), onProgress: (p) => avancees.push(p) },
      JOB,
    );

    expect(avancees.length).toBeGreaterThan(0);
    expect(avancees.every((p) => p >= 0 && p <= 100)).toBe(true);
    // Jamais décroissante : une barre qui reculerait est un bug d'arithmétique de
    // pondération, invisible autrement.
    expect(avancees).toEqual([...avancees].sort((a, b) => a - b));
    expect(avancees.at(-1)).toBe(100);
  }, 180_000);

  it("isole les jobs : le répertoire de travail porte l'identifiant du média", async () => {
    // `MEDIA_WORKER_CONCURRENCY > 1` fait tourner plusieurs jobs ensemble. Un
    // répertoire partagé les ferait se piétiner, et le nettoyage de l'un détruirait
    // le travail de l'autre.
    const fixture = await makeFixture(dir);
    const travail = join(dir, 'work');
    const vus: string[] = [];

    const { storage } = fakeStorage(fixture);
    const espionne: MediaStorage = {
      ...storage,
      async download(key, destPath) {
        vus.push(destPath);
        await storage.download(key, destPath);
      },
    };

    await runPipeline({ storage: espionne, tmpDir: travail }, JOB);

    expect(vus[0]).toContain(JOB.mediaId);
  }, 180_000);
});
