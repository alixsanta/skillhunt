import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { MediaStatus, MediaType } from '../common/enums';
import { User } from '../users/user.entity';

/** Une piste de qualité produite par le transcodage (design EP04 §5.2). */
export interface MediaRendition {
  name: string;
  width: number;
  height: number;
  bandwidth: number;
  playlistKey: string;
}

/**
 * Média de portfolio déclaré par un Freelance (SH-16a).
 *
 * Calque des conventions de `certification.entity.ts` : UUID, enums PostgreSQL dédiés,
 * FK indexée en CASCADE, horodatages `timestamptz`. Contrairement à une certification,
 * une vidéo de portfolio a vocation à être VUE : aucune purge RGPD n'est prévue ici.
 */
@Entity('user_media')
export class Media {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ length: 120 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  // Positionné par le worker après sonde de la projection (SH-16b).
  @Column({ type: 'enum', enum: MediaType, default: MediaType.VIDEO })
  type!: MediaType;

  // Indexé : sert la liste du freelance filtrée par statut et le balayage des DRAFT.
  @Index()
  @Column({ type: 'enum', enum: MediaStatus, default: MediaStatus.DRAFT })
  status!: MediaStatus;

  // Clés de stockage INTERNES : jamais exposées par l'API (cf. PublicMedia).
  @Column()
  sourceKey!: string;

  @Column({ type: 'varchar', nullable: true })
  posterKey!: string | null;

  @Column({ type: 'varchar', nullable: true })
  hlsPrefix!: string | null;

  // jsonb plutôt qu'une table fille (décision D8) : ces lignes ne sont jamais
  // interrogées seules, toujours lues avec leur parent pour bâtir le manifeste maître.
  @Column({ type: 'jsonb', nullable: true })
  renditions!: MediaRendition[] | null;

  @Column({ type: 'int', nullable: true })
  durationSeconds!: number | null;

  @Column({ type: 'int', nullable: true })
  width!: number | null;

  @Column({ type: 'int', nullable: true })
  height!: number | null;

  // bigint : une vidéo 4K dépasse la plage d'un int signé.
  @Column({ type: 'bigint', nullable: true })
  sizeBytes!: string | null;

  // Déclaré à la création, CONFIRMÉ par ffprobe au transcodage (SH-16b).
  @Column()
  mimeType!: string;

  // Message court destiné à l'utilisateur. Jamais de pile d'exécution ici.
  @Column({ type: 'varchar', nullable: true })
  errorReason!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  processedAt!: Date | null;

  @Index()
  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'freelanceId' })
  freelance!: User;

  @Column({ type: 'uuid' })
  freelanceId!: string;
}
