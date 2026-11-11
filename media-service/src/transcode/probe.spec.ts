import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describeIfFfmpeg, makeFixture } from '../test/fixture';
import { detectSpherical, probeVideo, type FfprobeOutput } from './probe';
import { TranscodeError } from './errors';

// ── Détection 360° : fonction PURE, donc testable sur les charges du TERRAIN ──────────
// Un vrai mp4 360° porte sa projection dans `side_data_list`, forme que ffmpeg ne sait
// pas synthétiser (cf. fixture.ts). La tester ici est le seul moyen de la couvrir.
describe('detectSpherical (SH-16b)', () => {
  it('détecte la forme des vrais mp4 360° : side_data « Spherical Mapping »', () => {
    // Charge calquée sur ce que ffprobe restitue d'un fichier portant les boîtes
    // st3d/sv3d du standard Google Spatial Media.
    const sortie: FfprobeOutput = {
      streams: [
        {
          codec_type: 'video',
          width: 3840,
          height: 1920,
          side_data_list: [{ side_data_type: 'Spherical Mapping', projection: 'equirectangular' }],
        },
      ],
      format: { duration: '12.5' },
    };

    expect(detectSpherical(sortie)).toBe(true);
  });

  it('détecte un tag de FLUX, quelle que soit la casse', () => {
    // Matroska restitue ses tags en majuscules ; un mov peut les rendre en minuscules.
    // Annotation nécessaire : sans elle, TypeScript infère une union de deux formes
    // dont chaque membre porte l'autre clé en `undefined`, incompatible avec l'index.
    const cas: Record<string, string>[] = [{ 'SPHERICAL-VIDEO': '1' }, { 'spherical-video': '1' }];

    for (const tags of cas) {
      expect(
        detectSpherical({ streams: [{ codec_type: 'video', width: 640, height: 360, tags }] }),
      ).toBe(true);
    }
  });

  it('détecte un tag de CONTENEUR', () => {
    expect(
      detectSpherical({
        streams: [{ codec_type: 'video', width: 640, height: 360 }],
        format: { tags: { PROJECTION: 'equirectangular' } },
      }),
    ).toBe(true);
  });

  it("ne voit rien sur une vidéo plate, même bien remplie", () => {
    // Le piège à éviter : un marqueur trop lâche qui verrait du 360° partout. `encoder`
    // et `handler_name` sont présents sur TOUTE vidéo produite par ffmpeg.
    expect(
      detectSpherical({
        streams: [
          {
            codec_type: 'video',
            width: 1920,
            height: 1080,
            tags: { language: 'und', handler_name: 'VideoHandler', encoder: 'Lavc63 libx264' },
            side_data_list: [],
          },
        ],
        format: { tags: { major_brand: 'isom', compatible_brands: 'isomiso2avc1mp41' } },
      }),
    ).toBe(false);
  });

  it('ne lève pas sur une sortie vide ou sans flux vidéo', () => {
    expect(detectSpherical({})).toBe(false);
    expect(detectSpherical({ streams: [{ codec_type: 'audio' }] })).toBe(false);
  });
});

// ── Sondage réel : exige ffprobe ─────────────────────────────────────────────────────
describeIfFfmpeg('probeVideo (SH-16b)', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'sh-probe-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('rend la durée et les dimensions réelles', async () => {
    const chemin = await makeFixture(dir);

    const resultat = await probeVideo(chemin);

    expect(resultat.width).toBe(640);
    expect(resultat.height).toBe(360);
    // 2 s demandées ; on tolère l'arrondi du conteneur sans accepter n'importe quoi.
    expect(resultat.durationSeconds).toBeGreaterThan(1.5);
    expect(resultat.durationSeconds).toBeLessThan(3);
  }, 60_000);

  it('ne voit AUCUNE projection sphérique sur une vidéo plate', async () => {
    const chemin = await makeFixture(dir);

    expect((await probeVideo(chemin)).spherical).toBe(false);
  }, 60_000);

  it('détecte la projection équirectangulaire de bout en bout', async () => {
    const chemin = await makeFixture(dir, { spherical: true });

    expect((await probeVideo(chemin)).spherical).toBe(true);
  }, 60_000);

  it("échoue explicitement sur un fichier qui n'est pas une vidéo", async () => {
    // Le dépôt a été vérifié par `head()` côté monolithe, mais un `Content-Type`
    // ANNONCÉ n'est pas une garantie de CONTENU : le worker reste juge (C2.2.3).
    const chemin = join(dir, 'pas-une-video.mp4');
    await writeFile(chemin, 'ceci est du texte, pas un flux vidéo');

    await expect(probeVideo(chemin)).rejects.toThrow();
  }, 60_000);

  it("n'expose NI commande NI chemin interne dans le message d'un fichier illisible", async () => {
    // Relevé en recette de bout en bout : ce message devient l'`errorReason` affiché
    // dans le portfolio. L'erreur brute de ffprobe y plaçait sa ligne de commande
    // complète, le chemin `/tmp/media/…` du conteneur et une adresse mémoire.
    const chemin = join(dir, 'pas-une-video.mp4');
    await writeFile(chemin, 'ceci est du texte, pas un flux vidéo');

    const erreur = await probeVideo(chemin).then(
      () => null,
      (err: unknown) => err as TranscodeError,
    );

    expect(erreur).toBeInstanceOf(TranscodeError);
    expect(erreur?.message).toBe("Fichier illisible : ce n'est pas une vidéo exploitable.");
    for (const interdit of ['ffprobe', 'Command failed', chemin, dir, '0x']) {
      expect(erreur?.message).not.toContain(interdit);
    }
    // La cause technique n'est pas perdue pour autant : elle part aux journaux.
    expect(erreur?.detail).toContain('ffprobe');
  }, 60_000);
});
