import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere } from 'typeorm';
import { GearStatus, UserRole } from '../common/enums';
import { Gear } from './gear.entity';
import { User } from '../users/user.entity';
import { AddGearDto } from './dto/add-gear.dto';
import { QueryGearDto } from './dto/query-gear.dto';

// Résultat paginé générique de l'Armurerie
export interface PaginatedGear {
  items: Gear[];
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
    return this.gearRepo.save(gear);
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
