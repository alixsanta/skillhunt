import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { CATEGORY_META, GEAR_CATEGORIES, GEAR_STATUSES, STATUS_META } from './gear-meta';

describe("Métadonnées de l'Armurerie (SH-21a)", () => {
  it('couvre toutes les catégories de matériel du backend', () => {
    expect(GEAR_CATEGORIES).toEqual(['DRONE', 'CAMERA_360', 'ROBOTICS', 'SENSOR', 'OTHER']);
    for (const category of GEAR_CATEGORIES) {
      expect(CATEGORY_META[category].label).not.toHaveLength(0);
      // lucide-react (v1.23) exporte ses icônes en composants React.forwardRef : leur
      // `typeof` est 'object', pas 'function'. On vérifie donc la présence du composant ;
      // le typage `LucideIcon` garantit déjà qu'il s'agit d'une icône valide.
      expect(CATEGORY_META[category].Icon).toBeTruthy();
    }
  });

  it('couvre tous les statuts, chacun avec un libellé TEXTE (jamais la couleur seule — R6)', () => {
    expect(GEAR_STATUSES).toEqual(['VALIDATED', 'PENDING', 'REJECTED']);
    expect(STATUS_META.VALIDATED.label).toBe('VALIDÉ');
    expect(STATUS_META.PENDING.label).toBe('ATTENTE');
    expect(STATUS_META.REJECTED.label).toBe('REJETÉ');
  });
});

// Garde-fou de design (spec §3) : la palette vit dans les tokens Tailwind (src/index.css).
// Une couleur écrite en dur dans un composant échapperait au thème et pourrait, par exemple,
// réintroduire une couleur par catégorie — que la spec interdit explicitement.
describe("Palette de l'Armurerie — aucune couleur codée en dur", () => {
  const sources = [
    ...readdirSync(join(process.cwd(), 'src/features/gear'))
      .filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file))
      .map((file) => join('src/features/gear', file)),
  ];

  it.each(sources)("%s n'écrit aucune couleur hexadécimale", (source) => {
    const content = readFileSync(join(process.cwd(), source), 'utf8');
    expect(content).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});
