import { decodeAccessToken } from './token';

// Fabrique un JWT factice : seule la partie payload nous intéresse (on ne vérifie
// aucune signature côté client — c'est le rôle exclusif du serveur).
function fakeJwt(payload: Record<string, unknown>): string {
  const encode = (value: object) => btoa(JSON.stringify(value)).replace(/=+$/, '');
  return `${encode({ alg: 'RS256' })}.${encode(payload)}.signature-non-verifiee`;
}

describe('decodeAccessToken', () => {
  it('extrait l\'identité du payload', () => {
    const token = fakeJwt({
      userId: 'u-1',
      email: 'pilote@skillhunt.io',
      role: 'FREELANCE',
      type: 'access',
    });

    expect(decodeAccessToken(token)).toEqual({
      userId: 'u-1',
      email: 'pilote@skillhunt.io',
      role: 'FREELANCE',
    });
  });

  it('renvoie null sur un token malformé', () => {
    expect(decodeAccessToken('pas-un-jwt')).toBeNull();
    expect(decodeAccessToken('a.b.c')).toBeNull();
  });

  it('renvoie null si le payload est incomplet', () => {
    expect(decodeAccessToken(fakeJwt({ userId: 'u-1' }))).toBeNull();
  });
});
