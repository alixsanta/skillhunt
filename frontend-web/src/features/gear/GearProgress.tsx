/**
 * Part de matériel VALIDATED sur le total déclaré (spec §5.1).
 * Signal de fiabilité et petit ressort de gamification : aucun champ backend supplémentaire,
 * le ratio est calculé côté front à partir des statuts.
 */
export function GearProgress({ validated, total }: { validated: number; total: number }) {
  // Borné dans [0, 100] (SH-44) : un réemploi avec validated > total produirait sinon un
  // aria-valuenow > 100 (ARIA invalide) et une barre qui déborde.
  const raw = total <= 0 ? 0 : Math.round((validated / total) * 100);
  const percent = Math.min(100, Math.max(0, raw));

  return (
    <div className="flex flex-col gap-2">
      <p className="text-hud-muted flex justify-between text-xs tracking-widest uppercase">
        <span>Matériel validé</span>
        <span>{`${validated}/${total}`}</span>
      </p>
      <div
        role="progressbar"
        aria-label="Part de matériel validé"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={`${validated} équipements validés sur ${total}`}
        className="bg-hud-pill h-2 w-full overflow-hidden rounded-full"
      >
        <div className="bg-hud-positive h-full rounded-full" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
