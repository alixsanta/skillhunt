import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Configuration partagée avec le smoke test de démarrage (app.setup.ts, SH-41) :
  // middlewares, CORS, ValidationPipe global et Swagger — un seul chemin, testé.
  configureApp(app);

  const port = process.env.PORT || 3001;
  await app.listen(port);
  console.log(`🚀 SkillHunt Core API est démarrée sur : http://localhost:${port}`);
  console.log(`📖 Documentation Swagger OpenAPI disponible sur : http://localhost:${port}/api/docs`);
}

bootstrap();
