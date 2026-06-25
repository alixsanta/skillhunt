import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsOptional, IsEnum, IsInt, Min, Max } from 'class-validator';
import { GearCategory, GearStatus } from '../../common/enums';

/**
 * Filtres et pagination pour lister du matériel (casier d'un Freelance ou file de validation admin).
 * Le ValidationPipe global (transform) convertit les query string en types attendus.
 */
export class QueryGearDto {
  @ApiPropertyOptional({ enum: GearCategory, description: 'Filtrer par catégorie' })
  @IsOptional()
  @IsEnum(GearCategory, { message: 'La catégorie de matériel est invalide' })
  category?: GearCategory;

  @ApiPropertyOptional({ enum: GearStatus, description: 'Filtrer par statut de validation' })
  @IsOptional()
  @IsEnum(GearStatus, { message: 'Le statut est invalide' })
  status?: GearStatus;

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
