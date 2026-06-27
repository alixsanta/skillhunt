import {
  Injectable,
  Inject,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere, In, Not } from 'typeorm';
import { randomUUID } from 'crypto';
import { PDFDocument } from 'pdf-lib';
import { Certification } from './certification.entity';
import { CertificationStatus, UserRole } from '../common/enums';
import { STORAGE_SERVICE, StorageService } from '../storage/storage.service';
import { JwtPayload } from '../auth/guards/jwt-auth.guard';
import { UploadCertificationDto } from './dto/upload-certification.dto';
import { ReviewCertificationDto } from './dto/review-certification.dto';
import { QueryCertificationDto } from './dto/query-certification.dto';

// Vue publique d'une certification : EXCLUT `s3Key` (clé de stockage interne, minimisation R3).
export interface PublicCertification {
  id: string;
  freelanceId: string;
  type: Certification['type'];
  number: string;
  validUntil: string;
  status: CertificationStatus;
  mimeType: string;
  uploadedAt: Date;
  reviewedAt: Date | null;
  purgedAt: Date | null;
}

export interface PaginatedCertifications {
  items: PublicCertification[];
  total: number;
  page: number;
  limit: number;
}

// Magic bytes d'un PDF : « %PDF » = 0x25 0x50 0x44 0x46 (R7 : on ne fait jamais confiance à l'extension).
const PDF_MAGIC = Buffer.from([0x25, 0x50, 0x44, 0x46]);

@Injectable()
export class CertificationService {
  constructor(
    @InjectRepository(Certification)
    private readonly certRepo: Repository<Certification>,
    @Inject(STORAGE_SERVICE)
    private readonly storage: StorageService,
  ) {}

  /** Upload d'une certification par un Freelance : validation, dedup, assainissement, stockage chiffré. */
  async uploadCertification(
    freelanceId: string,
    dto: UploadCertificationDto,
    file: Express.Multer.File,
  ): Promise<PublicCertification> {
    if (!file?.buffer) {
      throw new BadRequestException('Fichier manquant');
    }

    // Taille : contrôlée en premier (rejet le moins coûteux)
    const maxBytes = this.maxFileMb * 1024 * 1024;
    if (file.size > maxBytes) {
      throw new BadRequestException(`Fichier trop volumineux (maximum ${this.maxFileMb} Mo)`);
    }

    // MIME réel par magic bytes, jamais l'extension (R7, anti-injection — C2.2.3)
    if (!this.isPdf(file.buffer)) {
      throw new BadRequestException('Format non supporté : un PDF est attendu');
    }

    // Dedup anti-fraude (R2) : même {type, number} déjà déclaré (en attente ou validé) par un AUTRE compte
    const duplicate = await this.certRepo.findOne({
      where: {
        type: dto.type,
        number: dto.number,
        status: In([CertificationStatus.PENDING, CertificationStatus.VALIDATED]),
        freelanceId: Not(freelanceId),
      },
    });
    if (duplicate) {
      throw new ConflictException('Ce numéro de brevet est déjà déclaré sur un autre compte');
    }

    // Strip des métadonnées embarquées (XMP/Info : auteur, GPS, logiciel) AVANT stockage (RGPD R3)
    const cleaned = await this.stripPdfMetadata(file.buffer);

    const id = randomUUID();
    const s3Key = `private/certifications/${freelanceId}/${id}.pdf`;

    // TODO sécurité : brancher un scan antivirus (ClamAV) avant stockage (UX progress bar §3.4.4, ticket futur).
    // TODO sécurité : si le put réussit mais l'insert échoue, l'objet devient orphelin
    //   → prévoir une purge cron des PENDING orphelins / lifecycle rule S3 (ticket futur).
    await this.storage.put(s3Key, cleaned, 'application/pdf'); // chiffrement AES-256 au repos (SH-31)

    const cert = this.certRepo.create({
      id,
      freelanceId,
      type: dto.type,
      number: dto.number,
      validUntil: this.toDateOnly(dto.validUntil),
      status: CertificationStatus.PENDING,
      s3Key,
      mimeType: 'application/pdf',
    });
    const saved = await this.certRepo.save(cert);
    return this.toPublic(saved);
  }

  /** Liste paginée des certifications d'UN Freelance (étanchéité : filtrée sur son id, issu du token). */
  getMyCertifications(
    freelanceId: string,
    query: QueryCertificationDto,
  ): Promise<PaginatedCertifications> {
    const where: FindOptionsWhere<Certification> = { freelanceId };
    if (query.status) {
      where.status = query.status;
    }
    return this.paginate(where, query);
  }

