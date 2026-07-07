import { render, screen } from '@testing-library/react';
import { useQueryClient } from '@tanstack/react-query';
import { AppProviders } from './providers';

function Probe() {
  // Ne rend un marqueur que si un QueryClient est bien présent dans le contexte.
  const client = useQueryClient();
  return <span>{client ? 'query-ok' : 'query-ko'}</span>;
}

describe('AppProviders', () => {
  it('fournit un QueryClient à l’arbre React', () => {
    render(
      <AppProviders>
        <Probe />
      </AppProviders>,
    );
    expect(screen.getByText('query-ok')).toBeInTheDocument();
  });
});
