import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { MainNav } from './MainNav';

function renderNav(role: 'FREELANCE' | 'RECRUITER' | 'ADMIN') {
  return render(
    <MemoryRouter>
      <MainNav role={role} />
    </MemoryRouter>,
  );
}

describe('MainNav', () => {
  it('propose au freelance son armurerie et ses messages', () => {
    renderNav('FREELANCE');
    expect(screen.getByRole('link', { name: /mon armurerie/i })).toHaveAttribute(
      'href',
      '/mon-armurerie',
    );
    expect(screen.getByRole('link', { name: /messages/i })).toBeInTheDocument();
  });

  it("n'expose jamais la recherche au freelance (le backend renverrait 403)", () => {
    renderNav('FREELANCE');
    expect(screen.queryByRole('link', { name: /recherche/i })).not.toBeInTheDocument();
  });

  it('propose au recruteur la recherche et ses messages', () => {
    renderNav('RECRUITER');
    expect(screen.getByRole('link', { name: /recherche/i })).toHaveAttribute('href', '/recherche');
    expect(screen.getByRole('link', { name: /messages/i })).toBeInTheDocument();
  });

  it("n'expose jamais l'armurerie personnelle au recruteur", () => {
    renderNav('RECRUITER');
    expect(screen.queryByRole('link', { name: /mon armurerie/i })).not.toBeInTheDocument();
  });

  it("expose une navigation nommée pour les lecteurs d'écran", () => {
    renderNav('RECRUITER');
    expect(screen.getByRole('navigation', { name: /navigation principale/i })).toBeInTheDocument();
  });
});
