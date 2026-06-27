import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { CertificationType, CertificationStatus } from '../common/enums';
import { User } from '../users/user.entity';

/**
 * Certification professionnelle déclarée par un Freelance (SH-10).
 *
 * Donnée hautement sensible (document d'identité) : sujet RGPD (minimisation, purge) ET
 * anti-fraude (R2). Le document PDF n'est conservé que le temps de sa vérification, puis
 * purgé (cf. `purgedAt`). Seules les métadonnées de validité subsistent. Calque des
 * conventions de `gear.entity.ts` (UUID, enums, FK indexée, `@CreateDateColumn`).
 */
@Entity('user_certifications')
export class Certification {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // Type de certification (axe de filtre + dedup anti-fraude)
  @Column({ type: 'enum', enum: CertificationType, default: CertificationType.OTHER })
  type!: CertificationType;

  // Numéro de brevet : métadonnée de validité CONSERVÉE (sert au dedup R2)
  @Column()
  number!: string;

  // Date de fin de validité (saisie par le Freelance, confirmable par l'Admin)
  @Column({ type: 'date' })
  validUntil!: string;

  // Statut du workflow de validation, indexé (file d'attente admin)
  @Index()
  @Column({ type: 'enum', enum: CertificationStatus, default: CertificationStatus.PENDING })
  status!: CertificationStatus;

  // Clé de l'objet dans le stockage privé. NULL après purge RGPD (document supprimé).
  @Column({ type: 'varchar', nullable: true })
  s3Key!: string | null;

  // Type MIME réel (validé par magic bytes à l'upload)
  @Column()
  mimeType!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  uploadedAt!: Date;

  // Horodatage de la décision admin (validation/rejet). NULL tant que PENDING.
  @Column({ type: 'timestamptz', nullable: true })
  reviewedAt!: Date | null;

  // Preuve technique de purge RGPD (traçabilité jury). NULL tant que le document existe.
  @Column({ type: 'timestamptz', nullable: true })
  purgedAt!: Date | null;

  // Propriétaire (Freelance) — relation Many-to-One, FK indexée, suppression en cascade
  @Index()
  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'freelanceId' })
  freelance!: User;

  // Colonne FK exposée directement (filtres + étanchéité sans charger la relation)
  @Column({ type: 'uuid' })
  freelanceId!: string;
}
