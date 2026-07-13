import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { resolveCorsOrigins } from './common/cors';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Lecture du cookie de refresh (httpOnly) déposé au login (SH-20)
  app.use(cookieParser());

  // CORS à origines EXPLICITES : '*' + credentials est rejeté par le navigateur (C2.2.3)
  app.enableCors({
    origin: resolveCorsOrigins(process.env.CORS_ORIGIN),
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  // Activation globale du Pipe de Validation (Compétence C2.2.3 - Sécurité d'entrée contre injections)
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true, // Filtre automatiquement les propriétés non déclarées dans nos DTOs
    transform: true, // Convertit automatiquement les objets JSON aux types définis par TypeScript
    forbidNonWhitelisted: true, // Lève une erreur si des paramètres non autorisés sont injectés
  }));

  // Configuration de Swagger OpenAPI pour la documentation et l'audit technique (C2.4.1)
  const config = new DocumentBuilder()
    .setTitle('SkillHunt - Monolith Backend Core')
    .setDescription('API modulaire de notre MVP de recrutement technique de niche')
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();
    
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 3001;
  await app.listen(port);
  console.log(`🚀 SkillHunt Core API est démarrée sur : http://localhost:${port}`);
  console.log(`📖 Documentation Swagger OpenAPI disponible sur : http://localhost:${port}/api/docs`);
}

bootstrap();