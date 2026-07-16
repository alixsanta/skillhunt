import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import { GearController } from './gear.controller';
import { GearService } from './gear.service';
import { ROLES_KEY } from '../auth/guards/jwt-auth.guard';
import { UserRole } from '../common/enums';

/**
 * Contrat OpenAPI de l'Armurerie (C2.4.1).
 *
 * Le frontend génère ses types depuis ce document (`npm run gen:api`) : une route sans
 * réponse typée produit un `content?: never` côté client, donc une réponse non typable.
 * Ces tests verrouillent le contrat consommé par la grille d'inventaire (SH-21a).
 */
describe("GearController — contrat OpenAPI (C2.4.1)", () => {
  let app: INestApplication;
  let document: OpenAPIObject;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [GearController],
      // Le document OpenAPI se construit à partir des métadonnées : les dépendances
      // réelles (service, guards) ne sont jamais appelées, de simples doublures suffisent.
      providers: [
        { provide: GearService, useValue: {} },
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

  it("type la réponse 200 de GET /api/v1/gear/me en PaginatedGearDto", () => {
    const response = document.paths['/api/v1/gear/me'].get?.responses['200'];
    expect(response).toMatchObject({
      content: {
        'application/json': { schema: { $ref: '#/components/schemas/PaginatedGearDto' } },
      },
    });
  });

  it("type la réponse 201 de POST /api/v1/gear en GearResponseDto", () => {
    const response = document.paths['/api/v1/gear'].post?.responses['201'];
    expect(response).toMatchObject({
      content: {
        'application/json': { schema: { $ref: '#/components/schemas/GearResponseDto' } },
      },
    });
  });

  it("décrit PaginatedGearDto comme une page d'équipements typés", () => {
    const paginated = document.components?.schemas?.PaginatedGearDto;
    expect(paginated).toMatchObject({
      properties: {
        items: { items: { $ref: '#/components/schemas/GearResponseDto' } },
        total: { type: 'number' },
        page: { type: 'number' },
        limit: { type: 'number' },
      },
    });
  });

  // --- Vue publique recruteur (SH-39) : contrat + étanchéité déclarative ---

  it('type la réponse 200 de GET /api/v1/gear/freelance/{freelanceId} en PaginatedPublicGearDto', () => {
    const response = document.paths['/api/v1/gear/freelance/{freelanceId}'].get?.responses['200'];
    expect(response).toMatchObject({
      content: {
        'application/json': { schema: { $ref: '#/components/schemas/PaginatedPublicGearDto' } },
      },
    });
  });

  it('PublicGearDto n\'expose JAMAIS serialNumber ni freelanceId (minimisation SH-39)', () => {
    const pub = document.components?.schemas?.PublicGearDto;
    // Clés EXACTES (allowlist) : un champ sensible ajouté par inadvertance ferait rougir ce test.
    expect(Object.keys((pub as { properties: object }).properties).sort()).toEqual(
      ['brand', 'category', 'createdAt', 'id', 'model', 'status'].sort(),
    );
  });

  it('réserve la consultation publique au rôle RECRUITER (étanchéité RBAC, C2.2.3)', () => {
    // Le RolesGuard (testé en SH-8) applique ces métadonnées : FREELANCE et ADMIN → 403.
    const roles = Reflect.getMetadata(
      ROLES_KEY,
      GearController.prototype.getPublicFreelanceGear,
    ) as UserRole[];
    expect(roles).toEqual([UserRole.RECRUITER]);
  });

  it("expose les champs EXACTS sérialisés par l'entité Gear (ni plus, ni moins — SH-44)", () => {
    // Clés exactes plutôt qu'arrayContaining : un champ ajouté par inadvertance au contrat
    // (donc exposé au front via gen:api) ferait rougir ce test au lieu de passer en silence.
    const gear = document.components?.schemas?.GearResponseDto;
    expect(Object.keys((gear as { properties: object }).properties).sort()).toEqual(
      [
        'brand',
        'category',
        'createdAt',
        'freelanceId',
        'id',
        'model',
        'serialNumber',
        'status',
      ].sort(),
    );
  });
});
