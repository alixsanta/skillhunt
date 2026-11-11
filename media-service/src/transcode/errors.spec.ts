import { MESSAGE_ECHEC_GENERIQUE, TranscodeError, toTranscodeError } from './errors';

// C2.2.3 — Le message d'une erreur de transcodage finit affiché dans le portfolio. Ce
// fichier fige la garantie : rien d'interne n'y passe.
describe('toTranscodeError (SH-16b)', () => {
  it('laisse passer une TranscodeError telle quelle', () => {
    const origine = new TranscodeError('Fichier illisible.', 'ffprobe: moov atom not found');

    expect(toTranscodeError(origine)).toBe(origine);
  });

  it('enveloppe une erreur brute : message générique, cause conservée dans le détail', () => {
    // Le genre d'erreur qu'un SDK ou le système remonte, avec ses adresses et ses chemins.
    const brute = new Error('connect ECONNREFUSED 172.18.0.5:4566 /tmp/media/abc/master.mp4');

    const erreur = toTranscodeError(brute);

    expect(erreur.message).toBe(MESSAGE_ECHEC_GENERIQUE);
    expect(erreur.detail).toContain('ECONNREFUSED');
  });

  it('ne laisse AUCUN détail interne dans le message utilisateur', () => {
    const erreur = toTranscodeError(
      new Error('Command failed: ffprobe -hide_banner /tmp/media/abc/master.mp4 @ 0x7f312f676500'),
    );

    for (const interdit of ['/tmp', 'ffprobe', '0x', 'Command failed']) {
      expect(erreur.message).not.toContain(interdit);
    }
  });

  it("accepte ce qui n'est pas une Error sans lever", () => {
    // `throw 'chaîne'` et `throw undefined` existent dans le code tiers.
    expect(toTranscodeError('échec opaque').detail).toBe('échec opaque');
    expect(toTranscodeError(undefined).message).toBe(MESSAGE_ECHEC_GENERIQUE);
  });
});
