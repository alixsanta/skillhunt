import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import { MatchingController } from './matching.controller';
import { MatchingService } from './matching.service';
import { ROLES_KEY } from '../auth/guards/jwt-auth.guard';
import { UserRole } from '../common/enums';

/**
 * Contrat OpenAPI + étanchéité déclarative du proxy de matching (SH-22, C2.4.1).
 * Le frontend génère ses types depuis ce document (`npm run gen:api`).
 */
describe('MatchingController — contrat OpenAPI et RBAC (SH-22)', () => {
  let app: INestApplication;
  let document: OpenAPIObject;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [MatchingController],
      providers: [
        { provide: MatchingService, useValue: {} },
        { provide: JwtService, useValue: {} },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    document = SwaggerModule.createDocument(app, new DocumentBuilder().build());
  });

  afterAll(async () => {
    await app.close();
  });

  it('type la réponse 200 de POST /api/v1/matching/search en tableau de MatchResultDto', () => {
    const response = document.paths['/api/v1/matching/search'].post?.responses['200'];
    expect(response).toMatchObject({
      content: {
        'application/json': {
          schema: { type: 'array', items: { $ref: '#/components/schemas/MatchResultDto' } },
        },
      },
    });
  });

  it('expose les clés exactes de MatchResultDto (+ position pour la carte, SH-23)', () => {
    const dto = document.components?.schemas?.MatchResultDto;
    expect(Object.keys((dto as { properties: object }).properties).sort()).toEqual(
      ['distanceKm', 'freelanceId', 'latitude', 'longitude', 'score', 'username'].sort(),
    );
  });

  it('réserve la recherche au rôle RECRUITER (étanchéité RBAC, C2.2.3)', () => {
    // Le RolesGuard (testé en SH-8) applique ces métadonnées : FREELANCE et ADMIN → 403.
    const roles = Reflect.getMetadata(
      ROLES_KEY,
      MatchingController.prototype.search,
    ) as UserRole[];
    expect(roles).toEqual([UserRole.RECRUITER]);
  });
});
