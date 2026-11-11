export interface PasswordRule {
  id: string;
  label: string;
  test: (value: string) => boolean;
}

/**
 * Règles de robustesse du mot de passe (SH-51 — C2.2.3).
 *
 * MIROIR EXACT de `RegisterDto.password` côté backend. Si l'une des deux listes change,
 * l'autre doit suivre : une validation cliente plus laxiste laisserait partir un 400
 * assuré, une validation plus stricte interdirait des mots de passe que l'API accepte.
 * Le backend reste le juge de paix — ceci n'est qu'un confort d'usage.
 */
export const PASSWORD_RULES: readonly PasswordRule[] = [
  { id: 'length', label: 'Au moins 12 caractères', test: (value) => value.length >= 12 },
  { id: 'lower', label: 'Une lettre minuscule', test: (value) => /[a-z]/.test(value) },
  { id: 'upper', label: 'Une lettre majuscule', test: (value) => /[A-Z]/.test(value) },
  { id: 'digit', label: 'Un chiffre', test: (value) => /[0-9]/.test(value) },
];

export function isPasswordValid(value: string): boolean {
  return PASSWORD_RULES.every((rule) => rule.test(value));
}
