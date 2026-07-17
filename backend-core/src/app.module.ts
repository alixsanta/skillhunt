import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { buildDataSourceOptions } from './database/data-source';
import { User } from './users/user.entity';
import { Gear } from './gear/gear.entity';
import { Certification } from './certifications/certification.entity';
import { AuthService } from './auth/auth.service';
import { AuthController } from './auth/auth.controller';
import { TwoFactorService } from './auth/two-factor.service';
import { TwoFactorController } from './auth/two-factor.controller';
import { GearService } from './gear/gear.service';
import { GearController } from './gear/gear.controller';
import { CertificationService } from './certifications/certification.service';
import { CertificationController } from './certifications/certification.controller';
import { StorageModule } from './storage/storage.module';
import { MatchingService } from './matching/matching.service';
import { MatchingController } from './matching/matching.controller';
import { TokenStore } from './auth/token-store.service';
import { loadJwtKeys } from './auth/keys';
import { RedisModule } from './common/redis/redis.module';
import { EventPublisherService } from './common/events/event-publisher.service';
import { Message, MessageSchema } from './chat/message.schema';
import { ChatService } from './chat/chat.service';
import { ChatGateway } from './chat/chat.gateway';
import { ChatController } from './chat/chat.controller';

@Module({
  imports: [
    // Chargement global des variables d'environnement (.env)
    ConfigModule.forRoot({ isGlobal: true }),

    // Client Redis partagé (SH-14) — fourni globalement via le token REDIS_CLIENT (C2.2.3)
    RedisModule,

    // Persistance réelle PostgreSQL + PostGIS via TypeORM (SH-6, remplace DbState en mémoire)
    TypeOrmModule.forRootAsync({
      useFactory: () => buildDataSourceOptions(),
    }),
    TypeOrmModule.forFeature([User, Gear, Certification]),

    // Persistance NoSQL MongoDB (SH-24) — brique chat de l'architecture (§2/§3).
    // URL via l'environnement uniquement (CLAUDE.md §8-4) ; défaut = compose dev (port hôte 27018).
    MongooseModule.forRootAsync({
      useFactory: () => ({
        uri: process.env.MONGODB_URL ?? 'mongodb://localhost:27018/skillhunt',
      }),
    }),
    MongooseModule.forFeature([{ name: Message.name, schema: MessageSchema }]),

    // Stockage objet privé (SH-31) — fournit STORAGE_SERVICE aux certifications (et médias SH-17)
    StorageModule,

    // Configuration JWT RS256 (clés asymétriques) — secrets jamais en dur (C2.2.3)
    JwtModule.registerAsync({
      global: true,
      useFactory: () => {
        const keys = loadJwtKeys();
        if (keys.ephemeral) {
          console.warn(
            '⚠️  JWT : aucune clé RSA fournie (JWT_PRIVATE_KEY/JWT_PUBLIC_KEY). ' +
              'Génération d\'une paire éphémère — les tokens seront invalidés au redémarrage. ' +
              'À NE PAS utiliser en production.',
          );
        }
        return {
          privateKey: keys.privateKey,
          publicKey: keys.publicKey,
          signOptions: { algorithm: 'RS256', issuer: 'skillhunt' },
          verifyOptions: { algorithms: ['RS256'], issuer: 'skillhunt' },
        };
      },
    }),
  ],
  controllers: [
    AuthController,
    TwoFactorController, // 2FA TOTP (SH-40)
    GearController, // Déclaration du contrôleur d'armurerie
    CertificationController, // Déclaration du contrôleur de certifications (SH-10)
    MatchingController, // Proxy vers le matching-service interne (SH-22)
    ChatController, // Historique + liste des conversations du chat (SH-24)
  ],
  providers: [
    AuthService,
    TwoFactorService, // 2FA TOTP : enrôlement/vérification, anti-brute-force Redis (SH-40)
    GearService, // Déclaration du service d'armurerie
    CertificationService, // Déclaration du service de certifications (SH-10)
    MatchingService, // Relais + enrichissement des résultats de matching (SH-22)
    TokenStore, // Registre des refresh tokens (en mémoire → Redis SH-14)
    EventPublisherService, // Bus d'événements Redis Streams (SH-14, C2.2.3)
    ChatService, // Persistance MongoDB + règles métier du chat (SH-24)
    ChatGateway, // WebSocket socket.io authentifié au handshake (SH-24)
  ],
})
export class AppModule {}
