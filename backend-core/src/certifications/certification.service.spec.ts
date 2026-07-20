import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { FindOperator } from 'typeorm';
import { PDFDocument, PDFName } from 'pdf-lib';
import { CertificationService } from './certification.service';
import { Certification } from './certification.entity';
import { STORAGE_SERVICE } from '../storage/storage.service';
import { FakeStorageService } from '../storage/fake-storage.service';
import { CertificationType, CertificationStatus, UserRole } from '../common/enums';
import { UploadCertificationDto } from './dto/upload-certification.dto';
import { QueryCertificationDto } from './dto/query-certification.dto';
import { JwtPayload } from '../auth/guards/jwt-auth.guard';

/** Évalue une valeur de `where` en gérant les FindOperator TypeORM (In, Not) utilisés par le service. */
function matchesValue(actual: unknown, expected: unknown): boolean {
  if (expected instanceof FindOperator) {
    const op = expected as FindOperator<unknown>;
    if (op.type === 'in') return (op.value as unknown[]).includes(actual);
    if (op.type === 'not') return !matchesValue(actual, op.value);
    throw new Error(`Opérateur non géré par le fake : ${op.type}`);
  }
  return actual === expected;
}

/** Faux repository Certification en mémoire (create / save / findOne / findAndCount). */
class FakeCertificationRepository {
  private store: Certification[] = [];

  create(partial: Partial<Certification>): Certification {
    return { ...partial } as Certification;
  }

  save(cert: Certification): Promise<Certification> {
    if (!cert.id) {
      cert.id = randomUUID();
    }
    if (!cert.uploadedAt) {
      cert.uploadedAt = new Date();
    }
    const idx = this.store.findIndex((c) => c.id === cert.id);
    if (idx >= 0) {
      this.store[idx] = cert;
    } else {
      this.store.push(cert);
    }
    return Promise.resolve(cert);
  }

  findOne({ where }: { where: Record<string, unknown> }): Promise<Certification | null> {
    const keys = Object.keys(where);
    const found = this.store.find((c) =>
      keys.every((k) => matchesValue((c as unknown as Record<string, unknown>)[k], where[k])),
    );
    return Promise.resolve(found ?? null);
  }

  findAndCount(options: {
    where?: Record<string, unknown>;
    order?: { uploadedAt?: 'ASC' | 'DESC' };
    skip?: number;
    take?: number;
  }): Promise<[Certification[], number]> {
    const where = options.where ?? {};
    const keys = Object.keys(where);
    let rows = this.store.filter((c) =>
      keys.every((k) => matchesValue((c as unknown as Record<string, unknown>)[k], where[k])),
    );
    if (options.order?.uploadedAt === 'DESC') {
      rows = [...rows].sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime());
    }
    const total = rows.length;
    const skip = options.skip ?? 0;
    const end = options.take != null ? skip + options.take : undefined;
    return Promise.resolve([rows.slice(skip, end), total]);
  }
}

// Construit un PDF valide en mémoire avec des métadonnées à assainir.
async function makePdf(author = 'Jean Dupont', title = 'Document confidentiel'): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.addPage();
  doc.setAuthor(author);
  doc.setTitle(title);
  doc.setProducer('Logiciel-Secret 1.0');
  return Buffer.from(await doc.save());
}

// Construit un PDF porteur d'un flux XMP /Metadata (où se cachent auteur, GPS, logiciel).
async function makePdfWithXmp(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.addPage();
  const xmp = '<x:xmpmeta><dc:creator>Jean Dupont</dc:creator><geo>48.85,2.35</geo></x:xmpmeta>';
  const stream = doc.context.stream(xmp, { Type: 'Metadata', Subtype: 'XML' });
  doc.catalog.set(PDFName.of('Metadata'), doc.context.register(stream));
  return Buffer.from(await doc.save());
}

// Fabrique un faux fichier multer (seuls buffer/size/mimetype sont lus par le service).
function fakeFile(buffer: Buffer): Express.Multer.File {
  return {
    fieldname: 'file',
    originalname: 'cert.pdf',
    mimetype: 'application/pdf',
    size: buffer.length,
    buffer,
  } as Express.Multer.File;
}

function q(overrides: Partial<QueryCertificationDto> = {}): QueryCertificationDto {
  return { page: 1, limit: 20, ...overrides } as QueryCertificationDto;
}

