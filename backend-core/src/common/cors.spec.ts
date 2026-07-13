import { resolveCorsOrigins, DEFAULT_CORS_ORIGIN } from './cors';

describe('resolveCorsOrigins', () => {
  it('retombe sur l\'origine de dev quand CORS_ORIGIN est absent ou vide', () => {
    expect(resolveCorsOrigins(undefined)).toEqual([DEFAULT_CORS_ORIGIN]);
    expect(resolveCorsOrigins('   ')).toEqual([DEFAULT_CORS_ORIGIN]);
  });

  it('accepte plusieurs origines séparées par des virgules', () => {
    expect(resolveCorsOrigins('https://app.skillhunt.io, https://admin.skillhunt.io')).toEqual([
      'https://app.skillhunt.io',
      'https://admin.skillhunt.io',
    ]);
  });

  // Garde-fou : '*' + credentials est rejeté par le navigateur ET ouvrirait l'API
  // à n'importe quelle origine. On échoue au démarrage plutôt qu'en production (C2.2.3).
  it('refuse le joker "*"', () => {
    expect(() => resolveCorsOrigins('*')).toThrow(/joker/i);
  });
});
