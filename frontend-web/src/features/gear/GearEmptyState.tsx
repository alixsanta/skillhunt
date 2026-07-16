import { Link } from 'react-router-dom';
import { PackageOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * État vide de la vue privée (spec §5.4).
 *
 * Le CTA mène à l'écran de déclaration de matériel (SH-43).
 */
export function GearEmptyState() {
  return (
    <section className="border-hud-border bg-hud-card flex flex-col items-center gap-3 rounded-lg border border-dashed p-10 text-center">
      <PackageOpen aria-hidden="true" className="text-hud-muted h-12 w-12" />
      <h2 className="text-lg font-bold text-white">Ton arsenal est vide</h2>
      <p className="text-hud-muted max-w-sm text-sm">
        Déclare ton matériel : chaque équipement validé renforce ta crédibilité et améliore ta
        pertinence dans le matching des missions.
      </p>
      <Button asChild>
        <Link to="/mon-armurerie/ajouter">+ Ajouter mon premier équipement</Link>
      </Button>
    </section>
  );
}
