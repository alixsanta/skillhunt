import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Query,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { GearService } from './gear.service';
import { AddGearDto } from './dto/add-gear.dto';
import { QueryGearDto } from './dto/query-gear.dto';
import { ReviewGearDto } from './dto/review-gear.dto';
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
@ApiBearerAuth() // Toutes les routes nécessitent un Token JWT
@ApiUnauthorizedResponse({ description: 'Token JWT manquant, invalide ou expiré (401)' })
@ApiForbiddenResponse({ description: 'Rôle insuffisant pour cette ressource (403)' })
@UseGuards(JwtAuthGuard, RolesGuard) // Authentification puis autorisation par rôle (le rôle requis est défini par route)
@Controller('api/v1/gear')
export class GearController {
  constructor(private readonly gearService: GearService) {}

  @Post()
  @Roles(UserRole.FREELANCE)
  @ApiOperation({ summary: 'Déclarer un équipement dans son casier (Freelance)' })
  addGear(@CurrentUser() user: JwtPayload, @Body() dto: AddGearDto) {
    // Identité issue du token : aucun {id} client n'est accepté (anti-usurpation, OWASP)
    return this.gearService.addGearToLocker(user.userId, dto);
  }

  @Get('me')
  @Roles(UserRole.FREELANCE)
  @ApiOperation({ summary: 'Lister son propre matériel (filtres + pagination)' })
  getMyGear(@CurrentUser() user: JwtPayload, @Query() query: QueryGearDto) {
    // Un Freelance ne peut interroger que SON casier (étanchéité garantie par l'id du token)
    return this.gearService.getFreelanceGear(user.userId, query);
  }

  @Get('pending')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'File de validation : matériel en attente (Admin)' })
  getPending(@Query() query: QueryGearDto) {
    return this.gearService.listPendingForValidation(query);
  }

  @Patch(':id/review')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Valider ou rejeter un équipement (Admin)' })
  review(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReviewGearDto) {
    return this.gearService.reviewGear(id, dto.decision);
  }
}
