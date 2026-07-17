import { Pin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GearCard } from './GearCard';
import type { PublicGear } from './types';

const LOADOUT_SLOTS = 4; // miroir de LOADOUT_MAX_SLOTS backend (SH-21c)

/** Vitrine loadout : les équipements épinglés + les emplacements restants (SH-21c). */
export function LoadoutRow({
  items,
  onUnpin,
}: {
  items: PublicGear[];
  onUnpin?: (gearId: string) => void;
}) {
  const freeSlots = Math.max(0, LOADOUT_SLOTS - items.length);
  return (
    <section aria-label="Loadout" className="flex flex-col gap-2">
      <h2 className="flex items-center gap-2 text-sm font-bold tracking-widest text-white uppercase">
        <Pin aria-hidden="true" className="text-hud-icon h-4 w-4" />
        Loadout ({items.length}/{LOADOUT_SLOTS})
      </h2>
      <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">
        {items.map((gear) => (
          <GearCard
            key={gear.id}
            gear={gear}
            trailingAction={
              onUnpin && (
                <Button
                  variant="outline"
                  size="sm"
                  aria-label={`Retirer ${gear.brand} ${gear.model} du loadout`}
                  onClick={() => onUnpin(gear.id)}
                >
                  Retirer
                </Button>
              )
            }
          />
        ))}
        {Array.from({ length: freeSlots }, (_, i) => (
          <li
            key={`libre-${i}`}
            className="border-hud-border text-hud-muted flex items-center justify-center rounded-lg border border-dashed p-4 text-xs tracking-widest uppercase"
          >
            Emplacement libre
          </li>
        ))}
      </ul>
    </section>
  );
}
