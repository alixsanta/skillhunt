import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsOptional, IsEnum, IsInt, Min, Max } from 'class-validator';
import { CertificationStatus } from '../../common/enums';

/**
 * Filtres et pagination pour lister des certifications (les siennes ou la file de validation).
 * Le ValidationPipe global (transform) convertit les query string en types attendus.
 */
export class QueryCertificationDto {
  @ApiPropertyOptional({ enum: CertificationStatus, description: 'Filtrer par statut de validation' })
  @IsOptional()
  @IsEnum(CertificationStatus, { message: 'Le statut est invalide' })
  status?: CertificationStatus;

  @ApiPropertyOptional({ default: 1, minimum: 1, description: 'Numéro de page (1-indexé)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'La page doit être supérieure ou égale à 1' })
  page: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100, description: 'Taille de page' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100, { message: 'La taille de page ne peut pas dépasser 100' })
  limit: number = 20;
}
