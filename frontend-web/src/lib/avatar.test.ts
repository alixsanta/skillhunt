import { describe, expect, it } from 'vitest';
import { getAvatarPalette, getInitials } from './avatar';

describe('getInitials', () => {
  it("prend les deux premières initiales d'un nom composé", () => {
    expect(getInitials('Marcus Thorne')).toBe('MT');
  });

  it("prend les deux premiers caractères d'un mot unique", () => {
    expect(getInitials('DemoPilote')).toBe('DE');
  });

  it('ignore les espaces superflus', () => {
    expect(getInitials('  sasha   ivanova  ')).toBe('SI');
  });

  it('renvoie un repli pour une chaîne vide', () => {
    expect(getInitials('')).toBe('?');
  });
});

describe('getAvatarPalette', () => {
  it('est déterministe pour un même nom', () => {
    expect(getAvatarPalette('Marcus')).toEqual(getAvatarPalette('Marcus'));
  });

  it('renvoie des classes Tailwind, jamais une couleur en dur', () => {
    const palette = getAvatarPalette('Marcus');
    expect(palette.background).toMatch(/^bg-/);
    expect(palette.background).not.toMatch(/#/);
  });
});
