import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, IsNotEmpty } from 'class-validator';

// Code TOTP 6 chiffres OU code de secours XXXX-XXXX (alphabet sans ambiguïté) — C2.2.3
const CODE_PATTERN = /^(\d{6}|[A-Z2-9]{4}-[A-Z2-9]{4})$/i;
const CODE_MESSAGE =
  'Le code doit être un TOTP à 6 chiffres ou un code de secours au format XXXX-XXXX';

/** Confirmation d'enrôlement / désactivation / régénération : un code suffit. */
export class TwoFactorCodeDto {
  @ApiProperty({ example: '123456', description: 'Code TOTP (6 chiffres) ou code de secours' })
  @IsString()
  @Matches(CODE_PATTERN, { message: CODE_MESSAGE })
  code!: string;
}

/** Étape 2 du login : jeton d'étape (émis par /login quand la 2FA est active) + code. */
export class VerifyTwoFactorDto {
  @ApiProperty({ description: "Jeton d'étape 2FA émis par /login (validité 5 min)" })
  @IsString()
  @IsNotEmpty({ message: "Le jeton d'étape 2FA est obligatoire" })
  twoFactorToken!: string;

  @ApiProperty({ example: '123456', description: 'Code TOTP (6 chiffres) ou code de secours' })
  @IsString()
  @Matches(CODE_PATTERN, { message: CODE_MESSAGE })
  code!: string;
}

/** Réponse d'enrôlement : secret à saisir/scanner — affiché UNE seule fois. */
export class EnrollResponseDto {
  @ApiProperty({ example: 'JBSWY3DPEHPK3PXP', description: 'Secret TOTP (base32), à ne jamais re-consulter' })
  secret!: string;

  @ApiProperty({
    example: 'otpauth://totp/SkillHunt:pro%40skillhunt.io?secret=…',
    description: 'URI otpauth à encoder en QR code côté client',
  })
  otpauthUrl!: string;
}

/** Réponse de confirmation/régénération : codes de secours affichés UNE seule fois. */
export class BackupCodesResponseDto {
  @ApiProperty({
    type: [String],
    example: ['A2C4-E6G8', 'K3M5-P7R9'],
    description: 'Codes de secours à usage unique — stockés hachés, jamais re-consultables',
  })
  backupCodes!: string[];
}
