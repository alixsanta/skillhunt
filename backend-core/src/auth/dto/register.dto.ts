import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, IsNotEmpty, MinLength, IsIn } from 'class-validator';
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
  @ApiProperty({ description: 'Refresh token (JWT) obtenu lors du login' })
  @IsString()
  @IsNotEmpty({ message: 'Le refresh token est obligatoire' })
  refreshToken!: string;
}