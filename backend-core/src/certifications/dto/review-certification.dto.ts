import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsOptional, IsDate, MinDate } from 'class-validator';
import { CertificationStatus } from '../../common/enums';

// Décisions admissibles pour la revue admin d'une certification (PENDING -> VALIDATED | REJECTED).
export const CERT_REVIEW_DECISIONS: CertificationStatus[] = [
  CertificationStatus.VALIDATED,
  CertificationStatus.REJECTED,
];

export class ReviewCertificationDto {
  @ApiProperty({
    enum: CERT_REVIEW_DECISIONS,
    example: CertificationStatus.VALIDATED,
    description: 'Décision de validation : VALIDATED ou REJECTED',
  })
  @IsIn(CERT_REVIEW_DECISIONS, { message: 'La décision doit être VALIDATED ou REJECTED' })
  decision!: CertificationStatus;

  @ApiPropertyOptional({
    example: '2027-12-31',
    description: 'Date de validité confirmée/corrigée par l\'Admin (optionnel)',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'La date de validité est invalide' })
  @MinDate(() => new Date(), { message: 'La date de validité doit être dans le futur' })
  validUntil?: Date;
}
