import { ApiProperty } from '@nestjs/swagger';
import { GearCategory, GearStatus } from '../../common/enums';

/**
 * Équipement tel que renvoyé par l'API (C2.4.1).
 * Miroir exact des champs sérialisés par l'entité `Gear` : ne rien y déclarer que
 * l'entité ne renvoie pas — le front génère ses types depuis ce contrat.
 */
export class GearResponseDto {
  @ApiProperty({ format: 'uuid', example: '3f1b2c9e-6d54-4a1b-9d0e-7c2f5a8b1234' })
  id!: string;

  @ApiProperty({ example: 'DJI', description: 'Marque de l\'équipement' })
  brand!: string;

  @ApiProperty({ example: 'Mavic 3 Enterprise', description: 'Modèle exact' })
  model!: string;

  @ApiProperty({
    example: 'SN-123456789',
    description:
      'Numéro de série — donnée sensible : renvoyée uniquement au propriétaire du casier, jamais dans une vue publique (SH-39)',
  })
  serialNumber!: string;

  @ApiProperty({ enum: GearCategory, example: GearCategory.DRONE })
  category!: GearCategory;

  @ApiProperty({ enum: GearStatus, example: GearStatus.PENDING })
  status!: GearStatus;

  @ApiProperty({ format: 'date-time', example: '2026-07-14T09:12:33.000Z' })
  createdAt!: Date;

  @ApiProperty({
    format: 'uuid',
    description: 'Propriétaire (Freelance) — déduit du token, jamais d\'un identifiant client',
  })
  freelanceId!: string;
}

/** Page de résultats de l'Armurerie (miroir de `PaginatedGear`, gear.service.ts). */
export class PaginatedGearDto {
  @ApiProperty({ type: [GearResponseDto] })
  items!: GearResponseDto[];

  @ApiProperty({
    example: 12,
    description: 'Nombre total d\'équipements correspondant au filtre appliqué',
  })
  total!: number;

  @ApiProperty({ example: 1, description: 'Page courante (1-indexée)' })
  page!: number;

  @ApiProperty({ example: 20, description: 'Taille de page appliquée' })
  limit!: number;
}
