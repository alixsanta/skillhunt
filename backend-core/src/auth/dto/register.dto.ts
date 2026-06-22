import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, IsNotEmpty, MinLength, IsEnum } from 'class-validator';
import { UserRole } from '../../common/enums';

export class RegisterDto {
  @ApiProperty({ example: 'pilote.expert@skillhunt.io', description: 'Email unique de l\'utilisateur' })
  @IsEmail({}, { message: 'Format de l\'adresse email invalide' })
  email!: string;

  @ApiProperty({ example: 'MarcusThorne', description: 'Nom d\'utilisateur unique' })
  @IsString()
  @IsNotEmpty({ message: 'Le nom d\'utilisateur ne peut pas être vide' })
  username!: string;

  @ApiProperty({ example: 'P@ssw0rdSecureDrone2026', description: 'Mot de passe fort (8 caractères minimum)' })
  @IsString()
  @MinLength(8, { message: 'Le mot de passe doit faire au moins 8 caractères' })
  password!: string;

  @ApiProperty({ enum: UserRole, example: UserRole.FREELANCE })
  @IsEnum(UserRole, { message: 'Le rôle spécifié est invalide' })
  role!: UserRole;
}

export class LoginDto {
  @ApiProperty({ example: 'pilote.expert@skillhunt.io' })
  @IsEmail({}, { message: 'Format d\'email invalide' })
  email!: string;

  @ApiProperty({ example: 'P@ssw0rdSecureDrone2026' })
  @IsString()
  @IsNotEmpty()
  password!: string;
}

export class RefreshDto {
  @ApiProperty({ description: 'Refresh token (JWT) obtenu lors du login' })
  @IsString()
  @IsNotEmpty({ message: 'Le refresh token est obligatoire' })
  refreshToken!: string;
}