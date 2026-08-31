import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';

/**
 * Types MIME acceptés à la déclaration (C2.2.3 — liste blanche, jamais l'extension).
 * Ce n'est qu'un premier filtre : le contrôle de contenu RÉEL est fait par `ffprobe`
 * dans le worker (SH-16b), seul capable de trancher sur un fichier de 500 Mo qui ne
 * transite jamais par l'API.
 */
export const ALLOWED_MEDIA_MIME_TYPES = ['video/mp4', 'video/quicktime'] as const;

export class CreateMediaDto {
  @ApiProperty({ example: 'Survol de chantier — Toulouse', maxLength: 120 })
  @IsString()
  @IsNotEmpty({ message: 'Le titre est obligatoire' })
  @MaxLength(120, { message: 'Le titre ne peut pas dépasser 120 caractères' })
  title!: string;

  @ApiPropertyOptional({ example: 'Vol DGAC S3, caméra 4K stabilisée.', maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: 'La description ne peut pas dépasser 2000 caractères' })
  description?: string;

  @ApiProperty({ enum: ALLOWED_MEDIA_MIME_TYPES, example: 'video/mp4' })
  @IsIn(ALLOWED_MEDIA_MIME_TYPES, { message: 'Format non supporté : MP4 ou QuickTime attendu' })
  contentType!: string;

  @ApiProperty({ example: 104857600, description: 'Taille annoncée du fichier, en octets' })
  @IsInt({ message: 'La taille annoncée doit être un entier' })
  @Min(1, { message: 'La taille annoncée doit être strictement positive' })
  sizeBytes!: number;
}
