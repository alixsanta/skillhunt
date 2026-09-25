import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describeIfFfmpeg, hasFfmpeg, makeFixture } from './fixture';

describe('hasFfmpeg (SH-16b)', () => {
  it('rend un booléen sans jamais lever', () => {
    // La détection est appelée au CHARGEMENT du module pour construire la garde : si
    // elle levait sur un poste sans ffmpeg, elle ferait tomber la suite entière au lieu
    // de la sauter.
    expect(typeof hasFfmpeg()).toBe('boolean');
  });
});

describeIfFfmpeg('makeFixture (SH-16b)', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'sh-fixture-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('génère un MP4 non vide', async () => {
    const chemin = await makeFixture(dir);

    const infos = await stat(chemin);
    expect(infos.size).toBeGreaterThan(0);
    expect(chemin.endsWith('fixture.mp4')).toBe(true);
  }, 60_000);

  it('génère une variante 360° distincte, en conteneur Matroska', async () => {
    const plat = await makeFixture(dir);
    const spherique = await makeFixture(dir, { spherical: true });

    // Deux fichiers DISTINCTS : sans quoi le test de détection 360° comparerait une
    // vidéo à elle-même et ne prouverait rien.
    expect(spherique).not.toBe(plat);
    // Matroska et non mp4 : le muxer mp4 jette les tags de projection (cf. fixture.ts).
    expect(spherique.endsWith('fixture-360.mkv')).toBe(true);
    expect((await stat(spherique)).size).toBeGreaterThan(0);
  }, 60_000);
});
