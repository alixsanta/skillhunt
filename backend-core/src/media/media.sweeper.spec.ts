import { Repository } from 'typeorm';
import { MediaSweeper } from './media.sweeper';
import { Media } from './media.entity';
import { MediaStatus } from '../common/enums';
import { FakeStorageService } from '../storage/fake-storage.service';

const FREELANCE = '11111111-1111-1111-1111-111111111111';

// C2.2.2 — Une URL de dépôt délivrée puis abandonnée laisse une ligne et parfois un objet
// à moitié déposé. Sans balayage, ils s'accumulent et amputent le quota du freelance.
describe('MediaSweeper', () => {
  function contexte(rows: Media[]) {
    const supprimes: string[] = [];
    const repo = {
      find: async () => rows,
      remove: async (entities: Media[]) => {
        entities.forEach((entity) => supprimes.push(entity.id));
        return entities;
      },
    } as unknown as Repository<Media>;

    const storage = new FakeStorageService();
    return { supprimes, storage, sweeper: new MediaSweeper(repo, storage) };
  }

  it('purge la ligne ET les objets d\'un DRAFT abandonné', async () => {
    const perime = {
      id: 'vieux',
      freelanceId: FREELANCE,
      status: MediaStatus.DRAFT,
      sourceKey: `private/media/${FREELANCE}/vieux/master.mp4`,
    } as Media;
    const { supprimes, storage, sweeper } = contexte([perime]);
    await storage.put(perime.sourceKey, Buffer.from('partiel'), 'video/mp4');

    const count = await sweeper.purgeStaleDrafts();

    expect(count).toBe(1);
    expect(supprimes).toEqual(['vieux']);
    await expect(storage.head(perime.sourceKey)).rejects.toThrow();
  });

  it('ne fait rien quand aucune déclaration n\'est périmée', async () => {
    const { supprimes, sweeper } = contexte([]);

    await expect(sweeper.purgeStaleDrafts()).resolves.toBe(0);
    expect(supprimes).toEqual([]);
  });
});
