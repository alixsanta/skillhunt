import { describe, it, expect, afterEach, vi } from 'vitest';
import { sessionStore } from './session-store';

function fakeJwt(payload: Record<string, unknown>): string {
  const encode = (value: object) => btoa(JSON.stringify(value)).replace(/=+$/, '');
  return `${encode({ alg: 'RS256' })}.${encode(payload)}.signature-non-verifiee`;
}

const token = fakeJwt({ userId: 'u-1', email: 'a@skillhunt.io', role: 'RECRUITER' });

describe('sessionStore', () => {
  afterEach(() => sessionStore.clear());

  it('mémorise le token et l\'identité décodée', () => {
    sessionStore.setSession(token);

    expect(sessionStore.getAccessToken()).toBe(token);
    expect(sessionStore.getUser()).toEqual({
      userId: 'u-1',
      email: 'a@skillhunt.io',
      role: 'RECRUITER',
    });
  });

  it('notifie ses abonnés à chaque changement', () => {
    const listener = vi.fn();
    const unsubscribe = sessionStore.subscribe(listener);

    sessionStore.setSession(token);
    sessionStore.clear();

    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    sessionStore.setSession(token);
    expect(listener).toHaveBeenCalledTimes(2); // plus notifié après désabonnement
  });

  // Exigence non négociable de SH-20 : le token ne doit JAMAIS être persisté.
  it('n\'écrit RIEN dans localStorage ni sessionStorage', () => {
    sessionStore.setSession(token);

    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });
});
