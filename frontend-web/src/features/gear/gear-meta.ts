import { Bot, Box, Camera, Drone, Radar, type LucideIcon } from 'lucide-react';
import type { GearCategory, GearStatus } from './types';

// Catégorie : l'identité visuelle passe par l'ICÔNE, jamais par la couleur (spec §3).
// La pastille qui porte l'icône est neutre et identique pour toutes les catégories.
export const CATEGORY_META: Record<GearCategory, { label: string; Icon: LucideIcon }> = {
  DRONE: { label: 'Drone', Icon: Drone },
  CAMERA_360: { label: 'Caméra 360°', Icon: Camera },
  ROBOTICS: { label: 'Robotique', Icon: Bot },
  SENSOR: { label: 'Capteur', Icon: Radar },
  OTHER: { label: 'Autre', Icon: Box },
};

// Statut : le libellé TEXTE accompagne toujours la pastille colorée — l'information ne
// repose jamais sur la couleur seule (accessibilité R6).
export const STATUS_META: Record<
  GearStatus,
  { label: string; dotClass: string; textClass: string }
> = {
  VALIDATED: { label: 'VALIDÉ', dotClass: 'bg-hud-positive', textClass: 'text-hud-positive' },
  PENDING: { label: 'ATTENTE', dotClass: 'bg-hud-pending', textClass: 'text-hud-pending' },
  REJECTED: { label: 'REJETÉ', dotClass: 'bg-hud-rejected', textClass: 'text-hud-rejected' },
};

// Ordre d'affichage stable (chips de filtre, tests d'exhaustivité).
export const GEAR_CATEGORIES: GearCategory[] = [
  'DRONE',
  'CAMERA_360',
  'ROBOTICS',
  'SENSOR',
  'OTHER',
];

export const GEAR_STATUSES: GearStatus[] = ['VALIDATED', 'PENDING', 'REJECTED'];
