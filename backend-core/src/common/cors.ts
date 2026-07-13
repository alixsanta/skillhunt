// Origine par défaut en développement : le serveur Vite du frontend-web.
export const DEFAULT_CORS_ORIGIN = 'http://localhost:5173';

/**
 * Résout la liste des origines autorisées à appeler l'API depuis un navigateur.
 *
 * Le joker '*' est INTERDIT : combiné à `credentials: true`, il est rejeté par les
 * navigateurs sur toute requête créditée (le front pose `withCredentials`), et il
 * exposerait l'API à n'importe quelle origine. Échouer au démarrage vaut mieux qu'une
 * faille silencieuse en production (C2.2.3).
 */
export function resolveCorsOrigins(rawValue?: string): string[] {
  const raw = (rawValue ?? '').trim();
  if (!raw) {
    return [DEFAULT_CORS_ORIGIN];
  }

  const origins = raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (origins.includes('*')) {
    throw new Error(
      'CORS_ORIGIN ne peut pas contenir le joker "*" : incompatible avec credentials:true et dangereux.',
    );
  }

  return origins;
}
