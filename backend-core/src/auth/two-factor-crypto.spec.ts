import { encryptTwoFactorSecret, decryptTwoFactorSecret } from './two-factor-crypto';

/**
 * Chiffrement AES-256-GCM du secret TOTP (SH-40, C2.2.3) : le secret n'est JAMAIS
 * persisté en clair (CLAUDE.md §8-6). GCM = confidentialité + intégrité (tag d'auth).
 */
describe('two-factor-crypto — AES-256-GCM (SH-40)', () => {
  it('chiffre puis déchiffre un secret (aller-retour fidèle)', () => {
    const secret = 'JBSWY3DPEHPK3PXP';
    const encrypted = encryptTwoFactorSecret(secret);

    expect(encrypted).not.toContain(secret);
    expect(decryptTwoFactorSecret(encrypted)).toBe(secret);
  });

  it('produit un chiffré différent à chaque appel (IV aléatoire, pas de motif détectable)', () => {
    const secret = 'JBSWY3DPEHPK3PXP';
    expect(encryptTwoFactorSecret(secret)).not.toBe(encryptTwoFactorSecret(secret));
  });

  it("rejette un chiffré falsifié (le tag GCM garantit l'intégrité)", () => {
    const encrypted = encryptTwoFactorSecret('JBSWY3DPEHPK3PXP');
    const [iv, _data, tag] = encrypted.split('.');
    void _data; // le ciphertext d'origine est justement ce qu'on remplace
    const tampered = [iv, Buffer.from('falsifie-par-un-attaquant').toString('base64'), tag].join('.');

    expect(() => decryptTwoFactorSecret(tampered)).toThrow();
  });

  it('refuse une clé env qui ne fait pas 32 octets (AES-256 strict)', () => {
    const previous = process.env.TWO_FACTOR_ENCRYPTION_KEY;
    process.env.TWO_FACTOR_ENCRYPTION_KEY = Buffer.from('trop-courte').toString('base64');
    try {
      expect(() => encryptTwoFactorSecret('JBSWY3DPEHPK3PXP')).toThrow(/32 octets/);
    } finally {
      if (previous === undefined) {
        delete process.env.TWO_FACTOR_ENCRYPTION_KEY;
      } else {
        process.env.TWO_FACTOR_ENCRYPTION_KEY = previous;
      }
    }
  });
});
