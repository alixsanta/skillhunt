import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describeIfFfmpeg, makeFixture } from '../test/fixture';
import { encodeRendition, extractPoster } from './encode';
import { TranscodeError } from './errors';

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

  // Relevé en RECETTE de bout en bout (SH-16b), et invisible sur une fixture de 2 s :
  // sans images-clés forcées, ffmpeg ne peut couper qu'aux images-clés de l'encodeur —
  // une toutes les 250 images par défaut, soit 10 s à 25 i/s. `-hls_time 4` restait
  // lettre morte et la vidéo sortait en segments de 10 s.
  describe('découpage en segments', () => {
    const DUREE = 10;
    const CIBLE = 4;

    async function dureesDesSegments(playlist: string): Promise<number[]> {
      return (await readFile(playlist, 'utf8'))
        .split('\n')
        .filter((ligne) => ligne.startsWith('#EXTINF:'))
        .map((ligne) => Number(ligne.slice('#EXTINF:'.length).replace(',', '')));
    }

    it('respecte la durée cible : aucun segment ne dépasse 4 secondes', async () => {
      const longue = await makeFixture(dir, { durationSeconds: DUREE });
      const sortie = join(dir, 'out');

      const playlist = await encodeRendition(longue, sortie, PISTE_360P);
      const durees = await dureesDesSegments(playlist);

      // 10 s en segments de 4 s : 4 + 4 + 2.
      expect(durees).toHaveLength(Math.ceil(DUREE / CIBLE));
      for (const duree of durees) {
        expect(duree).toBeLessThanOrEqual(CIBLE + 0.1);
      }
    }, 180_000);

    it('ALIGNE les segments entre deux pistes de définitions différentes', async () => {
      // La bascule de qualité d'un lecteur HLS suppose que le segment N couvre le MÊME
      // intervalle de temps dans toutes les pistes. Des images-clés forcées à des
      // instants fixes le garantissent quel que soit l'encodage.
      //
      // Limite honnête de ce test : la mire de synthèse n'a aucun changement de plan,
      // donc il ne reproduit pas le désalignement que provoquerait un contenu réel. Il
      // vérifie l'égalité des découpages ; c'est le test précédent qui échoue si les
      // images-clés forcées disparaissent.
      const longue = await makeFixture(dir, { durationSeconds: DUREE });
      const sortie = join(dir, 'out');

      const haute = await encodeRendition(longue, sortie, PISTE_360P);
      const basse = await encodeRendition(longue, sortie, {
        name: '180p',
        width: 320,
        height: 180,
        bandwidth: 400_000,
      });

      expect(await dureesDesSegments(basse)).toEqual(await dureesDesSegments(haute));
    }, 180_000);
  });

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
    ).rejects.toBeInstanceOf(TranscodeError);
  }, 120_000);

  it("garde la sortie d'erreur de ffmpeg dans le DÉTAIL, pas dans le message", async () => {
    // Deux exigences qui tirent en sens inverse, d'où les deux champs :
    //  - un « exit 1 » nu est inexploitable en supervision → le détail porte la cause ;
    //  - le message finit affiché dans le portfolio → il ne porte RIEN d'interne.
    const sortie = join(dir, 'out');

    const erreur = await encodeRendition(join(dir, 'inexistant.mp4'), sortie, PISTE_360P).then(
      () => null,
      (err: unknown) => err as TranscodeError,
    );

    expect(erreur).toBeInstanceOf(TranscodeError);
    expect(erreur?.detail).toMatch(/ffmpeg a échoué \(code \d+\)/);
    expect(erreur?.detail).toContain('inexistant.mp4');
    expect(erreur?.message).not.toContain('inexistant.mp4');
    expect(erreur?.message).not.toContain(dir);
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
