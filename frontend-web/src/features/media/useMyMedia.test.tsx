import { hasPendingMedia } from './useMyMedia';
import type { PublicMedia } from './types';

function media(status: PublicMedia['status']): PublicMedia {
  return { id: status, status } as PublicMedia;
}

// Le sondage est la seule chose qui fait bouger la grille tant qu'aucun WebSocket ne
// couvre les médias : sa condition d'arrêt mérite d'être épinglée.
describe('hasPendingMedia', () => {
  it("est vrai tant qu'un média est déposé ou en traitement", () => {
    expect(hasPendingMedia([media('READY'), media('UPLOADED')])).toBe(true);
    expect(hasPendingMedia([media('PROCESSING')])).toBe(true);
  });

  it('est faux quand tout est stabilisé', () => {
    expect(hasPendingMedia([media('READY'), media('FAILED')])).toBe(false);
    expect(hasPendingMedia([])).toBe(false);
  });

  it("ignore les brouillons : rien ne les fera avancer sans action de l'utilisateur", () => {
    // Un DRAFT attend une confirmation de dépôt, pas un traitement serveur — le sonder
    // indéfiniment ne ferait que du trafic pour rien.
    expect(hasPendingMedia([media('DRAFT')])).toBe(false);
  });
});
