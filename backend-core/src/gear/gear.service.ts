import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GearStatus, UserRole } from '../common/enums';
import { Gear } from './gear.entity';
import { User } from '../users/user.entity';
import { AddGearDto } from './dto/add-gear.dto';

@Injectable()
export class GearService {
  constructor(
    @InjectRepository(Gear)
    private readonly gearRepo: Repository<Gear>,
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
  ) {}

  async addGearToLocker(freelanceId: string, dto: AddGearDto): Promise<Gear> {
    // 1. Vérifier que l'utilisateur existe bien et est un freelance
    const user = await this.usersRepo.findOne({ where: { id: freelanceId } });
    if (!user || user.role !== UserRole.FREELANCE) {
      throw new NotFoundException('Profil Freelance introuvable ou non autorisé');
    }

    // 2. Créer le nouvel équipement (En attente de validation par un Admin)
    const gear = this.gearRepo.create({
      freelanceId: user.id,
      brand: dto.brand,
      model: dto.model,
      serialNumber: dto.serialNumber,
      status: GearStatus.PENDING,
    });

    // 3. Persister en base
    return this.gearRepo.save(gear);
  }

  getFreelanceGear(freelanceId: string): Promise<Gear[]> {
    return this.gearRepo.find({ where: { freelanceId } });
  }
}
