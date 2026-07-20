import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { CITIES } from '@/lib/cities';

const inputClass =
  'border-hud-border bg-hud-card rounded-md border px-3 py-2 text-white ' +
  'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 outline-none';

/** Critères validés côté client, prêts à être envoyés au matching-service (SH-22). */
export interface SearchCriteria {
  skills: string[];
  lat: number;
  lon: number;
  radiusKm: number;
}

interface SearchFiltersProps {
  onSubmit: (criteria: SearchCriteria) => void;
  isPending: boolean;
  error: string | null;
}

/**
 * Formulaire de recherche (SH-22) — extrait de `Search.tsx` (SH-46) pour préparer le
 * passage en split-view. Validation client inchangée (C2.2.3) : compétences non vides,
 * rayon entre 1 et 500 km, avant tout appel réseau.
 */
export function SearchFilters({ onSubmit, isPending, error }: SearchFiltersProps) {
  const [skillsRaw, setSkillsRaw] = useState('');
  const [cityName, setCityName] = useState(CITIES[0].name);
  const [radiusKm, setRadiusKm] = useState('50');
  const [clientError, setClientError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setClientError(null);

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
    onSubmit({ skills, lat: city.lat, lon: city.lon, radiusKm: radius });
  }

  return (
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

      {(clientError ?? error) && (
        <p role="alert" className="text-hud-rejected text-sm">
          {clientError ?? error}
        </p>
      )}

      <div className="flex">
        <Button type="submit" disabled={isPending}>
          Lancer la recherche
        </Button>
      </div>
    </form>
  );
}
