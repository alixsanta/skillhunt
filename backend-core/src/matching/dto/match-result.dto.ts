import { ApiProperty } from '@nestjs/swagger';

/**
 * Résultat de matching enrichi (SH-22) : le microservice ne renvoie que des ids ;
 * le proxy ajoute le username pour l'affichage (C2.4.1).
 */
export class MatchResultDto {
  @ApiProperty({ format: 'uuid', example: '3f1b2c9e-6d54-4a1b-9d0e-7c2f5a8b1234' })
  freelanceId!: string;

  @ApiProperty({
    // `type: String` explicite : sur une union `string | null`, la réflexion TS émet
    // `Object` et le schéma OpenAPI perdrait son type (le front générerait un type vide).
    type: String,
    example: 'pilote-pro',
    nullable: true,
    description: 'Username du freelance — null si le compte a disparu entre-temps',
  })
  username!: string | null;

  @ApiProperty({ example: 0.92, minimum: 0, maximum: 1, description: 'Score de matching (0..1)' })
  score!: number;

  @ApiProperty({ example: 12.5, description: 'Distance au lieu de mission (km)' })
  distanceKm!: number;
}
