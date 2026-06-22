import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { GearStatus } from '../common/enums';
import { User } from '../users/user.entity';

/**
 * Équipement déclaré dans l'Armurerie (Gear Locker) d'un Freelance.
 * Persistance réelle PostgreSQL via TypeORM (SH-6). La donnée alimente le matching (SH-12).
 */
@Entity('gear')
export class Gear {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  brand!: string;

  @Column()
  model!: string;

  @Column()
  serialNumber!: string;

  @Column({ type: 'enum', enum: GearStatus, default: GearStatus.PENDING })
  status!: GearStatus;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  // Propriétaire du matériel (Freelance) — relation Many-to-One, FK indexée
  @Index()
  @ManyToOne(() => User, (user) => user.gear, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'freelanceId' })
  freelance!: User;

  // Colonne FK exposée directement (pratique pour les filtres sans charger la relation)
  @Column({ type: 'uuid' })
  freelanceId!: string;
}
