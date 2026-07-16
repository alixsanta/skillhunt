import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { IsNotEmpty, IsString } from 'class-validator';
import type { Request } from 'express';
import { configureApp } from './app.setup';

/**
 * Smoke test du VRAI chemin de démarrage (SH-41, C2.2.2).
 *
 * Origine : deux bugs bloquants de SH-20 ont échappé à toutes les suites vertes parce
 * qu'aucun test n'exécutait la configuration de `main.ts`. Ici, `configureApp()` — la
 * fonction EXACTE appelée par `bootstrap()` — est appliquée à une application réelle qui
 * écoute sur un port éphémère, et chaque middleware/pipe est exercé par un VRAI appel HTTP :
 * - si l'import de `cookie-parser` redevient un import par défaut fautif (bug 1),
 *   `configureApp` lève `TypeError` et TOUT ce fichier rougit ;
 * - si le ValidationPipe global disparaît ou perd `forbidNonWhitelisted`, le 400 attendu
 *   devient un 200/201 et le test rougit.
 */

class EchoDto {
  @IsString()
  @IsNotEmpty()
  name!: string;
}

// Contrôleur jetable : une surface minimale pour exercer les middlewares réels.
@Controller('smoke')
class SmokeController {
  @Get('cookies')
  cookies(@Req() request: Request) {
    // `request.cookies` n'existe QUE si cookieParser() est réellement monté
    return { parsed: request.cookies ?? null };
  }

  @Post('echo')
  echo(@Body() dto: EchoDto) {
    return dto;
  }
}

describe('configureApp — smoke test du chemin de démarrage réel (SH-41)', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [SmokeController],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app); // LA configuration de main.ts — c'est tout l'objet du test
    await app.listen(0); // port éphémère : vrai serveur HTTP, pas de collision
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
  });

  it('démarre avec la configuration réelle et parse les cookies (bug 1 : cookie-parser)', async () => {
    const response = await fetch(`${baseUrl}/smoke/cookies`, {
      headers: { cookie: 'skillhunt_refresh=jeton-de-test' },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { parsed: Record<string, string> | null };
    expect(body.parsed).toEqual({ skillhunt_refresh: 'jeton-de-test' });
  });

  it('applique le ValidationPipe global : propriété non déclarée => 400 (forbidNonWhitelisted)', async () => {
    const response = await fetch(`${baseUrl}/smoke/echo`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'ok', injected: 'refusé' }),
    });

    expect(response.status).toBe(400);
  });

  it('transforme et accepte un body conforme (transform actif)', async () => {
    const response = await fetch(`${baseUrl}/smoke/echo`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'ok' }),
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ name: 'ok' });
  });

  it('publie le document OpenAPI sur /api/docs-json (C2.4.1)', async () => {
    const response = await fetch(`${baseUrl}/api/docs-json`);

    expect(response.status).toBe(200);
    const doc = (await response.json()) as { info?: { title?: string } };
    expect(doc.info?.title).toContain('SkillHunt');
  });
});
