import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto, LoginDto, RefreshDto } from './dto/register.dto';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('🔐 IAM - Authentification & Autorisation')
@Controller('api/v1/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Inscription d\'un nouvel utilisateur (Freelance ou Recruteur)' })
  @ApiResponse({ status: 201, description: 'Utilisateur créé avec succès (sans exposer le hash).' })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Authentification et obtention d\'un couple de tokens (access + refresh)' })
  @ApiResponse({ status: 200, description: 'Jetons JWT RS256 émis.' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotation du refresh token et émission d\'un nouveau couple de tokens' })
  @ApiResponse({ status: 200, description: 'Nouveau couple de tokens émis ; l\'ancien refresh token est révoqué.' })
  refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Déconnexion : révocation du refresh token' })
  @ApiResponse({ status: 200, description: 'Refresh token révoqué (opération idempotente).' })
  logout(@Body() dto: RefreshDto) {
    return this.authService.logout(dto.refreshToken);
  }
}
