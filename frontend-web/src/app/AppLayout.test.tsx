import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import AppLayout from './AppLayout';

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
  return render(<RouterProvider router={router} />);
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
