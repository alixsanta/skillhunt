import { lazy, Suspense, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import type { MatchResult } from '@/features/matching/types';
import { useMatchSearch } from '@/features/matching/useMatchSearch';
import { SearchFilters, type SearchCriteria } from '@/features/matching/SearchFilters';

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
  const [submittedArea, setSubmittedArea] = useState<{
    lat: number;
    lon: number;
    radiusKm: number;
  } | null>(null);

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
    <div className="p-4 lg:p-8">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-widest text-white uppercase">
            Recherche de freelances
          </h1>
          <p className="text-hud-muted text-sm">
            Score de matching multicritères : compétences, matériel validé et distance au lieu de
            mission.
          </p>
        </header>

        <SearchFilters onSubmit={handleSearch} isPending={search.isPending} error={apiError} />

        {search.isPending && (
          <p role="status" className="text-hud-muted">
            Calcul des scores de matching…
          </p>
        )}

        {search.isSuccess && search.data.length === 0 && (
          <p className="text-hud-muted border-hud-border bg-hud-card rounded-lg border border-dashed p-10 text-center">
            Aucun freelance ne correspond à ces critères. Élargis le rayon ou retire des
            compétences.
          </p>
        )}

        {search.isSuccess && search.data.length > 0 && (
          <>
            <ul className="flex flex-col gap-3">
              {search.data.map((result) => (
                <SearchResult key={result.freelanceId} result={result} />
              ))}
            </ul>

            {/* Répartition géographique (SH-23) : centre + rayon de mission + un marqueur
                par freelance localisé. */}
            {submittedArea && (
              <Suspense fallback={null}>
                <SearchMap
                  center={{ lat: submittedArea.lat, lon: submittedArea.lon }}
                  radiusKm={submittedArea.radiusKm}
                  results={search.data}
                />
              </Suspense>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function SearchResult({ result }: { result: MatchResult }) {
  return (
    <li className="bg-hud-card border-hud-border flex flex-wrap items-center gap-4 rounded-lg border p-4">
      <span className="min-w-0 flex-1">
        <span className="block truncate font-bold text-white">
          {result.username ?? 'Freelance'}
        </span>
        <span className="text-hud-muted block text-xs tracking-widest uppercase">
          {result.distanceKm} km
        </span>
      </span>

      {/* Le score reste lisible sans la couleur : libellé texte en clair (R6) */}
      <span className="text-hud-positive text-lg font-bold" aria-label="score de matching">
        {Math.round(result.score * 100)}&nbsp;%
      </span>

      <Button asChild>
        <Link to={`/freelances/${result.freelanceId}/armurerie`}>Voir l'armurerie</Link>
      </Button>
    </li>
  );
}
