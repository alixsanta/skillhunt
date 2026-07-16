import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere } from 'typeorm';
import { GearCategory, GearStatus, UserRole } from '../common/enums';
import { Gear } from './gear.entity';
import { User } from '../users/user.entity';
import { AddGearDto } from './dto/add-gear.dto';
import { QueryGearDto } from './dto/query-gear.dto';
import { PublicQueryGearDto } from './dto/public-query-gear.dto';
import { EventPublisherService, DomainEventType } from '../common/events/event-publisher.service';

// Résultat paginé générique de l'Armurerie
export interface PaginatedGear {
  items: Gear[];
  total: number;
  page: number;
  limit: number;
}

/**
 * Équipement vu par un RECRUTEUR (SH-39) : projection par ALLOWLIST — jamais de
 * `serialNumber` (donnée sensible) ni de `freelanceId` (redondant avec la route).
 */
export interface PublicGearView {
  id: string;
  brand: string;
  model: string;
  category: GearCategory;
  status: GearStatus;
  createdAt: Date;
}

export interface PaginatedPublicGear {
  items: PublicGearView[];
  total: number;
  page: number;
  limit: number;
}

@Injectable()
export class GearService {
  constructor(
    @InjectRepository(Gear)
    private readonly gearRepo: Repository<Gear>,
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    private readonly events: EventPublisherService,
  ) {}

  /** Déclaration d'un équipement par un Freelance (statut initial : en attente de validation). */
  async addGearToLocker(freelanceId: string, dto: AddGearDto): Promise<Gear> {
    const user = await this.usersRepo.findOne({ where: { id: freelanceId } });
    if (!user || user.role !== UserRole.FREELANCE) {
      throw new NotFoundException('Profil Freelance introuvable ou non autorisé');
    }

    const gear = this.gearRepo.create({
      freelanceId: user.id,
      category: dto.category,
      brand: dto.brand,
      model: dto.model,
      serialNumber: dto.serialNumber,
      status: GearStatus.PENDING, // doit être validé par un Admin
    });

    return this.gearRepo.save(gear);
  }

  /** Liste paginée du casier d'UN Freelance (étanchéité : filtrée sur son id, issu du token). */
  getFreelanceGear(freelanceId: string, query: QueryGearDto): Promise<PaginatedGear> {
    const where: FindOptionsWhere<Gear> = { freelanceId };
    if (query.category) {
      where.category = query.category;
    }
    if (query.status) {
      where.status = query.status;
    }
    return this.paginate(where, query);
  }

  /**
   * Vue publique du casier pour un RECRUTEUR (SH-39) : matériel VALIDATED uniquement,
   * projeté sans donnée sensible. Le statut est imposé ICI, jamais dérivé du client (C2.2.3).
   */
  async getPublicFreelanceGear(
    freelanceId: string,
    query: PublicQueryGearDto,
  ): Promise<PaginatedPublicGear> {
    const target = await this.usersRepo.findOne({ where: { id: freelanceId } });
    // 404 uniforme (cible inconnue OU non-freelance) : pas d'énumération du rôle des comptes
    if (!target || target.role !== UserRole.FREELANCE) {
      throw new NotFoundException('Profil Freelance introuvable');
    }

    const where: FindOptionsWhere<Gear> = { freelanceId, status: GearStatus.VALIDATED };
    if (query.category) {
      where.category = query.category;
    }
    const { items, total, page, limit } = await this.paginate(where, query);

    // Minimisation (CLAUDE.md §8) : projection par ALLOWLIST, pas de suppression après coup —
    // un champ ajouté à l'entité Gear ne peut PAS fuiter ici par inadvertance.
    return { items: items.map(GearService.toPublicGearView), total, page, limit };
  }

  private static toPublicGearView(gear: Gear): PublicGearView {
    return {
      id: gear.id,
      brand: gear.brand,
      model: gear.model,
      category: gear.category,
      status: gear.status,
      createdAt: gear.createdAt,
    };
  }

  /** File de validation admin : équipements en attente (PENDING), tous freelances confondus. */
  listPendingForValidation(query: QueryGearDto): Promise<PaginatedGear> {
    const where: FindOptionsWhere<Gear> = { status: GearStatus.PENDING };
    if (query.category) {
      where.category = query.category;
    }
    return this.paginate(where, query);
  }

  /** Décision admin sur un équipement : PENDING -> VALIDATED | REJECTED (transition unique, tracée). */
  async reviewGear(gearId: string, decision: GearStatus): Promise<Gear> {
    const gear = await this.gearRepo.findOne({ where: { id: gearId } });
    if (!gear) {
      throw new NotFoundException('Équipement introuvable');
    }
    if (gear.status !== GearStatus.PENDING) {
      throw new ConflictException('Cet équipement a déjà été traité');
    }

    gear.status = decision;
    const saved = await this.gearRepo.save(gear);

    // Émission best-effort : notifie le matching-service pour invalider son cache (SH-14)
    const type =
      decision === GearStatus.VALIDATED
        ? DomainEventType.GEAR_VALIDATED
        : DomainEventType.GEAR_REJECTED;
    await this.events.publish(type, { gearId: saved.id, freelanceId: saved.freelanceId });

    return saved;
  }

  /** Helper de pagination commun (tri par date de création décroissante). */
  private async paginate(where: FindOptionsWhere<Gear>, query: QueryGearDto): Promise<PaginatedGear> {
    const { page, limit } = query;
    const [items, total] = await this.gearRepo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, total, page, limit };
  }
}
