import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';

/**
 * Recherche de freelances par matching (SH-22).
 * Bornes MIROIR des contraintes Pydantic du matching-service (C2.2.3, anti-DoS) :
 * les valider ici évite un aller-retour voué au 422 côté microservice.
 */
export class SearchMatchDto {
  @ApiProperty({
    example: ['pilotage drone', 'thermographie'],
    description: 'Compétences recherchées (1 à 50, chacune de 1 à 64 caractères)',
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'Au moins une compétence est requise' })
  @ArrayMaxSize(50, { message: 'Au plus 50 compétences par recherche' })
  @IsString({ each: true })
  @Length(1, 64, { each: true, message: 'Chaque compétence fait entre 1 et 64 caractères' })
  skills!: string[];

  @ApiProperty({ example: 43.6045, description: 'Latitude du lieu de mission' })
  @IsNumber()
  @Min(-90, { message: 'La latitude doit être comprise entre -90 et 90' })
  @Max(90, { message: 'La latitude doit être comprise entre -90 et 90' })
  lat!: number;

  @ApiProperty({ example: 1.4442, description: 'Longitude du lieu de mission' })
  @IsNumber()
  @Min(-180, { message: 'La longitude doit être comprise entre -180 et 180' })
  @Max(180, { message: 'La longitude doit être comprise entre -180 et 180' })
  lon!: number;

  @ApiProperty({ example: 50, description: "Rayon d'action en kilomètres (0 < r ≤ 500)" })
  @IsNumber()
  @Min(0.001, { message: 'Le rayon doit être strictement positif' })
  @Max(500, { message: 'Le rayon ne peut pas dépasser 500 km' })
  radiusKm!: number;
}
