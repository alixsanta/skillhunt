import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { Media, MediaRendition } from './media.entity';
import { MediaStatus, MediaType } from '../common/enums';
import { STORAGE_SERVICE, StorageService } from '../storage/storage.service';
import { CreateMediaDto } from './dto/create-media.dto';

/**
 * Vue publique d'un média. EXCLUT `sourceKey`, `posterKey` et `hlsPrefix` : aucune clé
 * de stockage interne ne sort de l'API (minimisation, comme `PublicCertification`).
 */
export interface PublicMedia {
  id: string;
  freelanceId: string;
  title: string;
  description: string | null;
  type: MediaType;
  status: MediaStatus;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  sizeBytes: number | null;
  mimeType: string;
  renditions: Array<Omit<MediaRendition, 'playlistKey'>> | null;
  errorReason: string | null;
  createdAt: Date;
  processedAt: Date | null;
}

/** Instructions de dépôt rendues au navigateur. */
export interface UploadInstructions {
  url: string;
  method: 'PUT';
  headers: Record<string, string>;
  expiresIn: number;
}

// Extension dérivée du type MIME — jamais d'un nom de fichier fourni par le client (R7).
const EXTENSIONS: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
};

@Injectable()
export class MediaService {
  constructor(
    @InjectRepository(Media)
    private readonly mediaRepo: Repository<Media>,
    @Inject(STORAGE_SERVICE)
    private readonly storage: StorageService,
  ) {}

  /**
   * Déclare un média et délivre son URL de dépôt (C2.2.3).
   *
   * L'identité vient du token, jamais d'un `{id}` client : un freelance ne peut pas
   * déposer dans le casier d'un autre.
   */
  async createDraft(
    freelanceId: string,
    dto: CreateMediaDto,
  ): Promise<{ media: PublicMedia; upload: UploadInstructions }> {
    const maxBytes = this.maxFileMb * 1024 * 1024;
    if (dto.sizeBytes > maxBytes) {
      throw new BadRequestException(`Fichier trop volumineux (maximum ${this.maxFileMb} Mo)`);
    }

    // Le quota ignore les médias FAILED : un échec de transcodage ne doit pas amputer
    // durablement le casier du freelance.
    const used = await this.mediaRepo.count({
      where: { freelanceId, status: Not(MediaStatus.FAILED) },
    });
    if (used >= this.maxPerFreelance) {
      throw new ConflictException(
        `Quota atteint : ${this.maxPerFreelance} médias au maximum. Supprimez-en un avant d'en ajouter.`,
      );
    }

    const id = randomUUID();
    const sourceKey = this.buildSourceKey(freelanceId, id, dto.contentType);

    const media = this.mediaRepo.create({
      id,
      freelanceId,
      title: dto.title,
      description: dto.description ?? null,
      type: MediaType.VIDEO,
      status: MediaStatus.DRAFT,
      sourceKey,
      mimeType: dto.contentType,
    });
    const saved = await this.mediaRepo.save(media);

    const url = await this.storage.getSignedUploadUrl(sourceKey, this.signedUrlTtl, dto.contentType);

    return {
      media: this.toPublic(saved),
      upload: {
        url,
        method: 'PUT',
        // Le type MIME entre dans la signature : le navigateur DOIT renvoyer cet en-tête
        // à l'identique, sinon S3 rejette le dépôt.
        headers: { 'Content-Type': dto.contentType },
        expiresIn: this.signedUrlTtl,
      },
    };
  }

  /** Clé du master. Le préfixe isole chaque média dans le casier de son propriétaire. */
  buildSourceKey(freelanceId: string, mediaId: string, contentType: string): string {
    const extension = EXTENSIONS[contentType] ?? 'bin';
    return `private/media/${freelanceId}/${mediaId}/master.${extension}`;
  }

  /** Préfixe couvrant TOUS les objets d'un média (master, poster, segments). */
  buildMediaPrefix(freelanceId: string, mediaId: string): string {
    return `private/media/${freelanceId}/${mediaId}/`;
  }

  toPublic(media: Media): PublicMedia {
    return {
      id: media.id,
      freelanceId: media.freelanceId,
      title: media.title,
      description: media.description,
      type: media.type,
      status: media.status,
      durationSeconds: media.durationSeconds,
      width: media.width,
      height: media.height,
      // `bigint` remonte en chaîne depuis `pg` : on rétablit un nombre pour l'API.
      sizeBytes: media.sizeBytes === null ? null : Number(media.sizeBytes),
      mimeType: media.mimeType,
      // `playlistKey` est une clé de stockage : elle est retirée de la vue publique.
      renditions:
        media.renditions?.map(({ name, width, height, bandwidth }) => ({
          name,
          width,
          height,
          bandwidth,
        })) ?? null,
      errorReason: media.errorReason,
      createdAt: media.createdAt,
      processedAt: media.processedAt,
    };
  }

  private get maxFileMb(): number {
    return Number(process.env.MEDIA_MAX_FILE_MB ?? 500);
  }

  private get maxPerFreelance(): number {
    return Number(process.env.MEDIA_MAX_PER_FREELANCE ?? 20);
  }

  private get signedUrlTtl(): number {
    return Number(process.env.MEDIA_SIGNED_URL_TTL ?? 900);
  }
}
