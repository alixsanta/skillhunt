import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BrandMark } from './BrandMark';

describe('BrandMark (SH-51)', () => {
  it('est décoratif : le mot-symbole textuel porte déjà le nom accessible', () => {
    const { container } = render(<BrandMark />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute('aria-hidden', 'true');
  });

  it('hérite de la couleur du parent plutôt que de la coder', () => {
    const { container } = render(<BrandMark />);
    // `currentColor` permet au parent de piloter la teinte via une classe de token
    // (text-hud-positive), sans jamais écrire d'hexadécimal dans un composant.
    expect(container.innerHTML).toContain('currentColor');
    expect(container.innerHTML).not.toMatch(/#[0-9a-fA-F]{3,8}/);
  });

  it('accepte une classe de dimensionnement', () => {
    const { container } = render(<BrandMark className="h-7 w-7" />);
    expect(container.querySelector('svg')).toHaveClass('h-7', 'w-7');
  });
});
