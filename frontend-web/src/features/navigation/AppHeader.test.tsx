import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '@/features/auth/useAuth';
import { AppHeader } from './AppHeader';

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

  it('assemble navigation et menu compte pour un recruteur', () => {
    renderHeader('RECRUITER');
    expect(screen.getByRole('navigation', { name: /navigation principale/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /mon compte/i })).toBeInTheDocument();
  });

  // SH-51 : la cloche menait à /messages, exactement comme l'entrée de navigation du même
  // nom. Deux chemins pour une destination, dont un annoncé « notifications » : on garde
  // le lien explicite et on supprime la cloche.
  it("n'offre qu'un seul chemin vers les messages", () => {
    renderHeader('RECRUITER');
    const versMessages = screen
      .getAllByRole('link')
      .filter((lien) => lien.getAttribute('href') === '/messages');
    expect(versMessages).toHaveLength(1);
  });

  it("hors session, n'affiche ni navigation ni menu compte", () => {
    renderHeader(null);
    expect(
      screen.queryByRole('navigation', { name: /navigation principale/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /mon compte/i })).not.toBeInTheDocument();
  });
});
