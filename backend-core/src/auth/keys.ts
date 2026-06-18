import { generateKeyPairSync } from 'crypto';

export interface JwtKeys {
  privateKey: string;
  publicKey: string;
  ephemeral: boolean; // true = paire générée au boot (dev), invalidée au redémarrage
}

// Accepte une clé fournie soit en PEM brut, soit encodée en base64 (pratique pour les variables d'env mono-ligne)
function decodeKey(raw: string): string {
  const value = raw.trim();
  if (value.includes('BEGIN')) {
    // PEM brut — on restaure les retours à la ligne échappés éventuels
    return value.replace(/\\n/g, '\n');
  }
  return Buffer.from(value, 'base64').toString('utf-8');
}

/**
 * Charge les clés RSA pour la signature JWT RS256 (C2.2.3).
 * Priorité aux variables d'environnement (aucun secret en dur dans le code, cf. CLAUDE.md §8).
 * À défaut (dev/local), génère une paire éphémère : les tokens ne survivent pas à un redémarrage.
 */
export function loadJwtKeys(): JwtKeys {
  const priv = process.env.JWT_PRIVATE_KEY;
  const pub = process.env.JWT_PUBLIC_KEY;

  if (priv && pub) {
    return { privateKey: decodeKey(priv), publicKey: decodeKey(pub), ephemeral: false };
  }

  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  return { privateKey, publicKey, ephemeral: true };
}
