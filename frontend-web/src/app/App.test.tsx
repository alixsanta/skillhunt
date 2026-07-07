import { render, screen } from '@testing-library/react';
import App from './App';

describe('App', () => {
  it('monte le routeur et affiche la page d’accueil par défaut', () => {
    render(<App />);
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /skillhunt/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /commencer/i })).toBeInTheDocument();
  });
});
