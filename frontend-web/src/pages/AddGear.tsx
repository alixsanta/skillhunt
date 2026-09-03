import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { getBrands, getModels } from '@/features/gear/gear-catalog';
import { CATEGORY_META, GEAR_CATEGORIES } from '@/features/gear/gear-meta';
import type { AddGearInput, GearCategory } from '@/features/gear/types';
import { useCreateGear } from '@/features/gear/useCreateGear';

type FieldName = 'category' | 'brand' | 'model' | 'serialNumber';
type FieldErrors = Partial<Record<FieldName, string>>;

// Validation client (C2.2.3) : mêmes règles et mêmes messages que AddGearDto côté backend
// (champ requis, catégorie dans l'enum, numéro de série ≥ 5 caractères). Elle évite un
// aller-retour réseau voué à l'échec — le backend reste le juge de paix.
function validate(input: AddGearInput): FieldErrors {
  const errors: FieldErrors = {};
  if (!GEAR_CATEGORIES.includes(input.category)) {
    errors.category = 'Choisis une catégorie.';
  }
  if (input.brand.trim() === '') {
    errors.brand = 'La marque est obligatoire.';
  }
  if (input.model.trim() === '') {
    errors.model = 'Le modèle est obligatoire.';
  }
  if (input.serialNumber.trim().length < 5) {
    errors.serialNumber = 'Le numéro de série doit contenir au moins 5 caractères.';
  }
  return errors;
}

const inputClass =
  'border-hud-border bg-hud-card rounded-md border px-3 py-2 text-white ' +
  'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 outline-none';

/**
 * Écran de déclaration de matériel (SH-43) — active les CTA « + Ajouter … » de SH-21a.
 *
 * Le numéro de série sert à la vérification anti-vol/assurance : il est saisi ici mais ne sera
 * JAMAIS réaffiché dans une vue de consultation publique (SH-39).
 */
export default function AddGear() {
  const navigate = useNavigate();
  const createGear = useCreateGear();

  const [category, setCategory] = useState<GearCategory | ''>('');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    createGear.reset();

    const input: AddGearInput = {
      category: category as GearCategory,
      brand: brand.trim(),
      model: model.trim(),
      serialNumber: serialNumber.trim(),
    };

    const errors = validate(input);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      return; // aucun appel réseau tant que le formulaire est invalide
    }

    createGear.mutate(input, {
      onSuccess: () => navigate('/mon-armurerie'),
    });
  }

  // Erreurs renvoyées par le backend : les messages du ValidationPipe (400) sont déjà en
  // français et compréhensibles — on les affiche tels quels. Tout le reste (5xx, réseau)
  // devient un message générique.
  let apiError: string | null = null;
  if (createGear.isError) {
    const body = createGear.error.response?.data;
    const messages =
      createGear.error.response?.status === 400 && body?.message ? [body.message].flat() : [];
    apiError =
      messages.length > 0
        ? messages.join(' ')
        : 'Impossible de déclarer cet équipement pour le moment. Réessaie plus tard.';
  }

  function fieldError(name: FieldName) {
    const message = fieldErrors[name];
    if (!message) return null;
    return (
      <p id={`${name}-error`} role="alert" className="text-hud-rejected text-sm">
        {message}
      </p>
    );
  }

  // Suggestions dérivées de la catégorie puis de la marque (SH-51). Tant qu'aucune
  // catégorie n'est choisie, il n'y a rien de pertinent à proposer.
  const brandOptions = category === '' ? [] : getBrands(category);
  const modelOptions = category === '' ? [] : getModels(category, brand);

  return (
    <div className="flex flex-1 items-center justify-center p-4 lg:p-8">
      <div className="border-hud-border bg-hud-card w-full max-w-xl rounded-xl border p-8">
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-widest text-white uppercase">
            Déclarer un équipement
          </h1>
          <p className="text-hud-muted text-sm">
            Chaque équipement déclaré part en validation : une fois validé, il renforce ta
            pertinence dans le matching.
          </p>
        </header>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-1">
            <label htmlFor="category" className="text-white">
              Catégorie
            </label>
            <select
              id="category"
              value={category}
              onChange={(event) => setCategory(event.target.value as GearCategory | '')}
              aria-invalid={fieldErrors.category ? true : undefined}
              aria-describedby={fieldErrors.category ? 'category-error' : undefined}
              className={inputClass}
            >
              <option value="">— Choisir une catégorie —</option>
              {GEAR_CATEGORIES.map((value) => (
                <option key={value} value={value}>
                  {CATEGORY_META[value].label}
                </option>
              ))}
            </select>
            {fieldError('category')}
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="brand" className="text-white">
              Marque
            </label>
            {/* `<datalist>` natif : suggère sans jamais contraindre, et reste accessible
                au clavier comme aux lecteurs d'écran sans aucune dépendance ajoutée. */}
            <input
              id="brand"
              list="brand-options"
              autoComplete="off"
              value={brand}
              onChange={(event) => setBrand(event.target.value)}
              placeholder="DJI, Insta360, Boston Dynamics…"
              aria-invalid={fieldErrors.brand ? true : undefined}
              aria-describedby={fieldErrors.brand ? 'brand-error' : 'brand-hint'}
              className={inputClass}
            />
            <datalist id="brand-options">
              {brandOptions.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
            <p id="brand-hint" className="text-hud-muted text-xs">
              Choisis dans la liste, ou saisis librement si ton matériel n'y figure pas.
            </p>
            {fieldError('brand')}
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="model" className="text-white">
              Modèle
            </label>
            <input
              id="model"
              list="model-options"
              autoComplete="off"
              value={model}
              onChange={(event) => setModel(event.target.value)}
              placeholder="Mavic 3 Enterprise"
              aria-invalid={fieldErrors.model ? true : undefined}
              aria-describedby={fieldErrors.model ? 'model-error' : undefined}
              className={inputClass}
            />
            <datalist id="model-options">
              {modelOptions.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
            {fieldError('model')}
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="serialNumber" className="text-white">
              Numéro de série
            </label>
            <input
              id="serialNumber"
              value={serialNumber}
              onChange={(event) => setSerialNumber(event.target.value)}
              placeholder="SN-123456789"
              aria-invalid={fieldErrors.serialNumber ? true : undefined}
              aria-describedby={
                fieldErrors.serialNumber ? 'serialNumber-error' : 'serialNumber-hint'
              }
              className={inputClass}
            />
            {/* Donnée sensible : visible uniquement par le propriétaire du casier (SH-39). */}
            <p id="serialNumber-hint" className="text-hud-muted text-xs">
              Utilisé pour la vérification anti-vol/assurance. Jamais montré aux recruteurs.
            </p>
            {fieldError('serialNumber')}
          </div>

          {apiError && (
            <p role="alert" className="text-hud-rejected text-sm">
              {apiError}
            </p>
          )}

          <div className="flex items-center gap-4">
            <Button type="submit" disabled={createGear.isPending}>
              Déclarer cet équipement
            </Button>
            <Link to="/mon-armurerie" className="text-hud-muted text-sm underline">
              Annuler
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
