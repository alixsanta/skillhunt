import { describe, expect, it } from 'vitest';
import { getDisplayName } from './display-name';
import type { AuthUser } from './types';

const base: AuthUser = { userId: 'u-1', email: 'marc.dupont@skillhunt.io', role: 'FREELANCE' };

describe('getDisplayName (SH-51)', () => {
  it("préfère le nom d'utilisateur quand le token le porte", () => {
    expect(getDisplayName({ ...base, username: 'PiloteJury' })).toBe('PiloteJury');
  });

  // Scénario 7 du ticket : les tokens émis AVANT cette évolution n'ont pas de `username`.
  // Sans repli, toute session ouverte au moment du déploiement serait fermée.
  it("se rabat sur la partie locale de l'email quand le token est antérieur", () => {
    expect(getDisplayName(base)).toBe('marc.dupont');
  });

  it('ignore un nom vide ou fait uniquement d’espaces', () => {
    expect(getDisplayName({ ...base, username: '   ' })).toBe('marc.dupont');
  });
});
