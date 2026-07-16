import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from '@/components/ui/button';
import { apiClient } from '@/api/client';

interface EnrollResponse {
  secret: string;
  otpauthUrl: string;
}

const statusQueryKey = ['auth', '2fa', 'status'] as const;

/**
 * Gestion de la 2FA dans « Mon compte » (SH-40) — opt-in pour tous les rôles.
 *
 * Sécurité côté client : le secret, l'URI otpauth et les codes de secours ne vivent que
 * dans le state ÉPHÉMÈRE de ce composant (jamais dans un store, jamais persistés) et les
 * codes de secours ne sont affichés qu'UNE seule fois.
 */
export function TwoFactorSettings() {
  const queryClient = useQueryClient();
  const [code, setCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const status = useQuery<{ enabled: boolean }>({
    queryKey: statusQueryKey,
    queryFn: async () =>
      (await apiClient.get<{ enabled: boolean }>('/api/v1/auth/2fa/status')).data,
  });

  const enroll = useMutation<EnrollResponse>({
    mutationFn: async () =>
      (await apiClient.post<EnrollResponse>('/api/v1/auth/2fa/enroll', {})).data,
    onError: () => setError("Impossible de démarrer l'enrôlement. Réessaie plus tard."),
  });

  const confirm = useMutation<{ backupCodes: string[] }, unknown, string>({
    mutationFn: async (totpCode) =>
      (
        await apiClient.post<{ backupCodes: string[] }>('/api/v1/auth/2fa/confirm', {
          code: totpCode,
        })
      ).data,
    onSuccess: async (data) => {
      setBackupCodes(data.backupCodes);
      setCode('');
      enroll.reset();
      await queryClient.invalidateQueries({ queryKey: statusQueryKey });
    },
    onError: () => setError('Code de vérification invalide.'),
  });

  const disable = useMutation<unknown, unknown, string>({
    mutationFn: async (totpCode) =>
      (await apiClient.post('/api/v1/auth/2fa/disable', { code: totpCode })).data,
    onSuccess: async () => {
      setCode('');
      setBackupCodes(null);
      await queryClient.invalidateQueries({ queryKey: statusQueryKey });
    },
    onError: () => setError('Code de vérification invalide.'),
  });

  function submitConfirm(event: FormEvent) {
    event.preventDefault();
    setError(null);
    confirm.mutate(code.trim());
  }

  function submitDisable(event: FormEvent) {
    event.preventDefault();
    setError(null);
    disable.mutate(code.trim());
  }

  if (status.isPending || status.isError) {
    return null; // section non bloquante : « Mon compte » reste utilisable sans elle
  }

  return (
    <section className="flex w-full max-w-sm flex-col gap-3 rounded-lg border p-4">
      <h2 className="font-bold">Double authentification (2FA)</h2>

      {/* Codes de secours : affichés UNE seule fois, jamais re-consultables */}
      {backupCodes && (
        <div className="flex flex-col gap-2 rounded-md border border-dashed p-3">
          <p className="text-sm font-medium">
            Conserve ces codes de secours en lieu sûr : ils ne seront plus jamais affichés.
          </p>
          <ul className="grid grid-cols-2 gap-1 font-mono text-sm">
            {backupCodes.map((backupCode) => (
              <li key={backupCode}>{backupCode}</li>
            ))}
          </ul>
        </div>
      )}

      {status.data.enabled ? (
        <>
          <p className="text-sm">
            La double authentification est activée sur ton compte. Pour la désactiver, saisis un
            code de ton application (ou un code de secours).
          </p>
          <form onSubmit={submitDisable} className="flex flex-col gap-3" noValidate>
            <div className="flex flex-col gap-1">
              <label htmlFor="twofa-manage-code">Code de vérification</label>
              <input
                id="twofa-manage-code"
                autoComplete="one-time-code"
                inputMode="numeric"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                className="rounded-md border px-3 py-2"
              />
            </div>
            {error && (
              <p role="alert" className="text-sm text-red-500">
                {error}
              </p>
            )}
            <Button type="submit" variant="outline" disabled={disable.isPending}>
              Désactiver
            </Button>
          </form>
        </>
      ) : enroll.data ? (
        <>
          <p className="text-sm">
            Scanne ce QR code avec ton application (Google Authenticator, Authy…) ou saisis le
            secret manuellement, puis confirme avec le code généré.
          </p>
          <div className="flex flex-col items-center gap-2">
            <QRCodeSVG value={enroll.data.otpauthUrl} size={160} marginSize={2} />
            <p className="font-mono text-sm">{enroll.data.secret}</p>
          </div>
          <form onSubmit={submitConfirm} className="flex flex-col gap-3" noValidate>
            <div className="flex flex-col gap-1">
              <label htmlFor="twofa-confirm-code">Code de vérification</label>
              <input
                id="twofa-confirm-code"
                autoComplete="one-time-code"
                inputMode="numeric"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                className="rounded-md border px-3 py-2"
              />
            </div>
            {error && (
              <p role="alert" className="text-sm text-red-500">
                {error}
              </p>
            )}
            <Button type="submit" disabled={confirm.isPending}>
              Confirmer
            </Button>
          </form>
        </>
      ) : (
        <>
          <p className="text-muted-foreground text-sm">
            Protège ton compte avec une application d'authentification (recommandé pour les comptes
            pro : accès aux données candidats).
          </p>
          {error && (
            <p role="alert" className="text-sm text-red-500">
              {error}
            </p>
          )}
          <Button onClick={() => enroll.mutate()} disabled={enroll.isPending}>
            Activer la double authentification
          </Button>
        </>
      )}
    </section>
  );
}
