import { ApiProperty } from '@nestjs/swagger';

/** Badge tel qu'exposé par l'API (C2.4.1). */
export class BadgeDto {
  @ApiProperty({ example: 'first-validated' }) id!: string;
  @ApiProperty({ example: 'Première validation' }) label!: string;
  @ApiProperty({ example: 'Un premier équipement validé par un admin' }) description!: string;
  @ApiProperty({ example: true }) earned!: boolean;
}

/** Badge public : obtenu par construction (le champ earned n'existe pas). */
export class PublicBadgeDto {
  @ApiProperty({ example: 'first-validated' }) id!: string;
  @ApiProperty({ example: 'Première validation' }) label!: string;
  @ApiProperty({ example: 'Un premier équipement validé par un admin' }) description!: string;
}

/** Profil de gamification complet (vue privée du freelance). */
export class GamificationProfileDto {
  @ApiProperty({ example: 260 }) xp!: number;
  @ApiProperty({ example: 3 }) level!: number;
  @ApiProperty({ example: 'Spécialiste' }) levelLabel!: string;
  // `type: Number` explicite (C2.4.1) : un type union `number | null` n'est pas reflété
  // correctement par @nestjs/swagger (design:type = Object), ce qui générait un schéma
  // `"type": "object"` et donc un `Record<string, never>` côté front après `gen:api`.
  @ApiProperty({
    type: Number,
    example: 450,
    nullable: true,
    description: 'Seuil du niveau suivant (null au niveau maximum)',
  })
  nextLevelAt!: number | null;
  @ApiProperty({ type: [BadgeDto] }) badges!: BadgeDto[];
}

/** Profil public (vue recruteur) : niveau + badges obtenus, jamais d'XP chiffré. */
export class PublicGamificationProfileDto {
  @ApiProperty({ example: 3 }) level!: number;
  @ApiProperty({ example: 'Spécialiste' }) levelLabel!: string;
  @ApiProperty({ type: [PublicBadgeDto] }) badges!: PublicBadgeDto[];
}
