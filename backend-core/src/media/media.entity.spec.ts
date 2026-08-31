import { getMetadataArgsStorage } from 'typeorm';
import { Media } from './media.entity';

// C2.2.2 — Le schéma est une preuve : on vérifie les points dont dépend l'étanchéité
// (index sur freelanceId) et la file d'attente (index sur status), pas chaque colonne.
describe('entité Media', () => {
  it('cible la table user_media', () => {
    const table = getMetadataArgsStorage().tables.find((t) => t.target === Media);

    expect(table?.name).toBe('user_media');
  });

  it('indexe freelanceId et status', () => {
    const indexed = getMetadataArgsStorage()
      .indices.filter((index) => index.target === Media)
      .map((index) => index.columns);

    // NB : getMetadataArgsStorage() est le stockage BRUT (pré-build) : un @Index() posé
    // sur une relation @ManyToOne y référence le nom de PROPRIÉTÉ ('freelance'), pas le
    // nom de colonne physique donné par @JoinColumn ('freelanceId'). 'freelance' est un
    // sous-ensemble de 'freelanceId' : cette assertion reste vraie même si une version de
    // TypeORM venait à résoudre le nom de colonne. Le nom de colonne réel est vérifié en
    // base (Step 9 : `\d user_media`) et dans la migration (IDX_media_freelanceId).
    expect(JSON.stringify(indexed)).toContain('freelance');
    expect(JSON.stringify(indexed)).toContain('status');
  });

  it('déclare renditions en jsonb nullable', () => {
    const column = getMetadataArgsStorage().columns.find(
      (c) => c.target === Media && c.propertyName === 'renditions',
    );

    expect(column?.options.type).toBe('jsonb');
    expect(column?.options.nullable).toBe(true);
  });
});
