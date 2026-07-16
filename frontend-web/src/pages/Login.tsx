import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/useAuth';

export default function Login() {
  const { login, verifyTwoFactor } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // Jeton d'étape 2FA (SH-40) : state ÉPHÉMÈRE du composant — jamais dans le store ni persisté.
  const [twoFactorToken, setTwoFactorToken] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Route d'origine mémorisée par ProtectedRoute, sinon l'accueil.
  const from = (location.state as { from?: string } | null)?.from ?? '/';

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    // Validation client en miroir du DTO backend — confort d'UX seulement :
    // le backend reste l'autorité (ValidationPipe global).
    if (password.length < 8) {
      setError('Le mot de passe doit faire au moins 8 caractères.');
      return;
    }

    setSubmitting(true);
    try {
      const outcome = await login(email, password);
      if (outcome.twoFactorRequired) {
        // Étape 2 : on bascule sur la saisie du code, sans session ouverte.
        setTwoFactorToken(outcome.twoFactorToken);
        return;
      }
      navigate(from, { replace: true });
    } catch {
      // Message générique : ne révèle pas si l'email existe (anti-énumération de comptes).
      setError('Email ou mot de passe incorrect.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerify(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!twoFactorToken) return;

    setSubmitting(true);
    try {
      await verifyTwoFactor(twoFactorToken, code.trim());
      navigate(from, { replace: true });
    } catch (err) {
      const status = (err as { response?: { status?: number } }).response?.status;
      setError(
        status === 429
          ? 'Trop de tentatives. Réessaie dans quelques minutes.'
          : 'Code de vérification invalide.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (twoFactorToken) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-4">
        <h1 className="text-2xl font-bold">Vérification en deux étapes</h1>
        <p className="text-muted-foreground max-w-sm text-center text-sm">
          Saisis le code à 6 chiffres de ton application d'authentification, ou un de tes codes de
          secours.
        </p>

        <form onSubmit={handleVerify} className="flex w-full max-w-sm flex-col gap-4" noValidate>
          <div className="flex flex-col gap-1">
            <label htmlFor="twofa-code">Code de vérification</label>
            <input
              id="twofa-code"
              autoComplete="one-time-code"
              inputMode="numeric"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              aria-describedby={error ? 'login-error' : undefined}
              className="rounded-md border px-3 py-2"
            />
          </div>

          {error && (
            <p id="login-error" role="alert" className="text-sm text-red-500">
              {error}
            </p>
          )}

          <Button type="submit" disabled={submitting}>
            Valider le code
          </Button>
        </form>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-4">
      <h1 className="text-2xl font-bold">Connexion</h1>

      <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-4" noValidate>
        <div className="flex flex-col gap-1">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-describedby={error ? 'login-error' : undefined}
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
            aria-describedby={error ? 'login-error' : undefined}
            className="rounded-md border px-3 py-2"
          />
        </div>

        {error && (
          <p id="login-error" role="alert" className="text-sm text-red-500">
            {error}
          </p>
        )}

        <Button type="submit" disabled={submitting}>
          Se connecter
        </Button>
      </form>

      <p className="text-muted-foreground text-sm">
        Pas encore de compte ?{' '}
        <Link to="/register" className="underline">
          Créer un compte
        </Link>
      </p>
    </main>
  );
}
