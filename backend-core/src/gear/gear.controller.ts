import { Controller, Post, Get, Body, UseGuards } from '@nestjs/common';
import { GearService } from './gear.service';
import { AddGearDto } from './dto/add-gear.dto';
import {
  JwtAuthGuard,
  CurrentUser,
  JwtPayload,
  RolesGuard,
  Roles,
} from '../auth/guards/jwt-auth.guard';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
} from '@nestjs/swagger';
import { UserRole } from '../common/enums';

@ApiTags('🎒 Armurerie (Gear Locker)')
@ApiBearerAuth() // Indique à Swagger que ces routes nécessitent un Token JWT
@ApiUnauthorizedResponse({ description: 'Token JWT manquant, invalide ou expiré (401)' })
@ApiForbiddenResponse({ description: 'Rôle insuffisant : route réservée aux Freelances (403)' })
// Double protection : authentification (JWT) puis autorisation par rôle (RBAC)
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.FREELANCE) // Tout le contrôleur est réservé aux Freelances
@Controller('api/v1/gear')
export class GearController {
  constructor(private readonly gearService: GearService) {}

  @Post()
  @ApiOperation({ summary: 'Ajouter un équipement à son casier' })
  addGear(@CurrentUser() user: JwtPayload, @Body() dto: AddGearDto) {
    // Grâce au décorateur @CurrentUser, on est sûr à 100% que l'ID vient du token chiffré.
    // C'est une protection vitale contre l'usurpation d'identité (OWASP) : aucun {id} client n'est accepté.
    return this.gearService.addGearToLocker(user.userId, dto);
  }

  @Get('me')
  @ApiOperation({ summary: 'Récupérer la liste de son équipement' })
  getMyGear(@CurrentUser() user: JwtPayload) {
    // L'identité provient du token : un Freelance ne peut interroger que SON propre casier (étanchéité)
    return this.gearService.getFreelanceGear(user.userId);
  }
}
