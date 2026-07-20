/**
 * Villes proposées à la saisie d'une position (SH-22 : lieu de mission recruteur ;
 * SH-34 : ville d'activité du freelance à l'inscription).
 *
 * Décision de design (2026-07-16) : saisie du lieu par liste prédéfinie — Mapbox (SH-23)
 * est hors périmètre du MVP et des lat/lon bruts sont hostiles pour un non-expert.
 * Coordonnées : centres-villes, précision largement suffisante pour un rayon en km.
 */
export interface City {
  name: string;
  lat: number;
  lon: number;
}

export const CITIES: City[] = [
  { name: 'Paris', lat: 48.8566, lon: 2.3522 },
  { name: 'Marseille', lat: 43.2965, lon: 5.3698 },
  { name: 'Lyon', lat: 45.764, lon: 4.8357 },
  { name: 'Toulouse', lat: 43.6045, lon: 1.4442 },
  { name: 'Nice', lat: 43.7102, lon: 7.262 },
  { name: 'Nantes', lat: 47.2184, lon: -1.5536 },
  { name: 'Montpellier', lat: 43.6108, lon: 3.8767 },
  { name: 'Strasbourg', lat: 48.5734, lon: 7.7521 },
  { name: 'Bordeaux', lat: 44.8378, lon: -0.5792 },
  { name: 'Lille', lat: 50.6292, lon: 3.0573 },
  { name: 'Rennes', lat: 48.1173, lon: -1.6778 },
  { name: 'Grenoble', lat: 45.1885, lon: 5.7245 },
];