  /** File de validation admin : certifications en attente (PENDING), tous freelances confondus. */
  listPendingForValidation(query: QueryCertificationDto): Promise<PaginatedCertifications> {
    return this.paginate({ status: CertificationStatus.PENDING }, query);
  }

  /**
   * Signed URL d'accès au document (durée courte). Réservé au propriétaire (Freelance) ou à un Admin.
   * Aucun lien permanent, bucket privé (R8).
   */
  async getDocumentUrl(certId: string, user: JwtPayload): Promise<{ url: string }> {
    const cert = await this.certRepo.findOne({ where: { id: certId } });
    if (!cert) {
      throw new NotFoundException('Certification introuvable');
    }
    // Étanchéité : un Freelance ne peut consulter QUE ses propres documents (un Admin, tous)
    if (user.role === UserRole.FREELANCE && cert.freelanceId !== user.userId) {
      throw new ForbiddenException('Accès refusé à ce document');
    }
    if (!cert.s3Key) {
      throw new NotFoundException('Document indisponible (purgé après vérification)');
    }
    const url = await this.storage.getSignedUrl(cert.s3Key, this.signedUrlTtl);
    return { url };
  }

  /**
   * Décision admin : PENDING -> VALIDATED | REJECTED (transition unique).
   * Purge RGPD du document sur les DEUX issues (on ne conserve jamais le PDF au-delà de sa finalité).
   */
  async reviewCertification(
    certId: string,
    dto: ReviewCertificationDto,
  ): Promise<PublicCertification> {
    const cert = await this.certRepo.findOne({ where: { id: certId } });
    if (!cert) {
      throw new NotFoundException('Certification introuvable');
    }
    if (cert.status !== CertificationStatus.PENDING) {
      throw new ConflictException('Cette certification a déjà été traitée');
    }

    cert.status = dto.decision;
    cert.reviewedAt = new Date();
    if (dto.validUntil) {
      // L'Admin peut confirmer/corriger la date de validité au moment de la décision
      cert.validUntil = this.toDateOnly(dto.validUntil);
    }

    // Purge : suppression effective du document + matérialisation de la minimisation (R3)
    if (cert.s3Key) {
      await this.storage.delete(cert.s3Key);
      cert.s3Key = null;
      cert.purgedAt = new Date();
    }

    const saved = await this.certRepo.save(cert);
    return this.toPublic(saved);
  }

  // --- Helpers internes ---

  private get maxFileMb(): number {
    return parseInt(process.env.CERT_MAX_FILE_MB ?? '5', 10);
  }

  private get signedUrlTtl(): number {
    return parseInt(process.env.CERT_SIGNED_URL_TTL ?? '900', 10);
  }

  private isPdf(buffer: Buffer): boolean {
    return buffer.length >= 4 && buffer.subarray(0, 4).equals(PDF_MAGIC);
  }

  /** Réécrit le PDF en neutralisant les métadonnées embarquées (Info + dates). */
  private async stripPdfMetadata(buffer: Buffer): Promise<Buffer> {
    try {
      const doc = await PDFDocument.load(buffer);
      doc.setTitle('');
      doc.setAuthor('');
      doc.setSubject('');
      doc.setKeywords([]);
      doc.setProducer('');
      doc.setCreator('');
      const epoch = new Date(0);
      doc.setCreationDate(epoch);
      doc.setModificationDate(epoch);
      return Buffer.from(await doc.save());
    } catch {
      // PDF chiffré/corrompu illisible par pdf-lib : on refuse plutôt que de stocker un fichier douteux
      throw new BadRequestException('PDF illisible ou corrompu');
    }
  }

  private toDateOnly(date: Date): string {
    // Stockage en colonne `date` (YYYY-MM-DD), sans composante horaire
    return date.toISOString().slice(0, 10);
  }

  private toPublic(cert: Certification): PublicCertification {
    // Exclut explicitement `s3Key` (clé de stockage interne) des réponses API
    return {
      id: cert.id,
      freelanceId: cert.freelanceId,
      type: cert.type,
      number: cert.number,
      validUntil: cert.validUntil,
      status: cert.status,
      mimeType: cert.mimeType,
      uploadedAt: cert.uploadedAt,
      reviewedAt: cert.reviewedAt,
      purgedAt: cert.purgedAt,
    };
  }

  private async paginate(
    where: FindOptionsWhere<Certification>,
    query: QueryCertificationDto,
  ): Promise<PaginatedCertifications> {
    const { page, limit } = query;
    const [rows, total] = await this.certRepo.findAndCount({
      where,
      order: { uploadedAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items: rows.map((c) => this.toPublic(c)), total, page, limit };
  }
}
