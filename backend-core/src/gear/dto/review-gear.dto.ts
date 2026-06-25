import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { GearStatus } from '../../common/enums';

// Décisions admissibles pour la validation admin d'un équipement (PENDING -> VALIDATED | REJECTED).
export const REVIEW_DECISIONS: GearStatus[] = [GearStatus.VALIDATED, GearStatus.REJECTED];

export class ReviewGearDto {
  @ApiProperty({
    enum: REVIEW_DECISIONS,
    example: GearStatus.VALIDATED,
    description: 'Décision de validation : VALIDATED ou REJECTED',
  })
  @IsIn(REVIEW_DECISIONS, { message: 'La décision doit être VALIDATED ou REJECTED' })
  decision!: GearStatus;
}
