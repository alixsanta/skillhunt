import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth, type RegisterInput } from '@/features/auth/useAuth';
import { CITIES } from '@/lib/cities';

// ADMIN est volontairement absent : il n'est pas auto-attribuable (cf. SELF_ASSIGNABLE_ROLES backend).
const ROLES = [
  { value: 'FREELANCE', label: 'Freelance' },
  { value: 'RECRUITER', label: 'Recruteur' },
] as const;

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'FREELANCE' | 'RECRUITER'>('FREELANCE');
  const [cityName, setCityName] = useState(CITIES[0].name);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('Le mot de passe doit faire au moins 8 caractères.');
      return;
    }

    const input: RegisterInput = { email, username, password, role };
    if (role === 'FREELANCE') {
      // Position obligatoire pour un freelance (SH-34) : sans elle, il serait invisible
      // du matching par rayon. Champs latitude/longitude explicites, jamais [lon, lat].
      const city = CITIES.find((c) => c.name === cityName) ?? CITIES[0];
      input.location = { latitude: city.lat, longitude: city.lon };
    }

    setSubmitting(true);
    try {
      // `register` enchaîne automatiquement le login : l'utilisateur arrive connecté.
      await register(input);
      navigate('/mon-compte', { replace: true });
    } catch {
      setError('Inscription impossible. Cet email est peut-être déjà utilisé.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <div className="border-hud-border bg-hud-card flex w-full max-w-md flex-col items-center gap-6 rounded-xl border p-8">
        <h1 className="text-2xl font-bold text-white">Créer un compte</h1>

        <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-4" noValidate>
          <div className="flex flex-col gap-1">
            <label htmlFor="email" className="text-white">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              aria-describedby={error ? 'register-error' : undefined}
              className="border-hud-border bg-hud-card rounded-md border px-3 py-2 text-white"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="username" className="text-white">
              Nom d'utilisateur
            </label>
            <input
              id="username"
              required
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="border-hud-border bg-hud-card rounded-md border px-3 py-2 text-white"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="password" className="text-white">
              Mot de passe
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              aria-describedby={error ? 'register-error' : undefined}
              className="border-hud-border bg-hud-card rounded-md border px-3 py-2 text-white"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="role" className="text-white">
              Je suis
            </label>
            <select
              id="role"
              value={role}
              onChange={(event) => setRole(event.target.value as 'FREELANCE' | 'RECRUITER')}
              className="border-hud-border bg-hud-card rounded-md border px-3 py-2 text-white"
            >
              {ROLES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {role === 'FREELANCE' && (
            <div className="flex flex-col gap-1">
              <label htmlFor="city" className="text-white">
                Ville d'activité
              </label>
              <select
                id="city"
                value={cityName}
                onChange={(event) => setCityName(event.target.value)}
                aria-describedby="city-hint"
                className="border-hud-border bg-hud-card rounded-md border px-3 py-2 text-white"
              >
                {CITIES.map((city) => (
                  <option key={city.name} value={city.name}>
                    {city.name}
                  </option>
                ))}
              </select>
              <p id="city-hint" className="text-hud-muted text-xs">
                Ta position sert au matching par rayon d'action : sans elle, les recruteurs ne
                peuvent pas te trouver.
              </p>
            </div>
          )}

          {error && (
            <p id="register-error" role="alert" className="text-hud-rejected text-sm">
              {error}
            </p>
          )}

          <Button type="submit" disabled={submitting}>
            Créer mon compte
          </Button>
        </form>

        <p className="text-hud-muted text-sm">
          Déjà inscrit ?{' '}
          <Link to="/login" className="text-hud-positive underline">
            Se connecter
          </Link>
        </p>
      </div>
    </div>
  );
}
