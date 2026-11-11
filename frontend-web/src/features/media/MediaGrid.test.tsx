import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MediaGrid } from './MediaGrid';
import { MediaEmptyState } from './MediaEmptyState';
import type { PublicMedia } from './types';

function makeMedia(id: string, title: string): PublicMedia {
  return {
    id,
    freelanceId: 'u-1',
    title,
    description: null,
    type: 'VIDEO',
    status: 'UPLOADED',
    durationSeconds: null,
    width: null,
    height: null,
    sizeBytes: null,
    mimeType: 'video/mp4',
    renditions: null,
    errorReason: null,
    createdAt: '2026-08-31T10:00:00.000Z',
    processedAt: null,
  } as PublicMedia;
}

describe('MediaGrid', () => {
  it('rend une liste sémantique nommée, annoncée comme telle', () => {
    render(<MediaGrid items={[makeMedia('m-1', 'Un'), makeMedia('m-2', 'Deux')]} />);
    expect(screen.getByRole('list', { name: 'Vidéos du portfolio' })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });
});

describe('MediaEmptyState', () => {
  it('invite à publier plutôt que de constater un vide', () => {
    render(
      <MemoryRouter>
        <MediaEmptyState />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: /ajouter ma première vidéo/i })).toHaveAttribute(
      'href',
      '/portfolio/ajouter',
    );
  });
});
