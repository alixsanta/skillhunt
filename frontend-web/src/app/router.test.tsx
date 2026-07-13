import { render, screen } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { routes } from './routes';

function renderAt(path: string) {
  const memoryRouter = createMemoryRouter(routes, { initialEntries: [path] });
  render(<RouterProvider router={memoryRouter} />);
}

describe('router', () => {
  it('rend la page d’accueil sur /', () => {
    renderAt('/');
    expect(screen.getByRole('heading', { name: /skillhunt/i })).toBeInTheDocument();
  });

  it('rend la page 404 sur une route inconnue', () => {
    renderAt('/route-inexistante');
    expect(screen.getByRole('heading', { name: /404/i })).toBeInTheDocument();
  });
});
