import 'dotenv/config';
import { join } from 'path';
import { DataSource, DataSourceOptions } from 'typeorm';
import { User } from '../users/user.entity';
import { Gear } from '../gear/gear.entity';
import { Certification } from '../certifications/certification.entity';

/**
 * Construit les options de connexion PostgreSQL + PostGIS depuis les variables d'environnement.
 * Partagé par le module NestJS (runtime) et la CLI TypeORM (migrations).
 * Aucun secret en dur : tout vient de l'environnement (cf. CLAUDE.md §8).
 */
export function buildDataSourceOptions(): DataSourceOptions {
  return {
    type: 'postgres',
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '5433', 10),
    username: process.env.DB_USERNAME ?? 'skillhunt',
    password: process.env.DB_PASSWORD ?? 'skillhunt',
    database: process.env.DB_NAME ?? 'skillhunt',
    entities: [User, Gear, Certification],
    // Relatif à __dirname (et .{ts,js}) : la CLI fonctionne depuis src/ (ts-node, dev)
    // COMME depuis dist/ (conteneur, SH-2) — un littéral 'src/…/*.ts' casse une fois compilé.
    migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
    // Jamais de synchronisation automatique : le schéma est versionné par les migrations (anti-perte de données)
    synchronize: false,
    logging: process.env.DB_LOGGING === 'true',
  };
}

// DataSource utilisé par la CLI TypeORM (`npm run migration:*`)
export default new DataSource(buildDataSourceOptions());
