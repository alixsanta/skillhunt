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

// Ordre d'affichage stable (chips de filtre, tests d'exhaustivité). DÉRIVÉS des tables META
// plutôt que réécrits à la main : comme CATEGORY_META/STATUS_META sont des `Record<Union, …>`
// (une clé manquante = erreur de compilation), une nouvelle catégorie/statut ajouté côté backend
// ne peut PAS être silencieusement absent de ces listes. Sans ça, un `GearCategory[]` accepte un
// sous-ensemble du type → la nouvelle catégorie s'afficherait dans la grille mais sans chip de
// filtre (donc infiltrable). Dette de revue SH-21a → SH-44.
export const GEAR_CATEGORIES = Object.keys(CATEGORY_META) as GearCategory[];

export const GEAR_STATUSES = Object.keys(STATUS_META) as GearStatus[];
