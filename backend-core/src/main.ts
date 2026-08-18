import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';

async function bootstrap() {
  // bufferLogs : les lignes émises pendant l'amorçage sont retenues jusqu'à ce que le
  // logger Pino soit disponible, puis rejouées à travers lui. Sans cela, tout ce qui
  // précède `useLogger` sortirait au format texte de Nest — et un incident au démarrage
  // (celui-là même que le smoke test de SH-41 traque) produirait des lignes non
  // structurées, donc inexploitables par Loki au pire moment (SH-29).
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  // Remplace le logger natif de Nest par Pino : les logs du framework ET ceux de
  // l'application partagent alors le même format JSON et le même `requestId`.
  app.useLogger(app.get(Logger));

  // Configuration partagée avec le smoke test de démarrage (app.setup.ts, SH-41) :
  // middlewares, CORS, ValidationPipe global et Swagger — un seul chemin, testé.
  configureApp(app);

  const port = process.env.PORT || 3001;
  await app.listen(port);

  const logger = app.get(Logger);
  logger.log(`SkillHunt Core API démarrée sur le port ${port}`);
  logger.log(`Documentation Swagger OpenAPI : http://localhost:${port}/api/docs`);
}

bootstrap();
