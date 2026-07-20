import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

/** Épingler/retirer un équipement du loadout (SH-21c). Validation stricte (C2.2.3). */
export class SetLoadoutDto {
  @ApiProperty({ example: true, description: 'true = épingler au loadout, false = retirer' })
  @IsBoolean({ message: 'inLoadout doit être un booléen' })
  inLoadout!: boolean;
}
