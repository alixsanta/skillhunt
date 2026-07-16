import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

/**
 * Chiffrement AES-256-GCM du secret TOTP au repos (SH-40, CLAUDE.md §8-6).
 *
 * GCM = confidentialité + intégrité (tag d'authentification : un chiffré falsifié est rejeté).
 * Format persisté : `iv.ciphertext.tag` (base64) — l'IV est aléatoire à chaque chiffrement.
 * La clé vient de TWO_FACTOR_ENCRYPTION_KEY (32 octets base64), distincte des clés RSA JWT.
 */

let ephemeralKey: Buffer | null = null;
let warnedEphemeral = false;

function loadTwoFactorKey(): Buffer {
  const raw = process.env.TWO_FACTOR_ENCRYPTION_KEY;
  if (raw) {
    const key = Buffer.from(raw.trim(), 'base64');
    if (key.length !== 32) {
      throw new Error(
        'TWO_FACTOR_ENCRYPTION_KEY doit contenir exactement 32 octets encodés en base64 (AES-256)',
      );
    }
    return key;
  }

  // Dev/local uniquement : clé éphémère (même philosophie que les clés JWT, keys.ts) —
  // les secrets 2FA chiffrés ne survivent pas à un redémarrage. À NE PAS utiliser en prod.
  if (!ephemeralKey) {
    ephemeralKey = randomBytes(32);
    if (!warnedEphemeral) {
      warnedEphemeral = true;
      console.warn(
        '⚠️  2FA : aucune clé fournie (TWO_FACTOR_ENCRYPTION_KEY). ' +
          'Clé AES-256 éphémère générée — les secrets TOTP seront illisibles au redémarrage.',
      );
    }
  }
  return ephemeralKey;
}

export function encryptTwoFactorSecret(plaintext: string): string {
  const key = loadTwoFactorKey();
  const iv = randomBytes(12); // taille de nonce recommandée pour GCM
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, ciphertext, tag].map((part) => part.toString('base64')).join('.');
}

export function decryptTwoFactorSecret(payload: string): string {
  const key = loadTwoFactorKey();
  const [iv, ciphertext, tag] = payload.split('.').map((part) => Buffer.from(part, 'base64'));
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
