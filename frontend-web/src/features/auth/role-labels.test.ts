import { describe, expect, it } from 'vitest';
import { ROLE_LABELS } from './role-labels';

describe('ROLE_LABELS (SH-51)', () => {
  it('traduit chaque rôle en français', () => {
    expect(ROLE_LABELS.FREELANCE).toBe('Freelance');
    expect(ROLE_LABELS.RECRUITER).toBe('Recruteur');
    expect(ROLE_LABELS.ADMIN).toBe('Administrateur');
  });

  it("n'expose jamais une valeur technique à l'écran", () => {
    // Un libellé tout en majuscules non accentuées trahirait la valeur d'enum brute.
    for (const label of Object.values(ROLE_LABELS)) {
      expect(label).not.toMatch(/^[A-Z_]+$/);
    }
  });
});
