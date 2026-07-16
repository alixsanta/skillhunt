import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { DEFAULT_API_URL } from '@/api/client';
import { TwoFactorSettings } from './TwoFactorSettings';

const url = (path: string) => `${DEFAULT_API_URL}${path}`;

function renderSettings() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(<TwoFactorSettings />, { wrapper });
}

describe('Gestion de la 2FA dans « Mon compte » (SH-40)', () => {
  it('enrôlement complet : activer → secret affiché → confirmation → codes de secours montrés UNE fois', async () => {
    server.use(
      http.get(url('/api/v1/auth/2fa/status'), () => HttpResponse.json({ enabled: false })),
      http.post(url('/api/v1/auth/2fa/enroll'), () =>
        HttpResponse.json({
          secret: 'JBSWY3DPEHPK3PXP',
          otpauthUrl: 'otpauth://totp/SkillHunt:pro%40skillhunt.io?secret=JBSWY3DPEHPK3PXP',
        }),
      ),
      http.post(url('/api/v1/auth/2fa/confirm'), () =>
        HttpResponse.json({ backupCodes: ['A2C4-E6G8', 'K3M5-P7R9'] }),
      ),
    );

    renderSettings();

    await userEvent.click(
      await screen.findByRole('button', { name: 'Activer la double authentification' }),
    );

    // Le secret est affiché (saisie manuelle possible en plus du QR code)
    expect(await screen.findByText('JBSWY3DPEHPK3PXP')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Code de vérification'), '123456');
    await userEvent.click(screen.getByRole('button', { name: 'Confirmer' }));

    // Les codes de secours sont montrés UNE seule fois, avec l'avertissement
    expect(await screen.findByText('A2C4-E6G8')).toBeInTheDocument();
    expect(screen.getByText('K3M5-P7R9')).toBeInTheDocument();
    expect(screen.getByText(/ne seront plus jamais affichés/i)).toBeInTheDocument();
  });

  it('2FA déjà active : propose la désactivation avec un code, et la confirme', async () => {
    let enabled = true;
    server.use(
      http.get(url('/api/v1/auth/2fa/status'), () => HttpResponse.json({ enabled })),
      http.post(url('/api/v1/auth/2fa/disable'), () => {
        enabled = false;
        return HttpResponse.json({ success: true });
      }),
    );

    renderSettings();

    expect(await screen.findByText(/double authentification est activée/i)).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Code de vérification'), '123456');
    await userEvent.click(screen.getByRole('button', { name: 'Désactiver' }));

    expect(
      await screen.findByRole('button', { name: 'Activer la double authentification' }),
    ).toBeInTheDocument();
  });

  it("désactivation refusée (401) : message d'erreur, la 2FA reste active", async () => {
    server.use(
      http.get(url('/api/v1/auth/2fa/status'), () => HttpResponse.json({ enabled: true })),
      http.post(url('/api/v1/auth/2fa/disable'), () => new HttpResponse(null, { status: 401 })),
    );

    renderSettings();

    await userEvent.type(await screen.findByLabelText('Code de vérification'), '000000');
    await userEvent.click(screen.getByRole('button', { name: 'Désactiver' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/code de vérification invalide/i);
    expect(screen.getByText(/double authentification est activée/i)).toBeInTheDocument();
  });
});
