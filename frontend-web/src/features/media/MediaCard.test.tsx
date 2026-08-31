import { render, screen } from '@testing-library/react';
import { MediaCard } from './MediaCard';
import type { PublicMedia } from './types';

function makeMedia(overrides: Partial<PublicMedia> = {}): PublicMedia {
  return {
    id: 'm-1',
    freelanceId: 'u-1',
    title: 'Survol de chantier — Toulouse',
    description: null,
    type: 'VIDEO',
    status: 'READY',
    durationSeconds: 134,
    width: 3840,
    height: 2160,
    sizeBytes: 184000000,
    mimeType: 'video/mp4',
    renditions: null,
    errorReason: null,
    createdAt: '2026-08-31T10:00:00.000Z',
    processedAt: '2026-08-31T10:02:00.000Z',
    ...overrides,
  } as PublicMedia;
}

function renderCard(media: PublicMedia) {
  return render(
    <ul>
      <MediaCard media={media} />
    </ul>,
  );
}

describe('MediaCard', () => {
  it('affiche le titre', () => {
    renderCard(makeMedia());
    expect(screen.getByText('Survol de chantier — Toulouse')).toBeInTheDocument();
  });

  it.each([
    ['DRAFT', 'BROUILLON', 'Dépôt non confirmé'],
    ['UPLOADED', 'DÉPOSÉE', 'En file d\'attente'],
    ['PROCESSING', 'EN TRAITEMENT', 'Transcodage en cours'],
    ['FAILED', 'ÉCHEC', 'Transcodage impossible'],
  ] as const)('rend le statut %s avec son libellé et son indice visuel', (status, label, hint) => {
    renderCard(makeMedia({ status, durationSeconds: null }));
    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.getByText(hint)).toBeInTheDocument();
  });

  it('affiche la durée quand le média est prêt', () => {
    renderCard(makeMedia({ status: 'READY', durationSeconds: 134 }));
    expect(screen.getByText('2:14')).toBeInTheDocument();
  });

  it('n\'affiche pas de durée tant que le média n\'est pas prêt', () => {
    // `durationSeconds` reste null jusqu'au sondage de SH-16b : afficher « — » sur une
    // vignette en attente ne dirait rien à personne.
    renderCard(makeMedia({ status: 'UPLOADED', durationSeconds: null }));
    expect(screen.queryByText('—')).not.toBeInTheDocument();
  });

  it('signale une vidéo 360°, et seulement celle-là', () => {
    renderCard(makeMedia({ type: 'VIDEO_360' }));
    expect(screen.getByText('360°')).toBeInTheDocument();
  });

  it('n\'affiche pas le badge 360° sur une vidéo plate', () => {
    renderCard(makeMedia({ type: 'VIDEO' }));
    expect(screen.queryByText('360°')).not.toBeInTheDocument();
  });

  it('affiche la raison de l\'échec, qui est la seule information utile à ce stade', () => {
    renderCard(makeMedia({ status: 'FAILED', errorReason: 'Aucun flux vidéo décodable' }));
    expect(screen.getByText('Aucun flux vidéo décodable')).toBeInTheDocument();
  });

  it('n\'affiche pas la raison d\'échec quand elle est absente', () => {
    // Le cas positif est couvert : si la garde était supprimée ou passée en test de
    // veracité laissant passer une chaîne vide, rien ne le détecterait. La vérification
    // de l'absence est tout aussi importante que celle de la présence.
    renderCard(makeMedia({ status: 'READY', errorReason: null }));
    expect(screen.queryByText('Erreur')).not.toBeInTheDocument();
  });
});
