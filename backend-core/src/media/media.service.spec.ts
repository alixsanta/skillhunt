import {
  ConflictException,
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Not, Repository } from 'typeorm';
import { MediaService } from './media.service';
import { Media } from './media.entity';
import { MediaStatus } from '../common/enums';
import { FakeStorageService } from '../storage/fake-storage.service';
import { CreateMediaDto } from './dto/create-media.dto';

const FREELANCE = '11111111-1111-1111-1111-111111111111';

// Bouchon de file : les tests de déclaration et de listing n'enfilent aucun job.
const queueBouchon = { enqueueTranscode: jest.fn() } as never;

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
    const service = new MediaService(fakeRepo(), storage, queueBouchon);

    const result = await service.createDraft(FREELANCE, dto());

    expect(result.media.status).toBe(MediaStatus.DRAFT);
    expect(result.upload.method).toBe('PUT');
    expect(result.upload.url).toContain('upload=1');
    expect(result.upload.headers['Content-Type']).toBe('video/mp4');
    expect(result.upload.expiresIn).toBe(900);
  });

  it('n\'expose AUCUNE clé de stockage interne', async () => {
    const service = new MediaService(fakeRepo(), storage, queueBouchon);

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
    const service = new MediaService(fakeRepo(), storage, queueBouchon);

    const key = service.buildSourceKey(FREELANCE, 'm1', 'video/mp4');

    expect(key).toBe(`private/media/${FREELANCE}/m1/master.mp4`);
  });

  it('choisit l\'extension d\'après le type MIME, jamais d\'après un nom de fichier', async () => {
    const service = new MediaService(fakeRepo(), storage, queueBouchon);

    expect(service.buildSourceKey(FREELANCE, 'm1', 'video/quicktime')).toMatch(/master\.mov$/);
  });

  it('refuse une taille annoncée au-delà du plafond', async () => {
    process.env.MEDIA_MAX_FILE_MB = '1';
    const service = new MediaService(fakeRepo(), storage, queueBouchon);

    await expect(service.createDraft(FREELANCE, dto({ sizeBytes: 2 * 1024 * 1024 }))).rejects.toThrow(
      BadRequestException,
    );
  });

  it('refuse au-delà du quota de médias', async () => {
    process.env.MEDIA_MAX_PER_FREELANCE = '1';
    const rows = [{ id: 'deja-la', status: MediaStatus.READY } as Media];
    const service = new MediaService(fakeRepo(rows), storage, queueBouchon);

    await expect(service.createDraft(FREELANCE, dto())).rejects.toThrow(ConflictException);
  });

  it('interroge le quota sur les seuls médias non FAILED du freelance', async () => {
    const repo = fakeRepo();
    const service = new MediaService(repo, storage, queueBouchon);

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
    const service = new MediaService(repoAvec(rows), new FakeStorageService(), queueBouchon);

    const page = await service.getMine(FREELANCE, {});

    // Étanchéité (C2.2.2) : le média du voisin ne doit jamais apparaître.
    expect(page.items.map((m) => m.id).sort()).toEqual(['a', 'b']);
    expect(page.total).toBe(2);
  });

  it('filtre par statut', async () => {
    const service = new MediaService(repoAvec(rows), new FakeStorageService(), queueBouchon);

    const page = await service.getMine(FREELANCE, { status: MediaStatus.READY });

    expect(page.items.map((m) => m.id)).toEqual(['a']);
  });

  it('met à jour le titre de son propre média', async () => {
    const service = new MediaService(repoAvec(rows), new FakeStorageService(), queueBouchon);

    const updated = await service.updateOwn('a', FREELANCE, { title: 'Nouveau titre' });

    expect(updated.title).toBe('Nouveau titre');
  });

  it('refuse de modifier le média d\'un autre freelance', async () => {
    const service = new MediaService(repoAvec(rows), new FakeStorageService(), queueBouchon);

    // 404 et non 403 : l'existence d'un média d'autrui ne doit pas être révélée.
    await expect(service.updateOwn('c', FREELANCE, { title: 'Pirate' })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('rejette un média inconnu', async () => {
    const service = new MediaService(repoAvec(rows), new FakeStorageService(), queueBouchon);

    await expect(service.updateOwn('inconnu', FREELANCE, { title: 'X' })).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('MediaService — confirmation du dépôt', () => {
  const MEDIA_ID = '33333333-3333-3333-3333-333333333333';

  // Même isolation que le bloc « déclaration » : un test qui abaisse le plafond
  // (voir plus bas) ne doit pas contaminer les tests suivants.
  beforeEach(() => {
    process.env.MEDIA_MAX_FILE_MB = '500';
    process.env.MEDIA_MAX_PER_FREELANCE = '20';
    process.env.MEDIA_SIGNED_URL_TTL = '900';
  });

  function contexte(overrides: Partial<Media> = {}) {
    const media = {
      id: MEDIA_ID,
      freelanceId: FREELANCE,
      status: MediaStatus.DRAFT,
      sourceKey: `private/media/${FREELANCE}/${MEDIA_ID}/master.mp4`,
      mimeType: 'video/mp4',
      renditions: null,
      sizeBytes: null,
      ...overrides,
    } as Media;

    const repo = {
      findOne: async () => media,
      save: async (entity: Media) => entity,
    } as unknown as Repository<Media>;

    const storage = new FakeStorageService();
    const queue = { enqueueTranscode: jest.fn().mockResolvedValue(undefined) };
    const service = new MediaService(repo, storage, queue as never);

    return { media, storage, queue, service };
  }

  it('vérifie le dépôt réel, passe en UPLOADED et enfile le job', async () => {
    const { media, storage, queue, service } = contexte();
    await storage.put(media.sourceKey, Buffer.alloc(2048), 'video/mp4');

    const result = await service.completeUpload(MEDIA_ID, FREELANCE);

    expect(result.status).toBe(MediaStatus.UPLOADED);
    expect(result.sizeBytes).toBe(2048);
    expect(queue.enqueueTranscode).toHaveBeenCalledWith({
      mediaId: MEDIA_ID,
      sourceKey: media.sourceKey,
      outputPrefix: `private/media/${FREELANCE}/${MEDIA_ID}/hls/`,
      posterKey: `private/media/${FREELANCE}/${MEDIA_ID}/poster.jpg`,
    });
  });

  it('refuse si aucun objet n\'a été déposé', async () => {
    const { service, queue } = contexte();

    await expect(service.completeUpload(MEDIA_ID, FREELANCE)).rejects.toThrow(BadRequestException);
    expect(queue.enqueueTranscode).not.toHaveBeenCalled();
  });

  it('purge et refuse quand la taille RÉELLE dépasse le plafond', async () => {
    process.env.MEDIA_MAX_FILE_MB = '1';
    const { media, storage, service } = contexte();
    // L'annonce disait 10 Ko à la déclaration ; le dépôt réel fait 2 Mo.
    await storage.put(media.sourceKey, Buffer.alloc(2 * 1024 * 1024), 'video/mp4');

    await expect(service.completeUpload(MEDIA_ID, FREELANCE)).rejects.toThrow(BadRequestException);
    // L'objet mensonger ne doit pas rester à occuper le stockage.
    await expect(storage.head(media.sourceKey)).rejects.toThrow();
  });

  it('purge et refuse quand le type RÉEL n\'est pas dans la liste blanche', async () => {
    const { media, storage, service } = contexte();
    await storage.put(media.sourceKey, Buffer.alloc(16), 'application/x-msdownload');

    await expect(service.completeUpload(MEDIA_ID, FREELANCE)).rejects.toThrow(BadRequestException);
    await expect(storage.head(media.sourceKey)).rejects.toThrow();
  });

  it('refuse la confirmation d\'un média d\'autrui', async () => {
    const { service } = contexte({ freelanceId: '99999999-9999-9999-9999-999999999999' });

    await expect(service.completeUpload(MEDIA_ID, FREELANCE)).rejects.toThrow(NotFoundException);
  });

  it('refuse de reconfirmer un média déjà traité', async () => {
    const { storage, media, service } = contexte({ status: MediaStatus.READY });
    await storage.put(media.sourceKey, Buffer.alloc(16), 'video/mp4');

    await expect(service.completeUpload(MEDIA_ID, FREELANCE)).rejects.toThrow(ConflictException);
  });

  it('remonte un 503 quand la file est indisponible, sans perdre le dépôt déjà vérifié', async () => {
    const { media, storage, queue, service } = contexte();
    await storage.put(media.sourceKey, Buffer.alloc(2048), 'video/mp4');
    // Panne de Redis simulée : `MediaQueue.enqueueTranscode` transforme ça en 503 (voir
    // media.queue.ts). Ici, on ne teste pas MediaQueue — on teste que MediaService laisse
    // remonter cette exception SANS avaler l'erreur ni perdre l'état déjà persisté.
    queue.enqueueTranscode.mockRejectedValueOnce(
      new ServiceUnavailableException('Le service de transcodage est momentanément indisponible.'),
    );

    await expect(service.completeUpload(MEDIA_ID, FREELANCE)).rejects.toThrow(
      ServiceUnavailableException,
    );

    // Le dépôt était valide et vérifié (taille + type déjà contrôlés) : une panne de file
    // ne doit JAMAIS faire perdre la trace d'un fichier bien déposé. `media` est l'entité
    // réellement mutée puis passée à `save` par le service — on vérifie l'état persisté,
    // pas seulement l'absence d'exception muette.
    expect(media.status).toBe(MediaStatus.UPLOADED);
    expect(media.sizeBytes).toBe('2048');
  });
});

// ── SH-54 — Suppression d'un média ────────────────────────────────────────────────────
// Avant ce ticket, le 409 de quota disait « Supprimez-en un avant d'en ajouter » alors
// qu'aucune route ne le permettait : un quota plein était une impasse définitive.
describe('MediaService — suppression (SH-54)', () => {
  const AUTRE = '22222222-2222-2222-2222-222222222222';
  const MEDIA_ID = '77777777-7777-7777-7777-777777777777';
  const PREFIXE = `private/media/${FREELANCE}/${MEDIA_ID}/`;

  let storage: FakeStorageService;

  /** Dépôt espionnable : la suppression doit être vérifiée sur l'appel RÉELLEMENT émis. */
  function contexte(status: MediaStatus, proprietaire = FREELANCE) {
    const media = {
      id: MEDIA_ID,
      freelanceId: proprietaire,
      status,
      sourceKey: `private/media/${proprietaire}/${MEDIA_ID}/master.mp4`,
      mimeType: 'video/mp4',
    } as Media;

    const remove = jest.fn(async (entity: Media) => entity);
    const repo = {
      findOne: async ({ where }: { where: { id: string } }) =>
        where.id === MEDIA_ID ? media : null,
      remove,
    } as unknown as Repository<Media>;

    const releaseTranscode = jest.fn(async () => true);
    const queue = { enqueueTranscode: jest.fn(), releaseTranscode };

    return { service: new MediaService(repo, storage, queue as never), remove, releaseTranscode };
  }

  /** Dépose les objets d'un média transcodé, plus ceux d'un AUTRE média du même freelance. */
  async function seedObjects(proprietaire = FREELANCE) {
    const base = `private/media/${proprietaire}/${MEDIA_ID}/`;
    await storage.put(`${base}master.mp4`, Buffer.from('m'), 'video/mp4');
    await storage.put(`${base}poster.jpg`, Buffer.from('p'), 'image/jpeg');
    await storage.put(`${base}hls/720p.m3u8`, Buffer.from('l'), 'application/vnd.apple.mpegurl');
    await storage.put(`${base}hls/720p/seg-00000.ts`, Buffer.from('s'), 'video/mp2t');
    // Voisin : un autre média du MÊME freelance, qui doit survivre à la purge.
    await storage.put(`private/media/${proprietaire}/voisin/master.mp4`, Buffer.from('v'), 'video/mp4');
  }

  beforeEach(() => {
    storage = new FakeStorageService();
  });

  it('supprime la ligne ET tous les objets du média, sans toucher au média voisin', async () => {
    await seedObjects();
    const { service, remove } = contexte(MediaStatus.READY);

    await service.deleteOwn(MEDIA_ID, FREELANCE);

    expect(remove).toHaveBeenCalledWith(expect.objectContaining({ id: MEDIA_ID }));
    // Supprimer la ligne sans les objets laisserait du stockage orphelin, facturé.
    for (const cle of ['master.mp4', 'poster.jpg', 'hls/720p.m3u8', 'hls/720p/seg-00000.ts']) {
      expect(storage.peek(`${PREFIXE}${cle}`)).toBeUndefined();
    }
    expect(storage.peek(`private/media/${FREELANCE}/voisin/master.mp4`)).toBeDefined();
  });

  it("ÉTANCHÉITÉ : refuse en 404 le média d'un autre freelance, et ne supprime RIEN", async () => {
    // 404 et non 403, comme `updateOwn` : l'existence du média d'autrui n'a pas à être
    // révélée. Ce test tombe si le contrôle de propriété saute (C2.2.3).
    await seedObjects(AUTRE);
    const { service, remove, releaseTranscode } = contexte(MediaStatus.READY, AUTRE);

    await expect(service.deleteOwn(MEDIA_ID, FREELANCE)).rejects.toThrow(NotFoundException);

    expect(remove).not.toHaveBeenCalled();
    expect(releaseTranscode).not.toHaveBeenCalled();
    expect(storage.peek(`private/media/${AUTRE}/${MEDIA_ID}/master.mp4`)).toBeDefined();
  });

  it('rejette un média inconnu en 404', async () => {
    const { service, remove } = contexte(MediaStatus.READY);

    await expect(
      service.deleteOwn('99999999-9999-9999-9999-999999999999', FREELANCE),
    ).rejects.toThrow(NotFoundException);
    expect(remove).not.toHaveBeenCalled();
  });

  it('refuse en 409 tant que le transcodage est RÉELLEMENT en cours, sans rien supprimer', async () => {
    // Supprimer sous les pieds d'un worker en plein encodage laisserait celui-ci
    // redéposer ses sorties APRÈS la purge : du stockage orphelin, sans ligne pour le
    // retrouver. Le refus est tranché sur l'état réel du job, pas sur le statut en base.
    await seedObjects();
    const { service, remove, releaseTranscode } = contexte(MediaStatus.UPLOADED);
    releaseTranscode.mockResolvedValue(false);

    await expect(service.deleteOwn(MEDIA_ID, FREELANCE)).rejects.toThrow(ConflictException);

    expect(remove).not.toHaveBeenCalled();
    expect(storage.peek(`${PREFIXE}master.mp4`)).toBeDefined();
  });

  it.each([MediaStatus.UPLOADED, MediaStatus.PROCESSING, MediaStatus.READY, MediaStatus.FAILED])(
    'libère le job de la file avant de supprimer un média %s',
    async (status) => {
      // UPLOADED / PROCESSING : un job en attente est retiré, il ne tournera jamais.
      // READY / FAILED : le job terminé est nettoyé — les échecs restent sinon
      // indéfiniment dans la file (`removeOnFail: false`).
      // Un média resté bloqué en UPLOADED dont le job est fini redevient supprimable.
      const { service, remove, releaseTranscode } = contexte(status);

      await service.deleteOwn(MEDIA_ID, FREELANCE);

      expect(releaseTranscode).toHaveBeenCalledWith(MEDIA_ID);
      expect(remove).toHaveBeenCalled();
    },
  );

  it("supprime un DRAFT SANS interroger la file : aucun job n'a jamais existé pour lui", async () => {
    // Un dépôt raté laisse un DRAFT qui compte dans le quota. Il doit rester
    // supprimable même si Redis est indisponible — d'où l'absence d'appel à la file.
    const { service, remove, releaseTranscode } = contexte(MediaStatus.DRAFT);
    releaseTranscode.mockRejectedValue(new ServiceUnavailableException('Redis indisponible'));

    await service.deleteOwn(MEDIA_ID, FREELANCE);

    expect(releaseTranscode).not.toHaveBeenCalled();
    expect(remove).toHaveBeenCalled();
  });

  it('purge le stockage AVANT la ligne : si la purge échoue, la ligne reste pour réessayer', async () => {
    // L'ordre inverse laisserait des objets orphelins que plus rien ne référence.
    const { service, remove } = contexte(MediaStatus.READY);
    jest.spyOn(storage, 'deletePrefix').mockRejectedValue(new Error('S3 indisponible'));

    await expect(service.deleteOwn(MEDIA_ID, FREELANCE)).rejects.toThrow('S3 indisponible');

    expect(remove).not.toHaveBeenCalled();
  });

  it('purge exactement le préfixe du média, terminé par « / »', async () => {
    // Sans le séparateur final, `…/m1` emporterait aussi `…/m10/…` (cf. storage.service.ts).
    const { service } = contexte(MediaStatus.READY);
    const purge = jest.spyOn(storage, 'deletePrefix');

    await service.deleteOwn(MEDIA_ID, FREELANCE);

    expect(purge).toHaveBeenCalledTimes(1);
    expect(purge).toHaveBeenCalledWith(PREFIXE);
  });
});
