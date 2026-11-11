import { describe, expect, it } from 'vitest';
import { getBrands, getModels } from './gear-catalog';
import { GEAR_CATEGORIES } from './gear-meta';

describe('Catalogue de matériel (SH-51)', () => {
  it('propose les marques de drones par ordre alphabétique', () => {
    const marques = getBrands('DRONE');
    expect(marques).toContain('DJI');
    expect([...marques]).toEqual([...marques].sort((a, b) => a.localeCompare(b, 'fr')));
  });

  it('propose les modèles de la marque choisie', () => {
    expect(getModels('DRONE', 'DJI')).toContain('Mavic 3 Enterprise');
  });

  it('retrouve la marque quelle que soit la casse saisie', () => {
    // Le champ est libre : l'utilisateur tape « dji » aussi bien que « DJI ».
    expect(getModels('DRONE', 'dji')).toEqual(getModels('DRONE', 'DJI'));
  });

  it('reste muet sur une marque inconnue plutôt que de lever', () => {
    expect(getModels('DRONE', 'Marque Confidentielle')).toEqual([]);
  });

  it('propose des marques partout sauf dans le fourre-tout', () => {
    for (const categorie of GEAR_CATEGORIES) {
      const marques = getBrands(categorie);
      if (categorie === 'OTHER') {
        // Sans catalogue par nature : la saisie y est toujours entièrement libre.
        expect(marques).toEqual([]);
        continue;
      }
      expect(marques.length).toBeGreaterThan(0);
      // Une marque annoncée sans aucun modèle serait une impasse pour l'utilisateur.
      for (const marque of marques) {
        expect(getModels(categorie, marque).length).toBeGreaterThan(0);
      }
    }
  });
});
