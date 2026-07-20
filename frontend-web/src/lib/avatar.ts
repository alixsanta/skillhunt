/**
 * Avatars à initiales (SH-46).
 *
 * L'API ne porte aucune photo de profil et le prototype dépendait d'un service externe
 * (pravatar.cc) : une démonstration hors-ligne y perdrait tous ses avatars. On dérive donc
 * l'avatar du nom, sans aucune requête réseau.
 */

// Variantes issues des tokens de thème — aucune couleur en dur (règle SH-21a).
const PALETTES = [
  { background: 'bg-hud-pill', foreground: 'text-hud-icon' },
  { background: 'bg-hud-icon/15', foreground: 'text-hud-icon' },
  { background: 'bg-hud-positive/15', foreground: 'text-hud-positive' },
  { background: 'bg-hud-pending/15', foreground: 'text-hud-pending' },
] as const;

export function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function getAvatarPalette(name: string): { background: string; foreground: string } {
  // Somme des points de code : stable d'une session à l'autre, contrairement à un hash
  // dépendant de l'ordre d'insertion.
  let sum = 0;
  for (const char of name) sum += char.codePointAt(0) ?? 0;
  return PALETTES[sum % PALETTES.length];
}
