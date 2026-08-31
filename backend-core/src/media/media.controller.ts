import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
} from '@nestjs/swagger';
import { MediaService } from './media.service';
import { CreateMediaDto } from './dto/create-media.dto';
import {
  JwtAuthGuard,
  RolesGuard,
  Roles,
  CurrentUser,
  JwtPayload,
} from '../auth/guards/jwt-auth.guard';
import { UserRole } from '../common/enums';

@ApiTags('🎬 Médias')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token JWT manquant, invalide ou expiré (401)' })
@ApiForbiddenResponse({ description: 'Rôle insuffisant ou accès à une ressource d\'autrui (403)' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('api/v1/media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post()
  @Roles(UserRole.FREELANCE)
  @ApiOperation({
    summary: 'Déclarer une vidéo et obtenir son URL de dépôt (Freelance)',
    description:
      'Crée la ligne au statut DRAFT et renvoie une URL PUT signée de courte durée. ' +
      'Le navigateur dépose le fichier DIRECTEMENT sur le stockage objet : aucun octet ' +
      'vidéo ne transite par l\'API. Confirmer ensuite via POST /media/{id}/complete.',
  })
  @ApiResponse({ status: 201, description: 'Média déclaré, URL de dépôt délivrée.' })
  @ApiResponse({ status: 400, description: 'Entrée invalide ou taille annoncée hors plafond.' })
  @ApiResponse({ status: 409, description: 'Quota de médias atteint.' })
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateMediaDto) {
    // Identité issue du token : aucun {id} client n'est accepté (anti-usurpation, OWASP).
    return this.mediaService.createDraft(user.userId, dto);
  }
}
