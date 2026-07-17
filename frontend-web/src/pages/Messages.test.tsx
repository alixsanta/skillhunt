import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { DEFAULT_API_URL } from '@/api/client';
import type { ConversationSummary } from '@/features/chat/types';
import Messages from './Messages';

const url = (path: string) => `${DEFAULT_API_URL}${path}`;

const CONVERSATIONS: ConversationSummary[] = [
  {
    conversationId: 'u-freelance:u-recruteur',
    with: { id: 'u-freelance', username: 'jean-telepilote', role: 'FREELANCE' },
    lastMessage: {
      id: 'm-2',
      conversationId: 'u-freelance:u-recruteur',
      senderId: 'u-freelance',
      body: 'Disponible la semaine prochaine.',
      createdAt: '2026-07-16T10:05:00.000Z',
    },
  },
  {
    conversationId: 'u-autre:u-recruteur',
    with: { id: 'u-autre', username: 'lisa-robotique', role: 'FREELANCE' },
    lastMessage: {
      id: 'm-9',
      conversationId: 'u-autre:u-recruteur',
      senderId: 'u-recruteur',
      body: 'Merci pour votre retour !',
      createdAt: '2026-07-15T09:00:00.000Z',
    },
  },
];

function respondWith(conversations: ConversationSummary[]) {
  return http.get(url('/api/v1/chat/conversations'), () => HttpResponse.json(conversations));
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0 } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/messages']}>{children}</MemoryRouter>
    </QueryClientProvider>
  );
  return render(<Messages />, { wrapper });
}

describe('Page Messages — liste des conversations (SH-24, S5)', () => {
  it('liste les conversations : interlocuteur + dernier message, lien vers le fil', async () => {
    server.use(respondWith(CONVERSATIONS));
    renderPage();

    expect(await screen.findByText('jean-telepilote')).toBeInTheDocument();
    expect(screen.getByText('lisa-robotique')).toBeInTheDocument();
    expect(screen.getByText('Disponible la semaine prochaine.')).toBeInTheDocument();
    expect(screen.getByText('Merci pour votre retour !')).toBeInTheDocument();

    // Chaque conversation est un LIEN vers son fil : navigable au clavier (a11y)
    const link = screen.getByRole('link', { name: /jean-telepilote/i });
    expect(link).toHaveAttribute('href', '/messages/u-freelance');
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('affiche un état vide explicite quand aucune conversation', async () => {
    server.use(respondWith([]));
    renderPage();

    expect(await screen.findByText(/aucune conversation/i)).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it("affiche une erreur avec « Réessayer » quand l'API échoue, et recharge au clic", async () => {
    server.use(
      http.get(url('/api/v1/chat/conversations'), () => new HttpResponse(null, { status: 500 })),
    );
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent(/impossible de charger/i);

    server.use(respondWith(CONVERSATIONS));
    await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }));

    expect(await screen.findByText('jean-telepilote')).toBeInTheDocument();
  });
});
