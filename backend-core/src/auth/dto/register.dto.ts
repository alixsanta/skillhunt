import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail, IsString, IsNotEmpty, MinLength, IsIn, IsOptional,
  IsDefined, IsLatitude, IsLongitude, ValidateIf, ValidateNested, Matches,
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
  // Coercition explicite en number : le ValidationPipe global n'a PAS enableImplicitConversion,
  // donc sans @Type() une string numérique ("43.6045") passerait @IsLatitude et serait
  // persistée telle quelle dans le GeoJSON → corruption silencieuse de la colonne geography (C2.2.3).
  @Type(() => Number)
  @IsLatitude({ message: 'La latitude doit être comprise entre -90 et 90' })
  latitude!: number;

  @ApiProperty({ example: 1.4442, description: 'Longitude en degrés décimaux (WGS84, entre -180 et 180)' })
  @Type(() => Number)
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

  // Robustesse du mot de passe (SH-51 — C2.2.3). La règle ne s'applique qu'à la CRÉATION :
  // aucun compte existant n'est invalidé, et `LoginDto` reste volontairement permissif.
  @ApiProperty({
    example: 'P@ssw0rdSecureDrone2026',
    description:
      'Mot de passe : 12 caractères minimum, dont au moins une minuscule, une majuscule et un chiffre',
  })
  @IsString()
  @MinLength(12, { message: 'Le mot de passe doit faire au moins 12 caractères' })
  @Matches(/[a-z]/, { message: 'Le mot de passe doit contenir au moins une minuscule' })
  @Matches(/[A-Z]/, { message: 'Le mot de passe doit contenir au moins une majuscule' })
  @Matches(/[0-9]/, { message: 'Le mot de passe doit contenir au moins un chiffre' })
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
  // Optionnel depuis SH-20 : le web transmet le refresh token par cookie httpOnly.
  // Le body reste supporté pour le mobile (Lot 2), où le cookie est inadapté.
  @ApiPropertyOptional({ description: 'Refresh token (JWT). Inutile pour le web : le cookie httpOnly fait foi.' })
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Le refresh token ne peut pas être vide' })
  refreshToken?: string;
}