import { useEffect } from 'react';
import { act, render, screen } from '@testing-library/react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { AppProviders } from './providers';
import { sessionStore } from '@/features/auth/session-store';

function Probe() {
  // Ne rend un marqueur que si un QueryClient est bien présent dans le contexte.
  const client = useQueryClient();
  return <span>{client ? 'query-ok' : 'query-ko'}</span>;
}

function fakeJwt(payload: Record<string, unknown>): string {
  const encode = (value: object) => btoa(JSON.stringify(value)).replace(/=+$/, '');
  return `${encode({ alg: 'RS256' })}.${encode(payload)}.signature-non-verifiee`;
}

const TOKEN_A = fakeJwt({ userId: 'u-A', email: 'a@skillhunt.io', role: 'FREELANCE' });
const TOKEN_A_REFRESHED = fakeJwt({ userId: 'u-A', email: 'a@skillhunt.io', role: 'FREELANCE' });
const TOKEN_B = fakeJwt({ userId: 'u-B', email: 'b@skillhunt.io', role: 'FREELANCE' });

const GEAR_QUERY_KEY = ['gear', 'me'];

// Capture le QueryClient du contexte pour l'inspecter depuis le test. L'affectation se fait
// dans un effet (et non pendant le rendu) : réassigner une variable de module en plein rendu
// est un effet de bord que la règle ESLint `react-hooks/globals` interdit à juste titre.
let capturedClient: QueryClient | null = null;
function ClientCapture() {
  const client = useQueryClient();
  useEffect(() => {
    capturedClient = client;
  }, [client]);
  return null;
}

describe('AppProviders', () => {
  afterEach(() => {
    capturedClient = null;
    sessionStore.clear();
  });

  it('fournit un QueryClient à l’arbre React', () => {
    render(
      <AppProviders>
        <Probe />
      </AppProviders>,
    );
    expect(screen.getByText('query-ok')).toBeInTheDocument();
  });

  describe('purge du cache au changement de session (SH-21a, RBAC CLAUDE.md §8.5)', () => {
    it("purge le cache quand l'utilisateur change (A se déconnecte, B se connecte)", () => {
      render(
        <AppProviders>
          <ClientCapture />
        </AppProviders>,
      );

      act(() => sessionStore.setSession(TOKEN_A));
      capturedClient!.setQueryData(GEAR_QUERY_KEY, { total: 1, items: [{ id: 'gear-de-A' }] });
      expect(capturedClient!.getQueryData(GEAR_QUERY_KEY)).toBeDefined();

      // Déconnexion de A : le cache doit être purgé même sans reconnexion immédiate.
      act(() => sessionStore.clear());
      expect(capturedClient!.getQueryData(GEAR_QUERY_KEY)).toBeUndefined();

      // B se connecte dans le même onglet : ne doit jamais voir resurgir les données de A.
      capturedClient!.setQueryData(GEAR_QUERY_KEY, { total: 1, items: [{ id: 'gear-de-B' }] });
      act(() => sessionStore.setSession(TOKEN_B));
      expect(capturedClient!.getQueryData(GEAR_QUERY_KEY)).toBeUndefined();
    });

    it('ne purge PAS le cache quand la même identité se reconfirme (rotation silencieuse du token)', () => {
      render(
        <AppProviders>
          <ClientCapture />
        </AppProviders>,
      );

      act(() => sessionStore.setSession(TOKEN_A));
      capturedClient!.setQueryData(GEAR_QUERY_KEY, { total: 1, items: [{ id: 'gear-de-A' }] });

      // Même utilisateur, nouveau token (refresh) : pas de purge, sinon on re-fetch tout
      // à chaque rotation de token.
      act(() => sessionStore.setSession(TOKEN_A_REFRESHED));
      expect(capturedClient!.getQueryData(GEAR_QUERY_KEY)).toBeDefined();
    });
  });
});
