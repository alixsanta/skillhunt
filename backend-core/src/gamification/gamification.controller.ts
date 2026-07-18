import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth, ApiForbiddenResponse, ApiNotFoundResponse, ApiOkResponse,
  ApiOperation, ApiTags, ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { GamificationService } from './gamification.service';
import { GamificationProfileDto, PublicGamificationProfileDto } from './dto/gamification-response.dto';
import { CurrentUser, JwtAuthGuard, JwtPayload, Roles, RolesGuard } from '../auth/guards/jwt-auth.guard';
import { UserRole } from '../common/enums';

/**
 * Gamification de l'Armurerie (SH-21c) : XP, niveaux et badges dérivés de la preuve validée.
 * Vue privée complète pour le freelance ; vue publique réduite pour le recruteur.
 */
@ApiTags('🏅 Gamification')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token JWT manquant, invalide ou expiré (401)' })
@ApiForbiddenResponse({ description: 'Rôle insuffisant pour cette ressource (403)' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('api/v1/gamification')
export class GamificationController {
  constructor(private readonly gamificationService: GamificationService) {}

  @Get('me')
  @Roles(UserRole.FREELANCE)
  @ApiOperation({ summary: 'Mon profil de gamification (XP, niveau, badges — Freelance)' })
  @ApiOkResponse({ type: GamificationProfileDto })
  getMyProfile(@CurrentUser() user: JwtPayload) {
    // Identité issue du token : on ne calcule jamais le profil d'un id client (C2.2.3)
    return this.gamificationService.profileFor(user.userId);
  }

  @Get('freelance/:id')
  @Roles(UserRole.RECRUITER)
  @ApiOperation({ summary: "Profil public d'un freelance : niveau + badges obtenus (Recruteur)" })
  @ApiOkResponse({ type: PublicGamificationProfileDto })
  @ApiNotFoundResponse({ description: 'Profil Freelance introuvable (404 uniforme)' })
  getPublicProfile(@Param('id', ParseUUIDPipe) id: string) {
    return this.gamificationService.publicProfileFor(id);
  }
}
