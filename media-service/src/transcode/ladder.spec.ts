import { selectLadder } from './ladder';

// C2.2.2 — Logique PURE : la règle métier de l'échelle ABR se teste sans binaire ni
// fixture vidéo. C'est la raison d'être de ce fichier séparé.
describe('selectLadder (SH-16b)', () => {
  it('produit les trois paliers pour une source 1080p', () => {
    const ladder = selectLadder(1920, 1080);

    expect(ladder.map((r) => r.name)).toEqual(['360p', '720p', '1080p']);
  });

  it("ne SUR-ÉCHANTILLONNE jamais : une source 720p s'arrête à 720p", () => {
    // Inventer un 1080p depuis un 720p coûte du CPU et du stockage pour une qualité
    // qui n'existe pas dans la source. C'est ce test qui l'interdit.
    const ladder = selectLadder(1280, 720);

    expect(ladder.map((r) => r.name)).toEqual(['360p', '720p']);
    expect(ladder.every((r) => r.height <= 720)).toBe(true);
  });

  it('rend au moins une piste pour une source plus petite que le premier palier', () => {
    // Zéro piste ferait rejeter tout le résultat par le validateur du monolithe :
    // `renditions` doit être un tableau NON VIDE de pistes valides.
    const ladder = selectLadder(320, 240);

    expect(ladder).toHaveLength(1);
    expect(ladder[0]).toMatchObject({ name: '240p', width: 320, height: 240 });
  });

  it("préserve le rapport d'aspect : un 4:3 de 1440x1080 donne du 960x720", () => {
    // Reprendre la largeur du palier (1280) étirerait l'image en 16:9.
    const ladder = selectLadder(1440, 1080);

    expect(ladder.find((r) => r.name === '720p')).toMatchObject({ width: 960, height: 720 });
  });

  // libx264 en yuv420p REFUSE les dimensions impaires, et l'échec tomberait APRÈS le
  // téléchargement du master — au pire moment. Les deux cas ci-dessous sont choisis
  // pour produire réellement un arrondi impair sans le garde-fou : une première
  // rédaction utilisait 1001x563, dont aucun palier ne tombe sur un impair, et le test
  // passait même en neutralisant l'arrondi. Vérifié par sabotage.
  it.each([
    // Palier 360p : 990 × 360 / 563 = 633,04 → 633, impair.
    { source: [990, 563], attendu: '360p' },
    // Repli sous le premier palier : les deux dimensions natives sont impaires.
    { source: [321, 241], attendu: 'repli natif' },
  ])('rend des dimensions PAIRES ($attendu)', ({ source }) => {
    const ladder = selectLadder(source[0], source[1]);

    expect(ladder.length).toBeGreaterThan(0);
    for (const rendition of ladder) {
      expect(rendition.width % 2).toBe(0);
      expect(rendition.height % 2).toBe(0);
    }
  });

  it('attribue un débit croissant avec la définition', () => {
    const ladder = selectLadder(1920, 1080);
    const bandwidths = ladder.map((r) => r.bandwidth);

    expect(bandwidths).toEqual([...bandwidths].sort((a, b) => a - b));
    expect(bandwidths.every((b) => Number.isInteger(b) && b > 0)).toBe(true);
  });

  it('rend des entiers positifs partout : le monolithe rejette tout le reste', () => {
    // `estEntierPositif` côté backend-core refuse le fractionnaire et le négatif.
    for (const [w, h] of [
      [1920, 1080],
      [1001, 563],
      [320, 240],
      [3840, 2160],
    ]) {
      for (const rendition of selectLadder(w, h)) {
        expect(Number.isInteger(rendition.width)).toBe(true);
        expect(Number.isInteger(rendition.height)).toBe(true);
        expect(Number.isInteger(rendition.bandwidth)).toBe(true);
        expect(rendition.width).toBeGreaterThan(0);
        expect(rendition.height).toBeGreaterThan(0);
        expect(rendition.bandwidth).toBeGreaterThan(0);
      }
    }
  });

  it('garde un nom de 32 caractères au plus : la borne du validateur', () => {
    for (const rendition of selectLadder(3840, 2160)) {
      expect(rendition.name.length).toBeGreaterThan(0);
      expect(rendition.name.length).toBeLessThanOrEqual(32);
    }
  });

  it('rejette des dimensions source absurdes plutôt que de les deviner', () => {
    expect(() => selectLadder(0, 1080)).toThrow(/dimensions/i);
    expect(() => selectLadder(1920, -1)).toThrow(/dimensions/i);
    expect(() => selectLadder(Number.NaN, 1080)).toThrow(/dimensions/i);
  });
});
