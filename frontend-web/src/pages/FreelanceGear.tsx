import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { GearCategoryChips } from '@/features/gear/GearCategoryChips';
import { GearGrid } from '@/features/gear/GearGrid';
import { GEAR_CATEGORIES } from '@/features/gear/gear-meta';
import type { GearCategory } from '@/features/gear/types';
import { useFreelanceGear } from '@/features/gear/useFreelanceGear';

/**
 * Vue PUBLIQUE de l'Armurerie (SH-21b, spec §5.2) — un recruteur consulte le matériel
 * d'un freelance. Mêmes composants que la vue privée, avec trois différences :
 * - seuls les équipements VALIDATED arrivent ici (filtre imposé par le backend, SH-39) ;
 * - aucun CTA d'ajout (on consulte le casier d'un tiers) ;
 * - pas de barre de progression : tout le visible étant validé, le ratio serait 100 % par
 *   construction — le compteur « N équipements validés » porte le signal de fiabilité.
 */
export default function FreelanceGear() {
  const { freelanceId } = useParams<{ freelanceId: string }>();
  const { data, isPending, isError, error, refetch } = useFreelanceGear(freelanceId ?? '');
  const [category, setCategory] = useState<GearCategory | null>(null);

  const items = useMemo(() => data?.items ?? [], [data]);

  const presentCategories = useMemo(
    () => GEAR_CATEGORIES.filter((c) => items.some((gear) => gear.category === c)),
    [items],
  );

  const visibleItems = useMemo(
    () => (category === null ? items : items.filter((gear) => gear.category === category)),
    [items, category],
  );

  const total = data?.total ?? 0;
  const status = error?.response?.status;

  return (
    <main className="bg-hud-bg min-h-screen p-4 lg:p-8">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <header className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-bold tracking-widest text-white uppercase">
              Armurerie du freelance
            </h1>
            {!isPending && !isError && (
              <p className="text-hud-muted text-sm">
                {`${total} équipement${total > 1 ? 's' : ''} validé${total > 1 ? 's' : ''}`}
              </p>
            )}
          </div>
          {/* Mise en relation (SH-24) : le « chat contextuel » démarre depuis le profil.
              Masqué sur erreur (403 : pas recruteur ; 404 : profil inexistant). */}
          {!isError && (
            <Button asChild>
              <Link to={`/messages/${freelanceId}`}>Contacter</Link>
            </Button>
          )}
        </header>

        {isPending && (
          <p role="status" className="text-hud-muted">
            Chargement de l'armurerie…
          </p>
        )}

        {isError &&
          // 403 : route réservée au rôle RECRUITER (RBAC SH-39) ; 404 : profil inconnu ou
          // non-freelance (réponse uniforme, pas d'énumération). Réessayer n'y changerait
          // rien — on explique. Seuls les échecs 5xx/réseau méritent un bouton d'action.
          (status === 403 ? (
            <p role="alert" className="text-hud-pending">
              Cette page est réservée aux recruteurs.
            </p>
          ) : status === 404 ? (
            <p role="alert" className="text-hud-pending">
              Profil freelance introuvable.
            </p>
          ) : (
            <div className="flex flex-col items-start gap-3">
              <p role="alert" className="text-hud-rejected">
                Impossible de charger cette armurerie.
              </p>
              <Button onClick={() => void refetch()}>Réessayer</Button>
            </div>
          ))}

        {!isPending && !isError && items.length === 0 && (
          // État vide NEUTRE (spec §5.4) : le profil existe, il n'a rien à montrer —
          // aucun CTA (on ne déclare pas de matériel dans le casier d'un tiers).
          <p className="text-hud-muted border-hud-border bg-hud-card rounded-lg border border-dashed p-10 text-center">
            Aucun équipement validé pour le moment.
          </p>
        )}

        {!isPending && !isError && items.length > 0 && (
          <>
            <GearCategoryChips
              categories={presentCategories}
              selected={category}
              onSelect={setCategory}
            />
            <GearGrid items={visibleItems} />

            {total > items.length && (
              <p className="text-hud-muted text-xs">
                Affichage des {items.length} équipements les plus récents.
              </p>
            )}
          </>
        )}
      </div>
    </main>
  );
}
