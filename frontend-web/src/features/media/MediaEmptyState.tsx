import { Link } from 'react-router-dom';
import { VideoOff } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** État vide du portfolio : une invitation à publier, pas le constat d'une absence. */
export function MediaEmptyState() {
  return (
    <section className="border-hud-border bg-hud-card flex flex-col items-center gap-3 rounded-lg border border-dashed p-10 text-center">
      <VideoOff aria-hidden="true" className="text-hud-muted h-12 w-12" />
      <h2 className="text-lg font-bold text-white">Ton portfolio est vide</h2>
      <p className="text-hud-muted max-w-sm text-sm">
        Une vidéo en dit plus qu'un CV : montre un vol, une inspection, un rush. C'est ce que
        les recruteurs regardent en premier.
      </p>
      <Button asChild>
        <Link to="/portfolio/ajouter">+ Ajouter ma première vidéo</Link>
      </Button>
    </section>
  );
}
