import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/useAuth';
import { getHomeRoute } from '@/features/navigation/home-route';

export default function Login() {
  const { user, login, verifyTwoFactor } = useAuth();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // Jeton d'étape 2FA (SH-40) : state ÉPHÉMÈRE du composant — jamais dans le store ni persisté.
  const [twoFactorToken, setTwoFactorToken] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Route d'origine mémorisée par ProtectedRoute, sinon l'écran du rôle (SH-51).
  const from = (location.state as { from?: string } | null)?.from ?? null;

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

  // Redirection PAR RENDU une fois la session ouverte (SH-51). Un `navigate()` dans le
  // gestionnaire de soumission lirait un `user` périmé — la closure est capturée avant
  // qu'AuthProvider n'ait renseigné la session.
  if (user) {
    return <Navigate to={from ?? getHomeRoute(user.role)} replace />;
  }

  if (twoFactorToken) {
    return (
      <div className="flex flex-1 items-center justify-center p-4">
        <div className="border-hud-border bg-hud-card flex w-full max-w-md flex-col items-center gap-6 rounded-xl border p-8">
          <h1 className="text-2xl font-bold text-white">Vérification en deux étapes</h1>
          <p className="text-hud-muted max-w-sm text-center text-sm">
            Saisis le code à 6 chiffres de ton application d'authentification, ou un de tes codes de
            secours.
          </p>

          <form onSubmit={handleVerify} className="flex w-full max-w-sm flex-col gap-4" noValidate>
            <div className="flex flex-col gap-1">
              <label htmlFor="twofa-code" className="text-white">
                Code de vérification
              </label>
              <input
                id="twofa-code"
                autoComplete="one-time-code"
                inputMode="numeric"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                aria-describedby={error ? 'login-error' : undefined}
                className="border-hud-border bg-hud-card rounded-md border px-3 py-2 text-white"
              />
            </div>

            {error && (
              <p id="login-error" role="alert" className="text-hud-rejected text-sm">
                {error}
              </p>
            )}

            <Button type="submit" disabled={submitting}>
              Valider le code
            </Button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <div className="border-hud-border bg-hud-card flex w-full max-w-md flex-col items-center gap-6 rounded-xl border p-8">
        <h1 className="text-2xl font-bold text-white">Connexion</h1>

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
              aria-describedby={error ? 'login-error' : undefined}
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
              aria-describedby={error ? 'login-error' : undefined}
              className="border-hud-border bg-hud-card rounded-md border px-3 py-2 text-white"
            />
          </div>

          {error && (
            <p id="login-error" role="alert" className="text-hud-rejected text-sm">
              {error}
            </p>
          )}

          <Button type="submit" disabled={submitting}>
            Se connecter
          </Button>
        </form>

        <p className="text-hud-muted text-sm">
          Pas encore de compte ?{' '}
          <Link to="/register" className="text-hud-positive underline">
            Créer un compte
          </Link>
        </p>
      </div>
    </div>
  );
}
