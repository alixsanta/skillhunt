import type { ReactNode } from 'react';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { MatchResult } from './types';
import { SearchMap } from './SearchMap';

// jsdom ne sait pas rendre une vraie carte (canvas/tuiles) : react-leaflet est mocké,
// on vérifie les DONNÉES passées aux primitives — le rendu réel est vérifié au navigateur.
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: ReactNode }) => <div data-testid="map">{children}</div>,
  TileLayer: ({ attribution }: { attribution: string }) => (
    <div data-testid="tiles" data-attribution={attribution} />
  ),
  Circle: ({ center, radius }: { center: [number, number]; radius: number }) => (
    <div data-testid="mission-radius" data-center={JSON.stringify(center)} data-radius={radius} />
  ),
  CircleMarker: ({ center, children }: { center: [number, number]; children: ReactNode }) => (
    <div data-testid="freelance-marker" data-center={JSON.stringify(center)}>
      {children}
    </div>
  ),
  Popup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

const RESULTS: MatchResult[] = [
  {
    freelanceId: 'f-1',
    username: 'pilote-pro',
    score: 0.82,
    distanceKm: 0,
    latitude: 43.6045,
    longitude: 1.4442,
  },
  {
    freelanceId: 'f-2',
    username: 'sans-position',
    score: 0.5,
    distanceKm: 10,
    latitude: null,
    longitude: null,
  },
];

function renderMap() {
  return render(
    <MemoryRouter>
      <SearchMap center={{ lat: 43.6, lon: 1.44 }} radiusKm={50} results={RESULTS} />
    </MemoryRouter>,
  );
}

describe('SearchMap — carte des résultats (SH-23)', () => {
  it('matérialise le rayon de mission autour du centre choisi (en mètres)', () => {
    renderMap();
    const radius = screen.getByTestId('mission-radius');
    expect(radius).toHaveAttribute('data-center', JSON.stringify([43.6, 1.44]));
    expect(radius).toHaveAttribute('data-radius', '50000');
  });

  it('pose un marqueur par freelance LOCALISÉ (jamais pour une position null)', () => {
    renderMap();
    const markers = screen.getAllByTestId('freelance-marker');
    expect(markers).toHaveLength(1);
    expect(markers[0]).toHaveAttribute('data-center', JSON.stringify([43.6045, 1.4442]));
  });

  it("la popup relie le marqueur à l'armurerie publique (SH-21b) avec username et score", () => {
    renderMap();
    const marker = screen.getByTestId('freelance-marker');
    expect(within(marker).getByText(/pilote-pro/)).toBeInTheDocument();
    expect(within(marker).getByText(/82\s?%/)).toBeInTheDocument();
    expect(within(marker).getByRole('link', { name: "Voir l'armurerie" })).toHaveAttribute(
      'href',
      '/freelances/f-1/armurerie',
    );
  });

  it('crédite OpenStreetMap (attribution obligatoire, zéro token — décision SH-23)', () => {
    renderMap();
    expect(screen.getByTestId('tiles').getAttribute('data-attribution')).toContain('OpenStreetMap');
  });
});
