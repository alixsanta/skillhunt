import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { CITIES } from '@/features/matching/cities';
import type { MatchResult } from '@/features/matching/types';
import { useMatchSearch } from '@/features/matching/useMatchSearch';

const inputClass =
  'border-hud-border bg-hud-card rounded-md border px-3 py-2 text-white ' +
  'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 outline-none';

/**
 * Recherche de freelances par matching multicritères (SH-22) — écran recruteur.
 *
 * Ferme la boucle démo : compétences + lieu + rayon → scores triés par le
 * matching-service (via le proxy backend) → lien vers l'armurerie publique (SH-21b).
 */
export default function Search() {
  const search = useMatchSearch();

  const [skillsRaw, setSkillsRaw] = useState('');
  const [cityName, setCityName] = useState(CITIES[0].name);
  const [radiusKm, setRadiusKm] = useState('50');
  const [clientError, setClientError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setClientError(null);
    search.reset();

    // Validation client (C2.2.3) : mêmes bornes que SearchMatchDto — évite un 400 assuré.
    const skills = skillsRaw
      .split(',')
      .map((skill) => skill.trim())
      .filter(Boolean);
    if (skills.length === 0) {
      setClientError('Renseigne au moins une compétence.');
      return;
    }
    const radius = Number(radiusKm);
    if (!Number.isFinite(radius) || radius < 1 || radius > 500) {
      setClientError('Le rayon doit être compris entre 1 et 500 km.');
      return;
    }

    const city = CITIES.find((c) => c.name === cityName) ?? CITIES[0];
    search.mutate({ skills, lat: city.lat, lon: city.lon, radiusKm: radius });
  }

  let apiError: string | null = null;
  if (search.isError) {
    apiError =
      search.error.response?.status === 403
        ? 'Cette recherche est réservée aux recruteurs.'
        : 'Le service de matching est momentanément indisponible. Réessaie dans un instant.';
  }

  return (
    <main className="bg-hud-bg min-h-screen p-4 lg:p-8">
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

        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-1">
            <label htmlFor="skills" className="text-white">
              Compétences recherchées (séparées par des virgules)
            </label>
            <input
              id="skills"
              value={skillsRaw}
              onChange={(event) => setSkillsRaw(event.target.value)}
              placeholder="pilotage drone, thermographie, inspection"
              className={inputClass}
            />
          </div>

          <div className="flex flex-wrap gap-4">
            <div className="flex min-w-48 flex-col gap-1">
              <label htmlFor="city" className="text-white">
                Lieu de mission
              </label>
              <select
                id="city"
                value={cityName}
                onChange={(event) => setCityName(event.target.value)}
                className={inputClass}
              >
                {CITIES.map((city) => (
                  <option key={city.name} value={city.name}>
                    {city.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex w-32 flex-col gap-1">
              <label htmlFor="radius" className="text-white">
                Rayon (km)
              </label>
              <input
                id="radius"
                type="number"
                min={1}
                max={500}
                value={radiusKm}
                onChange={(event) => setRadiusKm(event.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          {(clientError ?? apiError) && (
            <p role="alert" className="text-hud-rejected text-sm">
              {clientError ?? apiError}
            </p>
          )}

          <div className="flex">
            <Button type="submit" disabled={search.isPending}>
              Lancer la recherche
            </Button>
          </div>
        </form>

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
          <ul className="flex flex-col gap-3">
            {search.data.map((result) => (
              <SearchResult key={result.freelanceId} result={result} />
            ))}
          </ul>
        )}
      </div>
    </main>
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
