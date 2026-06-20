import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, MinLength } from 'class-validator';

export class AddGearDto {
  @ApiProperty({ example: 'DJI', description: 'Marque de l\'équipement' })
  @IsString()
  @IsNotEmpty({ message: 'La marque est obligatoire' })
  brand!: string;

  @ApiProperty({ example: 'Mavic 3 Enterprise', description: 'Modèle exact' })
  @IsString()
  @IsNotEmpty({ message: 'Le modèle est obligatoire' })
  model!: string;

  @ApiProperty({ example: 'SN-123456789', description: 'Numéro de série pour vérification anti-vol/assurance' })
  @IsString()
  @MinLength(5, { message: 'Le numéro de série doit contenir au moins 5 caractères' })
  serialNumber!: string;
}