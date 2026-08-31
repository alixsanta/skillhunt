import { ConflictException, BadRequestException, NotFoundException } from '@nestjs/common';
import { Not, Repository } from 'typeorm';
import { MediaService } from './media.service';
import { Media } from './media.entity';
import { MediaStatus } from '../common/enums';
import { FakeStorageService } from '../storage/fake-storage.service';
import { CreateMediaDto } from './dto/create-media.dto';

const FREELANCE = '11111111-1111-1111-1111-111111111111';

// Dépôt en mémoire : suffisant pour le cycle de vie, et sans base de données à démarrer.
function fakeRepo(rows: Media[] = []): Repository<Media> {
  // `count` est un mock espionnable : les tests de quota doivent vérifier la clause
  // `where` réellement envoyée, pas seulement le résultat du filtrage côté dépôt.
  const count = jest.fn(
    async () => rows.filter((row) => row.status !== MediaStatus.FAILED).length,
  );
  return {
    create: (data: Partial<Media>) => ({ ...data }) as Media,
    save: async (entity: Media) => {
      const index = rows.findIndex((row) => row.id === entity.id);
      if (index >= 0) rows[index] = entity;
      else rows.push(entity);
      return entity;
    },
    findOne: async ({ where }: { where: { id: string } }) =>
      rows.find((row) => row.id === where.id) ?? null,
    findAndCount: async () => [rows, rows.length],
    count,
  } as unknown as Repository<Media>;
}

function dto(overrides: Partial<CreateMediaDto> = {}): CreateMediaDto {
  return {
    title: 'Survol de chantier',
    contentType: 'video/mp4',
    sizeBytes: 10_000,
    ...overrides,
  } as CreateMediaDto;
}

describe('MediaService — déclaration', () => {
  let storage: FakeStorageService;

  beforeEach(() => {
    storage = new FakeStorageService();
    process.env.MEDIA_MAX_FILE_MB = '500';
    process.env.MEDIA_MAX_PER_FREELANCE = '20';
    process.env.MEDIA_SIGNED_URL_TTL = '900';
  });

  it('crée une ligne DRAFT et rend une URL PUT signée', async () => {
    const service = new MediaService(fakeRepo(), storage);

    const result = await service.createDraft(FREELANCE, dto());

    expect(result.media.status).toBe(MediaStatus.DRAFT);
    expect(result.upload.method).toBe('PUT');
    expect(result.upload.url).toContain('upload=1');
    expect(result.upload.headers['Content-Type']).toBe('video/mp4');
    expect(result.upload.expiresIn).toBe(900);
  });

  it('n\'expose AUCUNE clé de stockage interne', async () => {
    const service = new MediaService(fakeRepo(), storage);

    const { media } = await service.createDraft(FREELANCE, dto());

    // Contrat à clés EXACTES : une clé S3 qui fuit est une adresse d'objet privé.
    expect(Object.keys(media).sort()).toEqual(
      [
        'createdAt',
        'description',
        'durationSeconds',
        'errorReason',
        'freelanceId',
        'height',
        'id',
        'mimeType',
        'processedAt',
        'renditions',
        'sizeBytes',
        'status',
        'title',
        'type',
        'width',
      ].sort(),
    );
    expect(JSON.stringify(media)).not.toContain('private/media');
  });

  it('range le master sous un préfixe propre au freelance et au média', async () => {
    const service = new MediaService(fakeRepo(), storage);

    const key = service.buildSourceKey(FREELANCE, 'm1', 'video/mp4');

    expect(key).toBe(`private/media/${FREELANCE}/m1/master.mp4`);
  });

  it('choisit l\'extension d\'après le type MIME, jamais d\'après un nom de fichier', async () => {
    const service = new MediaService(fakeRepo(), storage);

    expect(service.buildSourceKey(FREELANCE, 'm1', 'video/quicktime')).toMatch(/master\.mov$/);
  });

  it('refuse une taille annoncée au-delà du plafond', async () => {
    process.env.MEDIA_MAX_FILE_MB = '1';
    const service = new MediaService(fakeRepo(), storage);

    await expect(service.createDraft(FREELANCE, dto({ sizeBytes: 2 * 1024 * 1024 }))).rejects.toThrow(
      BadRequestException,
    );
  });

  it('refuse au-delà du quota de médias', async () => {
    process.env.MEDIA_MAX_PER_FREELANCE = '1';
    const rows = [{ id: 'deja-la', status: MediaStatus.READY } as Media];
    const service = new MediaService(fakeRepo(rows), storage);

    await expect(service.createDraft(FREELANCE, dto())).rejects.toThrow(ConflictException);
  });

  it('interroge le quota sur les seuls médias non FAILED du freelance', async () => {
    const repo = fakeRepo();
    const service = new MediaService(repo, storage);

    await service.createDraft(FREELANCE, dto());

    // Sans cette assertion, le test du plafond passerait même si le service comptait
    // TOUS les médias de TOUS les freelances : le dépôt simulé filtre de son côté.
    expect(repo.count).toHaveBeenCalledWith({
      where: { freelanceId: FREELANCE, status: Not(MediaStatus.FAILED) },
    });
  });
});

