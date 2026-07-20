import { useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { InitialsAvatar } from '@/components/ui/InitialsAvatar';
import { BadgeGrid } from '@/features/gamification/BadgeGrid';
import { useFreelanceGamification } from '@/features/gamification/useGamification';
import { GearCategoryChips } from '@/features/gear/GearCategoryChips';
import { GearGrid } from '@/features/gear/GearGrid';
import { GEAR_CATEGORIES } from '@/features/gear/gear-meta';
import { LoadoutRow } from '@/features/gear/LoadoutRow';
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
  const location = useLocation();
  const { data, isPending, isError, error, refetch } = useFreelanceGear(freelanceId ?? '');
  const gamification = useFreelanceGamification(freelanceId ?? '');
  const [category, setCategory] = useState<GearCategory | null>(null);

  // Le nom vient de l'état de navigation posé par `SearchResultCard` (SH-46) — la vue
  // publique n'a aucun DTO exposant de username, seul l'UUID de route est garanti. Un accès
  // direct par URL (favori, lien partagé) n'a pas cet état : on affiche alors un libellé
  // neutre honnête plutôt que l'UUID brut, qui n'est pas un nom.
  const username = (location.state as { username?: string } | null)?.username ?? null;
  const displayName = username ?? 'Profil freelance';

  const items = useMemo(() => data?.items ?? [], [data]);
  // Loadout (SH-21c) : mis en avant au-dessus de la grille — dérivé du casier déjà chargé,
  // pas d'appel réseau supplémentaire (le backend sert déjà le loadout en premier).
  const pinnedItems = useMemo(() => items.filter((gear) => gear.isInLoadout), [items]);

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
    <div className="p-4 lg:p-8">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        {/* En-tête de profil (SH-46) : avatar + nom + niveau, réutilisant les données déjà
            chargées (loadout/gamification) — aucun appel réseau supplémentaire. */}
        <header className="border-hud-border bg-hud-card flex flex-wrap items-center justify-between gap-6 rounded-xl border p-6">
          <div className="flex flex-wrap items-center gap-6">
            <InitialsAvatar name={displayName} size="lg" />
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-2xl font-bold tracking-widest text-white uppercase">
                {displayName}
              </h1>
              {!isPending && !isError && (
                <p className="text-hud-muted text-sm">
                  {`${total} équipement${total > 1 ? 's' : ''} validé${total > 1 ? 's' : ''}`}
                </p>
              )}
              {/* Niveau (SH-21c) : jamais d'XP chiffré en vue publique, le libellé suffit. */}
              {gamification.data && (
                <p className="text-hud-positive font-semibold">{gamification.data.levelLabel}</p>
              )}
            </div>
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
            {/* Gamification (SH-21c) : loadout en tête, badges obtenus — vue publique, aucun
                contrôle d'épinglage (LoadoutRow sans onUnpin) et pas d'XP chiffré. Le niveau
                (levelLabel) est déjà affiché dans l'en-tête de profil ci-dessus. */}
            {pinnedItems.length > 0 && <LoadoutRow items={pinnedItems} />}
            {gamification.data && gamification.data.badges.length > 0 && (
              <BadgeGrid badges={gamification.data.badges} />
            )}
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
    </div>
  );
}
