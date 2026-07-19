import { Link } from 'react-router-dom';
import { Circle, CircleMarker, MapContainer, Popup, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import type { MatchResult } from './types';

interface SearchMapProps {
  center: { lat: number; lon: number };
  radiusKm: number;
  results: MatchResult[];
  /** Freelance dont la fiche de résultat est survolée (SH-46) : agrandit son marqueur. */
  highlightedId?: string | null;
}

/** Zoom heuristique pour que le cercle de mission tienne dans la vue. */
function zoomForRadius(radiusKm: number): number {
  if (radiusKm <= 15) return 11;
  if (radiusKm <= 60) return 9;
  if (radiusKm <= 150) return 8;
  return 6;
}

/**
 * Carte des résultats de recherche (SH-23) — Leaflet + OpenStreetMap.
 *
 * Décision actée (2026-07-16) : zéro token, zéro coût, cohérent avec « PostGIS plutôt
 * qu'une API carto payante » (CLAUDE.md §3). Marqueurs en SVG (`CircleMarker`) stylés par
 * className + tokens CSS (`index.css`) : aucun asset d'icône Leaflet, aucune couleur en dur.
 * Un freelance sans position (donnée d'avant SH-34) n'a simplement pas de marqueur.
 */
export function SearchMap({ center, radiusKm, results, highlightedId }: SearchMapProps) {
  const located = results.filter(
    (result): result is MatchResult & { latitude: number; longitude: number } =>
      result.latitude !== null && result.longitude !== null,
  );

  return (
    // h-full : en split-view (SH-46) cette carte remplit tout le panneau de droite, dont
    // la hauteur résolue vient du conteneur flex parent (voir Search.tsx) — Leaflet a
    // besoin d'une hauteur réelle sur toute la chaîne, jamais d'une valeur fixe en dur.
    <div className="border-hud-border h-full overflow-hidden rounded-lg border">
      <MapContainer
        center={[center.lat, center.lon]}
        zoom={zoomForRadius(radiusKm)}
        scrollWheelZoom={false}
        style={{ height: '100%' }}
      >
        <TileLayer
          attribution='&copy; les contributeurs <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Rayon de mission : le périmètre réellement interrogé (PostGIS, SH-13) */}
        <Circle
          center={[center.lat, center.lon]}
          radius={radiusKm * 1000}
          pathOptions={{ className: 'map-mission-radius' }}
        />

        {located.map((result) => {
          const isHighlighted = result.freelanceId === highlightedId;
          return (
            <CircleMarker
              // La clé inclut l'état de survol (C2.2.3 — pas de bug silencieux) : Leaflet
              // n'applique `pathOptions.className` qu'à la CRÉATION du <path> SVG (son
              // `setStyle` interne ne touche que stroke/fill, jamais l'attribut `class`).
              // Sans ce changement de clé, la classe `--highlighted` ne s'appliquerait
              // jamais après le premier rendu — on force donc un remount du marqueur.
              key={`${result.freelanceId}-${isHighlighted ? 'highlighted' : 'default'}`}
              center={[result.latitude, result.longitude]}
              radius={isHighlighted ? 14 : 10}
              pathOptions={{
                className: isHighlighted
                  ? 'map-freelance-marker map-freelance-marker--highlighted'
                  : 'map-freelance-marker',
              }}
            >
              <Popup>
                <span className="block font-bold">
                  {result.username ?? 'Freelance'} — {Math.round(result.score * 100)} %
                </span>
                <Link to={`/freelances/${result.freelanceId}/armurerie`}>Voir l'armurerie</Link>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
}
