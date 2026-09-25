import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describeIfFfmpeg, makeFixture } from '../test/fixture';
import { encodeRendition, extractPoster } from './encode';

const PISTE_360P = { name: '360p', width: 640, height: 360, bandwidth: 800_000 };

describeIfFfmpeg('encodeRendition (SH-16b)', () => {
  let dir: string;
  let source: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'sh-encode-'));
    source = await makeFixture(dir);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('écrit une playlist CLOSE et ses segments', async () => {
    const sortie = join(dir, 'out');

    const playlist = await encodeRendition(source, sortie, PISTE_360P);

    expect(playlist).toBe(join(sortie, '360p.m3u8'));
    const contenu = await readFile(playlist, 'utf8');
    expect(contenu).toContain('#EXTM3U');
    // VOD et non direct : sans `#EXT-X-ENDLIST`, un lecteur attend indéfiniment la suite.
    expect(contenu).toContain('#EXT-X-ENDLIST');

    const segments = await readdir(join(sortie, '360p'));
    expect(segments.length).toBeGreaterThan(0);
    expect(segments.every((nom) => nom.endsWith('.ts'))).toBe(true);
  }, 120_000);

  it('référence les segments par un chemin RELATIF au sous-dossier de la piste', async () => {
    // SH-17 réécrira chaque ligne de segment en URL signée. Une playlist portant un
    // chemin ABSOLU du système de fichiers du worker rendrait cette réécriture fausse
    // ET fuiterait l'arborescence interne du conteneur.
    const sortie = join(dir, 'out');
    const playlist = await encodeRendition(source, sortie, PISTE_360P);

    const lignes = (await readFile(playlist, 'utf8'))
      .split('\n')
      .map((ligne) => ligne.trim())
      .filter((ligne) => ligne !== '' && !ligne.startsWith('#'));

    expect(lignes.length).toBeGreaterThan(0);
    for (const ligne of lignes) {
      expect(ligne).toMatch(/^360p\/seg-\d+\.ts$/);
    }
  }, 120_000);

  it('rapporte la progression en secondes encodées', async () => {
    const sortie = join(dir, 'out');
    const avancees: number[] = [];

    await encodeRendition(source, sortie, PISTE_360P, (secondes) => avancees.push(secondes));

    expect(avancees.length).toBeGreaterThan(0);
    expect(avancees.every((valeur) => Number.isFinite(valeur) && valeur >= 0)).toBe(true);
  }, 120_000);

  it("échoue sur une source illisible plutôt que d'écrire une playlist vide", async () => {
    const sortie = join(dir, 'out');

    await expect(
      encodeRendition(join(dir, 'inexistant.mp4'), sortie, PISTE_360P),
    ).rejects.toThrow(/ffmpeg a échoué/);
  }, 120_000);

  it("remonte un extrait de la sortie d'erreur de ffmpeg, pas seulement un code", async () => {
    // Un « exit 1 » nu est inexploitable en supervision comme en recette.
    const sortie = join(dir, 'out');

    await expect(
      encodeRendition(join(dir, 'inexistant.mp4'), sortie, PISTE_360P),
    ).rejects.toThrow(/inexistant\.mp4/);
  }, 120_000);
});

describeIfFfmpeg('extractPoster (SH-16b)', () => {
  let dir: string;
  let source: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'sh-poster-'));
    source = await makeFixture(dir);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('extrait une image non vide à t = 1 s', async () => {
    const poster = join(dir, 'poster.jpg');

    await extractPoster(source, poster, 2);

    expect((await stat(poster)).size).toBeGreaterThan(0);
  }, 120_000);

  it("retombe sur la première image quand la vidéo est plus courte qu'une seconde", async () => {
    // `-ss 1` sur une vidéo de 0,4 s ne rend AUCUNE image : ffmpeg sort en SUCCÈS avec
    // un fichier vide, et le portfolio afficherait une vignette cassée sans erreur.
    const poster = join(dir, 'poster-court.jpg');

    await extractPoster(source, poster, 0.4);

    expect((await stat(poster)).size).toBeGreaterThan(0);
  }, 120_000);
});
