import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '@/features/auth/useAuth';
import { AccountMenu } from './AccountMenu';

function renderMenu(overrides: Partial<AuthContextValue> = {}) {
  const logout = vi.fn().mockResolvedValue(undefined);
  const value = {
    user: { userId: 'u-1', email: 'pilote@skillhunt.io', role: 'FREELANCE' as const },
    status: 'ready' as const,
    login: vi.fn(),
    verifyTwoFactor: vi.fn(),
    register: vi.fn(),
    logout,
    ...overrides,
  } as AuthContextValue;

  render(
    <MemoryRouter>
      <AuthContext.Provider value={value}>
        <AccountMenu />
      </AuthContext.Provider>
    </MemoryRouter>,
  );
  return { logout };
}

describe('AccountMenu', () => {
  it("expose un déclencheur nommé pour les lecteurs d'écran", () => {
    renderMenu();
    expect(screen.getByRole('button', { name: /mon compte/i })).toBeInTheDocument();
  });

  it('ouvre le menu au clavier et propose la déconnexion', async () => {
    const user = userEvent.setup();
    const { logout } = renderMenu();
    const trigger = screen.getByRole('button', { name: /mon compte/i });

    await user.tab();
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('menuitem', { name: /se déconnecter/i })).toBeInTheDocument();

    // Le focus doit entrer DANS le menu (roving focus Radix), pas rester sur le déclencheur :
    // un <div role="menu"> mono-clic sans gestion clavier ne déplacerait jamais le focus ici.
    const accountItem = screen.getByRole('menuitem', { name: /mon compte/i });
    expect(accountItem).toHaveFocus();

    // Navigation par flèches entre les items (le séparateur est ignoré) — preuve du roving
    // focus au clavier, qu'un menu mono-clic sans gestion ArrowDown ne fournirait pas.
    await user.keyboard('{ArrowDown}{ArrowDown}');
    const logoutItem = screen.getByRole('menuitem', { name: /se déconnecter/i });
    expect(logoutItem).toHaveFocus();

    // Activation au clavier du bon item : prouve que les flèches ont déplacé le focus
    // jusqu'à « Se déconnecter », pas seulement que Entrée clique le déclencheur.
    await user.keyboard('{Enter}');
    expect(logout).toHaveBeenCalledOnce();

    // Le menu se referme et le focus revient au déclencheur (comportement Radix standard).
    expect(trigger).toHaveFocus();
  });

  it('déclenche la déconnexion', async () => {
    const user = userEvent.setup();
    const { logout } = renderMenu();
    await user.click(screen.getByRole('button', { name: /mon compte/i }));
    await user.click(await screen.findByRole('menuitem', { name: /se déconnecter/i }));
    expect(logout).toHaveBeenCalledOnce();
  });

  it('ne rend rien hors session', () => {
    renderMenu({ user: null });
    expect(screen.queryByRole('button', { name: /mon compte/i })).not.toBeInTheDocument();
  });
});
