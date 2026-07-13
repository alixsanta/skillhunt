import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsString, IsNotEmpty, MinLength, IsIn, IsOptional } from 'class-validator';
import { UserRole } from '../../common/enums';

// Rôles auto-attribuables à l'inscription publique. ADMIN est volontairement EXCLU :
// il est provisionné hors-ligne (seed/migration) pour empêcher toute élévation de privilèges (OWASP A01 — C2.2.3).
export const SELF_ASSIGNABLE_ROLES: UserRole[] = [UserRole.FREELANCE, UserRole.RECRUITER];

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