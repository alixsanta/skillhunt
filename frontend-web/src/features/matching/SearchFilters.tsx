import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { CITIES } from '@/lib/cities';
import { SKILL_SUGGESTIONS } from './skill-suggestions';

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
  const [skills, setSkills] = useState<string[]>([]);
  const [skillDraft, setSkillDraft] = useState('');
  const [cityName, setCityName] = useState(CITIES[0].name);
  const [radiusKm, setRadiusKm] = useState('50');
  const [clientError, setClientError] = useState<string | null>(null);

  function toggleSkill(skill: string) {
    setSkills((courantes) =>
      courantes.includes(skill)
        ? courantes.filter((valeur) => valeur !== skill)
        : [...courantes, skill],
    );
  }

  function addDraftSkill() {
    const skill = skillDraft.trim().toLowerCase();
    if (skill === '' || skills.includes(skill)) return;
    setSkills((courantes) => [...courantes, skill]);
    setSkillDraft('');
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setClientError(null);

    // Validation client (C2.2.3) : mêmes bornes que SearchMatchDto — évite un 400 assuré.
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
      {/* Puces à bascule (SH-51) : de vrais <button> porteurs d'`aria-pressed`, pas des
          <div> cliquables — l'état est ainsi audible et la navigation au clavier native. */}
      <div className="flex flex-col gap-2">
        <span className="text-white" id="skills-legende">
          Compétences recherchées
        </span>
        <div className="flex flex-wrap gap-2" role="group" aria-labelledby="skills-legende">
          {[...SKILL_SUGGESTIONS, ...skills.filter((s) => !SKILL_SUGGESTIONS.includes(s))].map(
            (skill) => {
              const active = skills.includes(skill);
              return (
                <button
                  key={skill}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleSkill(skill)}
                  className={
                    active
                      ? 'bg-hud-positive/15 border-hud-positive text-hud-positive rounded-full border px-3 py-1 text-sm font-bold'
                      : 'border-hud-border bg-hud-card text-hud-muted hover:text-white rounded-full border px-3 py-1 text-sm'
                  }
                >
                  {skill}
                </button>
              );
            },
          )}
        </div>

        <div className="flex gap-2">
          <input
            id="skill-draft"
            aria-label="Ajouter une compétence"
            value={skillDraft}
            onChange={(event) => setSkillDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                // Empêche la soumission du formulaire : Entrée ajoute la compétence.
                event.preventDefault();
                addDraftSkill();
              }
            }}
            placeholder="Autre compétence…"
            className={`${inputClass} flex-1`}
          />
          <Button type="button" variant="outline" onClick={addDraftSkill}>
            Ajouter
          </Button>
        </div>
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

        <div className="flex min-w-56 flex-1 flex-col gap-1">
          {/* La valeur figure DANS le libellé : elle est ainsi annoncée à chaque
              déplacement du curseur, sans région live supplémentaire (R6). */}
          <label htmlFor="radius" className="text-white">
            Rayon de mission — {radiusKm} km
          </label>
          <input
            id="radius"
            type="range"
            min={1}
            max={500}
            step={1}
            value={radiusKm}
            onChange={(event) => setRadiusKm(event.target.value)}
            className="accent-hud-positive mt-3"
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
