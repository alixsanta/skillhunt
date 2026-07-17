import type { GamificationProfile } from './types';

/**
 * Niveau + progression XP (SH-21c). L'information est portée par le TEXTE
 * (libellé du niveau, aria-valuetext), jamais par la seule barre colorée (R6, SH-44).
 */
// Le profil complet (pas un `Pick`) : en usage réel, `LevelCard` reçoit toujours l'objet
// renvoyé par `useGamification()` tel quel (Tasks 5/6) ; un `Pick` ferait échouer la
// vérification des propriétés en excès dès qu'un test ou un appelant passe l'objet complet.
export function LevelCard({ profile }: { profile: GamificationProfile }) {
  const { xp, levelLabel, nextLevelAt } = profile;
  const max = nextLevelAt ?? Math.max(xp, 1);
  const percent = Math.min(100, Math.round((xp / max) * 100));
  const valuetext =
    nextLevelAt === null
      ? `${xp} XP — niveau maximum`
      : `${xp} XP — prochain niveau à ${nextLevelAt} XP`;

  return (
    <section
      aria-label="Progression"
      className="bg-hud-card border-hud-border flex flex-col gap-2 rounded-lg border p-4"
    >
      <p className="flex items-baseline justify-between">
        <span className="font-bold tracking-widest text-white uppercase">{levelLabel}</span>
        <span className="text-hud-muted text-xs">{valuetext}</span>
      </p>
      <div
        role="progressbar"
        aria-label="Progression vers le prochain niveau"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={xp}
        aria-valuetext={valuetext}
        className="bg-hud-pill h-2 overflow-hidden rounded-full"
      >
        {/* SH-21c/SH-44 : le remplissage réutilise le token positif de l'Armurerie
            (GearProgress.tsx) — `--color-hud-validated` n'existe pas dans src/index.css. */}
        <div className="bg-hud-positive h-full rounded-full" style={{ width: `${percent}%` }} />
      </div>
    </section>
  );
}