const admin: JwtPayload = { userId: 'admin-1', email: 'admin@x.io', role: UserRole.ADMIN };
const asFreelance = (id: string): JwtPayload => ({ userId: id, email: `${id}@x.io`, role: UserRole.FREELANCE });

describe('📜 CertificationService (SH-10)', () => {
  let service: CertificationService;
  let storage: FakeStorageService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CertificationService,
        { provide: getRepositoryToken(Certification), useClass: FakeCertificationRepository },
        { provide: STORAGE_SERVICE, useClass: FakeStorageService },
      ],
    }).compile();

    service = module.get<CertificationService>(CertificationService);
    storage = module.get<FakeStorageService>(STORAGE_SERVICE);
  });

  const dto = (overrides: Partial<UploadCertificationDto> = {}): UploadCertificationDto =>
    ({
      type: CertificationType.DGAC_DRONE,
      number: 'FR-DGAC-1',
      validUntil: new Date('2030-01-01'),
      ...overrides,
    }) as UploadCertificationDto;

  const keyOf = (c: { freelanceId: string; id: string }): string =>
    `private/certifications/${c.freelanceId}/${c.id}.pdf`;

  // --- Scénario 1 : Upload réussi ---
  it('accepte un PDF valide, l\'assainit, le stocke et crée une certif PENDING', async () => {
    const pdf = await makePdf();

    const result = await service.uploadCertification('free-A', dto(), fakeFile(pdf));

    expect(result.status).toBe(CertificationStatus.PENDING);
    expect(result.freelanceId).toBe('free-A');
    expect(result.mimeType).toBe('application/pdf');
    // Le fichier a bien été déposé dans le stockage (chiffrement AES-256 assuré par l'adaptateur S3)
    const stored = storage.get(keyOf(result));
    expect(stored).toBeDefined();
    // Métadonnées assainies : auteur/titre/producer retirés
    const reloaded = await PDFDocument.load(stored as Buffer);
    expect(reloaded.getAuthor() ?? '').toBe('');
    expect(reloaded.getTitle() ?? '').toBe('');
    // La réponse publique ne fuite jamais la clé de stockage interne (minimisation)
    expect((result as unknown as Record<string, unknown>).s3Key).toBeUndefined();
  });

  it('retire aussi le flux XMP /Metadata du catalogue (purge PII complète RGPD)', async () => {
    const pdf = await makePdfWithXmp();

    const result = await service.uploadCertification('free-A', dto(), fakeFile(pdf));

    const reloaded = await PDFDocument.load(storage.get(keyOf(result)) as Buffer);
    // Le flux XMP (auteur/GPS) ne doit plus exister après assainissement
    expect(reloaded.catalog.has(PDFName.of('Metadata'))).toBe(false);
  });

  // --- Scénario 2 : Format / taille invalide ---
  it('rejette (400) un fichier dont les magic bytes ne sont pas %PDF', async () => {
    const notPdf = Buffer.from('MZ ceci est un exécutable déguisé');

    await expect(service.uploadCertification('free-A', dto(), fakeFile(notPdf))).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejette (400) un fichier au-delà de la taille maximale', async () => {
    const big = Buffer.alloc(6 * 1024 * 1024); // 6 Mo > défaut 5 Mo
    big.set([0x25, 0x50, 0x44, 0x46], 0); // en-tête %PDF (la taille est contrôlée en premier)

    await expect(service.uploadCertification('free-A', dto(), fakeFile(big))).rejects.toThrow(
      BadRequestException,
    );
  });

  // --- Scénario 3 : Dedup anti-fraude ---
  it('rejette (409) un numéro de brevet déjà déclaré par un AUTRE compte', async () => {
    const pdf = await makePdf();
    await service.uploadCertification('free-B', dto({ number: 'NUM-1' }), fakeFile(pdf));

    await expect(
      service.uploadCertification('free-A', dto({ number: 'NUM-1' }), fakeFile(await makePdf())),
    ).rejects.toThrow(ConflictException);
  });

  it('n\'empêche pas le même compte de redéposer son propre numéro (dedup cross-comptes uniquement)', async () => {
    await service.uploadCertification('free-B', dto({ number: 'NUM-2' }), fakeFile(await makePdf()));

    await expect(
      service.uploadCertification('free-B', dto({ number: 'NUM-2' }), fakeFile(await makePdf())),
    ).resolves.toBeDefined();
  });

  // --- Scénario 4 : Consultation Admin via Signed URL ---
  it('renvoie une Signed URL au propriétaire et à l\'Admin', async () => {
    const cert = await service.uploadCertification('free-A', dto(), fakeFile(await makePdf()));

    const byOwner = await service.getDocumentUrl(cert.id, asFreelance('free-A'));
    const byAdmin = await service.getDocumentUrl(cert.id, admin);

    expect(byOwner.url).toContain(encodeURIComponent(keyOf(cert)));
    expect(byAdmin.url).toContain(encodeURIComponent(keyOf(cert)));
  });

  // --- Scénario 7 : Étanchéité RBAC ---
  it('interdit (403) à un Freelance non-propriétaire de consulter le document d\'autrui', async () => {
    const cert = await service.uploadCertification('free-A', dto(), fakeFile(await makePdf()));

    await expect(service.getDocumentUrl(cert.id, asFreelance('free-B'))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('renvoie 404 pour le document d\'une certification inexistante', async () => {
    await expect(service.getDocumentUrl('inconnu', admin)).rejects.toThrow(NotFoundException);
  });

  // --- Scénario 5 : Validation / rejet + purge RGPD ---
  it.each([CertificationStatus.VALIDATED, CertificationStatus.REJECTED])(
    'purge le document après décision %s (delete + s3Key=null + purgedAt)',
    async (decision) => {
      const cert = await service.uploadCertification('free-A', dto(), fakeFile(await makePdf()));
      const key = keyOf(cert);
      expect(storage.get(key)).toBeDefined();

      const reviewed = await service.reviewCertification(cert.id, { decision });

      expect(reviewed.status).toBe(decision);
      expect(reviewed.reviewedAt).toBeInstanceOf(Date);
      expect(reviewed.purgedAt).toBeInstanceOf(Date);
      // Document réellement purgé du stockage
      expect(storage.get(key)).toBeUndefined();
      // Et plus accessible via Signed URL
      await expect(service.getDocumentUrl(cert.id, admin)).rejects.toThrow(NotFoundException);
    },
  );

  // --- Scénario 6 : Double traitement ---
  it('refuse (409) une seconde décision sur une certification déjà traitée', async () => {
    const cert = await service.uploadCertification('free-A', dto(), fakeFile(await makePdf()));
    await service.reviewCertification(cert.id, { decision: CertificationStatus.VALIDATED });

    await expect(
      service.reviewCertification(cert.id, { decision: CertificationStatus.REJECTED }),
    ).rejects.toThrow(ConflictException);
  });

  it('refuse (404) la revue d\'une certification inexistante', async () => {
    await expect(
      service.reviewCertification('inexistant', { decision: CertificationStatus.VALIDATED }),
    ).rejects.toThrow(NotFoundException);
  });

  // --- Étanchéité de la liste « mes certifications » ---
  it('garantit l\'étanchéité : un Freelance ne liste que ses propres certifications', async () => {
    await service.uploadCertification('free-A', dto({ number: 'A-1' }), fakeFile(await makePdf()));
    await service.uploadCertification('free-A', dto({ number: 'A-2' }), fakeFile(await makePdf()));
    await service.uploadCertification('free-B', dto({ number: 'B-1' }), fakeFile(await makePdf()));

    const mine = await service.getMyCertifications('free-A', q());

    expect(mine.total).toBe(2);
    expect(mine.items.every((c) => c.freelanceId === 'free-A')).toBe(true);
  });

  // --- File de validation admin ---
  it('ne liste que les certifications PENDING dans la file de validation', async () => {
    const a = await service.uploadCertification('free-A', dto({ number: 'A-1' }), fakeFile(await makePdf()));
    await service.uploadCertification('free-B', dto({ number: 'B-1' }), fakeFile(await makePdf()));
    await service.reviewCertification(a.id, { decision: CertificationStatus.VALIDATED }); // sort de la file

    const pending = await service.listPendingForValidation(q());

    expect(pending.total).toBe(1);
    expect(pending.items.every((c) => c.status === CertificationStatus.PENDING)).toBe(true);
  });
});
