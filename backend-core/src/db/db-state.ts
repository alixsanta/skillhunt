import { Injectable } from '@nestjs/common';
import { BehaviorSubject } from 'rxjs';

export enum UserRole {
  FREELANCE = 'FREELANCE',
  RECRUITER = 'RECRUITER',
  ADMIN = 'ADMIN',
}

export enum GearStatus {
  PENDING = 'PENDING',
  VALIDATED = 'VALIDATED',
  REJECTED = 'REJECTED',
}

export interface User {
  id: string;
  email: string;
  username: string;
  role: UserRole;
  passwordHash: string;
}

export interface GearItem {
  id: string;
  freelanceId: string;
  brand: string;
  model: string;
  serialNumber: string;
  status: GearStatus;
  createdAt: Date;
}

@Injectable()
export class DbState {
  // Simulation de tables de base de données persistantes en mémoire
  public users$ = new BehaviorSubject<User[]>([
    {
      id: 'usr-freelance-1',
      email: 'marcus.thorne@skillhunt.io',
      username: 'Marcus Thorne',
      role: UserRole.FREELANCE,
      passwordHash: 'argon2_hashed_secure_password_placeholder'
    }
  ]);

  public gear$ = new BehaviorSubject<GearItem[]>([
    {
      id: 'gear-1',
      freelanceId: 'usr-freelance-1',
      brand: 'DJI',
      model: 'Matrice 300 RTK',
      serialNumber: 'SN-M300-99881',
      status: GearStatus.VALIDATED,
      createdAt: new Date()
    }
  ]);
}