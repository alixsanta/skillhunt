import { PackageOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * État vide de la vue privée (spec §5.4).
 *
 * Le CTA est volontairement DÉSACTIVÉ : l'écran de déclaration de matériel est hors du
 * périmètre de SH-21a (spec §2). Un bouton désactivé et explicite vaut mieux qu'un lien qui
 * mènerait à une 404.
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
      {/* CTA désactivé : écran de déclaration hors périmètre SH-21a (SH-43). L'explication est un
          texte VISIBLE relié par `aria-describedby` — un `title` seul est invisible au clavier et
          aux lecteurs d'écran (bouton désactivé = hors Tab order). Revue a11y SH-21a. */}
      <div className="flex flex-col items-center gap-1">
        <Button disabled aria-describedby="add-first-gear-hint">
          + Ajouter mon premier équipement
        </Button>
        <p id="add-first-gear-hint" className="text-hud-muted text-xs">
          Écran de déclaration à venir (SH-43).
        </p>
      </div>
    </section>
  );
}
