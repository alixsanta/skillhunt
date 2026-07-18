import { render, screen } from '@testing-library/react';
import { LevelCard } from './LevelCard';

const profile = {
  xp: 260,
  level: 3,
  levelLabel: 'Spécialiste',
  nextLevelAt: 450,
  badges: [],
};

describe('LevelCard (SH-21c)', () => {
  it('affiche le niveau en toutes lettres et la progression en aria-valuetext (R6/SH-44)', () => {
    render(<LevelCard profile={profile} />);
    expect(screen.getByText('Spécialiste')).toBeInTheDocument();
    const bar = screen.getByRole('progressbar', { name: /progression/i });
    expect(bar).toHaveAttribute('aria-valuenow', '260');
    expect(bar).toHaveAttribute('aria-valuetext', '260 XP — prochain niveau à 450 XP');
  });

  it('au niveau maximum (nextLevelAt null), annonce « niveau maximum » et une barre pleine', () => {
    render(
      <LevelCard profile={{ ...profile, level: 6, levelLabel: 'Légende', nextLevelAt: null }} />,
    );
    const bar = screen.getByRole('progressbar', { name: /progression/i });
    expect(bar).toHaveAttribute('aria-valuetext', '260 XP — niveau maximum');
  });
});
