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

  // --- 2FA TOTP (SH-40) — champs sensibles, JAMAIS exposés (cf. PublicUser) ---

  @Column({ type: 'boolean', default: false })
  twoFactorEnabled!: boolean;

  /** Secret TOTP chiffré AES-256-GCM (`iv.ciphertext.tag` base64) — jamais en clair (§8-6). */
  @Column({ type: 'varchar', nullable: true })
  twoFactorSecretEncrypted?: string | null;

  /** Codes de secours à usage unique, hachés Argon2id (cohérent SH-7) — jamais en clair. */
  @Column({ type: 'text', array: true, nullable: true })
  twoFactorBackupCodesHashed?: string[] | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  // Un utilisateur (Freelance) possède plusieurs équipements (Armurerie) — relation One-to-Many
  @OneToMany(() => Gear, (gear) => gear.freelance)
  gear!: Gear[];
}
