import type { ReactNode } from 'react';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { server } from '@/test/server';
import { DEFAULT_API_URL } from '@/api/client';
import { sessionStore } from '@/features/auth/session-store';
import { conversationIdFor, type ChatMessage } from '@/features/chat/types';
import MessageThread from './MessageThread';

// Socket factice : la page s'abonne à `message:new` et émet `message:send` avec accusé.
const { fakeSocket } = vi.hoisted(() => ({
  fakeSocket: {
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
  },
}));
vi.mock('@/features/chat/socket', () => ({ getChatSocket: () => fakeSocket }));

const url = (path: string) => `${DEFAULT_API_URL}${path}`;

const MY_ID = 'a0000000-0000-4000-8000-00000000000a';
const PEER_ID = 'b0000000-0000-4000-8000-00000000000b';
const CONVERSATION_ID = conversationIdFor(MY_ID, PEER_ID);

function fakeJwt(payload: Record<string, unknown>): string {
  const encode = (value: object) => btoa(JSON.stringify(value)).replace(/=+$/, '');
  return `${encode({ alg: 'RS256' })}.${encode(payload)}.signature-non-verifiee`;
}

function makeMessage(overrides: Partial<ChatMessage>): ChatMessage {
  return {
    id: 'm-1',
    conversationId: CONVERSATION_ID,
    senderId: PEER_ID,
    body: 'Bonjour !',
    createdAt: '2026-07-16T10:00:00.000Z',
    ...overrides,
  };
}

const HISTORY: ChatMessage[] = [
  makeMessage({ id: 'm-1', senderId: MY_ID, body: "Bonjour, votre profil m'intéresse." }),
  makeMessage({ id: 'm-2', senderId: PEER_ID, body: 'Merci, je suis disponible.' }),
];

function respondWith(messages: ChatMessage[]) {
  return http.get(url(`/api/v1/chat/with/${PEER_ID}`), () => HttpResponse.json(messages));
}

/** Récupère le handler `message:new` abonné par la page sur la socket factice. */
function liveHandler(): (message: ChatMessage) => void {
  const call = fakeSocket.on.mock.calls.find(([event]) => event === 'message:new');
  expect(call).toBeDefined();
  return call![1] as (message: ChatMessage) => void;
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0 } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/messages/${PEER_ID}`]}>
        <Routes>
          <Route path="/messages/:userId" element={children} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
  return render(<MessageThread />, { wrapper });
}

describe('Page fil de discussion — temps réel (SH-24)', () => {
  beforeEach(() => {
    sessionStore.setSession(
      fakeJwt({ userId: MY_ID, email: 'recruteur@skillhunt.io', role: 'RECRUITER' }),
    );
  });

  afterEach(() => {
    sessionStore.clear();
    fakeSocket.on.mockClear();
    fakeSocket.off.mockClear();
    fakeSocket.emit.mockReset();
  });

  it("charge l'historique (REST) et l'affiche dans l'ordre chronologique", async () => {
    server.use(respondWith(HISTORY));
    renderPage();

    const log = await screen.findByRole('log');
    const items = within(log).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Bonjour, votre profil m'intéresse.");
    expect(items[1]).toHaveTextContent('Merci, je suis disponible.');
  });

  it("distingue mes messages de ceux de l'interlocuteur (pas seulement par la couleur, R6)", async () => {
    server.use(respondWith(HISTORY));
    renderPage();

    const log = await screen.findByRole('log');
    const items = within(log).getAllByRole('listitem');
    expect(within(items[0]).getByText('Moi')).toBeInTheDocument();
    expect(within(items[1]).getByText('Interlocuteur')).toBeInTheDocument();
  });

  it("un message:new de CETTE conversation s'ajoute au fil en direct (S1)", async () => {
    server.use(respondWith(HISTORY));
    renderPage();
    await screen.findByRole('log');

    act(() =>
      liveHandler()(makeMessage({ id: 'm-3', senderId: PEER_ID, body: 'On démarre lundi ?' })),
    );

    expect(screen.getByText('On démarre lundi ?')).toBeInTheDocument();
  });

  it("un message:new d'une AUTRE conversation est ignoré (étanchéité d'affichage)", async () => {
    server.use(respondWith(HISTORY));
    renderPage();
    await screen.findByRole('log');

    act(() =>
      liveHandler()(
        makeMessage({ id: 'm-x', conversationId: 'autre:fil', body: 'Message hors sujet' }),
      ),
    );

    expect(screen.queryByText('Message hors sujet')).not.toBeInTheDocument();
  });

  it("n'ajoute PAS deux fois un message déjà reçu (accusé + écho serveur)", async () => {
    server.use(respondWith(HISTORY));
    renderPage();
    await screen.findByRole('log');

    const incoming = makeMessage({ id: 'm-3', senderId: PEER_ID, body: 'Message unique' });
    act(() => liveHandler()(incoming));
    act(() => liveHandler()(incoming));

    expect(screen.getAllByText('Message unique')).toHaveLength(1);
  });

  it('envoi : émet message:send avec le destinataire et vide le champ sur accusé ok', async () => {
    server.use(respondWith([]));
    fakeSocket.emit.mockImplementation(
      (_event: string, payload: { body: string }, ack: (r: unknown) => void) =>
        ack({
          ok: true,
          message: makeMessage({ id: 'm-10', senderId: MY_ID, body: payload.body }),
        }),
    );
    renderPage();

    const input = await screen.findByRole('textbox', { name: /message/i });
    await userEvent.type(input, 'Bonjour !');
    await userEvent.click(screen.getByRole('button', { name: /envoyer/i }));

    expect(fakeSocket.emit).toHaveBeenCalledWith(
      'message:send',
      { toUserId: PEER_ID, body: 'Bonjour !' },
      expect.any(Function),
    );
    expect(input).toHaveValue('');
  });

  it("envoi refusé : l'erreur de l'accusé s'affiche et la saisie est conservée (S4)", async () => {
    server.use(respondWith([]));
    fakeSocket.emit.mockImplementation(
      (_event: string, _payload: unknown, ack: (r: unknown) => void) =>
        ack({ ok: false, error: 'Le message ne peut pas être vide' }),
    );
    renderPage();

    const input = await screen.findByRole('textbox', { name: /message/i });
    await userEvent.type(input, 'x');
    await userEvent.click(screen.getByRole('button', { name: /envoyer/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Le message ne peut pas être vide');
    expect(input).toHaveValue('x');
  });

  it("se désabonne de message:new au démontage (pas de fuite d'écouteurs)", async () => {
    server.use(respondWith([]));
    const { unmount } = renderPage();
    await screen.findByRole('log');

    unmount();

    const subscribed = liveHandler();
    expect(fakeSocket.off).toHaveBeenCalledWith('message:new', subscribed);
  });
});
