import { describe, expect, it } from 'vitest';
import { getHomeRoute } from './home-route';
import { NAV_ITEMS } from './nav-items';

describe('getHomeRoute (SH-51)', () => {
  it('mène le recruteur sur la recherche', () => {
    expect(getHomeRoute('RECRUITER')).toBe('/recherche');
  });

  it('mène le freelance sur son Armurerie', () => {
    expect(getHomeRoute('FREELANCE')).toBe('/mon-armurerie');
  });

  it("mène l'admin sur les messages, seul écran de son Lot 1", () => {
    expect(getHomeRoute('ADMIN')).toBe('/messages');
  });

  it("n'envoie jamais un rôle sur un écran que son RBAC lui refuse", () => {
    for (const role of ['FREELANCE', 'RECRUITER', 'ADMIN'] as const) {
      const autorisees = NAV_ITEMS[role].map((item) => item.to);
      expect(autorisees).toContain(getHomeRoute(role));
    }
  });
});