describe('MediaService — consultation et mise à jour', () => {
  const AUTRE = '22222222-2222-2222-2222-222222222222';

  function repoAvec(rows: Media[]): Repository<Media> {
    return {
      findAndCount: async ({ where, skip, take }: any) => {
        const filtered = rows.filter(
          (row) =>
            row.freelanceId === where.freelanceId &&
            (where.status === undefined || row.status === where.status),
        );
        return [filtered.slice(skip, skip + take), filtered.length];
      },
      findOne: async ({ where }: any) => rows.find((row) => row.id === where.id) ?? null,
      save: async (entity: Media) => entity,
    } as unknown as Repository<Media>;
  }

  const rows = [
    { id: 'a', freelanceId: FREELANCE, status: MediaStatus.READY, title: 'A', renditions: null, sizeBytes: null } as Media,
    { id: 'b', freelanceId: FREELANCE, status: MediaStatus.DRAFT, title: 'B', renditions: null, sizeBytes: null } as Media,
    { id: 'c', freelanceId: AUTRE, status: MediaStatus.READY, title: 'C', renditions: null, sizeBytes: null } as Media,
  ];

  it('ne rend QUE les médias du freelance du token', async () => {
    const service = new MediaService(repoAvec(rows), new FakeStorageService());

    const page = await service.getMine(FREELANCE, {});

    // Étanchéité (C2.2.2) : le média du voisin ne doit jamais apparaître.
    expect(page.items.map((m) => m.id).sort()).toEqual(['a', 'b']);
    expect(page.total).toBe(2);
  });

  it('filtre par statut', async () => {
    const service = new MediaService(repoAvec(rows), new FakeStorageService());

    const page = await service.getMine(FREELANCE, { status: MediaStatus.READY });

    expect(page.items.map((m) => m.id)).toEqual(['a']);
  });

  it('met à jour le titre de son propre média', async () => {
    const service = new MediaService(repoAvec(rows), new FakeStorageService());

    const updated = await service.updateOwn('a', FREELANCE, { title: 'Nouveau titre' });

    expect(updated.title).toBe('Nouveau titre');
  });

  it('refuse de modifier le média d\'un autre freelance', async () => {
    const service = new MediaService(repoAvec(rows), new FakeStorageService());

    // 404 et non 403 : l'existence d'un média d'autrui ne doit pas être révélée.
    await expect(service.updateOwn('c', FREELANCE, { title: 'Pirate' })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('rejette un média inconnu', async () => {
    const service = new MediaService(repoAvec(rows), new FakeStorageService());

    await expect(service.updateOwn('inconnu', FREELANCE, { title: 'X' })).rejects.toThrow(
      NotFoundException,
    );
  });
});
