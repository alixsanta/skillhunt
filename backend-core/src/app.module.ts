import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { DbState } from './db/db-state';
import { AuthService } from './auth/auth.service';
import { AuthController } from './auth/auth.controller';
import { GearService } from './gear/gear.service';
import { GearController } from './gear/gear.controller';
import { TokenStore } from './auth/token-store.service';
import { loadJwtKeys } from './auth/keys';

@Module({
  imports: [
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
    GearController, // Déclaration du contrôleur d'armurerie
  ],
  providers: [
    DbState,
    AuthService,
    GearService, // Déclaration du service d'armurerie
    TokenStore, // Registre des refresh tokens (en mémoire → Redis SH-14)
  ],
})
export class AppModule {}
