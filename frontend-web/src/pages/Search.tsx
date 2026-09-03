import { lazy, Suspense, useState } from 'react';
import { useMatchSearch } from '@/features/matching/useMatchSearch';
import { SearchFilters, type SearchCriteria } from '@/features/matching/SearchFilters';
import { SearchResultCard } from '@/features/matching/SearchResultCard';
import { CITIES } from '@/lib/cities';

// Leaflet (~55 kB gzip) est chargé PARESSEUSEMENT : il ne pèse ni sur le bundle initial
// ni sur les visiteurs qui ne lancent aucune recherche (éco-conception, SH-28).
const SearchMap = lazy(() =>
  import('@/features/matching/SearchMap').then((module) => ({ default: module.SearchMap })),
);

/**
 * Recherche de freelances par matching multicritères (SH-22) — écran recruteur.
 *
 * Ferme la boucle démo : compétences + lieu + rayon → scores triés par le
 * matching-service (via le proxy backend) → lien vers l'armurerie publique (SH-21b).
 */
export default function Search() {
  const search = useMatchSearch();

  // Périmètre réellement soumis (SH-23) : la carte doit refléter la RECHERCHE affichée,
  // pas l'état courant du formulaire (que l'utilisateur peut modifier sans relancer).
  // La carte est visible DÈS L'ARRIVÉE (SH-51), centrée sur la ville par défaut : le
  // recruteur voit son périmètre de mission avant sa première recherche, là où l'écran
  // s'ouvrait sur un vide. `SearchFilters` part des mêmes valeurs par défaut.
  const [submittedArea, setSubmittedArea] = useState<{
    lat: number;
    lon: number;
    radiusKm: number;
  }>({ lat: CITIES[0].lat, lon: CITIES[0].lon, radiusKm: 50 });
  // Fiche survolée côté liste (SH-46) : met en évidence le marqueur correspondant sur la carte.
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  function handleSearch(criteria: SearchCriteria) {
    search.reset();
    setSubmittedArea({ lat: criteria.lat, lon: criteria.lon, radiusKm: criteria.radiusKm });
    search.mutate(criteria);
  }

  let apiError: string | null = null;
  if (search.isError) {
    apiError =
      search.error.response?.status === 403
        ? 'Cette recherche est réservée aux recruteurs.'
        : 'Le service de matching est momentanément indisponible. Réessaie dans un instant.';
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {/* Barre de filtres pleine largeur */}
      <div className="border-hud-border bg-hud-card border-b p-4">
        <div className="mx-auto flex max-w-6xl flex-col gap-4">
          {/* Titre court (SH-51) : la phrase sur le score multicritères était du jargon
              interne et mangeait la hauteur utile au-dessus de la carte. Le détail du
              score reste lisible sur chaque carte de résultat, là où il a du sens. */}
          <h1 className="text-2xl font-bold tracking-widest text-white uppercase">
            Trouver un freelance
          </h1>

          <SearchFilters onSubmit={handleSearch} isPending={search.isPending} error={apiError} />
        </div>
      </div>

      {/* Split : liste à gauche, carte à droite. Sous 1024px, la carte passe SOUS la liste
          (Mobile-First, §6 du CLAUDE.md) — d'où flex-col lg:flex-row. */}
      <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
        <div className="border-hud-border w-full overflow-y-auto p-4 lg:w-96 lg:border-r">
          {search.isPending && (
            <p role="status" className="text-hud-muted">
              Calcul des scores de matching…
            </p>
          )}

          {search.isSuccess && search.data.length === 0 && (
            <p className="text-hud-muted border-hud-border rounded-lg border border-dashed p-10 text-center">
              Aucun freelance ne correspond à ces critères. Élargis le rayon ou retire des
              compétences.
            </p>
          )}

          {search.isSuccess && search.data.length > 0 && (
            <ul aria-label="Résultats de la recherche" className="flex flex-col gap-3">
              {search.data.map((result) => (
                <SearchResultCard
                  key={result.freelanceId}
                  result={result}
                  isHighlighted={highlightedId === result.freelanceId}
                  onHover={setHighlightedId}
                />
              ))}
            </ul>
          )}
        </div>

        {/* Répartition géographique (SH-23) : centre + rayon de mission + un marqueur
            par freelance localisé. Panneau plein cadre côté carte (SH-46). */}
        <div className="min-h-80 flex-1">
          <Suspense fallback={null}>
            <SearchMap
              center={{ lat: submittedArea.lat, lon: submittedArea.lon }}
              radiusKm={submittedArea.radiusKm}
              results={search.data ?? []}
              highlightedId={highlightedId}
            />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
