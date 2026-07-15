import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import { GearController } from './gear.controller';
import { GearService } from './gear.service';

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

  it("expose tous les champs réellement sérialisés par l'entité Gear", () => {
    const gear = document.components?.schemas?.GearResponseDto;
    expect(Object.keys((gear as { properties: object }).properties)).toEqual(
      expect.arrayContaining([
        'id',
        'brand',
        'model',
        'serialNumber',
        'category',
        'status',
        'createdAt',
        'freelanceId',
      ]),
    );
  });
});
