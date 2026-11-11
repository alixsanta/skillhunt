import { useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth, type RegisterInput } from '@/features/auth/useAuth';
import { PASSWORD_RULES, isPasswordValid } from '@/features/auth/password-rules';
import { ROLE_LABELS } from '@/features/auth/role-labels';
import { CITIES } from '@/lib/cities';
import { getHomeRoute } from '@/features/navigation/home-route';

// ADMIN est volontairement absent : il n'est pas auto-attribuable (cf. SELF_ASSIGNABLE_ROLES backend).
// Les libellés viennent de ROLE_LABELS (SH-51) : seule source de traduction des rôles.
const ROLES = [
  { value: 'FREELANCE', label: ROLE_LABELS.FREELANCE },
  { value: 'RECRUITER', label: ROLE_LABELS.RECRUITER },
] as const;

export default function Register() {
  const { user, status, register } = useAuth();

  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [role, setRole] = useState<'FREELANCE' | 'RECRUITER'>('FREELANCE');
  const [cityName, setCityName] = useState(CITIES[0].name);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    // Validation stricte des entrées (C2.2.3) — mêmes règles que RegisterDto : un mot de
    // passe non conforme n'atteint jamais le réseau.
    if (!isPasswordValid(password)) {
      setError('Le mot de passe ne respecte pas toutes les règles indiquées.');
      return;
    }
    if (password !== passwordConfirm) {
      setError('Le mot de passe et sa confirmation ne correspondent pas.');
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
    } catch {
      setError('Inscription impossible. Cet email est peut-être déjà utilisé.');
    } finally {
      setSubmitting(false);
    }
  }

  // Tant que le refresh silencieux du démarrage est en vol, on ne conclut RIEN : décider sur
  // `user` seul (nul pendant la restauration) ferait clignoter le formulaire avant un saut vers
  // l'écran du rôle pour un utilisateur déjà connecté. Même approche que ProtectedRoute (SH-20),
  // pour une seule façon d'attendre la session dans toute l'application (SH-51).
  if (status === 'restoring') {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Chargement de votre session…</p>
      </main>
    );
  }

  // `register` enchaîne le login : dès que la session est ouverte, l'utilisateur part sur
  // l'écran de travail de son rôle plutôt que sur la fiche de son compte (SH-51).
  if (user) {
    return <Navigate to={getHomeRoute(user.role)} replace />;
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
              maxLength={50}
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

          {/* Les règles sont affichées ET cochées en direct : l'utilisateur n'apprend pas
              son erreur au moment de l'envoi. L'état est porté par l'`aria-label` de chaque
              item, seule source lue aussi bien par les lecteurs d'écran que par les tests (R6). */}
          <ul
            aria-label="Règles du mot de passe"
            className="text-hud-muted flex flex-col gap-1 text-xs"
          >
            {PASSWORD_RULES.map((regle) => {
              const respectee = regle.test(password);
              return (
                <li
                  key={regle.id}
                  aria-label={`${regle.label} : ${respectee ? 'respectée' : 'non respectée'}`}
                  className={respectee ? 'text-hud-positive' : undefined}
                >
                  {respectee ? '✓' : '•'} {regle.label}
                </li>
              );
            })}
          </ul>

          <div className="flex flex-col gap-1">
            <label htmlFor="password-confirm" className="text-white">
              Confirmation du mot de passe
            </label>
            <input
              id="password-confirm"
              type="password"
              required
              value={passwordConfirm}
              onChange={(event) => setPasswordConfirm(event.target.value)}
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
