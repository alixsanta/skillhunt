import { render, screen } from '@testing-library/react';
import App from './App';

describe('App', () => {
  it('affiche le titre SkillHunt dans un repère main', () => {
    render(<App />);
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /skillhunt/i })).toBeInTheDocument();
  });

  it('rend un bouton de démonstration shadcn/ui', () => {
    render(<App />);
    expect(screen.getByRole('button', { name: /commencer/i })).toBeInTheDocument();
  });
});
