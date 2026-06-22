import { Controller, Post, Get, Body, UseGuards } from '@nestjs/common';
import { GearService } from './gear.service';
import { AddGearDto } from './dto/add-gear.dto';
import { JwtAuthGuard, CurrentUser, JwtPayload, RolesGuard } from '../auth/guards/jwt-auth.guard';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UserRole } from '../common/enums';

@ApiTags('🎒 Armurerie (Gear Locker)')
@ApiBearerAuth() // Indique à Swagger que ces routes nécessitent un Token JWT
@UseGuards(JwtAuthGuard) // Protection globale du contrôleur
@Controller('api/v1/gear')
export class GearController {
  constructor(private readonly gearService: GearService) {}

  @Post()
  @UseGuards(new RolesGuard([UserRole.FREELANCE])) // Seul un freelance peut ajouter du matériel
  @ApiOperation({ summary: 'Ajouter un équipement à son casier' })
  addGear(@CurrentUser() user: JwtPayload, @Body() dto: AddGearDto) {
    // Grâce au décorateur @CurrentUser, on est sûr à 100% que l'ID vient du token chiffré
    // C'est une protection vitale contre l'usurpation d'identité (OWASP)
    return this.gearService.addGearToLocker(user.userId, dto);
  }

  @Get('me')
  @UseGuards(new RolesGuard([UserRole.FREELANCE]))
  @ApiOperation({ summary: 'Récupérer la liste de son équipement' })
  getMyGear(@CurrentUser() user: JwtPayload) {
    return this.gearService.getFreelanceGear(user.userId);
  }
}