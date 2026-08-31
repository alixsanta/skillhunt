import { ApiProperty } from '@nestjs/swagger';
import { MediaStatus, MediaType } from '../../common/enums';

/** Une piste de qualité, telle qu'exposée au client (sans sa clé de stockage). */
export class MediaRenditionDto {
  @ApiProperty({ example: '720p' })
  name!: string;

  @ApiProperty({ example: 1280 })
  width!: number;

  @ApiProperty({ example: 720 })
  height!: number;

  @ApiProperty({ example: 2800000, description: 'Débit cible en bits par seconde' })
  bandwidth!: number;
}

/**
 * Vue publique d'un média. Reflète `PublicMedia` (media.service.ts) : ni `sourceKey`,
 * ni `posterKey`, ni `hlsPrefix`, ni les `playlistKey` des pistes — aucune clé de
 * stockage interne ne sort de l'API.
 */
export class PublicMediaDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  freelanceId!: string;

  @ApiProperty({ example: 'Survol de chantier — Toulouse' })
  title!: string;

  @ApiProperty({ type: String, nullable: true })
  description!: string | null;

  @ApiProperty({ enum: MediaType })
  type!: MediaType;

  @ApiProperty({ enum: MediaStatus })
  status!: MediaStatus;

  @ApiProperty({ type: Number, nullable: true, description: 'Durée en secondes, sondée au transcodage' })
  durationSeconds!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  width!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  height!: number | null;

  @ApiProperty({ type: Number, nullable: true, description: 'Taille réelle du master, en octets' })
  sizeBytes!: number | null;

  @ApiProperty({ example: 'video/mp4' })
  mimeType!: string;

  @ApiProperty({ type: [MediaRenditionDto], nullable: true })
  renditions!: MediaRenditionDto[] | null;

  @ApiProperty({ type: String, nullable: true, description: 'Message court en cas d\'échec' })
  errorReason!: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty({ type: Date, nullable: true })
  processedAt!: Date | null;
}

/** Instructions de dépôt : le navigateur envoie le fichier DIRECTEMENT à cette URL. */
export class UploadInstructionsDto {
  @ApiProperty({ description: 'URL PUT signée, de courte durée' })
  url!: string;

  @ApiProperty({ example: 'PUT' })
  method!: string;

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'string' },
    description: 'En-têtes à envoyer tels quels — le Content-Type entre dans la signature',
  })
  headers!: Record<string, string>;

  @ApiProperty({ example: 900, description: 'Durée de validité de l\'URL, en secondes' })
  expiresIn!: number;
}

export class CreateMediaResponseDto {
  @ApiProperty({ type: PublicMediaDto })
  media!: PublicMediaDto;

  @ApiProperty({ type: UploadInstructionsDto })
  upload!: UploadInstructionsDto;
}

export class PaginatedMediaDto {
  @ApiProperty({ type: [PublicMediaDto] })
  items!: PublicMediaDto[];

  @ApiProperty({ example: 3 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;
}
