import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Point } from 'geojson';
import { UserRole } from '../common/enums';
import { Gear } from '../gear/gear.entity';

/**
 * Utilisateur de la plateforme (Freelance, Recruteur, Admin).
 * Persistance réelle PostgreSQL via TypeORM (SH-6), remplace l'ancien placeholder mémoire.
 * Clé primaire en UUID v4 (cf. spécifications SH-8).
 */
@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // Indexée et unique : recherche fréquente + unicité du compte (anti-doublon)
  @Index({ unique: true })
  @Column()
  email!: string;

  @Column()
  username!: string;

  // Jamais exposé dans les réponses API (cf. PublicUser dans AuthService)
  @Column()
  passwordHash!: string;

  @Index()
  @Column({ type: 'enum', enum: UserRole, default: UserRole.FREELANCE })
  role!: UserRole;

  /**
   * Position géographique de l'expert au format PostGIS GEOGRAPHY(POINT, 4326).
   * Nullable pour l'instant : alimentée et exploitée par le matching géospatial (SH-13).
   * L'index spatial GiST est créé par la migration initiale.
   */
  @Column({ type: 'geography', spatialFeatureType: 'Point', srid: 4326, nullable: true })
  location?: Point | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  // Un utilisateur (Freelance) possède plusieurs équipements (Armurerie) — relation One-to-Many
  @OneToMany(() => Gear, (gear) => gear.freelance)
  gear!: Gear[];
}
