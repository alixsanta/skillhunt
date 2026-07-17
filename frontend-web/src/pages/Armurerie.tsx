import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { BadgeGrid } from '@/features/gamification/BadgeGrid';
import { LevelCard } from '@/features/gamification/LevelCard';
import { useGamification } from '@/features/gamification/useGamification';
import { GearCategoryChips } from '@/features/gear/GearCategoryChips';
import { GearEmptyState } from '@/features/gear/GearEmptyState';
import { GearGrid } from '@/features/gear/GearGrid';
import { GearProgress } from '@/features/gear/GearProgress';
import { GEAR_CATEGORIES } from '@/features/gear/gear-meta';
import { LoadoutRow } from '@/features/gear/LoadoutRow';
import type { GearCategory } from '@/features/gear/types';
import { useMyGear } from '@/features/gear/useMyGear';
import { useSetLoadout } from '@/features/gear/useSetLoadout';

/**
 * Vue privée de l'Armurerie (SH-21a) — le freelance voit TOUS ses équipements, quel que soit
 * leur statut de validation : c'est précisément l'information qu'il vient chercher (spec §5.1).
 *
 * Le filtre par catégorie s'applique en mémoire sur le casier déjà chargé (cf. useMyGear).
 */
export default function Armurerie() {
  const { data, isPending, isError, error, refetch } = useMyGear();
  const gamification = useGamification();
  const setLoadout = useSetLoadout();
  const [category, setCategory] = useState<GearCategory | null>(null);
  const [loadoutError, setLoadoutError] = useState<string | null>(null);

  const items = useMemo(() => data?.items ?? [], [data]);
  // Loadout (SH-21c) : dérivé du casier déjà chargé, pas d'appel réseau supplémentaire.
  const pinnedItems = useMemo(() => items.filter((gear) => gear.isInLoadout), [items]);

  // Chips : uniquement les catégories réellement présentes dans le casier (spec §5.1),
  // dans l'ordre d'affichage stable de GEAR_CATEGORIES.
  const presentCategories = useMemo(
    () => GEAR_CATEGORIES.filter((c) => items.some((gear) => gear.category === c)),
    [items],
  );

  const visibleItems = useMemo(
    () => (category === null ? items : items.filter((gear) => gear.category === category)),
    [items, category],
  );

  const validatedCount = items.filter((gear) => gear.status === 'VALIDATED').length;
  const total = data?.total ?? 0;

  return (
    <main className="bg-hud-bg min-h-screen p-4 lg:p-8">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-widest text-white uppercase">Mon Armurerie</h1>
          {!isPending && !isError && (
            <p className="text-hud-muted text-sm">{`${total} équipement${total > 1 ? 's' : ''}`}</p>
          )}
        </header>

        {isPending && (
          <p role="status" className="text-hud-muted">
            Chargement de ton armurerie…
          </p>
        )}

        {isError &&
          // 403 (RBAC) et 401 (session morte, refresh déjà tenté par les intercepteurs) :
          // réessayer n'y changerait rien — on explique au lieu de proposer une action
          // inutile. Couleur NEUTRE (SH-44 : l'ambre « attente » suggérait à tort un
          // état de validation). Seuls les échecs 5xx/réseau méritent « Réessayer ».
          (error?.response?.status === 403 ? (
            <p role="alert" className="text-hud-muted">
              Cette page est réservée aux freelances.
            </p>
          ) : error?.response?.status === 401 ? (
            <p role="alert" className="text-hud-muted">
              Ta session a expiré. Reconnecte-toi pour retrouver ton armurerie.
            </p>
          ) : (
            <div className="flex flex-col items-start gap-3">
              <p role="alert" className="text-hud-rejected">
                Impossible de charger ton armurerie.
              </p>
              <Button onClick={() => void refetch()}>Réessayer</Button>
            </div>
          ))}

        {!isPending && !isError && items.length === 0 && <GearEmptyState />}

        {!isPending && !isError && items.length > 0 && (
          <>
            {/* Gamification (SH-21c) : loadout, niveau, badges — dérivés de la preuve validée */}
            <LoadoutRow
              items={pinnedItems}
              onUnpin={(gearId) => setLoadout.mutate({ gearId, inLoadout: false })}
            />
            {gamification.data && (
              <>
                <LevelCard profile={gamification.data} />
                <BadgeGrid badges={gamification.data.badges} />
              </>
            )}
            {loadoutError && (
              <p role="alert" className="text-hud-rejected text-sm">
                {loadoutError}
              </p>
            )}

            {/* Dénominateur = items.length (les <= 100 chargés), PAS data.total : divergence
                INTENTIONNELLE avec le compteur d'en-tête au-delà de 100 équipements, cohérente
                avec la mention « Affichage des N plus récents » (SH-44, item 6). */}
            <GearProgress validated={validatedCount} total={items.length} />
            <GearCategoryChips
              categories={presentCategories}
              selected={category}
              onSelect={setCategory}
            />
            {/* Région polie (4.1.3, SH-44) : le résultat du filtrage est annoncé aux lecteurs
                d'écran — le compteur d'en-tête, lui, reste le total non filtré. */}
            <p aria-live="polite" className="text-hud-muted text-xs">
              {`${visibleItems.length} équipement${visibleItems.length > 1 ? 's' : ''} affiché${visibleItems.length > 1 ? 's' : ''}`}
            </p>
            <GearGrid
              items={visibleItems}
              renderAction={(gear) =>
                gear.status === 'VALIDATED' && !gear.isInLoadout ? (
                  <Button
                    variant="outline"
                    size="sm"
                    aria-label={`Épingler ${gear.brand} ${gear.model} au loadout`}
                    onClick={() =>
                      setLoadout.mutate(
                        { gearId: gear.id, inLoadout: true },
                        {
                          onError: (mutationError) =>
                            setLoadoutError(
                              (mutationError.response?.data as { message?: string })?.message ??
                                'Impossible de modifier le loadout',
                            ),
                          onSuccess: () => setLoadoutError(null),
                        },
                      )
                    }
                  >
                    Épingler
                  </Button>
                ) : null
              }
            />

            {total > items.length && (
              <p className="text-hud-muted text-xs">
                Affichage des {items.length} équipements les plus récents.
              </p>
            )}

            <div className="flex">
              <Button asChild>
                <Link to="/mon-armurerie/ajouter">+ Ajouter du matériel</Link>
              </Button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
