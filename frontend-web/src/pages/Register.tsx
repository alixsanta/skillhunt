import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/useAuth';

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
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('Le mot de passe doit faire au moins 8 caractères.');
      return;
    }

    setSubmitting(true);
    try {
      // `register` enchaîne automatiquement le login : l'utilisateur arrive connecté.
      await register({ email, username, password, role });
      navigate('/mon-compte', { replace: true });
    } catch {
      setError('Inscription impossible. Cet email est peut-être déjà utilisé.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-4">
      <h1 className="text-2xl font-bold">Créer un compte</h1>

      <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-4" noValidate>
        <div className="flex flex-col gap-1">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-describedby={error ? 'register-error' : undefined}
            className="rounded-md border px-3 py-2"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="username">Nom d'utilisateur</label>
          <input
            id="username"
            required
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            className="rounded-md border px-3 py-2"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="password">Mot de passe</label>
          <input
            id="password"
            type="password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-describedby={error ? 'register-error' : undefined}
            className="rounded-md border px-3 py-2"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="role">Je suis</label>
          <select
            id="role"
            value={role}
            onChange={(event) => setRole(event.target.value as 'FREELANCE' | 'RECRUITER')}
            className="rounded-md border px-3 py-2"
          >
            {ROLES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {error && (
          <p id="register-error" role="alert" className="text-sm text-red-500">
            {error}
          </p>
        )}

        <Button type="submit" disabled={submitting}>
          Créer mon compte
        </Button>
      </form>

      <p className="text-muted-foreground text-sm">
        Déjà inscrit ?{' '}
        <Link to="/login" className="underline">
          Se connecter
        </Link>
      </p>
    </main>
  );
}
