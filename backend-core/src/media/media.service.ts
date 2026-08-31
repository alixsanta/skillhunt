import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Not, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { Media, MediaRendition } from './media.entity';
import { MediaStatus, MediaType } from '../common/enums';
import { STORAGE_SERVICE, StorageService, StoredObjectHead } from '../storage/storage.service';
import { ALLOWED_MEDIA_MIME_TYPES, CreateMediaDto } from './dto/create-media.dto';
import { QueryMediaDto } from './dto/query-media.dto';
import { UpdateMediaDto } from './dto/update-media.dto';
import { MediaQueue } from './media.queue';

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

export interface PaginatedMedia {
  items: PublicMedia[];
  total: number;
  page: number;
  limit: number;
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
    private readonly queue: MediaQueue,
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
      // `dto.sizeBytes` n'est PAS persisté ici (volontaire) : c'est une taille annoncée
      // par le client, non vérifiée à ce stade — elle ne sert qu'au contrôle de plafond
      // ci-dessus. La taille faisant foi sera écrite à la confirmation du dépôt, lue
      // depuis les métadonnées réelles de l'objet (storage.head()).
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

  /** Liste paginée des médias d'UN freelance. Étanchéité : filtrée sur l'id du token. */
  async getMine(freelanceId: string, query: QueryMediaDto): Promise<PaginatedMedia> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: FindOptionsWhere<Media> = { freelanceId };
    if (query.status) {
      where.status = query.status;
    }

    const [rows, total] = await this.mediaRepo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { items: rows.map((row) => this.toPublic(row)), total, page, limit };
  }

  /**
   * Met à jour les métadonnées éditables d'un média dont on est propriétaire.
   * Un média d'autrui donne 404 et non 403 : son existence n'a pas à être révélée.
   */
  async updateOwn(
    mediaId: string,
    freelanceId: string,
    dto: UpdateMediaDto,
  ): Promise<PublicMedia> {
    const media = await this.mediaRepo.findOne({ where: { id: mediaId } });
    if (!media || media.freelanceId !== freelanceId) {
      throw new NotFoundException('Média introuvable');
    }

    if (dto.title !== undefined) {
      media.title = dto.title;
    }
    if (dto.description !== undefined) {
      media.description = dto.description;
    }

    return this.toPublic(await this.mediaRepo.save(media));
  }

  /**
   * Confirme le dépôt (C2.2.3).
   *
   * Une URL PUT signée ne sait pas plafonner la taille : c'est ICI, par lecture des
   * métadonnées réelles, qu'une annonce mensongère est démasquée. Le contrôle de contenu
   * définitif reste `ffprobe`, côté worker — seul capable de trancher sur un fichier qui
   * ne transite jamais par l'API.
   */
  async completeUpload(mediaId: string, freelanceId: string): Promise<PublicMedia> {
    const media = await this.mediaRepo.findOne({ where: { id: mediaId } });
    if (!media || media.freelanceId !== freelanceId) {
      throw new NotFoundException('Média introuvable');
    }
    if (media.status !== MediaStatus.DRAFT) {
      throw new ConflictException('Ce média a déjà été confirmé');
    }

    let head: StoredObjectHead;
    try {
      head = await this.storage.head(media.sourceKey);
    } catch {
      throw new BadRequestException('Aucun fichier déposé pour ce média');
    }

    const prefix = this.buildMediaPrefix(freelanceId, mediaId);
    const maxBytes = this.maxFileMb * 1024 * 1024;

    if (head.sizeBytes > maxBytes) {
      await this.storage.deletePrefix(prefix);
      throw new BadRequestException(`Fichier trop volumineux (maximum ${this.maxFileMb} Mo)`);
    }
    if (!ALLOWED_MEDIA_MIME_TYPES.includes(head.contentType as never)) {
      await this.storage.deletePrefix(prefix);
      throw new BadRequestException('Format non supporté : MP4 ou QuickTime attendu');
    }

    media.status = MediaStatus.UPLOADED;
    media.sizeBytes = String(head.sizeBytes);
    media.mimeType = head.contentType;
    const saved = await this.mediaRepo.save(media);

    // Après la sauvegarde : si l'enfilement échoue (503), le média reste UPLOADED et
    // pourra être réenfilé, plutôt que de perdre la trace d'un fichier bien déposé.
    await this.queue.enqueueTranscode({
      mediaId,
      sourceKey: media.sourceKey,
      outputPrefix: `${prefix}hls/`,
      posterKey: `${prefix}poster.jpg`,
    });

    return this.toPublic(saved);
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
