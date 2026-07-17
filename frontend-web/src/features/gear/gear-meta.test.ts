/// <reference types="node" />
// Les types Node sont scopés à ce fichier de test (via la triple-slash directive
// ci-dessus) plutôt qu'ajoutés à `tsconfig.app.json` : le code applicatif ne doit
// jamais dépendre des types Node (il tourne dans le navigateur).
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
    // Chaque catégorie doit avoir SA PROPRE icône : la catégorie se distingue par
    // l'icône (jamais par une couleur, cf. commentaire de gear-meta.ts) — deux
    // catégories partageant la même icône seraient indiscernables à l'écran.
    expect(new Set(GEAR_CATEGORIES.map((c) => CATEGORY_META[c].Icon)).size).toBe(
      GEAR_CATEGORIES.length,
    );
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
// Étendu à src/pages/ (SH-44, item 1) : les PAGES de l'Armurerie (et les autres) doivent
// respecter le même contrat de thème que les composants de la feature.
describe("Palette de l'Armurerie — aucune couleur codée en dur", () => {
  const scanDirs = ['src/features/gear', 'src/features/gamification', 'src/pages'];
  const sources = scanDirs.flatMap((dir) =>
    readdirSync(join(process.cwd(), dir))
      .filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file))
      .map((file) => join(dir, file)),
  );

  it.each(sources)("%s n'écrit aucune couleur hexadécimale", (source) => {
    const content = readFileSync(join(process.cwd(), source), 'utf8');
    expect(content).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});
