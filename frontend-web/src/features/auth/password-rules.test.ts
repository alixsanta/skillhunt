import { describe, expect, it } from 'vitest';
import { PASSWORD_RULES, isPasswordValid } from './password-rules';

describe('PASSWORD_RULES (SH-51)', () => {
  it('valide un mot de passe conforme', () => {
    expect(isPasswordValid('PiloteDrone2026')).toBe(true);
  });

  it.each([
    ['Pilote2026', 'length'],
    ['pilotedrone2026', 'upper'],
    ['PILOTEDRONE2026', 'lower'],
    ['PiloteDroneAAAA', 'digit'],
  ])('refuse %s en signalant la règle %s', (mot, regleAttendue) => {
    expect(isPasswordValid(mot)).toBe(false);
    const echouees = PASSWORD_RULES.filter((regle) => !regle.test(mot)).map((r) => r.id);
    expect(echouees).toContain(regleAttendue);
  });

  it('reste aligné sur le DTO backend', () => {
    // Miroir de RegisterDto.password (C2.2.3) : quatre règles, ni plus ni moins.
    expect(PASSWORD_RULES.map((r) => r.id)).toEqual(['length', 'lower', 'upper', 'digit']);
  });
});
