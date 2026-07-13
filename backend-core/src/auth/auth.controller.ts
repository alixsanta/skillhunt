import {
  Controller,
  Post,
  Body,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto, LoginDto, RefreshDto } from './dto/register.dto';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import {
  REFRESH_COOKIE_NAME,
  refreshCookieOptions,
  clearRefreshCookieOptions,
} from './refresh-cookie';

@ApiTags('🔐 IAM - Authentification & Autorisation')
@Controller('api/v1/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  private get isProduction(): boolean {
    return process.env.NODE_ENV === 'production';
  }

  /** Dépose le refresh token dans un cookie httpOnly : hors de portée du JS (anti-XSS, C2.2.3). */
  private setRefreshCookie(res: Response, refreshToken: string): void {
    res.cookie(REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions(this.isProduction));
  }

  /** Cookie prioritaire (web) ; body en repli (mobile, Lot 2). */
  private readRefreshToken(req: Request, dto?: RefreshDto): string | undefined {
    const fromCookie = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE_NAME];
    return fromCookie ?? dto?.refreshToken;
  }

  @Post('register')
  @ApiOperation({ summary: 'Inscription d\'un nouvel utilisateur (Freelance ou Recruteur)' })
  @ApiResponse({ status: 201, description: 'Utilisateur créé avec succès (sans exposer le hash).' })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Authentification : access token dans le body, refresh token en cookie httpOnly' })
  @ApiResponse({ status: 200, description: 'Jetons JWT RS256 émis ; cookie `sh_refresh` déposé.' })
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const tokens = await this.authService.login(dto);
    this.setRefreshCookie(res, tokens.refreshToken);
    // Le body conserve le couple complet : le mobile (Lot 2) n'utilise pas les cookies.
    return tokens;
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotation du refresh token (lu depuis le cookie, ou le body pour le mobile)' })
  @ApiResponse({ status: 200, description: 'Nouveau couple émis ; l\'ancien refresh token est révoqué.' })
  @ApiResponse({ status: 401, description: 'Refresh token absent, invalide, expiré ou révoqué.' })
  async refresh(
    @Req() req: Request,
    @Body() dto: RefreshDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = this.readRefreshToken(req, dto);
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token manquant');
    }

    const tokens = await this.authService.refresh(refreshToken);
    this.setRefreshCookie(res, tokens.refreshToken); // rotation : le cookie porte le nouveau jeton
    return tokens;
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Déconnexion : révocation du refresh token (Redis) et expiration du cookie' })
  @ApiResponse({ status: 200, description: 'Refresh token révoqué (opération idempotente).' })
  async logout(
    @Req() req: Request,
    @Body() dto: RefreshDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = this.readRefreshToken(req, dto);

    // Idempotent : se déconnecter sans jeton n'est pas une erreur — mais on purge le cookie dans tous les cas.
    const result = refreshToken ? await this.authService.logout(refreshToken) : { success: true };

    res.clearCookie(REFRESH_COOKIE_NAME, clearRefreshCookieOptions(this.isProduction));
    return result;
  }
}
