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

  // M2 (revue finale SH-20) : une valeur qui ne contient que des séparateurs (",", " , ")
  // n'est pas vide au sens de `raw`, mais produit une liste vide après filtrage. Sans garde-fou,
  // enableCors({ origin: [] }) bloquerait TOUTES les origines sans le signaler (silencieux).
  it('refuse une valeur qui ne contient que des séparateurs (liste vide après filtrage)', () => {
    expect(() => resolveCorsOrigins(',')).toThrow(/aucune origine/i);
    expect(() => resolveCorsOrigins(' , , ')).toThrow(/aucune origine/i);
  });
});
