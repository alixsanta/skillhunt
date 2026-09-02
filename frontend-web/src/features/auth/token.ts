import type { AuthUser } from './types';

/**
 * Décode le payload d'un access token JWT.
 *
 * ⚠️ AUCUNE signature n'est vérifiée ici, et c'est volontaire : ce décodage sert
 * UNIQUEMENT à l'affichage et au routage côté client (afficher un email, masquer une
 * entrée de menu). L'autorité reste exclusivement le serveur, qui vérifie la signature
 * RS256 dans son JwtAuthGuard. Aucune décision de sécurité ne repose sur cette fonction. (C2.2.3)
 */
export function decodeAccessToken(token: string): AuthUser | null {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }

  try {
    // base64url → base64 avant décodage
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(base64)) as Partial<AuthUser>;

    if (!payload.userId || !payload.email || !payload.role) {
      return null;
    }

    // `username` est repris s'il est présent, JAMAIS exigé : un token antérieur à SH-51
    // n'en a pas, et le rejeter fermerait la session au lieu de dégrader l'affichage.
    return {
      userId: payload.userId,
      email: payload.email,
      role: payload.role,
      username: payload.username,
    };
  } catch {
    return null;
  }
}
