import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
// Import en `* as` : le projet compile en CommonJS SANS `esModuleInterop` (seul
// `allowSyntheticDefaultImports` est actif). Un `import cookieParser from ...` compile
// donc sans erreur, mais émet un `.default` inexistant à l'exécution — le serveur
// refusait de démarrer (« cookie_parser_1.default is not a function »), SH-20.
import * as cookieParser from 'cookie-parser';
import { resolveCorsOrigins } from './common/cors';

/**
 * Configuration UNIQUE de l'application (middlewares, CORS, validation, Swagger).
 *
 * Extraite de `bootstrap()` pour être exécutée par `main.ts` ET par le smoke test de
 * démarrage (`app.setup.spec.ts`, SH-41) : c'est la garantie que le chemin testé est
 * EXACTEMENT le chemin de production — sans cette fonction partagée, test et prod
 * divergeraient de nouveau (cause racine des deux bugs bloquants de SH-20).
 */
export function configureApp(app: INestApplication): INestApplication {
  // Lecture du cookie de refresh (httpOnly) déposé au login (SH-20)
  app.use(cookieParser());

  // CORS à origines EXPLICITES : '*' + credentials est rejeté par le navigateur (C2.2.3)
  app.enableCors({
    origin: resolveCorsOrigins(process.env.CORS_ORIGIN),
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  // Activation globale du Pipe de Validation (Compétence C2.2.3 - Sécurité d'entrée contre injections)
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Filtre automatiquement les propriétés non déclarées dans nos DTOs
      transform: true, // Convertit automatiquement les objets JSON aux types définis par TypeScript
      forbidNonWhitelisted: true, // Lève une erreur si des paramètres non autorisés sont injectés
    }),
  );

  // Configuration de Swagger OpenAPI pour la documentation et l'audit technique (C2.4.1)
  const config = new DocumentBuilder()
    .setTitle('SkillHunt - Monolith Backend Core')
    .setDescription('API modulaire de notre MVP de recrutement technique de niche')
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  return app;
}
