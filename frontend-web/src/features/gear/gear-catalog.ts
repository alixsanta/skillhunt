import type { GearCategory } from './types';

/**
 * Catalogue d'aide à la saisie du matériel (SH-51).
 *
 * Il ASSISTE, il ne contraint jamais : `AddGear` accepte toujours une marque et un modèle
 * absents de cette table, et `AddGearDto` côté backend est inchangé. Contraindre la liste
 * rendrait indéclarable tout matériel légitime qui n'y figure pas.
 *
 * Enjeu : la donnée du Gear Locker alimente le score de matching, cœur différenciant du
 * produit. Saisie librement, elle produit des doublons orthographiques (« dji », « D.J.I »,
 * « Dji ») qui fragmentent les correspondances.
 *
 * `Record<GearCategory, …>` rend la table exhaustive : une catégorie ajoutée côté backend
 * casse la compilation ici plutôt que d'arriver sans aucune suggestion.
 */
export const GEAR_CATALOG: Record<GearCategory, Record<string, readonly string[]>> = {
  DRONE: {
    DJI: ['Mavic 3 Enterprise', 'Matrice 350 RTK', 'Matrice 30T', 'Mini 4 Pro', 'Avata 2'],
    Parrot: ['Anafi USA', 'Anafi Ai'],
    Autel: ['EVO II Dual 640T', 'EVO Max 4T'],
    Skydio: ['X10', 'S2+'],
  },
  CAMERA_360: {
    Insta360: ['X4', 'ONE RS 1-Inch 360', 'Pro 2', 'Titan'],
    GoPro: ['MAX', 'Fusion'],
    Ricoh: ['Theta X', 'Theta Z1'],
    Kandao: ['Obsidian Pro', 'QooCam 8K'],
  },
  ROBOTICS: {
    'Boston Dynamics': ['Spot', 'Stretch'],
    Unitree: ['Go2', 'B2', 'H1'],
    ANYbotics: ['ANYmal D'],
    Clearpath: ['Husky A300', 'Jackal'],
  },
  SENSOR: {
    FLIR: ['Vue Pro R', 'Duo Pro R', 'Tau 2'],
    Teledyne: ['Micasense RedEdge-P', 'Altum-PT'],
    YellowScan: ['Mapper+', 'Surveyor Ultra'],
    Velodyne: ['Puck VLP-16', 'Ultra Puck'],
  },
  // Catégorie fourre-tout : par nature sans catalogue, la saisie y est toujours libre.
  OTHER: {},
};

export function getBrands(category: GearCategory): string[] {
  return Object.keys(GEAR_CATALOG[category]).sort((a, b) => a.localeCompare(b, 'fr'));
}

export function getModels(category: GearCategory, brand: string): readonly string[] {
  // Comparaison insensible à la casse : le champ étant libre, « dji » doit retrouver « DJI ».
  const recherche = brand.trim().toLowerCase();
  const trouvee = Object.entries(GEAR_CATALOG[category]).find(
    ([nom]) => nom.toLowerCase() === recherche,
  );
  return trouvee ? trouvee[1] : [];
}
