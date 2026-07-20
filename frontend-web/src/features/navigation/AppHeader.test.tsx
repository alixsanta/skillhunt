import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '@/features/auth/useAuth';
import { AppHeader } from './AppHeader';

vi.mock('@/features/chat/socket', () => ({
  getChatSocket: () => ({ on: vi.fn(), off: vi.fn() }),
}));

function renderHeader(role: 'FREELANCE' | 'RECRUITER' | null) {
  const value = {
    user: role ? { userId: 'u-1', email: 'demo@skillhunt.io', role } : null,
    status: 'ready' as const,
    login: vi.fn(),
    verifyTwoFactor: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
  } as AuthContextValue;

  render(
    <MemoryRouter>
      <AuthContext.Provider value={value}>
        <AppHeader />
      </AuthContext.Provider>
    </MemoryRouter>,
  );
}

describe('AppHeader', () => {
  it("affiche le logo ramenant à l'accueil", () => {
    renderHeader('RECRUITER');
    expect(screen.getByRole('link', { name: /skillhunt/i })).toHaveAttribute('href', '/');
  });

  it('assemble navigation, notifications et menu compte pour un recruteur', () => {
    renderHeader('RECRUITER');
    expect(screen.getByRole('navigation', { name: /navigation principale/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /messages, aucun nouveau/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /mon compte/i })).toBeInTheDocument();
  });

  it("hors session, n'affiche ni navigation ni menu compte", () => {
    renderHeader(null);
    expect(
      screen.queryByRole('navigation', { name: /navigation principale/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /mon compte/i })).not.toBeInTheDocument();
  });
});
