import { describe, it, expect, afterEach, vi } from 'vitest';
import { io } from 'socket.io-client';
import { sessionStore } from '@/features/auth/session-store';
import { DEFAULT_API_URL } from '@/api/client';
import { getChatSocket, resetChatSocket } from './socket';

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => ({ on: vi.fn(), off: vi.fn(), emit: vi.fn(), disconnect: vi.fn() })),
}));

function fakeJwt(payload: Record<string, unknown>): string {
  const encode = (value: object) => btoa(JSON.stringify(value)).replace(/=+$/, '');
  return `${encode({ alg: 'RS256' })}.${encode(payload)}.signature-non-verifiee`;
}

const token = fakeJwt({ userId: 'u-1', email: 'r@skillhunt.io', role: 'RECRUITER' });

describe('Socket chat (SH-24)', () => {
  afterEach(() => {
    resetChatSocket();
    sessionStore.clear();
    vi.mocked(io).mockClear();
  });

  it("se connecte à l'URL de l'API, jeton dans `auth` — JAMAIS en query string (C2.2.3)", () => {
    sessionStore.setSession(token);
    getChatSocket();

    expect(io).toHaveBeenCalledTimes(1);
    const [url, options] = vi.mocked(io).mock.calls[0];
    expect(url).toBe(DEFAULT_API_URL);
    // Une query string se logue côté serveur/proxy : le jeton n'y figure jamais.
    expect(options?.query).toBeUndefined();

    // `auth` est une FONCTION : réévaluée par socket.io à chaque (re)connexion,
    // elle fournit donc toujours le token frais après une rotation de refresh.
    const provideAuth = options?.auth as (cb: (data: object) => void) => void;
    const callback = vi.fn();
    provideAuth(callback);
    expect(callback).toHaveBeenCalledWith({ token });
  });

  it("est un singleton : deux appels ne créent qu'une seule connexion", () => {
    getChatSocket();
    getChatSocket();
    expect(io).toHaveBeenCalledTimes(1);
  });

  it('resetChatSocket déconnecte et oublie la socket (déconnexion utilisateur)', () => {
    const socket = getChatSocket();
    resetChatSocket();

    expect(socket.disconnect).toHaveBeenCalled();
    getChatSocket();
    expect(io).toHaveBeenCalledTimes(2);
  });
});
