import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '@/features/auth/useAuth';
import AppLayout from './AppLayout';

vi.mock('@/features/chat/socket', () => ({
  getChatSocket: () => ({ on: vi.fn(), off: vi.fn() }),
}));

// AppLayout monte désormais AppHeader (SH-46), qui lit useAuth() : ce test a donc
// besoin d'un AuthContext.Provider, comme AppHeader.test.tsx.
const authValue = {
  user: null,
  status: 'ready' as const,
  login: vi.fn(),
  verifyTwoFactor: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
} as AuthContextValue;

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      {
        element: <AppLayout />,
        children: [{ path: '/page-test', element: <p>Contenu de la page</p> }],
      },
    ],
    { initialEntries: [path] },
  );
  return render(
    <AuthContext.Provider value={authValue}>
      <RouterProvider router={router} />
    </AuthContext.Provider>,
  );
}

describe('AppLayout', () => {
  it('rend la page enfant dans une région principale', () => {
    renderAt('/page-test');
    expect(screen.getByRole('main')).toHaveTextContent('Contenu de la page');
  });

  it('expose une bannière de navigation commune', () => {
    renderAt('/page-test');
    expect(screen.getByRole('banner')).toBeInTheDocument();
  });
});
