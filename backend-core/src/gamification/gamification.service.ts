import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { Gear } from '../gear/gear.entity';
import { Certification } from '../certifications/certification.entity';
import { LOADOUT_MAX_SLOTS } from '../gear/gear.service';
import {
  CertificationStatus, CertificationType, GearStatus, UserRole,
} from '../common/enums';

// Barème XP (spec SH-21c §2) — SEULE source de vérité, référencée par les tests.
export const XP_PER_VALIDATED_GEAR = 50;
export const XP_PER_COVERED_CATEGORY = 30;
export const XP_PER_VALIDATED_CERTIFICATION = 80;

export interface LevelDefinition { threshold: number; level: number; label: string }
export const LEVELS: readonly LevelDefinition[] = [
  { threshold: 0, level: 1, label: 'Recrue' },
  { threshold: 100, level: 2, label: 'Opérateur' },
  { threshold: 250, level: 3, label: 'Spécialiste' },
  { threshold: 450, level: 4, label: 'Vétéran' },
  { threshold: 700, level: 5, label: 'Élite' },
  { threshold: 1000, level: 6, label: 'Légende' },
];

export interface BadgeView { id: string; label: string; description: string; earned: boolean }
export interface GamificationProfile {
  xp: number; level: number; levelLabel: string; nextLevelAt: number | null; badges: BadgeView[];
}
export interface PublicGamificationProfile {
  level: number; levelLabel: string; badges: Array<{ id: string; label: string; description: string }>;
}

/** Statistiques dérivées de la donnée existante — tout le calcul part d'ici. */
interface FreelanceStats {
  validatedGear: number; coveredCategories: number;
  validatedCertifications: number; dgacCertifications: number; loadoutCount: number;
}

// Catalogue statique : un badge = un prédicat sur les stats (dérivé, jamais persisté).
const BADGE_CATALOG: ReadonlyArray<{
  id: string; label: string; description: string; earnedWhen: (s: FreelanceStats) => boolean;
}> = [
  { id: 'first-validated', label: 'Première validation', description: 'Un premier équipement validé par un admin', earnedWhen: (s) => s.validatedGear >= 1 },
  { id: 'arsenal-5', label: 'Arsenal étoffé', description: '5 équipements validés', earnedWhen: (s) => s.validatedGear >= 5 },
  { id: 'arsenal-10', label: "Arsenal d'élite", description: '10 équipements validés', earnedWhen: (s) => s.validatedGear >= 10 },
  { id: 'polyvalent', label: 'Polyvalent', description: '3 catégories de matériel couvertes', earnedWhen: (s) => s.coveredCategories >= 3 },
  { id: 'certified', label: 'Certifié', description: 'Une certification professionnelle validée', earnedWhen: (s) => s.validatedCertifications >= 1 },
  { id: 'dgac-pilot', label: 'Télépilote DGAC', description: 'Brevet de télépilote DGAC validé', earnedWhen: (s) => s.dgacCertifications >= 1 },
  { id: 'loadout-full', label: 'Loadout complet', description: `${LOADOUT_MAX_SLOTS} équipements épinglés au loadout`, earnedWhen: (s) => s.loadoutCount >= LOADOUT_MAX_SLOTS },
];

/**
 * Gamification de l'Armurerie (SH-21c) — XP/niveaux/badges DÉRIVÉS À LA LECTURE :
 * aucune persistance propre, donc aucune dérive possible entre la donnée et la récompense.
 * Seule la preuve VALIDÉE rapporte (KPI : qualité de la donnée de matching, R10).
 */
@Injectable()
export class GamificationService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Gear) private readonly gear: Repository<Gear>,
    @InjectRepository(Certification) private readonly certifications: Repository<Certification>,
  ) {}

  /** Profil complet du freelance connecté (XP chiffré + badges verrouillés inclus). */
  async profileFor(userId: string): Promise<GamificationProfile> {
    const stats = await this.statsFor(userId);
    const xp =
      stats.validatedGear * XP_PER_VALIDATED_GEAR +
      stats.coveredCategories * XP_PER_COVERED_CATEGORY +
      stats.validatedCertifications * XP_PER_VALIDATED_CERTIFICATION;

    const current = [...LEVELS].reverse().find((l) => xp >= l.threshold) ?? LEVELS[0];
    const next = LEVELS.find((l) => l.threshold > xp) ?? null;

    return {
      xp,
      level: current.level,
      levelLabel: current.label,
      nextLevelAt: next ? next.threshold : null,
      badges: BADGE_CATALOG.map((b) => ({
        id: b.id, label: b.label, description: b.description, earned: b.earnedWhen(stats),
      })),
    };
  }

  /**
   * Profil PUBLIC pour un recruteur : niveau + badges OBTENUS uniquement.
   * Ni XP chiffré ni badges verrouillés : la mécanique interne n'est pas un signal recruteur (C2.2.3).
   */
  async publicProfileFor(freelanceId: string): Promise<PublicGamificationProfile> {
    const target = await this.users.findOne({ where: { id: freelanceId } });
    // 404 uniforme (inconnu OU non-freelance) : pas d'énumération du rôle des comptes
    if (!target || target.role !== UserRole.FREELANCE) {
      throw new NotFoundException('Profil Freelance introuvable');
    }
    const { xp, level, levelLabel, badges } = await this.profileFor(freelanceId);
    void xp; // jamais exposé publiquement
    return {
      level, levelLabel,
      badges: badges.filter((b) => b.earned).map(({ id, label, description }) => ({ id, label, description })),
    };
  }

  private async statsFor(userId: string): Promise<FreelanceStats> {
    const validated = await this.gear.find({ where: { freelanceId: userId, status: GearStatus.VALIDATED } });
    const validCerts = await this.certifications.find({
      where: { freelanceId: userId, status: CertificationStatus.VALIDATED },
    });
    return {
      validatedGear: validated.length,
      coveredCategories: new Set(validated.map((g) => g.category)).size,
      validatedCertifications: validCerts.length,
      dgacCertifications: validCerts.filter((c) => c.type === CertificationType.DGAC_DRONE).length,
      loadoutCount: validated.filter((g) => g.isInLoadout).length,
    };
  }
}
