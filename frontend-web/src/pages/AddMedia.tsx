import { Link } from 'react-router-dom';
import { MediaUploader } from '@/features/media/MediaUploader';

/** Écran de dépôt d'une vidéo (SH-18a). */
export default function AddMedia() {
  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-white">Ajouter une vidéo</h1>
        <p className="text-hud-muted text-sm">
          Le fichier part directement vers le stockage : il ne transite pas par l'API.
        </p>
      </div>

      <MediaUploader />

      <Link className="text-hud-muted text-sm underline" to="/portfolio">
        Retour au portfolio
      </Link>
    </section>
  );
}
