import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsString, IsNotEmpty, IsEnum, IsDate, MinDate, MaxLength } from 'class-validator';
import { CertificationType } from '../../common/enums';

/**
 * Métadonnées d'upload d'une certification (champs texte du multipart).
 * Le fichier PDF lui-même arrive via `@UploadedFile()` (FileInterceptor), pas dans ce DTO.
 * Validation stricte des entrées (C2.2.3).
 */
export class UploadCertificationDto {
  @ApiProperty({
    enum: CertificationType,
    example: CertificationType.DGAC_DRONE,
    description: 'Type de certification',
  })
  @IsEnum(CertificationType, { message: 'Le type de certification est invalide' })
  type!: CertificationType;

  @ApiProperty({
    example: 'FR-DGAC-2024-123456',
    description: 'Numéro de brevet (conservé ; sert au contrôle anti-doublon)',
  })
  @IsString()
  @IsNotEmpty({ message: 'Le numéro de brevet est obligatoire' })
  @MaxLength(100, { message: 'Le numéro de brevet ne peut pas dépasser 100 caractères' })
  number!: string;

  @ApiProperty({
    example: '2027-12-31',
    description: 'Date de fin de validité (doit être dans le futur)',
  })
  // Le ValidationPipe global (transform) convertit la chaîne ISO du multipart en Date
  @Type(() => Date)
  @IsDate({ message: 'La date de validité est invalide' })
  @MinDate(() => new Date(), { message: 'La date de validité doit être dans le futur' })
  validUntil!: Date;
}
