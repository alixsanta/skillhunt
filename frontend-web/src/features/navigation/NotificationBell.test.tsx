import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationBell } from './NotificationBell';

const handlers = new Map<string, (payload: unknown) => void>();

vi.mock('@/features/chat/socket', () => ({
  getChatSocket: () => ({
    on: (event: string, handler: (payload: unknown) => void) => handlers.set(event, handler),
    off: (event: string) => handlers.delete(event),
  }),
}));

function emitMessage() {
  handlers.get('message:new')?.({
    id: 'm-1',
    conversationId: 'a:b',
    senderId: 'other-user',
    body: 'Bonjour',
    createdAt: new Date().toISOString(),
  });
}

beforeEach(() => handlers.clear());
afterEach(() => vi.clearAllMocks());

describe('NotificationBell', () => {
  it("n'annonce aucun message non lu au départ", () => {
    render(
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole('link', { name: /messages, aucun nouveau message/i }),
    ).toBeInTheDocument();
  });

  it('signale un message reçu pendant la session', async () => {
    render(
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>,
    );
    emitMessage();
    expect(
      await screen.findByRole('link', { name: /messages, nouveaux messages non lus/i }),
    ).toBeInTheDocument();
  });

  it('éteint la pastille quand on ouvre les messages', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>,
    );
    emitMessage();
    await user.click(await screen.findByRole('link', { name: /nouveaux messages/i }));
    expect(await screen.findByRole('link', { name: /aucun nouveau message/i })).toBeInTheDocument();
  });

  it('se désabonne du socket au démontage (pas de fuite de listener entre routes)', () => {
    const { unmount } = render(
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>,
    );
    expect(handlers.has('message:new')).toBe(true);
    unmount();
    expect(handlers.has('message:new')).toBe(false);
  });
});
