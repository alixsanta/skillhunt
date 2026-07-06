import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail, IsString, IsNotEmpty, MinLength, IsIn,
  IsDefined, IsLatitude, IsLongitude, ValidateIf, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { UserRole } from '../../common/enums';

// Rôles auto-attribuables à l'inscription publique. ADMIN est volontairement EXCLU :
// il est provisionné hors-ligne (seed/migration) pour empêcher toute élévation de privilèges (OWASP A01 — C2.2.3).
export const SELF_ASSIGNABLE_ROLES: UserRole[] = [UserRole.FREELANCE, UserRole.RECRUITER];

/**
 * Position géographique saisie à l'inscription (SH-34).
 * Champs explicites latitude/longitude (pas de tableau) : neutralise le piège
 * d'ordre GeoJSON ([lon, lat]) à la frontière API (C2.2.3).
 */
export class LocationDto {
  @ApiProperty({ example: 43.6045, description: 'Latitude en degrés décimaux (WGS84, entre -90 et 90)' })
  @IsLatitude({ message: 'La latitude doit être comprise entre -90 et 90' })
  latitude!: number;

  @ApiProperty({ example: 1.4442, description: 'Longitude en degrés décimaux (WGS84, entre -180 et 180)' })
  @IsLongitude({ message: 'La longitude doit être comprise entre -180 et 180' })
  longitude!: number;
}

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

  @ApiProperty({
    enum: SELF_ASSIGNABLE_ROLES,
    example: UserRole.FREELANCE,
    description: 'FREELANCE ou RECRUITER (le rôle ADMIN n\'est pas auto-attribuable)',
  })
  @IsIn(SELF_ASSIGNABLE_ROLES, { message: 'Le rôle doit être FREELANCE ou RECRUITER' })
  role!: UserRole;

  @ApiPropertyOptional({
    type: LocationDto,
    description:
      'Position géographique. OBLIGATOIRE pour un FREELANCE (sinon invisible du matching par rayon, SH-13) ; optionnelle pour un RECRUITER.',
  })
  // C2.2.3 — Validation conditionnelle par rôle (SH-34) :
  // - FREELANCE : position obligatoire (un freelance sans position est invisible du matching) ;
  // - autres rôles : optionnelle, mais validée dès qu'elle est fournie (jamais de donnée non validée).
  @ValidateIf((o: RegisterDto) => o.role === UserRole.FREELANCE || o.location !== undefined)
  @IsDefined({ message: 'La position est obligatoire pour un compte Freelance' })
  @ValidateNested()
  @Type(() => LocationDto)
  location?: LocationDto;
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