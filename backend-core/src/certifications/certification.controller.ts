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
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
} from '@nestjs/swagger';
import { CertificationService } from './certification.service';
import { UploadCertificationDto } from './dto/upload-certification.dto';
import { ReviewCertificationDto } from './dto/review-certification.dto';
import { QueryCertificationDto } from './dto/query-certification.dto';
import {
  JwtAuthGuard,
  RolesGuard,
  Roles,
  CurrentUser,
  JwtPayload,
} from '../auth/guards/jwt-auth.guard';
import { UserRole } from '../common/enums';

/**
 * Plafond mémoire DUR de l'upload (anti-DoS R7/R9) : multer coupe le flux au-delà, AVANT
 * de tout bufferiser en RAM. C'est un garde-fou volontairement supérieur à la limite métier
 * `CERT_MAX_FILE_MB` (vérifiée dans le service, qui produit le 400 « Fichier trop volumineux »).
 * Si `CERT_MAX_FILE_MB` est porté au-delà de 10 Mo, relever aussi cette constante.
 */
const UPLOAD_MEMORY_LIMIT_BYTES = 10 * 1024 * 1024;

@ApiTags('📜 Certifications')
@ApiBearerAuth() // Toutes les routes nécessitent un Token JWT
@ApiUnauthorizedResponse({ description: 'Token JWT manquant, invalide ou expiré (401)' })
@ApiForbiddenResponse({ description: 'Rôle insuffisant ou accès à une ressource d\'autrui (403)' })
@UseGuards(JwtAuthGuard, RolesGuard) // Authentification puis autorisation par rôle (défini par route)
@Controller('api/v1/certifications')
export class CertificationController {
  constructor(private readonly certificationService: CertificationService) {}

  @Post()
  @Roles(UserRole.FREELANCE)
  // Stockage mémoire (buffer assaini puis chiffré) + plafond mémoire dur anti-DoS
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: UPLOAD_MEMORY_LIMIT_BYTES } }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Uploader une certification PDF (Freelance)' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'type', 'number', 'validUntil'],
      properties: {
        file: { type: 'string', format: 'binary', description: 'Document PDF (≤ 5 Mo)' },
        type: { type: 'string', enum: ['DGAC_DRONE', 'ELEC_HABILITATION', 'OTHER'] },
        number: { type: 'string', example: 'FR-DGAC-2024-123456' },
        validUntil: { type: 'string', format: 'date', example: '2027-12-31' },
      },
    },
  })
  upload(
    @CurrentUser() user: JwtPayload,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadCertificationDto,
  ) {
    // Identité issue du token : aucun {id} client n'est accepté (anti-usurpation, OWASP)
    return this.certificationService.uploadCertification(user.userId, dto, file);
  }

  @Get('me')
  @Roles(UserRole.FREELANCE)
  @ApiOperation({ summary: 'Lister ses propres certifications (métadonnées + statut)' })
  getMine(@CurrentUser() user: JwtPayload, @Query() query: QueryCertificationDto) {
    // Étanchéité garantie par l'id du token (un Freelance ne voit que SES certifs)
    return this.certificationService.getMyCertifications(user.userId, query);
  }

  @Get('pending')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'File de validation : certifications en attente (Admin)' })
  getPending(@Query() query: QueryCertificationDto) {
    return this.certificationService.listPendingForValidation(query);
  }

  @Get(':id/document')
  @Roles(UserRole.FREELANCE, UserRole.ADMIN)
  @ApiOperation({ summary: 'Obtenir une Signed URL du document (propriétaire ou Admin)' })
  getDocument(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    // L'étanchéité propriétaire/Admin est vérifiée dans le service
    return this.certificationService.getDocumentUrl(id, user);
  }

  @Patch(':id/review')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Valider ou rejeter une certification + purge RGPD (Admin)' })
  review(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReviewCertificationDto) {
    return this.certificationService.reviewCertification(id, dto);
  }
}
