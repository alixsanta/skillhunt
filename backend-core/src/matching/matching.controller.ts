import { Body, Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiBadGatewayResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard, Roles, RolesGuard } from '../auth/guards/jwt-auth.guard';
import { UserRole } from '../common/enums';
import { MatchingService } from './matching.service';
import { SearchMatchDto } from './dto/search-match.dto';
import { MatchResultDto } from './dto/match-result.dto';

@ApiTags('🎯 Matching')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token JWT manquant, invalide ou expiré (401)' })
@ApiForbiddenResponse({ description: 'Rôle insuffisant pour cette ressource (403)' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('api/v1/matching')
export class MatchingController {
  constructor(private readonly matchingService: MatchingService) {}

  @Post('search')
  // POST utilisé comme "recherche" (payload structuré), pas comme création : 200, pas 201
  @HttpCode(200)
  @Roles(UserRole.RECRUITER)
  @ApiOperation({ summary: 'Rechercher des freelances par matching multicritères (Recruteur)' })
  @ApiOkResponse({
    type: MatchResultDto,
    isArray: true,
    description: 'Résultats triés (score décroissant, distance croissante), enrichis du username',
  })
  @ApiBadGatewayResponse({ description: 'Matching-service indisponible (502)' })
  // `@Req()` uniquement pour relayer l'identifiant de corrélation (SH-29) : l'identité de
  // l'utilisateur reste dérivée du token via les guards, jamais de la requête brute (§8).
  search(@Body() dto: SearchMatchDto, @Req() req: Request) {
    return this.matchingService.search(dto, req.requestId);
  }
}
