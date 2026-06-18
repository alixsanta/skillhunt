import { Injectable, NotFoundException } from '@nestjs/common';
import { DbState, GearItem, GearStatus, UserRole } from '../db/db-state';
import { AddGearDto } from './dto/add-gear.dto';

@Injectable()
export class GearService {
  constructor(private readonly db: DbState) {}

  addGearToLocker(freelanceId: string, dto: AddGearDto): GearItem {
    // 1. Vérifier que l'utilisateur existe bien et est un freelance
    const user = this.db.users$.getValue().find(u => u.id === freelanceId);
    if (!user || user.role !== UserRole.FREELANCE) {
      throw new NotFoundException('Profil Freelance introuvable ou non autorisé');
    }

    // 2. Créer le nouvel équipement (En attente de validation)
    const newGear: GearItem = {
      id: `gear-${Math.random().toString(36).substring(2, 9)}`,
      freelanceId: user.id,
      brand: dto.brand,
      model: dto.model,
      serialNumber: dto.serialNumber,
      status: GearStatus.PENDING, // Par défaut, l'équipement doit être validé par un Admin
      createdAt: new Date(),
    };

    // 3. Sauvegarder dans notre base en mémoire
    const currentGear = this.db.gear$.getValue();
    this.db.gear$.next([...currentGear, newGear]);

    return newGear;
  }

  getFreelanceGear(freelanceId: string): GearItem[] {
    return this.db.gear$.getValue().filter(gear => gear.freelanceId === freelanceId);
  }
}