import { Body, Controller, Get, HttpCode, HttpStatus, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { TwoFactorService } from './two-factor.service';
import { JwtAuthGuard, CurrentUser, JwtPayload } from './guards/jwt-auth.guard';
import {
  BackupCodesResponseDto,
  EnrollResponseDto,
  TwoFactorCodeDto,
  VerifyTwoFactorDto,
} from './dto/two-factor.dto';
import { REFRESH_COOKIE_NAME, refreshCookieOptions } from './refresh-cookie';

/**
 * 2FA TOTP — SH-40. Opt-in pour tous les rôles (décision 2026-07-16).
 * Toutes les routes exigent une session, SAUF /verify : c'est l'étape 2 du login,
 * authentifiée par le jeton d'étape courte durée émis par /login.
 */
@ApiTags('🔐 IAM - Double authentification (2FA)')
@Controller('api/v1/auth/2fa')
export class TwoFactorController {
  constructor(
    private readonly twoFactorService: TwoFactorService,
    private readonly authService: AuthService,
  ) {}

  @Get('status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'État 2FA du compte courant (le JWT ne porte pas cette information)' })
  @ApiOkResponse({ description: '`{ enabled: boolean }`' })
  status(@CurrentUser() user: JwtPayload) {
    return this.twoFactorService.status(user.userId);
  }

  @Post('enroll')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Démarrer l\'enrôlement 2FA (génère le secret TOTP, chiffré en base)' })
  @ApiOkResponse({ type: EnrollResponseDto, description: 'Secret + URI otpauth (affichés une seule fois)' })
  @ApiResponse({ status: 409, description: '2FA déjà activée sur ce compte' })
  enroll(@CurrentUser() user: JwtPayload) {
    // Identité issue du token : personne ne peut enrôler la 2FA d'un autre compte (RBAC)
    return this.twoFactorService.enroll(user.userId);
  }

  @Post('confirm')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirmer l\'enrôlement avec le premier code : ACTIVE la 2FA' })
  @ApiOkResponse({ type: BackupCodesResponseDto, description: 'Codes de secours — affichés UNE seule fois' })
  @ApiUnauthorizedResponse({ description: 'Code invalide : la 2FA reste inactive' })
  confirm(@CurrentUser() user: JwtPayload, @Body() dto: TwoFactorCodeDto) {
    return this.twoFactorService.confirm(user.userId, dto.code);
  }

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Étape 2 du login : jeton d\'étape + code TOTP (ou code de secours) => vrais tokens',
  })
  @ApiOkResponse({ description: 'Connexion complétée : tokens émis, cookie sh_refresh déposé' })
  @ApiUnauthorizedResponse({ description: 'Jeton d\'étape expiré ou code invalide' })
  @ApiTooManyRequestsResponse({ description: 'Trop de tentatives : compte temporairement verrouillé' })
  async verify(@Body() dto: VerifyTwoFactorDto, @Res({ passthrough: true }) res: Response) {
    const tokens = await this.authService.completeTwoFactorLogin(dto.twoFactorToken, dto.code);
    // Même dépôt de cookie httpOnly qu'au login classique (SH-20)
    res.cookie(
      REFRESH_COOKIE_NAME,
      tokens.refreshToken,
      refreshCookieOptions(process.env.NODE_ENV === 'production'),
    );
    return tokens;
  }

  @Post('disable')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Désactiver la 2FA (exige un code valide) : purge secret + codes de secours' })
  @ApiUnauthorizedResponse({ description: 'Code invalide : la 2FA reste active' })
  disable(@CurrentUser() user: JwtPayload, @Body() dto: TwoFactorCodeDto) {
    return this.twoFactorService.disable(user.userId, dto.code);
  }

  @Post('backup-codes/regenerate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Régénérer les codes de secours (les anciens sont invalidés)' })
  @ApiOkResponse({ type: BackupCodesResponseDto, description: 'Nouveaux codes — affichés UNE seule fois' })
  regenerateBackupCodes(@CurrentUser() user: JwtPayload, @Body() dto: TwoFactorCodeDto) {
    return this.twoFactorService.regenerateBackupCodes(user.userId, dto.code);
  }
}
