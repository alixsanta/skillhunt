import { LessThan, Repository } from 'typeorm';
import { MediaSweeper } from './media.sweeper';
import { MediaService } from './media.service';
import { Media } from './media.entity';
import { MediaStatus } from '../common/enums';
import { FakeStorageService } from '../storage/fake-storage.service';

const FREELANCE = '11111111-1111-1111-1111-111111111111';

// C2.2.2 — Une URL de dépôt délivrée puis abandonnée laisse une ligne et parfois un objet
// à moitié déposé. Sans balayage, ils s'accumulent et amputent le quota du freelance.
describe('MediaSweeper', () => {
  function context(rows: Media[]) {
    const removed: string[] = [];
    const repo = {
      find: jest.fn(async () => rows),
      remove: async (entities: Media[]) => {
        entities.forEach((entity) => removed.push(entity.id));
        return entities;
      },
    } as unknown as Repository<Media>;

    const storage = new FakeStorageService();
    // Service RÉEL (pas de fakeRepo/queue nécessaires : buildMediaPrefix ne les touche
    // pas) — le test ne peut ainsi jamais diverger de la vraie construction du préfixe.
    const mediaService = new MediaService(repo, storage, { enqueueTranscode: jest.fn() } as never);
    return { repo, removed, storage, sweeper: new MediaSweeper(repo, storage, mediaService) };
  }

  it('purge la ligne ET les objets d\'un DRAFT abandonné', async () => {
    const staleRow = {
      id: 'vieux',
      freelanceId: FREELANCE,
      status: MediaStatus.DRAFT,
      sourceKey: `private/media/${FREELANCE}/vieux/master.mp4`,
    } as Media;
    const { removed, storage, sweeper } = context([staleRow]);
    await storage.put(staleRow.sourceKey, Buffer.from('partiel'), 'video/mp4');

    const count = await sweeper.purgeStaleDrafts();

    expect(count).toBe(1);
    expect(removed).toEqual(['vieux']);
    await expect(storage.head(staleRow.sourceKey)).rejects.toThrow();
  });

  it('ne fait rien quand aucune déclaration n\'est périmée', async () => {
    const { removed, sweeper } = context([]);

    await expect(sweeper.purgeStaleDrafts()).resolves.toBe(0);
    expect(removed).toEqual([]);
  });

  it('ne cible que les déclarations DRAFT plus anciennes que le délai', async () => {
    process.env.MEDIA_DRAFT_TTL_HOURS = '24';
    const { repo, sweeper } = context([]);

    await sweeper.purgeStaleDrafts();

    // Sans cette assertion, perdre le filtre `DRAFT` supprimerait des médias UPLOADED
    // en cours de transcodage — et aucun test ne le verrait.
    expect(repo.find).toHaveBeenCalledWith({
      where: { status: MediaStatus.DRAFT, createdAt: LessThan(expect.any(Date)) },
    });
  });
});
